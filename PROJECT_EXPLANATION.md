# Tradeverse - Project Deep Dive & Interview Prep Guide

This document is designed to teach you exactly how your project works from top to bottom. If a senior developer or technical interviewer asks you about this project, studying this document will allow you to answer confidently as if you wrote every single line yourself from scratch.

---

## 1. High-Level Architecture (The Big Picture)

Tradeverse is a **Microservices-based Algorithmic Trading Simulator**. It doesn't use just one server; it splits the work across different specialized systems.

Here is how the pieces fit together:

1. **Frontend (React/Vite):** The UI where the user logs in, views their dashboard, and clicks "Buy" or "Sell".
2. **Backend Gateway (Node.js/Express):** The main server. It handles user authentication, manages the wallet balance, talks to the database, and routes requests to the AI engine.
3. **Database (MongoDB Atlas):** Stores persistent data: User accounts, hashed passwords, wallet balances, and transaction history.
4. **Cache (Redis):** A temporary, super-fast memory store. It temporarily saves live stock prices so you don't spam the Yahoo Finance API and get blocked.
5. **AI Microservice (Python/FastAPI):** A separate server dedicated to heavy mathematical and AI tasks. It uses NLP (Natural Language Processing) to analyze news sentiment and calculates technical stock indicators.
6. **Vector Database (Pinecone):** A specialized database used by the Python server to search for financial news articles based on their *meaning* (vector embeddings), rather than just exact keywords.

---

## 2. Code Walkthrough: How specific features work

If an interviewer asks: *"Walk me through what happens when a user clicks 'Buy'."*

### A. The Buy/Sell Flow & MongoDB Transactions (Crucial for Interviews)
**Location:** `Tradeverse-Backend/src/routes/trade.routes.js`

1. **The Request:** The React frontend sends a POST request to `/api/v1/trades/buy` with the stock `symbol` and `quantity`, along with the user's JWT cookie.
2. **Authentication:** The `verifyJWT` middleware reads the cookie, decrypts it using the `ACCESS_TOKEN_SECRET`, and finds the user's ID. It attaches the user object to the request (`req.user`).
3. **The ACID Transaction (The 'Wow' Factor):**
   - The code calls `mongoose.startSession()` and `session.startTransaction()`.
   - **Why?** Imagine a user has $100. They click "Buy $100 of Apple" very fast, twice in a row. Without a transaction, the server might read the balance ($100) for *both* clicks before updating it, allowing the user to buy $200 worth of stock with only $100. This is called a **Race Condition** or **Double Spend**.
   - The transaction ensures that the database is locked for that specific user. It reads the balance, deducts the cost, updates the portfolio array (`user.portfolio.push`), and saves the user.
   - Finally, it calls `session.commitTransaction()`. If *anything* fails during this process (e.g., Yahoo API crashes, not enough money), it calls `session.abortTransaction()`, and the database reverts to exactly how it was before. No money is lost.

### B. The Live Price Caching System
**Location:** `Tradeverse-Backend/src/routes/trade.routes.js` (Route: `/price/:symbol`)

1. **The Problem:** The frontend needs live prices. If 1,000 users are looking at TSLA, making 1,000 API calls to Yahoo Finance per second will get your IP banned.
2. **The Solution:** **Redis**.
3. **How it works:** When a request for TSLA's price comes in, the server first asks Redis: *"Do you have the price for TSLA?"* (`redisClient.get`).
   - **Cache Hit:** If Redis has it, it returns it instantly (in milliseconds).
   - **Cache Miss:** If Redis doesn't have it (or it expired), the server fetches the real price from `yahooFinance.quote()`. It then saves this price into Redis with an Expiration time (TTL) of 10 seconds (`redisClient.setEx`).
   - For the next 10 seconds, anyone asking for TSLA gets the cached price. This protects your API limits.

### C. The AI Engine (FinBERT + Pinecone)
**Location:** `Tradeverse-AI/algo_engine.py` and `Tradeverse-AI/main.py`

1. **Vector Search (Pinecone):**
   - When a user asks for "news about Tesla", the text is converted into a list of numbers (a Vector) using the `SentenceTransformer` model (`all-MiniLM-L6-v2`).
   - It sends this vector to Pinecone. Pinecone compares this vector against thousands of pre-loaded news vectors and returns the headline that is mathematically "closest" in meaning.
