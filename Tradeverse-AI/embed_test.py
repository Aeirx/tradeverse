from sentence_transformers import SentenceTransformer

print("🧠 Waking up the AI Language Model (This takes a few seconds)...")
# We are using a lightweight, lightning-fast model built by Microsoft/HuggingFace
model = SentenceTransformer('all-MiniLM-L6-v2')

# 1. Give the AI some fake financial news headlines
headlines = [
    "Tata Motors reports massive profits this quarter.",
    "Stock market crashes as inflation rises.",
    "Tata Motors sees huge growth in EV sales."
]

print("\n⚙️ Translating English into Math (Vector Embeddings)...")
# 2. Convert the English sentences into number arrays
embeddings = model.encode(headlines)

# 3. Prove that it worked!
print(f"\n✅ Successfully generated {len(embeddings)} vectors!")
print(f"The first headline was translated into an array of {len(embeddings[0])} numbers.")
print("\nHere is a tiny sneak peek at what the AI sees for headline #1:")
print(embeddings[0][:5]) # Just printing the first 5 numbers of the array so we don't flood the screen