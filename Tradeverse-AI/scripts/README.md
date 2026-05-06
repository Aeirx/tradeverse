# Tradeverse-AI scripts

One-off tools that are **not** part of the running FastAPI service. Each script
is invoked manually from the project root with `python scripts/<name>.py`.

| Script | Purpose |
|---|---|
| `data_loader.py` | Pull 1y of historical OHLC for a symbol from yfinance into `market_data.csv` (gitignored). |
| `data_cleaner.py` | Take the raw CSV, drop NaNs, add a 20-day SMA column, write `clean_market_data.csv`. |
| `embed_test.py` | Sanity-check the SentenceTransformer install by encoding three demo headlines. |
| `upload_vectors.py` | One-time bootstrap: seed the Pinecone index with three demo headlines. |
| `search_vectors.py` | Smoke-test Pinecone retrieval with a hard-coded query. |

The live news refresh that keeps Pinecone fresh in production runs as a
background `lifespan` task inside `main.py`. None of these scripts run on
boot.
