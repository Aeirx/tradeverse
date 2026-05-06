"""
Tradeverse-AI FastAPI app.

Endpoints:
  GET  /                — open health probe (HF Spaces / Render uses this)
  GET  /warmup          — open, idempotent: forces lazy models to load
  POST /search          — auth: needs X-API-Secret. Best-headline retrieval.
  POST /api/predict     — auth: needs X-API-Secret. Full ensemble decision.

Background:
  - lifespan launches a single news-refresh loop that reuses one httpx
    AsyncClient (#46), logs failures with logger.exception (#47), and
    shouts louder after N consecutive failures.
  - lifespan also spawns a model-warmup task so the first user request
    after a cold boot doesn't wait 10+ s for FinBERT + MiniLM to load (#44).
"""

import os
import asyncio
import logging
import secrets
import time

import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel
from dotenv import load_dotenv
from pinecone import Pinecone
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

import config
from algo_engine import run_ensemble_model, get_nlp_pipeline

# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("tradeverse-ai")

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
API_SECRET = os.getenv("API_SECRET")

if not API_SECRET:
    raise RuntimeError(
        "API_SECRET env var is required. Set it to a long random string "
        "and configure the same value as AI_SERVICE_SECRET on the backend."
    )


def require_api_secret(x_api_secret: str | None = Header(default=None, alias="X-API-Secret")):
    if not x_api_secret or not secrets.compare_digest(x_api_secret, API_SECRET):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Secret header.")
    return True


logger.info("🔌 Connecting to Pinecone Cloud...")
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(config.PINECONE_INDEX_NAME)

# Lazy model loader (warmed in lifespan) — see #44.
_embedding_model = None
_warmup_status = {"models_loaded": False, "loading": False}


def get_model():
    global _embedding_model
    if _embedding_model is None:
        logger.info("🧠 Loading embedding model (%s)...", config.EMBEDDING_MODEL)
        _embedding_model = SentenceTransformer(config.EMBEDDING_MODEL)
    return _embedding_model


async def warmup_models():
    """Pull both models into memory in the background. Idempotent."""
    if _warmup_status["models_loaded"] or _warmup_status["loading"]:
        return
    _warmup_status["loading"] = True
    try:
        logger.info("🔥 Warming up models in background...")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, get_model)
        # Encode once to materialise the underlying torch graph.
        await loop.run_in_executor(None, lambda: get_model().encode("warmup"))
        await loop.run_in_executor(None, get_nlp_pipeline)
        _warmup_status["models_loaded"] = True
        logger.info("✅ Models warmed.")
    except Exception:
        logger.exception("Model warmup failed — will retry lazily on first request.")
    finally:
        _warmup_status["loading"] = False


# ---------------------------------------------------------------------------
# Symbol → company-name map for sharper Pinecone retrieval (#41).
# ---------------------------------------------------------------------------

SYMBOL_TO_NAME = {
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "TSLA": "Tesla",
    "NVDA": "Nvidia",
    "AMZN": "Amazon",
    "META": "Meta Platforms",
    "GOOGL": "Alphabet Google",
    "GOOG": "Alphabet Google",
    "AMD": "Advanced Micro Devices",
    "INTC": "Intel",
    "NFLX": "Netflix",
    "COIN": "Coinbase",
    "SPY": "S&P 500",
    "JPM": "JPMorgan Chase",
    "WMT": "Walmart",
    "XOM": "Exxon Mobil",
    "JNJ": "Johnson & Johnson",
    "BRK.B": "Berkshire Hathaway",
    "UBER": "Uber",
    "DIS": "Disney",
    "BA": "Boeing",
    "F": "Ford",
}


def build_pinecone_query(symbol: str) -> str:
    """Build a richer retrieval query that includes the company name when known."""
    company = SYMBOL_TO_NAME.get(symbol.upper())
    if company:
        return f"{company} ({symbol}) stock market news earnings recent"
    return f"{symbol} stock market news earnings recent"


# ---------------------------------------------------------------------------
# News refresh loop (background) — single shared httpx client (#46),
# proper logging (#47), and a failure counter that shouts after N misses.
# ---------------------------------------------------------------------------


