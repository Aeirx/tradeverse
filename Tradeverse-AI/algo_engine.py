import yfinance as yf
import pandas as pd
import numpy as np
import re
from transformers import pipeline

print("Initializing Quant Ensemble Engine...")

# Lazy-load FinBERT to reduce startup memory pressure on free-tier hosts
nlp_pipeline = None

def get_nlp_pipeline():
    global nlp_pipeline
    if nlp_pipeline is None:
        try:
            print("Loading FinBERT Sentiment Engine...")
            nlp_pipeline = pipeline("sentiment-analysis", model="ProsusAI/finbert")
        except Exception as e:
            print(f"Failed to load FinBERT: {e}")
    return nlp_pipeline


def get_live_technicals(symbol):
    try:
        ticker = yf.Ticker(symbol, session=None)
        df = ticker.history(period="3mo")
        if df.empty:
            return None, None, None

        close = df['Close']
        if len(close) < 50:
            return 0.0, 0.0, 0.0, 1.0

        # 1. 50-day SMA Momentum
        sma_50 = close.rolling(window=50).mean().iloc[-1]
        current_price = close.iloc[-1]
        ma_diff_pct = (current_price - sma_50) / sma_50
        ma_score = min(max(ma_diff_pct * 10, -1.0), 1.0)

        # 2. 14-day RSI (Wilder's RSI)
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        current_rsi = rsi.iloc[-1]
        rsi_score = (50 - current_rsi) / 20.0
        rsi_score = min(max(rsi_score, -1.0), 1.0)

        # 3. Volatility — 20-day annualized std dev
        returns = close.pct_change()
        volatility = returns.tail(20).std() * np.sqrt(252)

        # 4. Volume Multiplier (comparing current volume to 20-day average)
        volume = df['Volume']
        if len(volume) < 20:
            volume_multiplier = 1.0
        else:
            avg_volume = volume.rolling(window=20).mean().iloc[-1]
            current_volume = volume.iloc[-1]
            volume_multiplier = current_volume / avg_volume if avg_volume > 0 else 1.0
            volume_multiplier = max(0.5, min(volume_multiplier, 3.0)) # cap between 0.5x and 3x

        return float(ma_score), float(rsi_score), float(volatility), float(volume_multiplier)

    except Exception as e:
        print(f"⚠️ YFinance Error for {symbol}: {e}")
        return 0.0, 0.0, 0.0, 1.0

def get_market_regime():
    """Determine market regime using VIX and SPY moving averages."""
    try:
        spy = yf.Ticker("SPY", session=None).history(period="1y")
        vix = yf.Ticker("^VIX", session=None).history(period="1mo")
        
        if spy.empty or vix.empty:
            return "Neutral"
            
        spy_close = spy['Close']
        vix_close = vix['Close']
        
        current_vix = vix_close.iloc[-1]
        current_spy = spy_close.iloc[-1]
        
        if len(spy_close) < 200:
            return "Neutral"
            
        spy_200_sma = spy_close.rolling(window=200).mean().iloc[-1]
        
        if current_vix > 30:
            return "Panic"
        elif current_spy > spy_200_sma and current_vix < 20:
            return "Trending"
        elif current_spy < spy_200_sma and 20 <= current_vix <= 30:
            return "Sideways"
        else:
            return "Neutral"
    except Exception as e:
        print(f"⚠️ Market Regime Error: {e}")
        return "Neutral"


def apply_fake_news_filter(headline, score):
    """Slash score by 80% if headline contains unverified rumor language."""
    pattern = re.compile(
        r'\b(rumor|allegedly|scam|unverified|fraud|claims|falsely|supposedly)\b',
        re.IGNORECASE
    )
    if pattern.search(headline):
        print(f"Fake news regex triggered: '{headline[:60]}...'")
        return score * 0.2
    return score


def get_finbert_sentiment(headline):
    """Score a single headline using FinBERT. Returns float in [-1.0, +1.0]."""
    if not headline or get_nlp_pipeline() is None:
        return 0.0
    try:
        res = get_nlp_pipeline()(headline[:512])[0]  # cap at 512 tokens
        label = res['label']
        confidence = res['score']

        if label == 'positive':
            score = confidence
        elif label == 'negative':
            score = -confidence
        else:
            score = 0.0

        score = apply_fake_news_filter(headline, score)
        return score
    except Exception as e:
        print(f"⚠️ FinBERT error on headline: {e}")
        return 0.0


# --- FIX #1: Accept a list of headlines and average the sentiment ---
def get_averaged_sentiment(headlines: list) -> float:
    """
    Run FinBERT on up to 5 headlines and return the weighted average sentiment.
    Higher-ranked headlines (closer match to the query) get more weight.
    """
    if not headlines:
        return 0.0

    scores = []
    for headline in headlines[:5]:
        s = get_finbert_sentiment(headline)
        scores.append(s)
        print(f"   FinBERT: {s:+.3f} | '{headline[:60]}...'")

    if not scores:
        return 0.0

    # Weighted average: first result (best Pinecone match) gets double weight
    weights = [2.0] + [1.0] * (len(scores) - 1)
    weighted_avg = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
    print(f"   Averaged Sentiment Score: {weighted_avg:+.3f} across {len(scores)} headlines")
    return weighted_avg


