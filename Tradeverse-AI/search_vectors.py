import os
from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# 1. Load your secret API key
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

print("🔌 Connecting to Pinecone Cloud...")
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index("tradeverse-news")

print("🧠 Waking up the AI Language Model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# 2. Ask the AI a question! 
# Notice how the words "company", "making", and "cars" are NOT in our saved database!
query = "Are there any companies making electric cars?"
print(f"\n🔎 Searching for the concept of: '{query}'")

# 3. Translate our English question into Math so Pinecone can understand it
query_vector = model.encode(query).tolist()

# 4. Search the cloud database for the closest mathematical match!
# top_k=1 means "Give me the #1 best match"
# include_metadata=True means "Bring back the actual English text, not just the math arrays"
search_results = index.query(
    vector=query_vector,
    top_k=1,
    include_metadata=True
)

# 5. Print the results
print("\n✅ --- AI SEARCH RESULTS ---")
for match in search_results['matches']:
    # The 'score' tells us how confident the AI is (closer to 1.0 is better)
    print(f"Confidence Score: {match['score']:.2f}")
    print(f"Headline Found: {match['metadata']['text']}")