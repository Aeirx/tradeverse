# Tradeverse — Brutally Honest Code Review

> Generated for the owner (Aeirx) as a self-contained dump that can be pasted into any other LLM conversation for follow-up review or interview prep.
> Date: 2026-05-05. Repo state: branch `main`, clean working tree, latest commit `f9774be Add Hugging Face Spaces configuration frontmatter`.

---

## 1. Project Overview

**What it is.** Tradeverse is a three-tier paper-trading simulator. A React/Vite SPA lets a logged-in user manage a $100,000 virtual wallet, look up live equity quotes, place buy/sell orders against their portfolio, and run a "decision engine" that mixes news-headline sentiment (FinBERT over Pinecone-retrieved Finnhub headlines) with classic technical indicators (50-day SMA, 14-day RSI, 20-day annualised volatility, volume multiplier) and a market-regime overlay (SPY/VIX) to spit out a BUY / SELL / HOLD signal plus a Kelly-style risk-allocation %. There is also an "auto-pilot" mode that polls the AI for a configurable basket of tickers every 60 s and submits orders automatically.

**Tech stack**

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, React Router 7, TailwindCSS 4 (Vite plugin), Axios, lucide-react icons, TradingView embed widget |
| Backend | Node.js (ESM), Express 4, Mongoose 8, MongoDB Atlas (with multi-document **transactions** — requires replica set), JWT (jsonwebtoken 9), bcrypt 6, Multer 2, cookie-parser, Cloudinary v2, Redis 5 (price cache), axios, yahoo-finance2 (declared but **unused** at runtime — see §9) |
| AI service | Python 3.10, FastAPI, Uvicorn, Pinecone (`tradeverse-news` index), Sentence-Transformers (`all-MiniLM-L6-v2`), HuggingFace Transformers + FinBERT (`ProsusAI/finbert`), yfinance, pandas/numpy, httpx, requests, python-dotenv, schedule (legacy bot_worker only), torch CPU |
| External APIs | Finnhub (live quotes + general/forex/crypto/merger news), Yahoo Finance (technicals/SPY/VIX), Cloudinary (avatar uploads), TradingView (chart widget — embed only, no auth) |
| Infra | MongoDB Atlas, Redis (Docker compose for local), Pinecone Serverless |
| Deployment | Frontend → Vercel; Backend → Render (with Koyeb mentioned in commit history as alternative); AI Engine → Hugging Face Spaces (Docker SDK, port 7860); local Redis via `docker-compose.yml` |

**Three deployed URLs.** *(Not present anywhere in the repo. The repo has no `vercel.json`, no `render.yaml`, no production URL constants. You must supply these — they are not documented in code, README, or env files.)*
- Frontend (Vercel): `https://<unknown>.vercel.app`
- Backend (Render/Koyeb): `https://<unknown>.onrender.com` (or `.koyeb.app`)
- AI Engine (HF Spaces): `https://<username>-tradeverse-ai.hf.space`

**Repo tree (top 3 levels, excluding node_modules / .git / venv / dist)**

```
Project/
├── .gitignore
├── .vscode/
│   └── settings.json
├── Dockerfile                  # AI-only, for Hugging Face Spaces
├── README.md
├── docker-compose.yml          # Redis only, local-dev helper
├── fix_dashboard.js            # ⚠ Stray dev script, should not be in repo
├── Tradeverse-AI/
│   ├── .dockerignore .env .env.example .gitignore
│   ├── Dockerfile              # Duplicates root Dockerfile (port 8001 vs 7860)
│   ├── algo_engine.py          # 282 LOC — heart of signal logic
│   ├── bot_worker.py           # ⚠ Obsolete, replaced by lifespan task in main.py
│   ├── clean_market_data.csv   # ⚠ Data file checked into repo
│   ├── colab_backtester.py     # Educational script only
│   ├── data_cleaner.py data_loader.py embed_test.py    # ⚠ Tutorial-era scripts
│   ├── fetch_news.py           # Used only by obsolete bot_worker.py
│   ├── main.py                 # 185 LOC — FastAPI server
│   ├── market_data.csv         # ⚠ Data file checked into repo
│   ├── requirements.txt
│   ├── search_vectors.py upload_vectors.py             # ⚠ One-off Pinecone setup
│   └── venv/ __pycache__/
├── Tradeverse-Backend/
│   ├── .env .env.example .gitignore .prettierignore .prettierrc
│   ├── Dockerfile
│   ├── package.json package-lock.json
│   ├── public/
│   │   └── temp/               # Multer scratch dir for avatar uploads
│   ├── src/
│   │   ├── app.js index.js constants.js
│   │   ├── controllers/        # ai, trade, user
│   │   ├── db/index.js
│   │   ├── middlewares/        # auth, multer
│   │   ├── models/             # user, transaction
│   │   ├── routes/             # ai, trade, user
│   │   └── utils/              # ApiError, ApiResponse, asyncHandler, cloudinary
│   └── tests/                  # example.test.js, trade.test.js (vitest)
└── Tradeverse-Frontend/
    ├── .env .env.example .gitignore
    ├── Dockerfile              # Multi-stage nginx serve
    ├── eslint.config.js index.html package.json vite.config.js
    ├── public/                 # favicon, icons
    └── src/
        ├── App.jsx App.test.jsx main.jsx App.css index.css
        ├── assets/
        ├── components/         # AlgoWeightControls, BotControlPanel, ExecutionLog,
        │                       # HoldingsTable, MarketSidebar, ProtectedRoute,
        │                       # TradingChart, TradingPanel
        └── pages/              # Dashboard, Login, Register
```

---

## 2. Architecture Diagram

```
                        ┌──────────────────────────────────────────┐
                        │          Browser (React SPA)             │
                        │   - Login / Register / Dashboard         │
                        │   - HttpOnly cookie carries JWT          │
                        └──┬──────────────────────────────┬────────┘
                           │ axios (withCredentials=true) │
            VITE_API_URL ──▼                              ▼── VITE_AI_URL
              ┌────────────────────────┐    ┌────────────────────────────┐
              │  Express Backend       │    │  FastAPI AI Engine         │
              │  (Render / Koyeb)      │    │  (HF Spaces, port 7860)    │
              │                        │    │                            │
              │  /api/v1/users/*       │    │  GET  /                    │
              │  /api/v1/trades/*      │    │  POST /search              │
              │  /api/v1/ai/ask  ⚠     │    │  POST /api/predict   ⚠     │
              │     (dead code)        │    │     (no auth!)             │
              │                        │    │                            │
              │  verifyJWT middleware  │    │  Lifespan task: every 5min │
              │  Cookie-based session  │    │  refresh Pinecone w/ news  │
              └──┬──────────┬──────────┘    └──┬───────────┬─────────────┘
                 │          │                  │           │
                 ▼          ▼                  ▼           ▼
          ┌──────────┐ ┌──────────┐      ┌──────────┐ ┌────────────┐
          │ MongoDB  │ │ Redis    │      │ Pinecone │ │ yfinance / │
          │ Atlas    │ │ price    │      │ index    │ │ Finnhub /  │
          │ (TXN)    │ │ cache    │      │ "tradev- │ │ Cloudinary │
          │          │ │ TTL=10s  │      │ erse-    │ │            │
          └──────────┘ └──────────┘      │ news"    │ └────────────┘
                                         └──────────┘
                                              ▲
                                              │ FinBERT + MiniLM embeds
                                              │ headline metadata
                                              │
                       Backend → Finnhub for live quote (axios direct,
                       no library) on every BUY/SELL and on /price/:symbol
                       cache miss; Backend → Cloudinary on register.
```

**End-to-end "Get Signal" data flow** (user clicks `Execute Strategy` for `TSLA`):