def run_ensemble_model(symbol, weights, headlines=None):
    """
    Run the full ensemble: FinBERT (multi-headline avg) + SMA50 + RSI14.
    
    Fixes applied:
    - Fix #1: Averages sentiment across up to 5 headlines (not just 1)
    - Fix #3: BUY requires BOTH a strong score AND at least 1 technical confirmation
    - Fix #4: Weights are pre-normalized in main.py before reaching here
    """
    if headlines is None:
        headlines = []

    print(f"\nRunning Ensemble for {symbol} | {len(headlines)} headlines...")

    # 1. Multi-headline FinBERT Sentiment
    raw_sent_score = get_averaged_sentiment(headlines)

    # 2. Live Technical Indicators
    ma_score, rsi_score, volatility, vol_multiplier = get_live_technicals(symbol)
    if ma_score is None:
        ma_score, rsi_score, volatility, vol_multiplier = 0.0, 0.0, 0.0, 1.0
        print("No pricing data. Using neutral technical indicators.")
        
    # 3. Scale Sentiment by Volume (News only matters if institutions are trading)
    sent_score = raw_sent_score * vol_multiplier
    sent_score = max(-1.0, min(1.0, sent_score))

    print(f"50 MA Momentum:         {ma_score:+.2f}")
    print(f"14-Day RSI:             {rsi_score:+.2f}")
    print(f"Annualized Volatility:  {volatility:.2%}")
    print(f"Volume Multiplier:      {vol_multiplier:.2f}x")
    print(f"Scaled Sentiment:       {sent_score:+.2f} (Raw: {raw_sent_score:+.2f})")

    # 4. Risk Hard-Abort: extreme meme-stock volatility
    if volatility > 0.80:
        print("\n[ABORT] Extreme volatility detected. Risk limits exceeded.")
        return {"final_score": 0.0, "signal": "⚪ HOLD", "kelly_percentage": 0.0}

    # 5. Market Regime Detection & Dynamic Weights
    regime = get_market_regime()
    print(f"Market Regime Detected: {regime}")
    
    if regime == "Panic":
        weights = {"sentiment": 0.7, "ma": 0.1, "rsi": 0.2}
    elif regime == "Trending":
        weights = {"sentiment": 0.3, "ma": 0.6, "rsi": 0.1}
    elif regime == "Sideways":
        weights = {"sentiment": 0.2, "ma": 0.1, "rsi": 0.7}
        
    # Ensure dynamic weights sum to 1.0
    total_w = sum(weights.values())
    if total_w > 0:
        weights = {k: v / total_w for k, v in weights.items()}

    # 6. Weighted Score Calculation
    final_weighted_score = (
        (sent_score * weights['sentiment']) +
        (ma_score   * weights['ma']) +
        (rsi_score  * weights['rsi'])
    )

    # --- FIX #3: Stricter Signal Logic ---
    # BUY: Score must be >= 0.25 AND at least one technical must confirm (not just sentiment alone)
    # SELL: Score must be <= -0.25 AND sentiment must not be positive (no panic-selling on good news)
    technicals_bullish   = (ma_score > 0) or (rsi_score > 0)
    technicals_bearish   = (ma_score < 0) or (rsi_score < 0)
    sentiment_positive   = sent_score > 0
    sentiment_negative   = sent_score < 0

    if final_weighted_score >= 0.25 and technicals_bullish:
        if sentiment_negative:
            print("⚠️ [CAUTION] Strong technical BUY but negative news! Downgrading to HOLD.")
            signal = "⚪ HOLD"
        else:
            signal = "🟢 BUY"
    elif final_weighted_score <= -0.25 and technicals_bearish:
        if sentiment_positive:
            print("⚠️ [CAUTION] Strong technical SELL but positive news! Downgrading to HOLD.")
            signal = "⚪ HOLD"
        else:
            signal = "🔴 SELL"
    else:
        signal = "⚪ HOLD"

    # 7. Kelly Criterion Risk Allocation
    if signal in ["🟢 BUY", "🔴 SELL"]:
        # Mapping Score -> Risk % (e.g. 0.25 -> 2%, 0.95 -> 15%)
        # y = mx + c => m = 18.57, c = -2.64
        score_mag = abs(final_weighted_score)
        kelly_risk = (score_mag * 18.57) - 2.64
        kelly_risk = max(1.0, min(kelly_risk, 20.0))  # Bound between 1% and 20%
    else:
        kelly_risk = 0.0

    print("\n==================================================")
    print(f"DYNAMIC WEIGHTS: {weights['sentiment']*100:.1f}% Sentiment | {weights['ma']*100:.1f}% MA | {weights['rsi']*100:.1f}% RSI")
    print(f"FINAL WEIGHTED SCORE: {final_weighted_score:+.3f}")
    print(f"MASTER TRADING SIGNAL: {signal}")
    print(f"KELLY RISK ALLOCATION: {kelly_risk:.2f}% of Portfolio")
    print("==================================================\n")

    return {
        "final_score": round(final_weighted_score, 3),
        "signal": signal,
        "kelly_percentage": round(kelly_risk, 2)
    }


# --- LOCAL FILE TEST ---
if __name__ == "__main__":
    user_weights = {"sentiment": 0.5, "ma": 0.3, "rsi": 0.2}
    # Test: rumor headline should get filtered down
    run_ensemble_model("TSLA", user_weights, headlines=[
        "Rumor: Elon Musk allegedly steps down, market panics!"
    ])
    # Test: strong multi-headline bullish signal
    run_ensemble_model("AAPL", user_weights, headlines=[
        "Apple smashes earnings expectations natively!",
        "iPhone 17 demand surges across Asia markets",
        "Apple stock hits all-time high after record quarter"
    ])