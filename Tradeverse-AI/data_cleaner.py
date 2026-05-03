import pandas as pd

print("🧹 Loading raw data from market_data.csv...")

# 1. Load the raw data. (yfinance adds a weird 2nd header row for the ticker, so we skip it to keep things clean)
df = pd.read_csv("market_data.csv", header=0, skiprows=[1])

# Fix the first column name to 'Date' just in case
df.rename(columns={'Price': 'Date', 'Unnamed: 0': 'Date'}, inplace=True)

# 2. Drop any rows that have missing data (NaN) 
df.dropna(inplace=True)

# 3. FEATURE ENGINEERING: Calculate a 20-Day Simple Moving Average (SMA)

print("⚙️ Calculating 20-Day Moving Average...")
df['SMA_20'] = df['Close'].rolling(window=20).mean()

# Because a 20-day average needs 20 days of past data, the first 19 days will be blank (NaN).
# So, we drop the blanks again.
df.dropna(inplace=True)

# 4. Print it out to verify
print("\n--- Cleaned Data with AI Features ---")
# Just showing the Date, Close price, and our new SMA column
print(df[['Date', 'Close', 'SMA_20']].head())

# 5. Save it as a new file for the AI to train on tomorrow
clean_filename = "clean_market_data.csv"
df.to_csv(clean_filename, index=False)

print(f"\n✅ Success! Clean, AI-ready data saved to {clean_filename}")