1. `Dashboard.handleRunAlgorithm` → `axios.post(VITE_AI_URL + "/api/predict", { symbol, weights })` — **the browser talks to the AI service directly**, completely bypassing the Express backend and JWT.
2. FastAPI `/api/predict` normalises weights, embeds the query text `"financial news and market updates for TSLA stock earnings"` via SentenceTransformer (lazy-loaded), queries Pinecone for top-5 matching headlines.
3. `algo_engine.run_ensemble_model`:
   - For each headline, FinBERT (lazy-loaded HF pipeline) returns a label+confidence; weighted average across 5 (first headline gets 2× weight).
   - `apply_fake_news_filter` decimates the score by 80 % if regex-matched rumor words.
   - yfinance pulls 3 mo of `TSLA` history → SMA50, RSI14 (Wilder), 20-day annualised vol, volume multiplier.
   - If volatility > 0.80 → instant HOLD abort.
   - `get_market_regime` queries SPY (1y) and ^VIX (1mo); classifies Panic/Trending/Sideways/Neutral and **overrides the user-supplied weights** with hard-coded regime weights.
   - Final score = sentiment·w_s + ma·w_ma + rsi·w_rsi.
   - Signal = BUY if score ≥ +0.25 AND a technical confirms AND sentiment isn't negative; SELL mirror; HOLD otherwise.
   - Kelly % = `clamp(score·18.57 − 2.64, 1, 20)` for actionable signals (this is **not** the Kelly criterion — it's a curve fit).
4. JSON returned: `{signal, confidence, kelly_percentage, symbol}`.
5. Dashboard logs result, then if signal contains "BUY"/"SELL", calls the **backend** (`/api/v1/trades/buy`) which **does** require the JWT cookie. The backend re-fetches a Finnhub price (so the price the AI saw and the price the trade executes at are different), runs a Mongo transaction over `User` and `Transaction` collections, and returns the updated wallet/portfolio.

**Where authentication sits.**
- JWT lives in two **HttpOnly, secure, sameSite=none** cookies (`accessToken`, `refreshToken`) set by the backend on `/login`.
- `verifyJWT` middleware reads `req.cookies.accessToken`, verifies with `ACCESS_TOKEN_SECRET`, loads the user, attaches `req.user`.
- It is applied to: `POST /trades/buy`, `POST /trades/sell`, `GET /trades/portfolio`, `GET /trades/history`, `POST /users/logout`, `POST /users/wallet/add`, `GET /users/balance`.
- It is **NOT** applied to: `GET /trades/price/:symbol`, `POST /api/v1/ai/ask`, the entire FastAPI service. (See §7.)

---

## 3. Backend (Express / Node.js)

### `Tradeverse-Backend/src/index.js` (17 LOC)
- Loads `.env`, calls `connectDB()`, then `app.listen(PORT||8000)`.
- **Smell:** logs `process.env.PORT` even when the fallback was used → log says `port : undefined`.
- **Smell:** no graceful shutdown, no SIGTERM handler.
- **Bug:** uses `dotenv.config({path: "./.env"})` *and* `nodemon -r dotenv/config` in `dev` script — double-loaded. Harmless but redundant.

### `Tradeverse-Backend/src/app.js` (51 LOC)
- Builds the Express app, registers manual CORS middleware (replaces the `cors` package which is still in `dependencies` — dead dep), parses JSON (16 KB cap), serves `public/`, parses cookies, mounts three routers, and a global error handler.
- **Mixed concerns / style:** `import aiRouter` is wedged *inside* the body of the file after middleware definitions. Imports hoist so it works, but it's confusing.
- **Bug:** the manual CORS middleware reads `process.env.CORS_ORIGIN` once **per request** but only allows a single origin. Multi-origin (e.g. preview deployments) is impossible without a code change. The `cors` npm package is imported in `package.json` but never used.
- **Smell:** there is no health endpoint. No request logger (no morgan/pino).
- **Smell:** the global error handler swallows the stack — no console.error, no Sentry hook. In prod a 500 leaves zero forensic trail.
- **Smell:** `express.static("public")` exposes `public/temp` (Multer's scratch dir) to the world. After Cloudinary upload the file is unlinked, but if the upload fails the file stays — accessible at `/temp/<originalname>`.

### `Tradeverse-Backend/src/constants.js` (1 LOC)
- Single export: `DB_NAME = "tradeverse"`. Fine.

### `Tradeverse-Backend/src/db/index.js` (18 LOC)
- `mongoose.connect(\`${MONGODB_URI}/${DB_NAME}\`)`. On failure: `process.exit(1)`.
- **Smell:** no retry, no heartbeat. If Atlas blips for 5 s the whole pod dies. Render/Koyeb will restart it but you lose in-flight requests.
- **Smell:** appending `/${DB_NAME}` to a SRV URI works but is unconventional — most teams use `dbName` option.

### `Tradeverse-Backend/src/controllers/user.controller.js` (219 LOC)
- Exports: `registerUser`, `loginUser`, `logoutUser`, `addMoneyToWallet`, `refreshAccessToken`. Plus internal `generateAccessAndRefreshTokens`.
- `cookieOptions = {httpOnly:true, secure:true, sameSite:"none"}` defined once at module top.
- **Bug (cosmetic):** registration message reads `₹{amount}` but the rest of the app uses `$`. Pick a currency.
- **Smell:** `addMoneyToWallet` accepts any positive number with **no upper bound** — anyone can deposit `1e18` virtual dollars and break formatting/UI.
- **Smell:** `existedUser` typo — `existedUser` (should be `existingUser`); minor.
- **Smell:** `refreshAccessToken` rotates the refresh token (good) but does not invalidate the old one server-side beyond overwriting `user.refreshToken`. Race window if the same refresh token is used concurrently from two tabs — both will succeed once.
- **Smell:** `generateAccessAndRefreshTokens` swallows the underlying error message → harder to debug.
- **Smell:** `cookieOptions` has no `domain`, no `maxAge`, no `path`. Cookies will **only set in production** (HTTPS) because `secure:true` — local dev over HTTP will silently drop the Set-Cookie header. The dev experience is broken unless you run the backend on HTTPS.

### `Tradeverse-Backend/src/controllers/trade.controller.js` (227 LOC)
- Exports: `buyStock`, `sellStock`, `getPortfolio`, `getHistory`.
- Uses `mongoose.startSession` + `startTransaction` + `commitTransaction` / `abortTransaction` around `User.updateOne` and `Transaction.create` — **requires a Mongo replica set**. Standalone Mongo (e.g. local single-node) will throw "Transaction numbers are only allowed on a replica set member or mongos."
- **Bug (critical):** silent-fallback price = `150.0` if Finnhub returns no `c`. So if Finnhub rate-limits you, **every trade executes at $150**. Users will see clearly fake P&L. Should fail closed (return 503).
- **Bug (data integrity):** the live-price fetch is done **before** the transaction starts, so the price you charge can drift between the read and the commit. Not a real race-condition bug for paper trading, but worth knowing.
- **Smell:** input is parsed from three field names (`symbol|stockSymbol`, `quantity|shares|tradeQuantity`). Backwards-compatibility flexibility is fine, but the multiple-name fan-in suggests the frontend was inconsistent at some point — consolidate.
- **Smell:** symbol regex is `/^[A-Z]+$/` — rejects `BRK.B`, `RDS-A`, anything with a dot or hyphen. Common stocks won't trade.
- **Bug:** `getPortfolio` falls back to `averagePrice || 150` for missing prices. `||` treats `0` as missing — and `0` is a legitimate average if the schema default kicked in. Magic number again.
- **Smell:** catch block `error.statusCode || 400` rewrites all non-`ApiError` failures (axios ECONNRESET, mongo errors, etc.) as **400 Bad Request**, which is misleading to the frontend and to monitoring.
- **Smell:** `getHistory` returns the entire transaction list with no pagination. Will get heavy after a few hundred trades.
- **Smell:** when an existing holding is bought into, the `updateOne` increments quantity *and* sets the new average price — fine, but the average-price formula casts to plain JS Number (float). Cents will drift over thousands of trades.

### `Tradeverse-Backend/src/controllers/ai.controller.js` (42 LOC)
- Exports `getAiInsight` mounted at `POST /api/v1/ai/ask`.
- **Bug (critical):** hard-coded `axios.post("http://127.0.0.1:8001/search", ...)`. In production on Render this calls `localhost:8001`, which doesn't exist there. Endpoint is **broken** in any deployed environment.
- **Bug:** does **not** apply `verifyJWT`, so any unauthenticated client can trigger upstream Pinecone/AI work via the backend.
- **Status:** **dead code** — the React frontend calls the AI service directly via `VITE_AI_URL`; nothing in the codebase calls `/api/v1/ai/ask`.
- **Smell:** error response shape is `{ error: "..." }` instead of the project's standard `ApiResponse`/`ApiError`. Inconsistent.

### `Tradeverse-Backend/src/routes/user.routes.js` (37 LOC)
- `POST /register` (multer avatar), `POST /login`, `POST /refresh-token`, `POST /logout` (JWT), `POST /wallet/add` (JWT), `GET /balance` (JWT).
- **Bug:** `GET /balance` is an **inline route handler** (not a controller). It returns `{walletBalance, portfolio}` raw — no `ApiResponse` envelope, unlike every other endpoint. Frontend `ProtectedRoute` and `Dashboard.fetchWalletBalance` both depend on this raw shape, so changing it would cascade.
- **Smell:** `req.user?.walletBalance || 100000` — defaults to 100k when `req.user` is undefined, but the route is JWT-protected so `req.user` should always be set. The fallback hides bugs.

### `Tradeverse-Backend/src/routes/trade.routes.js` (70 LOC)
- Initialises a Redis client at module load with `reconnectStrategy: false` (fails fast — and stays dead). After a single failed connection `redisClient = null` for the rest of the process; **a temporary outage requires a restart to recover the cache**.
- `GET /price/:symbol` — Redis-cached for 10 s, falls back to Finnhub. **No JWT required.** Anyone can flood your Finnhub quota.
- All other routes JWT-protected.
- **Bug:** Same silent `livePrice = 150.0` fallback on Finnhub failure — cache will then memoise the fake price for 10 s.
- **Smell:** Redis init is in a route file, not in `db/` next to Mongo. Place coupling.
- **Smell:** the `console.log("Cache hit/miss")` lines on every quote will spam Render's free log volume.

### `Tradeverse-Backend/src/routes/ai.routes.js` (9 LOC)
- One route: `POST /ask` → `getAiInsight`. **Dead.**

### `Tradeverse-Backend/src/middlewares/auth.middleware.js` (29 LOC)
- Reads `req.cookies?.accessToken`, verifies with `ACCESS_TOKEN_SECRET`, loads user (sans password/refresh token) onto `req.user`.
- **Smell:** does **not** also check the `Authorization: Bearer` header. If the SPA ever needed to make a cross-origin fetch without cookies (mobile, server-side render), it can't. Trivial to add.
- **Smell:** the catch always throws `401 Invalid access token`, even if the failure was a downstream Mongo error — could mislead alerting.

### `Tradeverse-Backend/src/middlewares/multer.middleware.js` (14 LOC)
- Disk storage at `./public/temp`, **filename = `file.originalname` verbatim**.
- **Bug (collision):** two users registering with avatars named `me.png` at the same instant will overwrite each other's file before Cloudinary upload. Use `Date.now()` + sanitized name, or memory storage + direct upload.
- **Smell:** no file-size limit, no MIME type filter. A 200 MB `.exe` renamed `.png` is accepted.

### `Tradeverse-Backend/src/models/user.model.js` (98 LOC)
- Schema fields: `username` (unique, lowercase, trim, indexed), `email` (unique, lowercase, trim), `fullName` (indexed), `avatar` (required), `password` (required), `walletBalance` (default 100000), `portfolio: [portfolioItemSchema]`, `refreshToken`, timestamps.
- `portfolioItemSchema`: `stockSymbol`, `quantity` (default 0), `averagePrice` (default 0).
- Hooks: bcrypt hash on save (cost 10).
- Methods: `isPasswordCorrect`, `generateAccessToken` (encodes `_id`, email, username, fullName), `generateRefreshToken` (encodes only `_id`).
- **Smell:** `email` not indexed despite `unique:true` — `unique:true` does create an index, so this is fine, just inconsistent with `username` having both.
- **Smell:** `walletBalance` default is hard-coded 100000 in TWO places (model + route fallback in `/balance`).
- **Smell:** no separate `Portfolio` collection. Pushing each holding into the user doc is fine for small portfolios but blows up the document size for power users; also blocks per-holding indexing.

### `Tradeverse-Backend/src/models/transaction.model.js` (35 LOC)
- Fields: `user` (ObjectId ref User, required), `type` (`BUY|SELL|DEPOSIT`), `stockSymbol`, `quantity`, `price`, `totalAmount` (required), timestamps.
- **Field-name consistency check.** Controllers write `stockSymbol`, `quantity`, `price`, `totalAmount`. Schema matches. ✅ The "schema-vs-controller drift" bug from the past appears **fixed**.
- **Smell:** no `WITHDRAW` type — yet the wallet has no withdraw endpoint either, so consistent (just incomplete).
- **Smell:** no compound index on `{user:1, createdAt:-1}` even though `getHistory` queries exactly that pattern.

### Utils
- **`ApiError.js` (23 LOC):** standard utility class. `data = null` is unused. Fine.
- **`ApiResponse.js` (10 LOC):** sets `success` from `statusCode < 400`. Fine.
- **`asyncHandler.js` (10 LOC):** Promise-resolve wrapper that forwards rejections to `next(err)`. Standard pattern. Fine.
- **`cloudinary.js` (28 LOC):** uploads from `localFilePath`, unlinks on success. **Bug:** in the `catch` it calls `fs.unlinkSync(localFilePath)` unconditionally, which **throws if the file already failed to write or was missing** — that throw is uncaught and propagates as a 500. Wrap in try/catch.

### Tests (`Tradeverse-Backend/tests/`)
- `example.test.js` — `expect(1+1).toBe(2)`. Smoke-test only.
- `trade.test.js` — **the only meaningful test in the project.** Covers buy/sell/portfolio/history with mocked Mongoose + yahoo-finance2 (note: real controller uses Finnhub via axios, not yahoo-finance2 — see §9, "yahoo-finance2 is mocked in the test but not actually called by the controller. The mock is dead.").

---

## 4. AI Service (FastAPI / Python)

### `Tradeverse-AI/main.py` (185 LOC)
- Loads env, connects to Pinecone, **lazy-loads** the SentenceTransformer (`all-MiniLM-L6-v2`) on first request via `get_model()` — done to dodge HF Spaces OOM at startup.
- `lifespan` context starts a background `refresh_news_loop()` that every 300 s pulls top-5 headlines from each of `general/forex/crypto/merger` Finnhub categories, embeds them, upserts into Pinecone with id `news_{ts}_{i}` and metadata `{text, type:"live_market_news"}`.
- CORS allows **one** origin from `CORS_ORIGIN` env (single string, not list).
- **Endpoints:**
  - `GET /` → `{status:"online", message:"…"}` — implicit health check.
  - `POST /search {text}` → embeds, queries Pinecone top_k=5, returns the **single best** match. `top_k=5` is wasteful since only `[0]` is used.
  - `POST /api/predict {symbol, weights:{sentiment,ma,rsi}}` → orchestrates `run_ensemble_model`. **No auth.**
- **Bugs / smells:**
  - **No authentication on `/api/predict` or `/search`.** Anyone with the URL can drain your Pinecone quota and Finnhub quota.
  - Lazy-load means the **first** `/api/predict` request after a cold boot will block for ~10 s downloading the model. The frontend has no retry logic — user sees "ERROR" and nothing else.
  - `refresh_news_loop` opens a *new* `httpx.AsyncClient` per category per cycle (4 clients per 5 min). Should reuse one.
  - `httpx` errors are caught broadly (`except Exception`); a 401 from Finnhub will be silently swallowed every cycle forever.
  - Hardcoded Pinecone index name `tradeverse-news`, model name, refresh interval (300 s), and Finnhub categories.
  - `confidence = min(round(abs(final_score)*50 + 50, 1), 99.9)` → **even a HOLD with `final_score=0` shows 50 % confidence in the response.** Confusing and unjustified.
  - The query string `"financial news and market updates for {symbol} stock earnings"` is the same for every request — Pinecone retrieval quality depends entirely on the symbol token. For `MSFT` you get headlines about Microsoft; for `BRK.B` you'd get garbage.
  - No request-level timeout enforcement — a slow yfinance fetch will block the worker indefinitely.

### `Tradeverse-AI/algo_engine.py` (282 LOC)

This is the most important file in the AI service. Read it carefully.

**Public functions:**
- `get_live_technicals(symbol) -> (ma_score, rsi_score, volatility, vol_multiplier)`
- `get_market_regime() -> "Panic" | "Trending" | "Sideways" | "Neutral"`
- `apply_fake_news_filter(headline, score) -> score` — regex-based rumor downgrade (×0.2)
- `get_finbert_sentiment(headline) -> float in [-1, +1]`
- `get_averaged_sentiment(headlines: list) -> float`
- `run_ensemble_model(symbol, weights, headlines=None) -> {final_score, signal, kelly_percentage}`

**Exact formula for final score (after `main.py` normalises user weights and `algo_engine` may overwrite them by regime):**

```
raw_sentiment   = weighted_avg(FinBERT(h_i)) over up to 5 headlines,
                  with weights = [2.0, 1.0, 1.0, 1.0, 1.0]
                  Each FinBERT(h_i): +confidence if "positive",
                                     -confidence if "negative",
                                     0 if "neutral",
                                     then ×0.2 if regex(rumor|allegedly|scam|...).
sent_score      = clip(raw_sentiment * volume_multiplier, -1, +1)

ma_score        = clip((current_close - SMA50) / SMA50 * 10, -1, +1)
rsi_score       = clip((50 - RSI14) / 20, -1, +1)        # Wilder's RSI
volatility      = std(daily returns over last 20 days) * sqrt(252)
volume_multipl. = clip(current_vol / 20-day avg vol, 0.5, 3.0)

if volatility > 0.80:                      # hard abort
    return HOLD, kelly=0

regime = market_regime()                   # SPY 200SMA + VIX bands
weights = match regime to:
    Panic     -> {sentiment:0.7, ma:0.1, rsi:0.2}
    Trending  -> {sentiment:0.3, ma:0.6, rsi:0.1}
    Sideways  -> {sentiment:0.2, ma:0.1, rsi:0.7}
    Neutral   -> (use the user-supplied normalised weights as-is)
weights renormalised to sum to 1.

final_weighted_score = sent_score * w_sent + ma_score * w_ma + rsi_score * w_rsi
```

**Final signal decision:**
```
technicals_bullish = (ma>0) or (rsi>0) or (ma==0 and rsi==0)   # neutral counts as bullish
technicals_bearish = (ma<0) or (rsi<0) or (ma==0 and rsi==0)   # neutral counts as bearish
sentiment_positive = sent_score > 0
sentiment_negative = sent_score < 0

if final_score >= +0.25 and technicals_bullish:
    if sentiment_negative: HOLD ("strong technical BUY but negative news")
    else: BUY
elif final_score <= -0.25 and technicals_bearish:
    if sentiment_positive: HOLD ("strong technical SELL but positive news")
    else: SELL
else: HOLD
```

**Kelly percentage:**
```
score_mag    = abs(final_weighted_score)
kelly_risk   = clip(score_mag * 18.57 - 2.64, 1.0, 20.0)   # only if signal is BUY/SELL, else 0
```

**This is NOT the Kelly criterion.** True Kelly is `f* = (p·b − q) / b` where `p,q` are win/loss probabilities and `b` is win/loss payoff ratio. The repo's formula is a **linear curve fit** that maps score 0.25 → ≈2 % and score 0.95 → ≈15 %, capped at 20 %. The `18.57` and `−2.64` are pure magic numbers — solve `(0.25,2), (0.95,15)` and you get `m=18.57, c=-2.64`. **Calling this "Kelly" is at best a marketing label; at worst, indefensible in an interview.** Be ready to either (a) own the simplification ("it's a confidence-to-risk mapping, named after Kelly because it bounds position size by signal strength") or (b) implement a real Kelly with backtested win/loss stats.

**Hardcoded thresholds / magic numbers:**
- `0.80` — volatility hard-abort (annualised σ).
- `0.25` — BUY/SELL trigger threshold (final score).
- `±0.20` SMA pct → ±1 score (`* 10` then clip).
- `RSI 30→+1, 50→0, 70→-1` (the `/20.0` divisor).
- VIX bands: `>30` Panic, `<20` Trending; SPY 200-SMA threshold.
- Regime weights `{0.7/0.1/0.2}`, `{0.3/0.6/0.1}`, `{0.2/0.1/0.7}`.
- FinBERT max input: 512 chars (note: this is *characters*, not tokens — comment says "tokens" which is wrong).
- First-headline weight = 2.0, others = 1.0.
- Fake-news regex: `\b(rumor|allegedly|scam|unverified|fraud|claims|falsely|supposedly)\b` — very limited list.
- Fake-news downgrade factor 0.2.
- Kelly slope/intercept `(18.57, -2.64)` and clip `[1, 20]`.
- Volume multiplier clip `[0.5, 3.0]`.

**Smells:**
- The user's slider weights are silently overridden by regime weights in 3 of 4 regimes. The UI shows weights that don't reflect what actually ran.
- `technicals_bullish`/`technicals_bearish` both count `(0,0)` as true → if yfinance fails the system can fire BUY *or* SELL as long as score crosses ±0.25 (sentiment alone suffices). That's the opposite of fail-safe.
- `get_finbert_sentiment` slices headline `[:512]` — that's character length, not tokens. FinBERT's tokenizer would handle truncation natively if you passed `truncation=True`.
- `apply_fake_news_filter` runs on the *post-FinBERT* score (so if FinBERT already labelled it neutral the multiplication does nothing). Should probably gate the headline before passing to FinBERT, or filter the raw text.
- `get_market_regime` does **two** yfinance round-trips on every prediction — this is the slowest call in the chain. Should be cached for at least 1 hour.
- `if __name__ == "__main__"` test block at the bottom runs real model loads — this means importing `algo_engine` for testing is fine, but running the file directly will eat several seconds.

### Other Python files (status: dev / educational / dead)
- **`bot_worker.py` (59 LOC)** — standalone scheduler that does the same news refresh as `main.py`'s lifespan loop. **Obsolete since the lifespan task was added.** Delete or document why it remains.
- **`fetch_news.py` (41 LOC)** — only used by the obsolete `bot_worker.py`. Dead.
- **`data_loader.py` (19 LOC)**, **`data_cleaner.py` (31 LOC)**, **`embed_test.py` (21 LOC)** — tutorial-era scripts that download `AAPL` data, compute a 20-day SMA, or print embeddings for hard-coded headlines. Useful as learning artefacts, *not* production code. Should live in a `notebooks/` or `experiments/` folder.
- **`upload_vectors.py` (40 LOC)** / **`search_vectors.py` (38 LOC)** — one-off Pinecone bootstrap scripts. Never executed by the running service. Should be tagged as "ops-only".
- **`colab_backtester.py` (186 LOC)** — runs a 20-year backtest of a simplified MA + RSI strategy across 7 tickers in Colab. Note that this backtester does **not** use FinBERT/Pinecone (it can't — no historical Pinecone data) and uses **100 % allocation** per signal change with **no transaction costs, slippage, or borrow fees**. README correctly flags this as "not rigorous." Don't quote its returns in interviews.
- **`clean_market_data.csv`, `market_data.csv`** — committed CSV artefacts. Delete and re-generate.

---

## 5. Frontend (React)

### `src/main.jsx` (41 LOC)
- Sets `axios.defaults.withCredentials = true`.
- Installs an axios response interceptor: on first 401 (not on `/refresh-token`), POSTs to `/users/refresh-token` and retries the original request once. On refresh failure, hard-redirects to `/`.
- **Smell:** the redirect uses `window.location.href = "/"` — full page reload. Loses React state and causes a flash. Use `navigate("/")` from the router instead.
- **Smell:** retry queue is implicit — multiple 401s in flight will each fire their own refresh request (no dedup). Should be coalesced into a single in-flight refresh promise.

### `src/App.jsx` (28 LOC)
- Three routes: `/` Login, `/register` Register, `/dashboard` (wrapped in `ProtectedRoute`) Dashboard.
- **Smell:** `/` renders Login even for authenticated users — no auto-redirect to `/dashboard`. Mildly annoying UX.

### `src/pages/Login.jsx` (116 LOC)
- Renders email + password form, posts to `${VITE_API_URL}/api/v1/users/login`, navigates to `/dashboard` on success.
- Reads error message from `err.response?.data?.message`. Backend uses `message`. ✅ Correct.

### `src/pages/Register.jsx` (159 LOC)
- Renders 4 text inputs + file input, builds `FormData`, posts to `/users/register` with `multipart/form-data`.
- **Bug:** reads `err.response?.data?.error` for the error string. **Backend sends `message`, not `error`.** So validation errors render the generic fallback "Registration failed. Try again." every time. Fix by reading `data?.message`.
- **Smell:** no client-side password strength check, no email format check beyond `type="email"`, no avatar size cap.
- **Smell:** "Creating Vault..." button text doesn't disable form fields, only the button — user can resubmit by pressing Enter twice.

### `src/pages/Dashboard.jsx` (413 LOC) — too large
- **Single component owning ALL state** for the dashboard: dark mode, sidebar, active symbol, search, three weights, logs, balance, portfolio, live prices, trade quantity, bot toggle, bot targets, stop loss, take profit, max capital, ref to portfolio, ref to interval.
- Calls **5 different API endpoints** (`/users/balance`, `/trades/price/:symbol`, `/trades/buy`, `/trades/sell`, `/users/logout`) and **2 AI endpoints** (`/api/predict`).
- Bot loop is `setInterval(runBotCycle, 60000)` triggered by toggle.
- **Bugs:**
  - **`stopLoss` and `takeProfit` sliders do nothing.** The bot loop never reads them. Pure UI placebo.
  - `useEffect` dependency arrays are intentionally suppressed with `// eslint-disable-next-line react-hooks/exhaustive-deps`. The bot loop won't pick up changes to `sentimentWeight/rsiWeight/maWeight/maxCapital` until you toggle it off and on.
  - Each bot cycle awaits a `setTimeout(1500)` between symbols → with 9 default targets that's ~13 s minimum per cycle, but the *interval* is only 60 s. If yfinance stalls, cycles overlap and submit duplicate orders.
  - The bot's BUY-quantity logic is `Math.max(1, Math.floor(maxCapital / livePrice))` — uses `maxCapital` not the AI's `kelly_percentage`. **The Kelly value is computed but never used by the client.** Dead in practice.
  - On SELL the bot dumps **the entire holding** every time, regardless of confidence. There's no incremental position management.
  - `setLogs` is `[...prev, msg]` — log array is **unbounded**. Long sessions OOM the tab.
  - `setTimeout(() => addLog(...), 0)` on the toggle is suspicious cargo-cult; appears to dodge a setState-during-render warning.
- **Smells:**
  - Component is 413 LOC. Splitting into `useDashboardWallet`, `useDashboardBot`, `useDashboardWeights` hooks would help.
  - Inline Tailwind class-name strings repeat the dark-mode ternary everywhere. Use `data-theme` + CSS vars or a wrapper.
  - The status cards (`Live Market Status`, `Analysis Engine Status`, `Current Signal`) are **hard-coded strings** — they never update from real state. "Connected" is a lie if the AI is down.
  - `aggregateValue` recomputes on every render. Memoize.

### `src/components/AlgoWeightControls.jsx` (48 LOC)
- Renders three sliders + "Execute Strategy" button. Pure presentational, props-driven.
- **Smell:** the three weights aren't constrained to sum to 1 — relies on the AI service to normalise. Fine, but the visible "%" labels can total 220 %, which looks like a bug to the user.

### `src/components/BotControlPanel.jsx` (100 LOC)
- Renders bot toggle, target chip selector, max-capital/stop-loss/take-profit sliders.
- **Bug:** `ALL_TARGETS` is duplicated here AND in `Dashboard.jsx` — single source of truth missing.
- **Smell:** the stop-loss/take-profit sliders are wired to state that nothing reads.

### `src/components/ExecutionLog.jsx` (38 LOC)
- Renders log strings, classified by emoji/keyword for colouring, auto-scrolls to bottom.
- **Smell:** colour classification by string-match is brittle. Move log entries to objects `{level, message}`.

### `src/components/HoldingsTable.jsx` (81 LOC)
- Renders the user's portfolio with shares / total spent / live value / net return %.
- Reads `portfolioLivePrices` map populated in `Dashboard`. Sound.
- **Smell:** `portfolio.length === 0` doesn't account for `portfolio` being an array of empty/invalid items (the `if (!stock.stockSymbol) return null;` guard handles that during render but the empty-state check stays false).

### `src/components/MarketSidebar.jsx` (140 LOC)
- Slide-out drawer with a hardcoded list of 12 popular stocks + manual symbol search box.
- **Smell:** the popular-stocks list is yet another hardcoded list (third copy, after `ALL_TARGETS` × 2). Hoist to a shared constants file.

### `src/components/ProtectedRoute.jsx` (40 LOC)
- On mount, GETs `/users/balance`. If 200, renders children; if not, redirects to `/`.
- **Smell:** issues a network call **every** time the protected route renders. Cache the result in context or use a `/me` endpoint with cookie verification only.
- **Smell:** during the `checking` state shows a centered spinner — fine, but blocks any nested route from prefetching.

### `src/components/TradingChart.jsx` (43 LOC)
- Embeds the TradingView Advanced Chart widget by injecting a `<script>` tag with JSON config. Rebuilds on `[symbol, isDarkMode]` change.
- **Smell:** the script is appended to a div whose `innerHTML = ""` is reset first — fine, but an SSR-style `dangerouslySetInnerHTML` would be cleaner.

### `src/components/TradingPanel.jsx` (63 LOC)
- Holds the chart + manual buy/sell controls. Disabled when livePrice is null/ERROR.
- **Smell:** `tradeQuantity` is a string in state (from `<input>`) but submitted directly to the backend. Backend coerces with `Number()`, so OK, but type-discipline is sloppy.

---

## 6. Database Schema

### Mongoose: `User` (collection `users`)
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | implicit |
| `username` | String, required, unique, lowercase, trim, indexed | |
| `email` | String, required, unique (→ index), lowercase, trim | |
| `fullName` | String, required, trim, indexed | |
| `avatar` | String, required | URL — Cloudinary or `ui-avatars.com` fallback |
| `password` | String, required | bcrypt cost 10, hashed in pre-save hook |
| `walletBalance` | Number, default 100000 | |
| `portfolio` | `[portfolioItemSchema]` | embedded array |
| `refreshToken` | String | nullable |
| `createdAt`, `updatedAt` | Date | from `timestamps:true` |

### Embedded sub-schema: `portfolioItem` (no own collection)
| Field | Type |
|---|---|
| `stockSymbol` | String, required |
| `quantity` | Number, required, default 0 |
| `averagePrice` | Number, required, default 0 |

### Mongoose: `Transaction` (collection `transactions`)
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | implicit |
| `user` | ObjectId, ref `User`, required | |
| `type` | String enum `BUY|SELL|DEPOSIT`, required | no `WITHDRAW` |
| `stockSymbol` | String | optional (DEPOSIT has none) |
| `quantity` | Number | optional |
| `price` | Number | optional |
| `totalAmount` | Number, required | |
| `createdAt`, `updatedAt` | Date | from `timestamps:true` |

### Indexes
- `users.username` (unique + explicit `index:true`)
- `users.email` (implicit unique index)
- `users.fullName` (`index:true`)
- No indexes on `Transaction`. (`getHistory` does `find({user}).sort({createdAt:-1})` — would benefit from `{user:1, createdAt:-1}`.)

### Schema-vs-controller field-name consistency
| Place | Field used | Schema field | Match? |
|---|---|---|---|
| `trade.controller` BUY/SELL | `stockSymbol`, `quantity`, `averagePrice` | same | ✅ |
| `Transaction.create` | `user`, `type`, `stockSymbol`, `quantity`, `price`, `totalAmount` | same | ✅ |
| `getPortfolio` aggregation | `stockSymbol`, `quantity`, `averagePrice` | same | ✅ |
| `addMoneyToWallet` | `walletBalance` | same | ✅ |

The historical "schema vs controller drift" appears **resolved** in the current code. The code is internally consistent.

---

## 7. Authentication & Security

### JWT generation & validation
- `generateAccessToken` signs `{_id, email, username, fullName}` with `ACCESS_TOKEN_SECRET`, expiry from `ACCESS_TOKEN_EXPIRY` (env, default 1d in `.env.example`).
- `generateRefreshToken` signs `{_id}` only with `REFRESH_TOKEN_SECRET`, expiry from `REFRESH_TOKEN_EXPIRY` (default 10d).
- Tokens written to **HttpOnly, secure, sameSite=none** cookies. Mounted on every successful login and refresh.
- Validation: `verifyJWT` middleware reads the cookie, verifies access token, fetches the user (sans password and refresh token).

### Where auth is applied
| Route | Protected? |
|---|---|
| `POST /api/v1/users/register` | ❌ public (correct) |
| `POST /api/v1/users/login` | ❌ public (correct) |
| `POST /api/v1/users/refresh-token` | ❌ public, but reads cookie (correct) |
| `POST /api/v1/users/logout` | ✅ |
| `POST /api/v1/users/wallet/add` | ✅ |
| `GET  /api/v1/users/balance` | ✅ |
| `GET  /api/v1/trades/price/:symbol` | ❌ **should probably be protected — anyone can drain your Finnhub quota** |
| `POST /api/v1/trades/buy` | ✅ |
| `POST /api/v1/trades/sell` | ✅ |
| `GET  /api/v1/trades/portfolio` | ✅ |
| `GET  /api/v1/trades/history` | ✅ |
| `POST /api/v1/ai/ask` | ❌ **dead and unprotected** |
| FastAPI `POST /api/predict` | ❌ **completely unauthenticated** — public abuse vector |
| FastAPI `POST /search` | ❌ same |

### Routes that should be protected but aren't
1. **FastAPI `/api/predict`** — embeddings + Pinecone + yfinance + FinBERT inference per call. Trivial to weaponise into a denial-of-wallet attack.
2. **FastAPI `/search`** — same.
3. **Backend `/trades/price/:symbol`** — Finnhub free tier is 60 calls/min. One attacker burns through this in seconds.
4. **Backend `/api/v1/ai/ask`** — even though it's dead.

Recommended fix: pass the JWT cookie through to FastAPI, or have FastAPI verify a backend-issued service token, or front the AI service with the Express backend (proxy).

### Password hashing
- bcrypt with cost factor 10 (default). Adequate for 2026 CPU; consider 12 if your host can stomach the latency.
- Passwords hashed in the `pre("save")` hook and re-hashed on any save where `password` was modified.

### CORS configuration
- Manual middleware in `app.js` setting:
  - `Access-Control-Allow-Origin: ${CORS_ORIGIN}` (single origin, no wildcard)
  - `Access-Control-Allow-Credentials: true`
  - methods: `GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS`
  - headers: `Content-Type, Authorization`
- Preflight returns 204.
- The npm `cors` package is in `package.json` but unused.
- **FastAPI** uses `CORSMiddleware` with `allow_origins=[CORS_ORIGIN_or_localhost]` — single origin only.

### Secret / API-key handling
- `.env` files exist locally for all three services (in repo file tree, **but** `.gitignore` excludes `.env` so they shouldn't be committed — verify `git ls-files | grep .env` shows nothing).
- `.env.example` files exist for all three (committed, no secrets).
- Searching the codebase: I see **no hardcoded API keys**. All secret reads use `process.env.*` (Node) or `os.getenv` (Python). ✅
- However **`fix_dashboard.js` in repo root** is a one-off dev script that hard-codes Windows paths — not a secret leak, just litter.

### Other security notes
- `cookieOptions.secure: true` will silently fail to set cookies over HTTP. Local dev needs HTTPS or a `secure: process.env.NODE_ENV === "production"` flag.
- No CSRF protection on cookie-bearing POSTs. `sameSite: "none"` requires CSRF defence (CSRF tokens or `sameSite: "strict"` + Bearer header). With `sameSite:none` you are **vulnerable to cross-site POST CSRF**.
- No rate limiting anywhere (no `express-rate-limit`). Login endpoint can be brute-forced.
- No helmet / security headers middleware.
- Multer accepts arbitrary file types — unrestricted upload.
- Stack traces hidden from clients (good) but also from logs (bad — global error handler doesn't log anything).

---

## 8. Environment Variables

| Variable | Used In | Purpose |
|---|---|---|
| `PORT` | Backend `index.js` | HTTP port (default 8000) |
| `MONGODB_URI` | Backend `db/index.js` | Mongo Atlas connection string (DB name appended in code) |
| `ACCESS_TOKEN_SECRET` | Backend `auth.middleware.js`, `user.model.js` | JWT signing secret (access) |
| `ACCESS_TOKEN_EXPIRY` | Backend `user.model.js` | Access token TTL (default `1d`) |
| `REFRESH_TOKEN_SECRET` | Backend `user.controller.js`, `user.model.js` | JWT signing secret (refresh) |
| `REFRESH_TOKEN_EXPIRY` | Backend `user.model.js` | Refresh token TTL (default `10d`) |
| `REDIS_URL` | Backend `trade.routes.js` | Price-cache Redis (default `redis://localhost:6379`) |
| `FINNHUB_API_KEY` | Backend `trade.routes.js`, `trade.controller.js`; AI `main.py`, `fetch_news.py` | Live quotes + news. **Used in TWO services with the same key.** |
| `CLOUDINARY_CLOUD_NAME` | Backend `cloudinary.js` | Cloudinary cloud |
| `CLOUDINARY_API_KEY` | Backend `cloudinary.js` | |
| `CLOUDINARY_API_SECRET` | Backend `cloudinary.js` | |
| `CORS_ORIGIN` | Backend `app.js`, AI `main.py` | Allowed browser origin (single string) |
| `PINECONE_API_KEY` | AI `main.py`, `bot_worker.py`, `upload_vectors.py`, `search_vectors.py` | Pinecone auth |
| `VITE_API_URL` | Frontend `main.jsx`, `Dashboard.jsx`, `Login.jsx`, `Register.jsx`, `ProtectedRoute.jsx` | Backend base URL — baked into bundle at build time |
| `VITE_AI_URL` | Frontend `Dashboard.jsx` | AI service base URL — baked into bundle at build time |

Variables in `.env.example` but **never read in code** (deletable):
- None obvious — all the documented vars are referenced.

Variables read in code but **not documented in `.env.example`** (add them):
- `CORS_ORIGIN` is read by both backend and AI but **not in any `.env.example`**.
- `PORT` is read but not in backend `.env.example`. (Actually, it is — present. ✅)

---

## 9. Known Bugs / Issues / Tech Debt

### Critical
1. **AI controller hardcodes `http://127.0.0.1:8001/search`** — the `/api/v1/ai/ask` endpoint is broken in any deployed environment. (`ai.controller.js:18`)
2. **Frontend talks directly to FastAPI from the browser**, bypassing JWT and exposing the AI URL publicly.
3. **`/api/predict` and `/search` have NO authentication** — Pinecone and Finnhub quotas exposed to the open internet.
4. **`/trades/price/:symbol` is unauthenticated** and uncached on first hit — Finnhub abuse vector.
5. **`livePrice` falls back to a hardcoded `150.0`** in three places (`/price/:symbol`, `buy`, `sell`) when Finnhub fails, **so trades silently execute at fake prices**.
6. **CSRF vulnerability** — `sameSite: "none"` cookies on POST endpoints without CSRF tokens.
7. **MongoDB transactions require a replica set.** A standalone Mongo instance (e.g. local/dev) crashes every buy/sell.
8. **Multer filename collision** — `file.originalname` verbatim; concurrent uploads overwrite each other.
9. **`secure: true` cookies** silently fail on local HTTP dev. Login appears to succeed but no cookie is stored.
10. **Bot's stop-loss / take-profit sliders are placebo** — not read by the bot loop.
11. **Bot ignores `kelly_percentage` returned from AI** — quantity sized by `Math.floor(maxCapital / price)` instead.
12. **Bot SELL dumps entire holding** with no incremental sizing.
13. **AI Engine market regime overrides user weights silently** — UI sliders are misleading.
14. **`getHistory` has no pagination and no `{user, createdAt}` index** — performance cliff after a few hundred trades.
15. **`addMoneyToWallet` has no upper bound** — DoS by ledger inflation.

### High
16. **Symbol regex `/^[A-Z]+$/`** rejects `BRK.B`, `RDS-A`, `BF.B`, `^GSPC`, etc.
17. **Backend declares `yahoo-finance2` dependency but never uses it** at runtime — only the test file references it (and mocks it). Dead dep + dead mock.
18. **`cors` npm package declared but unused** — manual CORS overrides it. Dead dep.
19. **`getAiInsight` controller + `/api/v1/ai/ask` route + `aiRouter` are entirely dead code.**
20. **`bot_worker.py`, `fetch_news.py` are obsolete** since `main.py` lifespan refresh was added.
21. **`data_loader.py`, `data_cleaner.py`, `embed_test.py`, `upload_vectors.py`, `search_vectors.py`** are dev scripts cluttering the AI root.
22. **`market_data.csv`, `clean_market_data.csv`** committed to repo — should be `.gitignored` and regenerated.
23. **`fix_dashboard.js` in project root** is a one-off Windows-path script — looks AI/agent-generated. Delete.
24. **Register page reads `data?.error` but backend sends `data?.message`** — registration errors never display correctly.
25. **`/users/balance` route returns raw shape** (no `ApiResponse` envelope) — inconsistent with every other endpoint.
26. **Status cards on Dashboard are hardcoded strings** ("Connected", "Awaiting execution...") — never reflect real state.
27. **`addLog` produces an unbounded array** — long bot sessions leak memory.
28. **Bot interval can overlap** if a cycle takes >60 s with 9 targets and 1.5 s sleep each.
29. **No CSRF protection, no rate limit, no helmet headers.**
30. **Multer accepts unrestricted file types and sizes.**

### Medium
31. **Cookie options missing `maxAge`/`path`/`domain`** — defaults work but not explicit.
32. **No `WITHDRAW` transaction type** despite a wallet existing.
33. **`getPortfolio` uses `averagePrice || 150` magic fallback** — `||` treats 0 as missing.
34. **Trade controller catch reduces all unknown errors to 400** — masks 5xx.
35. **Global Express error handler doesn't log anything** — invisible 500s in production.
36. **No graceful shutdown** in `index.js`; SIGTERM kills in-flight requests.
37. **No health endpoint** on backend (`/healthz`). HF Spaces and Render health checks rely on the root route, which on backend is a 404.
38. **`ProtectedRoute` issues a network call on every navigation** — should cache.
39. **axios refresh interceptor doesn't dedupe** — N concurrent 401s fire N refresh requests.
40. **AI service confidence value is 50% even on HOLD with score 0** — misleading.
41. **AI service's Pinecone retrieval query is identical for every symbol** modulo the symbol token — quality-of-context degrades for less-common tickers.
42. **Magic numbers throughout `algo_engine.py`** with no central config (volatility 0.80, BUY threshold 0.25, Kelly 18.57/-2.64, etc.).
43. **The "Kelly" formula isn't Kelly** — it's a linear curve fit. Misleading naming for an interview.
44. **Lazy-loaded models cause first-request latency spike** without retry on the frontend — user sees "ERROR" once and may not retry.
45. **`get_market_regime` does two yfinance calls per prediction** — should be cached.
46. **`refresh_news_loop` opens a new `httpx` client per category per cycle** — should reuse.
47. **`refresh_news_loop` swallows all exceptions silently** for an indefinite loop.
48. **`apply_fake_news_filter` runs after FinBERT** — neutral labels can't be reduced.
49. **FinBERT input slice `[:512]` is characters, not tokens** — comment is wrong.
50. **`technicals_bullish/bearish` treat `(0,0)` as both true** — fail-open, not fail-safe.
51. **`addLog` for the first bot tick uses `setTimeout(..., 0)`** — cargo-culted setState dodge.
52. **Currency symbol inconsistency** — `addMoneyToWallet` uses `₹`, frontend uses `$`.

### Low / cosmetic
53. **Duplicate `ALL_TARGETS` array** in `Dashboard.jsx` and `BotControlPanel.jsx`.
54. **Duplicate stock-list constants** (`POPULAR_STOCKS` in sidebar).
55. **Console.log debugging** scattered across `trade.routes.js`, `user.controller.js`, `ai.controller.js`, `main.py`, `algo_engine.py`. Production noise.
56. **`existedUser` typo** (should be `existingUser`).
57. **`registerUser` builds a fallback avatar URL with `ui-avatars.com`** — third-party dependency without fallback.
58. **`Dashboard.jsx` 413 LOC** — should be split into hooks.
59. **`algo_engine.py` 282 LOC** — dense, but acceptable.
60. **Two Dockerfiles for the AI service** — `Tradeverse-AI/Dockerfile` (port 8001) and `Project/Dockerfile` (port 7860 for HF Spaces). Confusing.
61. **`docker-compose.yml` only has Redis** — README admits this; awkward for new contributors.
62. **No CI configuration** (`.github/workflows`, `vercel.json`, `render.yaml`, etc.) — deployment is presumably done via dashboards.
63. **`TODO/FIXME` count: 0** — no leftover author notes. ✅
64. **Comments on routes mention "double-spend race conditions"** — overstates what a Mongo TXN actually prevents here.
65. **`tests/` only has trade controller** — no auth, wallet, route, AI controller tests.
66. **`App.test.jsx` is a `1+1==2` smoke test** — meaningless coverage.

---

## 10. Deployment Configuration

### Frontend → Vercel (assumed)
- `vite build` outputs to `dist/`. There is **no `vercel.json`** — relies on Vercel's auto-detection of Vite.
- Build command: `npm run build`. Install: `npm install`. Output: `dist`.
- Env vars must be set in the Vercel dashboard: `VITE_API_URL`, `VITE_AI_URL` (note: these are **bake-time**, so changes require re-deploy).
- Multi-stage Dockerfile exists (`Tradeverse-Frontend/Dockerfile` → nginx) but is unused by Vercel.
- **No SPA fallback rewrite configured** — direct visit to `/dashboard` may 404 unless Vercel auto-detects `index.html` fallback (it usually does).

### Backend → Render (or Koyeb per recent commit history)
- No `render.yaml`, no `koyeb.yaml`. Service config is dashboard-driven.
- Build: `npm install`. Start: `npm start` → `node src/index.js`.
- Dockerfile in `Tradeverse-Backend/Dockerfile` runs `npm run dev` (with nodemon!) — **this is wrong for production.** Render usually ignores Dockerfile in favour of Buildpack, but if Docker is enabled you'll be running nodemon in prod.
- `PORT` is read from env (Render injects it).
- Env vars: see §8.
- Health check endpoint: **none.** Render's health probe will hit `/` and get a 404 — the service is still considered up because the TCP socket is listening.
- Recent commit history shows churn between Render and Koyeb due to Yahoo Finance blocking. Note that the current code uses **Finnhub for prices** (axios direct in trade routes/controllers), not Yahoo — so the "Yahoo blocked" issue is moot for trading. Yahoo (yfinance) is only used by the AI service for technicals and SPY/VIX.

### AI Engine → Hugging Face Spaces (Docker SDK)
- Root `README.md` carries the HF Spaces frontmatter (`sdk: docker`, `app_port: 7860`).
- Root `Dockerfile` builds the AI service against `Tradeverse-AI/requirements.txt`, copies the AI folder, runs `uvicorn main:app --host 0.0.0.0 --port 7860`.
- Non-root user `user:1000` (HF mandate).
- No HF-specific Dockerfile in `Tradeverse-AI/` — there's an *additional* Dockerfile inside the AI folder (`port 8001`) used for local docker / Render — this confused split should be documented.
- Env vars: configure as HF Space "Repository secrets": `PINECONE_API_KEY`, `FINNHUB_API_KEY`, `CORS_ORIGIN`.
- Health check: HF will probe `GET /` → returns `{"status":"online", ...}`. ✅
- The lazy-load of FinBERT/MiniLM means **the first user request after a cold start will time out** in the browser if it exceeds axios's default timeout (none, so it'll hang indefinitely — but TradingView and Vercel proxies may cut earlier).

### CI/CD
- **None.** No `.github/workflows/`, no `.gitlab-ci.yml`, no other CI config.
- No automated test runs on PRs. The vitest suites would catch the trade controller regressions, but only if someone runs them locally.

### docker-compose
- Local-only Redis helper. Not for production.

---

## 11. Test Coverage

- **Framework:** Vitest (both backend and frontend declare it; backend uses `--pool=threads`).
- **Backend tests** (`Tradeverse-Backend/tests/`):
  - `example.test.js` — 1 trivial assertion (smoke check).
  - `trade.test.js` — 8 assertions covering buy/sell/portfolio/history with mocked Mongoose, mocked yahoo-finance2, and a stubbed mongoose session. Covers: invalid symbol, invalid quantity, new buy + transaction record, weighted-average recalculation, insufficient funds, sell with insufficient shares, sell partial, portfolio metrics, history.
  - **Critical mocking bug:** the test mocks `yahoo-finance2`, but the actual `trade.controller.js` calls **Finnhub via axios**, not yahoo-finance2. So the "live price" the test thinks the controller is using is never actually read — the controller would, in real life, hit the network. The test passes only because the mocked `User.findById(...).session(...)` short-circuits before the price branch matters.
- **Frontend tests** (`src/App.test.jsx`):
  - 1 trivial `expect(1+1).toBe(2)` smoke test. **No real coverage.**
- **AI service tests:** **none.** No `pytest` config, no test files.

**What's tested:** trade controller business logic (with broken mock).
**What isn't tested:** auth flow, wallet, registration, file upload, AI controller, every route handler, every React component, the Python signal engine, the regime detector, the Pinecone integration, the bot loop.

---

## 12. Interview Talking Points

> Honest, defensible answers — not hype.

**Q: Why FastAPI for the AI service vs Node.js?**
> The Python ecosystem is where the model libraries live — `transformers`/FinBERT, `sentence-transformers`, `yfinance`, `pinecone-client`, and `pandas`. Calling HuggingFace pipelines from Node requires either a separate ONNX export pipeline or a hosted inference API, both of which add latency and operational cost. FastAPI gives me Python-native model access, automatic OpenAPI docs, async I/O for the Pinecone/Finnhub calls, and a clean Pydantic validation layer. The tradeoff is operational: I'm now running and paying for two separate runtimes instead of one.

**Q: Why Pinecone over alternatives (FAISS, Weaviate, pgvector)?**
> Pinecone is a managed serverless vector DB — there's no instance to size, no ops burden, and the free tier is enough for this project's news-headline volume. FAISS is a library, so I'd need to host it inside the Python process and persist the index myself. Weaviate is heavier and self-hosted unless I pay for cloud. pgvector is great if you already have Postgres, but I didn't, and I didn't want to add a relational store just for embeddings. The honest cost of Pinecone is vendor lock-in and per-query pricing — I traded those for zero ops at this scale.

**Q: Why SentenceTransformers (`all-MiniLM-L6-v2`) over OpenAI embeddings?**
> MiniLM gives 384-dim embeddings at zero per-call cost, runs on CPU, and is good enough for short headline retrieval where vocabulary overlap is high. OpenAI's `text-embedding-3-small` (1536-dim) would give better recall on nuanced queries, but it adds API cost on every prediction *and* every news refresh — the news loop alone runs every 5 minutes against ~20 headlines. At project budget that adds up. I'd switch to OpenAI embeddings the moment the queries got longer or more conceptual; for a 5-word query against a 10-word headline, MiniLM is fine.

**Q: Why separate the AI service from the main backend?**
> Three reasons. First, language: the AI logic is Python, the API server is Node — keeping them as one process means choosing one and paying conversion cost. Second, deploy independence: the model loads consume ~500 MB of RAM; bundling them with the trading API would force me to size the trading host for the worst-case Python footprint. Third, the AI service can be cold-started or even taken offline without breaking trades — the dashboard degrades gracefully (manual buy/sell still works). The cost of separation is one extra network hop, one extra deployment target, and a CORS surface.

**Q: Why deploy on three different platforms (Vercel / Render / HF Spaces)?**
> Each platform's free tier is shaped to one of the three workloads. Vercel is best-in-class for Vite/React static deploys and edge-cached. Render gives me a long-lived Node process with persistent connections to Mongo and Redis — Vercel's serverless functions would cold-start each request and break the Redis cache. HF Spaces gives 16 GB of disk for free for ML images, which is what I need to ship a 1+ GB FinBERT image; Render's free tier doesn't have that. The downside is three dashboards, three secret stores, three different ways CI fails — and I currently have no CI.

**Q: How does the system handle scale?**
> Honestly: it doesn't, yet. The Express backend will scale horizontally because state is in Mongo and Redis, but I have no rate limiting, no request queueing, and the FastAPI service has lazy-loaded global model state that's not thread-safe under heavy load. The AI prediction endpoint is the slowest path — yfinance calls for SPY/VIX run on every request without caching. To scale to thousands of users I'd need (a) cache market regime for ~1 hour, (b) cache live prices in Redis for longer than 10 s with stale-while-revalidate, (c) move the FinBERT pipeline to a worker queue (Celery + Redis) so the API stays responsive, (d) add rate limiting on every public endpoint, (e) fix the unauthenticated AI endpoints. Today the design holds up to maybe a couple of dozen concurrent active users.

**Q: What would you change if you had to rebuild this?**
> Five things, in order. (1) **Front the AI service behind the Express backend** so all traffic carries the JWT and I can rate-limit at one chokepoint. (2) **Replace the manual CORS middleware with the `cors` package** and drop the unused dep. (3) **Real Kelly criterion or rename it** — the current curve fit is indefensible. (4) **Move the embedded portfolio array out of the User document** into its own collection with `{userId, symbol}` as a unique compound key — easier to index, easier to paginate. (5) **Ship a real CI** with vitest + pytest + lint on every PR; right now nothing stops a regression.

---

## 13. Code Quality Snapshot

### Total LOC by language (source files only, excluding deps and dist)
- **Python (AI service):** 882 LOC across 11 files (282 in `algo_engine.py`, 186 in `colab_backtester.py`, 185 in `main.py`).
- **JavaScript (Backend):** 869 LOC across 14 source files + ~270 LOC of tests.
- **JSX (Frontend):** ~1,275 LOC across 12 React files (`Dashboard.jsx` is 413, `Register.jsx` is 159, `MarketSidebar.jsx` is 140, `Login.jsx` is 116).
- **Total:** ~3,156 LOC of human code (excluding generated CSS, lockfiles, dist).

### File count by service
- **AI service:** 11 Python source files.
- **Backend:** 14 source `.js` files + 2 test files.
- **Frontend:** 11 component/page `.jsx` files + 2 entrypoints + 1 test file.

### Files that feel oversized (>300 LOC)
- `Tradeverse-Frontend/src/pages/Dashboard.jsx` — **413 LOC**, owns all state and effects. Should be split into custom hooks (`useWallet`, `useBot`, `useAlgoExecution`).
- `Tradeverse-AI/algo_engine.py` — 282 LOC. Acceptable for a single-purpose engine; could split into `technicals.py` + `regime.py` + `signal.py`.

### Files that feel under-sized (<10 LOC)
- `Tradeverse-Backend/src/constants.js` — 1 LOC. Fine, but could be inlined.
- `Tradeverse-Backend/src/routes/ai.routes.js` — 9 LOC, **and entirely dead** (see §9).
- `Tradeverse-Backend/tests/example.test.js` — 7 LOC of `1+1==2`. Delete.
- `Tradeverse-Frontend/src/App.test.jsx` — 7 LOC of the same. Delete.

### Naming consistency check
- Backend uses `*.controller.js`, `*.routes.js`, `*.model.js`, `*.middleware.js` — consistent.
- Mongoose model names: `User`, `Transaction` — PascalCase singular, consistent.
- Frontend components are PascalCase, hooks would be camelCase (none yet).
- Mongoose field naming inconsistency: `stockSymbol` vs `symbol` (the controller accepts `req.body.symbol || req.body.stockSymbol` — historical migration cruft).
- AI service Python: `snake_case` consistently. `get_*` and `apply_*` and `run_*` prefixes are clear.
- Three different copies of the popular-stocks list (`Dashboard.ALL_TARGETS`, `BotControlPanel.ALL_TARGETS`, `MarketSidebar.POPULAR_STOCKS`) — naming differs and contents differ. Consolidate.
- Env var naming: backend uses `SCREAMING_SNAKE`, frontend uses `VITE_*` (Vite mandate), Python uses `SCREAMING_SNAKE`. Consistent within each service.

### Heuristic AI-generation flags

These read like AI-generated and may not be deeply understood:
- **`fix_dashboard.js`** in repo root — uses `c:\\Project\\tradeverse-frontend\\` lowercase paths (the actual folder is `Tradeverse-Frontend` with capital T/F). Looks like an AI tried to monkey-patch the dashboard and the script wouldn't run. Delete it.
- **The "Kelly" formula `(score_mag * 18.57) - 2.64`** — defensible only if you can explain the linear interpolation between `(0.25, 2)` and `(0.95, 15)`. The constants are too precise to be picked manually.
- **Magic-number cargo cult in `algo_engine.py`** — many of the thresholds (volatility 0.80, score 0.25, MA scaling × 10, RSI divisor 20, fake-news 0.2x) have no documented derivation. They look like LLM-generated "reasonable defaults." If asked in an interview, be ready to either justify them empirically (run a sensitivity analysis) or admit they're heuristics.
- **`asyncio.create_task(refresh_news_loop())` inside a FastAPI lifespan** — the pattern is correct but the comments around it ("Fix #2", "Fix #3", "Fix #4") look like LLM iteration markers; consider rewriting comments in human voice.
- **Confidence formula `min(round(abs(score)*50 + 50, 1), 99.9)`** — produces 50 % on a HOLD. Be ready to defend why.
- **Multiple emoji-heavy `print()` statements** in Python code — not inherently bad, but reads as boilerplate AI output. Either embrace it as your style or strip.
- **Triple-nested ternaries in Tailwind class names** in `Dashboard.jsx` — typical of code that was iterated by an LLM rather than written by hand.

### Final honest verdict

Tradeverse is a **competent full-stack portfolio project** that demonstrates real skills: cookie-based JWT auth, multi-document MongoDB transactions, a real-news-driven sentiment pipeline, a multi-tier deployment, and a testable backend architecture. It is **not production-grade**: there is no auth on the AI service, the Kelly formula is mislabelled, several UI controls are decorative, and a few critical bugs (price fallback to $150, hardcoded localhost in the AI controller, CSRF exposure) would fail any serious code review.

For an interview, **lean into the architecture story** (three-tier separation, why Pinecone, why FastAPI) and **own the limitations explicitly** ("I named it Kelly because it's a confidence-to-risk mapping; a real Kelly would need backtested win/loss stats — here's how I'd add them"). Don't claim production-readiness or quote backtest returns. Fix the critical bugs in §9 before showing this to a serious reviewer.
