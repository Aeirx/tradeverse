import yfinance as yf
import pandas as pd

# 1. Define the stock symbol 
symbol = "AAPL"

print(f"Fetching 1 year of historical data for {symbol}...")

# 2. Download the last 1 year of daily market data
stock_data = yf.download(symbol, period="1y")

# 3. Print the first 5 days of data to the terminal to prove it worked
print("\n--- First 5 Days of Data ---")
print(stock_data.head())

# 4. Save it to a CSV file so our AI can train on it later
filename = "market_data.csv"
stock_data.to_csv(filename)

print(f"\n✅ Success! Millions of data points saved to {filename}")