2. **FinBERT Sentiment Analysis:**
   - The Python code takes that news headline and feeds it into **FinBERT** (a version of Google's BERT model specifically trained on financial data).
   - FinBERT returns a score: Positive, Negative, or Neutral.
3. **The Ensemble Algorithm:**
   - The `run_ensemble_model` function calculates a "Master Score".
   - It calculates the 50-day Moving Average (MA) and the 14-day Relative Strength Index (RSI) using `yfinance` historical data.
   - It combines the User's Weights (e.g., 40% Sentiment, 40% MA, 20% RSI) to output a final mathematical score, resulting in a signal: `🟢 BUY`, `🔴 SELL`, or `⚪ HOLD`.

### D. User Authentication (JWT)
**Location:** `Tradeverse-Backend/src/controllers/user.controller.js`

- **Passwords:** Handled using `bcrypt`. Passwords are never saved in plain text. They are hashed before saving to MongoDB.
- **Tokens:** When a user logs in successfully, the server creates a **JSON Web Token (JWT)** using `jsonwebtoken`.
- **Cookies:** The server sends this token back to the browser in an `httpOnly` cookie. This is a massive security feature because `httpOnly` cookies cannot be stolen by malicious JavaScript (XSS attacks) running on the frontend.

---

## 3. What to Read & Study to Ace Interviews

To defend this project like a senior engineer, you need to understand the concepts behind the code. Spend a few hours reading up on these topics:

### General Architecture Concepts
- **Microservices vs. Monoliths:** Know the pros and cons. (Pro: you can scale the heavy Python AI separately from the Node.js web server. Con: harder to deploy and manage).
- **REST APIs:** Understand HTTP methods (GET vs POST), status codes (200, 400, 404, 500), and JSON payloads.
- **CORS (Cross-Origin Resource Sharing):** Understand why your browser blocks the React app (port 5173) from talking to the Node app (port 8000) unless the backend explicitly allows it via CORS headers.

### Backend & Database (Node.js/MongoDB)
- **Study:** **ACID Transactions in Databases.** This is your strongest talking point. Know what Atomicity, Consistency, Isolation, and Durability mean.
- **Study:** **Race Conditions.** Be able to explain the "double spend" problem clearly.
- **Study:** **JWT (JSON Web Tokens).** Know the 3 parts of a JWT (Header, Payload, Signature) and why `httpOnly` cookies are safer than `localStorage` for auth tokens.

### Performance & Caching (Redis)
- **Study:** **Redis.** Understand that Redis is an "In-Memory Data Store". It lives in RAM, making it extremely fast compared to reading from a hard drive like MongoDB.
- **Study:** **Caching Strategies.** Understand "Cache Hit", "Cache Miss", and "TTL" (Time To Live / Expiration).

### AI & Python Microservice
- **Study:** **FastAPI.** Know why it's fast (it supports asynchronous programming out of the box).
- **Study:** **Vector Databases (Pinecone).** Understand the difference between Keyword Search (SQL `LIKE '%tesla%'`) and Semantic Vector Search (understanding the meaning of words).
- **Study:** **LLMs and FinBERT.** You don't need to know how to build a neural network, but know that FinBERT is a pre-trained NLP model fine-tuned on financial lexicon.

### Frontend (React)
- **Study:** **React Hooks.** Understand what `useState` and `useEffect` do. (e.g., `useEffect` is used to fetch the wallet balance when the Dashboard loads).
- **Study:** **Axios vs Fetch.** You used Axios. Know that Axios automatically parses JSON and handles errors nicely.

---

## 4. Potential Interview Questions to Prepare For

1. *"Why did you use Python for the AI part instead of doing it all in Node.js?"*
   **Answer:** Python has the best ecosystem for Machine Learning and Data Science (pandas, transformers, yfinance). Node.js is single-threaded and terrible at heavy mathematical CPU tasks. Splitting them into microservices was the optimal architectural choice.

2. *"What happens if Yahoo Finance API goes down?"*
   **Answer:** Our system handles this gracefully. The Redis cache will serve the last known price until it expires. After that, the `try/catch` block in the `/price` route catches the error and sends a 500 status code to the frontend, which will display a fallback UI instead of crashing the whole server.

3. *"How did you handle the risk of a user buying stock with money they don't have if two requests arrive at the exact same millisecond?"*
   **Answer:** I foresaw this race condition and implemented MongoDB ACID transactions. By starting a session, the document is locked for that transaction context. If two requests hit simultaneously, the database ensures they are processed sequentially, and if the first one drains the balance, the second one will evaluate against the new balance and fail safely.