async def refresh_news_loop(http_client: httpx.AsyncClient):
    consecutive_failures = 0

    while True:
        try:
            logger.info("⏰ [AUTO-REFRESH] Fetching live headlines into Pinecone memory...")
            headlines: list[str] = []

            for category in config.NEWS_REFRESH_CATEGORIES:
                url = (
                    f"https://finnhub.io/api/v1/news?category={category}"
                    f"&token={FINNHUB_API_KEY}"
                )
                res = await http_client.get(url)
                res.raise_for_status()
                articles = res.json()
                for article in articles[: config.NEWS_REFRESH_PER_CATEGORY]:
                    if article.get("headline"):
                        headlines.append(article["headline"])

            if headlines:
                vectors = []
                for i, text in enumerate(headlines):
                    vec = get_model().encode(text).tolist()
                    vectors.append({
                        "id": f"news_{int(time.time())}_{i}",
                        "values": vec,
                        "metadata": {"text": text, "type": "live_market_news"},
                    })
                index.upsert(vectors=vectors)
                logger.info("✅ [AUTO-REFRESH] Memorized %d live headlines into Pinecone.", len(vectors))
            else:
                logger.warning("⚠️ [AUTO-REFRESH] No headlines fetched this cycle.")

            consecutive_failures = 0
        except Exception:
            consecutive_failures += 1
            logger.exception("[AUTO-REFRESH] Cycle failed (consecutive failures: %d).", consecutive_failures)
            if consecutive_failures >= config.NEWS_REFRESH_ALERT_AFTER_FAILURES:
                logger.critical(
                    "🚨 [AUTO-REFRESH] %d consecutive failures — Pinecone memory is going stale. "
                    "Check Finnhub key/quota.",
                    consecutive_failures,
                )

        await asyncio.sleep(config.NEWS_REFRESH_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # One reusable HTTP client for the lifetime of the process (#46).
    http_client = httpx.AsyncClient(timeout=config.NEWS_REFRESH_HTTP_TIMEOUT_SECONDS)
    refresh_task = asyncio.create_task(refresh_news_loop(http_client))
    warmup_task = asyncio.create_task(warmup_models())
    logger.info("🔄 Background news refresh loop started (every %ds).", config.NEWS_REFRESH_INTERVAL_SECONDS)
    logger.info("🔥 Background model warmup scheduled.")
    try:
        yield
    finally:
        refresh_task.cancel()
        warmup_task.cancel()
        await http_client.aclose()


app = FastAPI(title="Tradeverse AI Brain", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:8000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class SearchQuery(BaseModel):
    text: str


class WeightConfig(BaseModel):
    sentiment: float
    ma: float
    rsi: float


class TradeRequest(BaseModel):
    symbol: str
    weights: WeightConfig


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/")
def health_check():
    return {
        "status": "online",
        "models_loaded": _warmup_status["models_loaded"],
        "models_loading": _warmup_status["loading"],
        "message": "🧠 AI Brain is listening for signals!",
    }


@app.get("/warmup")
async def warmup_endpoint():
    """Idempotent. Useful for clients to pre-warm before the first prediction."""
    await warmup_models()
    return {
        "models_loaded": _warmup_status["models_loaded"],
        "models_loading": _warmup_status["loading"],
    }


@app.post("/search", dependencies=[Depends(require_api_secret)])
def search_news(query: SearchQuery):
    logger.info("📡 Received search request for: '%s'", query.text)
    query_vector = get_model().encode(query.text).tolist()
    search_results = index.query(vector=query_vector, top_k=config.PINECONE_TOP_K, include_metadata=True)
    if not search_results["matches"]:
        return {"error": "No matching news found in memory."}
    best_match = search_results["matches"][0]
    return {
        "query": query.text,
        "best_headline": best_match["metadata"]["text"],
        "confidence_score": round(best_match["score"], 2),
    }


@app.post("/api/predict", dependencies=[Depends(require_api_secret)])
def predict_trade_signal(request: TradeRequest):
    symbol = request.symbol.upper()
    logger.info("🚀 AI Engine activated for %s", symbol)

    # Normalise user-supplied weights so they sum to 1.0 before passing them
    # downstream. (Regime overrides may later replace them entirely.)
    raw_s = request.weights.sentiment
    raw_m = request.weights.ma
    raw_r = request.weights.rsi
    total = raw_s + raw_m + raw_r
    if total == 0:
        total = 1
    normalized_weights = {
        "sentiment": raw_s / total,
        "ma": raw_m / total,
        "rsi": raw_r / total,
    }
    logger.info(
        "⚖️  Requested weights → Sentiment: %.2f | MA: %.2f | RSI: %.2f",
        normalized_weights["sentiment"], normalized_weights["ma"], normalized_weights["rsi"],
    )

    # Sharper retrieval query — includes company name when known (#41).
    query_text = build_pinecone_query(symbol)
    logger.info("🔎 Pinecone query: %s", query_text)
    query_vector = get_model().encode(query_text).tolist()

    search_results = index.query(
        vector=query_vector,
        top_k=config.PINECONE_TOP_K,
        include_metadata=True,
    )

    headlines = []
    if search_results["matches"]:
        for match in search_results["matches"]:
            text = match["metadata"].get("text", "")
            if text:
                headlines.append(text)
        logger.info("📡 PINECONE: Found %d headlines for sentiment averaging.", len(headlines))
    else:
        logger.info("📡 PINECONE: No news found. Falling back to technicals only.")

    decision_data = run_ensemble_model(
        symbol=symbol,
        weights=normalized_weights,
        headlines=headlines,
    )

    raw_signal = decision_data["signal"]
    final_score = decision_data["final_score"]

    # Confidence — fixed (#40):
    # - HOLD always reports 0% confidence (the old formula gave 50% on HOLD).
    # - BUY/SELL: |score| × 100, capped at 99.9% so we never report certainty.
    if "HOLD" in raw_signal.upper() or final_score == 0:
        confidence = 0.0
    else:
        confidence = min(round(abs(final_score) * 100.0, 1), 99.9)

    return {
        "signal": raw_signal,
        "confidence": confidence,
        # Renamed from kelly_percentage — see config.py for the rationale.
        "risk_pct": decision_data.get("risk_pct", 0.0),
        "symbol": symbol,
        "regime": decision_data.get("regime", "Neutral"),
        "requested_weights": normalized_weights,
        "effective_weights": decision_data.get("effective_weights", normalized_weights),
        "models_loaded": _warmup_status["models_loaded"],
    }
