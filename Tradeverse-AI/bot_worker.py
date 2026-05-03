import time
import schedule
import os
from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
from fetch_news import fetch_live_market_news 

# 1. Load Keys and Wake Up the AI Models
load_dotenv()
print("🔌 Connecting to Pinecone Cloud...")
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("tradeverse-news")

print("🧠 Waking up the AI Language Model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

def ai_job():
    print("\n⏰ [ALARM TRIGGERED] Waking up the bot to check Wall Street...")
    
    # 2. Fetch the live text from Finnhub
    headlines = fetch_live_market_news()
    
    if not headlines:
        print("No news to memorize. Going back to sleep...")
        return

    print("🧠 Memorizing live news into Pinecone Cloud...")
    vectors_to_upload = []
    
    # 3. Translate the English into Vector Math
    for i, text in enumerate(headlines):
        vector_math = model.encode(text).tolist()
        
        # Create a unique ID for the database using the exact current time
        unique_id = f"news_{int(time.time())}_{i}"
        
        # Package it up (ID, Math Array, and the actual English words)
        vectors_to_upload.append({
            "id": unique_id,
            "values": vector_math,
            "metadata": {"text": text, "type": "live_market_news"}
        })
    
    # 4. Upload the payload to the Cloud!
    if vectors_to_upload:
        index.upsert(vectors=vectors_to_upload)
        print(f"✅ Successfully permanently memorized {len(vectors_to_upload)} live headlines!")
    
    print("💤 Going back to sleep...")

# --- THE SCHEDULER ---
schedule.every(1).minutes.do(ai_job)

print("\n🤖 Autonomous Trading Bot Worker started!")
print("Press Ctrl+C to stop it. Waiting for the first 1-minute tick...")

while True:
    schedule.run_pending()
    time.sleep(1)