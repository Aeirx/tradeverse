import os
import requests
from dotenv import load_dotenv

# 1. Load your secret Finnhub Key
load_dotenv()
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

def fetch_live_market_news():
    print("🌐 Connecting to Wall Street (Finnhub API)...")
    
    # 2. The exact URL to get General Market News
    url = f"https://finnhub.io/api/v1/news?category=general&token={FINNHUB_API_KEY}"

    try:
        # 3. Make the GET request to the internet
        response = requests.get(url)
        news_data = response.json() # Convert the response into a Python list/dictionary

        if not news_data:
            print("No news found right now.")
            return []

        print("\n📰 --- LIVE WALL STREET HEADLINES ---")
        live_headlines = []
        
        # 4. Loop through the data and grab the top 5 most recent headlines
        # (We use [:5] to just grab the first 5 items from the massive list they send us)
        for i, article in enumerate(news_data[:5]):
            headline = article.get('headline', 'No headline available')
            live_headlines.append(headline)
            print(f"{i+1}. {headline}")

        return live_headlines

    except Exception as e:
        print(f"🚨 Connection Error: {e}")
        return []

# 5. This tells Python to run the function ONLY if we run this specific file
if __name__ == "__main__":
    fetch_live_market_news()