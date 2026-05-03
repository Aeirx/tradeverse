import os
from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# 1. Load your secret API key from the .env file
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

print("🔌 Connecting to Pinecone Cloud...")
# 2. Connect to Pinecone and target your specific Index
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index("tradeverse-news")

print("🧠 Waking up the AI Language Model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# 3. The data we want to save
headlines = [
    "Tata Motors reports massive profits this quarter.",
    "Stock market crashes as inflation rises.",
    "Tata Motors sees huge growth in EV sales."
]

print("⚙️ Translating English into Math...")
embeddings = model.encode(headlines)

print("☁️ Uploading to Pinecone...")
# 4. Package the data exactly how Pinecone wants it: (ID, Vector Array, Metadata)
vectors_to_upload = []
for i, headline in enumerate(headlines):
    vectors_to_upload.append({
        "id": f"news-{i}", 
        "values": embeddings[i].tolist(), # Convert to a standard list
        "metadata": {"text": headline}    # Save the original English text so we can read it later!
    })

# 5. 'Upsert' means Insert or Update. This is the command that actually pushes to the cloud!
index.upsert(vectors=vectors_to_upload)

print("\n✅ SUCCESS! Your AI's memories are now permanently stored in the Pinecone cloud!")