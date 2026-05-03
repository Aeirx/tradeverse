# Tradeverse AI - 20-Year Quant Backtest for Google Colab
# -----------------------------------------------------------
# Instructions:
# 1. Open Google Colab: https://colab.research.google.com/
# 2. Create a new Notebook.
# 3. Create a cell at the top and run: !pip install yfinance matplotlib seaborn tabulate
# 4. Copy and paste this entire script into the next cell and run it!
# -----------------------------------------------------------

import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import warnings
warnings.filterwarnings('ignore')

# 1. Configuration
# Testing a diverse mix: Tech, Finance, Retail, Energy, Healthcare
TICKERS = ['AAPL', 'MSFT', 'AMZN', 'JPM', 'WMT', 'XOM', 'JNJ']
PERIOD = '20y'
INITIAL_CAPITAL = 100000

print(f"Downloading 20 years of market data for {len(TICKERS)} stocks...")

# 2. Download Baseline (SPY) and Volatility (VIX) for Market Regime Detection
spy = yf.download('SPY', period=PERIOD, progress=False)
vix = yf.download('^VIX', period=PERIOD, progress=False)

# Handle yfinance multi-index columns for recent versions
if isinstance(spy.columns, pd.MultiIndex):
    spy_close = spy['Close']['SPY']
    vix_close = vix['Close']['^VIX']
else:
    spy_close = spy['Close']
    vix_close = vix['Close']

market_df = pd.DataFrame({'SPY_Close': spy_close, 'VIX_Close': vix_close})
market_df['SPY_200MA'] = market_df['SPY_Close'].rolling(window=200).mean()

# 3. Market Regime Logic (The "Brain" of the Algorithm)
def get_regime(row):
    if pd.isna(row['SPY_200MA']): return 'Sideways'
    if row['VIX_Close'] > 30: return 'Panic'
    elif row['SPY_Close'] > row['SPY_200MA'] and row['VIX_Close'] < 20: return 'Trending'
    else: return 'Sideways'

print("Calculating Market Regimes...")
market_df['Regime'] = market_df.apply(get_regime, axis=1)

results = []
portfolio_histories = {}

print("Executing AI Trading Algorithm...\n")

# 4. Run Backtest for each Ticker
for symbol in TICKERS:
    data = yf.download(symbol, period=PERIOD, progress=False)
    if isinstance(data.columns, pd.MultiIndex):
        close_px = data['Close'][symbol]
    else:
        close_px = data['Close']
        
    df = pd.DataFrame({'Close': close_px}).join(market_df, how='inner')
    
    # Calculate Technicals (MA & RSI)
    df['50_MA'] = df['Close'].rolling(window=50).mean()
    df['200_MA'] = df['Close'].rolling(window=200).mean()
    delta = df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['RSI'] = 100 - (100 / (1 + rs))
    
    # Drop initial NaNs to start simulation cleanly
    df = df.dropna().copy()
    
    capital = INITIAL_CAPITAL
    position = 0
    portfolio_values = []
    
    # Step through time
    for idx, row in df.iterrows():
        regime = row['Regime']
        
        # Signal Generation 1: Golden Cross Momentum
        ma_signal = 1.0 if row['50_MA'] > row['200_MA'] else -1.0
        
        # Signal Generation 2: Dynamic RSI
        rsi_val = row['RSI']
        rsi_signal = 0.0
        if regime == 'Trending':
            if rsi_val < 50: rsi_signal = 1.0
            elif rsi_val > 80: rsi_signal = -1.0
        else:
            if rsi_val < 30: rsi_signal = 1.0
            elif rsi_val > 70: rsi_signal = -1.0
        
        # Dynamic Risk Weights based on Regime
        if regime == 'Panic':
            w_ma, w_rsi = 0.2, 0.8
        elif regime == 'Trending':
            w_ma, w_rsi = 0.8, 0.2
        else:
            w_ma, w_rsi = 0.5, 0.5
            
        score = (ma_signal * w_ma) + (rsi_signal * w_rsi)
        
        # Execution Engine: 100% Allocation for Maximum Returns
        if score > 0.0 and position == 0:
            # BUY 100%
            position = capital / row['Close']
            capital = 0
        elif score < 0.0 and position > 0:
            # SELL 100%
            capital = position * row['Close']
            position = 0
            
        # Record daily portfolio value
        current_value = capital + (position * row['Close'])
        portfolio_values.append(current_value)
        
    df['Portfolio'] = portfolio_values
    df['Buy_Hold'] = INITIAL_CAPITAL * (df['Close'] / df['Close'].iloc[0])
    
    portfolio_histories[symbol] = df
    
    # Calculate Performance Metrics
    final_pv = df['Portfolio'].iloc[-1]
    final_bh = df['Buy_Hold'].iloc[-1]
    
    algo_ret = (final_pv - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100
    bh_ret = (final_bh - INITIAL_CAPITAL) / INITIAL_CAPITAL * 100
    
    # Calculate Annualized Return (CAGR)
    years = 20
    algo_cagr = ((final_pv / INITIAL_CAPITAL) ** (1 / years) - 1) * 100
    bh_cagr = ((final_bh / INITIAL_CAPITAL) ** (1 / years) - 1) * 100
    
    # Calculate Max Drawdown (Risk)
    df['Peak'] = df['Portfolio'].cummax()
    df['Drawdown'] = (df['Portfolio'] - df['Peak']) / df['Peak']
    algo_max_dd = df['Drawdown'].min() * 100
    
    df['BH_Peak'] = df['Buy_Hold'].cummax()
    df['BH_Drawdown'] = (df['Buy_Hold'] - df['BH_Peak']) / df['BH_Peak']
    bh_max_dd = df['BH_Drawdown'].min() * 100
    
    results.append({
        'Symbol': symbol,
        'Algo Total Ret': f"{algo_ret:,.0f}%",
        'B&H Total Ret': f"{bh_ret:,.0f}%",
        'Algo Per Annum': f"{algo_cagr:.1f}%",
        'B&H Per Annum': f"{bh_cagr:.1f}%",
        'Algo Max Drop': f"{algo_max_dd:.1f}%",
        'B&H Max Drop': f"{bh_max_dd:.1f}%",
        'Safer?': 'Yes' if algo_max_dd > bh_max_dd else 'No' # Closer to 0 is better
    })

# 5. Output Results
results_df = pd.DataFrame(results)
print("="*80)
print("20-YEAR BACKTEST RESULTS")
print("="*80)
print(results_df.to_markdown(index=False))
print("\nNotice: The Algo's primary goal is to minimize 'Max Drawdown' (crashes).")
print("During the 2008 and 2020 crashes, the algorithm likely moved to cash, saving capital.")

# 6. Plotting
plt.style.use('dark_background')
fig, axes = plt.subplots(len(TICKERS), 1, figsize=(14, 4 * len(TICKERS)))
fig.suptitle('Tradeverse AI Algo vs Buy & Hold (20-Year Growth)', fontsize=16, y=0.99)

for i, symbol in enumerate(TICKERS):
    df = portfolio_histories[symbol]
    ax = axes[i]
    ax.plot(df.index, df['Portfolio'], label=f'{symbol} Algo', color='#00ff9d', linewidth=2)
    ax.plot(df.index, df['Buy_Hold'], label=f'{symbol} Buy & Hold', color='#555555', linestyle='--', linewidth=1.5)
    ax.set_title(f"{symbol} Performance")
    ax.set_ylabel("Portfolio Value ($)")
    ax.legend()
    ax.grid(alpha=0.2)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, loc: "{:,}".format(int(x))))

plt.tight_layout()
plt.show()
