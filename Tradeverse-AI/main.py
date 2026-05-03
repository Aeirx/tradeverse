import os
import asyncio
from fastapi import FastAPI
from contextlib import asynccontextmanager
from pydantic import BaseModel
from dotenv import load_dotenv
from pinecone import Pinecone
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

from algo_engine import run_ensemble_model

# --- Load Keys ---
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

print("🔌 Connecting to Pinecone Cloud...")
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index("tradeverse-news")

print("🧠 Waking up the AI Language Model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# -------------------------------------------------------
# BACKGROUND NEWS REFRESH TASK (Fix #2)
# Runs every 5 minutes inside the FastAPI server process.
# No need to manually run bot_worker.py separately.
# -------------------------------------------------------
async def refresh_news_loop():
    """Continuously refresh Pinecone with live market headlines every 5 minutes."""
    import time
    import httpx

    CATEGORIES = ["general", "forex", "crypto", "merger"]
    
    while True:
        try:
            print("\n⏰ [AUTO-REFRESH] Fetching live headlines into Pinecone memory...")
            headlines = []

            for category in CATEGORIES:
                url = f"https://finnhub.io/api/v1/news?category={category}&token={FINNHUB_API_KEY}"
                async with httpx.AsyncClient(timeout=10) as client:
                    res = await client.get(url)
                    if res.status_code == 200:
                        articles = res.json()
                        for article in articles[:5]:  # top 5 per category
                            if article.get("headline"):
                                headlines.append(article["headline"])

            if headlines:
                vectors_to_upload = []
                for i, text in enumerate(headlines):
                    vector_math = model.encode(text).tolist()
                    unique_id = f"news_{int(time.time())}_{i}"
                    vectors_to_upload.append({
                        "id": unique_id,
                        "values": vector_math,
                        "metadata": {"text": text, "type": "live_market_news"}
                    })
                index.upsert(vectors=vectors_to_upload)
                print(f"✅ [AUTO-REFRESH] Memorized {len(vectors_to_upload)} live headlines into Pinecone.")
            else:
                print("⚠️ [AUTO-REFRESH] No headlines fetched this cycle.")

        except Exception as e:
            print(f"⚠️ [AUTO-REFRESH] Error: {e}")

        # Wait 5 minutes before next refresh
        await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background news refresh when server boots."""
    task = asyncio.create_task(refresh_news_loop())
    print("🔄 Background news refresh loop started (every 5 min).")
    yield
    task.cancel()

# --- Initialize Server ---
app = FastAPI(title="Tradeverse AI Brain", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request Models ---
class SearchQuery(BaseModel):
    text: str

class WeightConfig(BaseModel):
    sentiment: float
    ma: float
    rsi: float

class TradeRequest(BaseModel):
    symbol: str
    weights: WeightConfig

# --- ENDPOINTS ---

@app.get("/")
def health_check():
    return {"status": "online", "message": "🧠 AI Brain is listening for signals!"}

@app.post("/search")
def search_news(query: SearchQuery):
    print(f"📡 Received search request for: '{query.text}'")
    query_vector = model.encode(query.text).tolist()
    search_results = index.query(vector=query_vector, top_k=5, include_metadata=True)
    if not search_results['matches']:
        return {"error": "No matching news found in memory."}
    best_match = search_results['matches'][0]
    return {
        "query": query.text,
        "best_headline": best_match['metadata']['text'],
        "confidence_score": round(best_match['score'], 2)
    }

@app.post("/api/predict")
def predict_trade_signal(request: TradeRequest):
    print(f"\n🚀 AI Engine activated for {request.symbol}!")

    # --- FIX #4: Normalize weights so they always sum to 1.0 ---
    raw_s = request.weights.sentiment
    raw_m = request.weights.ma
    raw_r = request.weights.rsi
    total = raw_s + raw_m + raw_r
    if total == 0:
        total = 1  # avoid division by zero
    normalized_weights = {
        "sentiment": raw_s / total,
        "ma": raw_m / total,
        "rsi": raw_r / total,
    }
    print(f"⚖️  Normalized weights → Sentiment: {normalized_weights['sentiment']:.2f} | MA: {normalized_weights['ma']:.2f} | RSI: {normalized_weights['rsi']:.2f}")

    # --- FIX #1: Fetch top 5 headlines, average sentiment ---
    query_text = f"financial news and market updates for {request.symbol} stock earnings"
    query_vector = model.encode(query_text).tolist()

    search_results = index.query(
        vector=query_vector,
        top_k=5,  # Was 1 — now reads 5 headlines for a robust average
        include_metadata=True
    )

    headlines = []
    if search_results['matches']:
        for match in search_results['matches']:
            text = match['metadata'].get('text', '')
            if text:
                headlines.append(text)
        print(f"📡 PINECONE MEMORY: Found {len(headlines)} headlines for sentiment averaging.")
    else:
        print("📡 PINECONE MEMORY: No news found. Falling back to technicals only.")

    # Pass all headlines to the engine (it will average them internally)
    decision_data = run_ensemble_model(
        symbol=request.symbol,
        weights=normalized_weights,
        headlines=headlines  # Now a list, not a single string
    )

    raw_signal = decision_data["signal"]
    confidence = min(round(abs(decision_data["final_score"]) * 50 + 50.0, 1), 99.9)

    return {
        "signal": raw_signal,
        "confidence": confidence,
        "kelly_percentage": decision_data.get("kelly_percentage", 0.0),
        "symbol": request.symbol
    }