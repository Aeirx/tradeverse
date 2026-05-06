"""
Tradeverse-AI tunables, in one place, with the reasoning behind each number.

Why this exists: the rest of the engine used to be peppered with magic
constants (0.80, 0.25, 18.57, -2.64, ...). When a number is bare in the
middle of a function, you can't tell whether it's load-bearing or a guess.
This module is the single source of truth — change it here, change it
everywhere.
"""

# ---------------------------------------------------------------------------
# Pinecone retrieval
# ---------------------------------------------------------------------------

PINECONE_INDEX_NAME = "tradeverse-news"

# How many headlines to retrieve per query. Five is a balance between
# averaging out a single-headline outlier and amplifying noise from less
# relevant matches.
PINECONE_TOP_K = 5

# The embedding model. all-MiniLM-L6-v2 produces 384-dim vectors, runs on
# CPU in ~10 ms per encode, and is good enough for short headline matching.
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# ---------------------------------------------------------------------------
# Sentiment (FinBERT)
# ---------------------------------------------------------------------------

FINBERT_MODEL = "ProsusAI/finbert"

# FinBERT's tokenizer max input is 512 tokens. We pass truncation=True so
# the tokenizer truncates *by tokens*, not by characters. (Old code did
# `headline[:512]` which was misleading — that's chars, not tokens.)
FINBERT_MAX_INPUT_TOKENS = 512

# Weighted average of FinBERT scores across N headlines: the first (best
# Pinecone match) gets DOUBLE weight, every other headline gets weight 1.
SENTIMENT_TOP_HEADLINE_WEIGHT = 2.0
SENTIMENT_OTHER_HEADLINE_WEIGHT = 1.0

# Regex of "rumor language" — headlines matching get filtered out BEFORE
# FinBERT runs (so a neutral label can't sneak through unfiltered).
RUMOR_PATTERN = (
    r"\b(rumor|allegedly|scam|unverified|fraud|claims|falsely|supposedly)\b"
)

# ---------------------------------------------------------------------------
# Technical indicators (yfinance)
# ---------------------------------------------------------------------------

# 50-day SMA — "is the current price above or below the 50-day average?"
SMA_PERIOD = 50

# 14-day RSI (Wilder) — overbought/oversold momentum.
RSI_PERIOD = 14

# Volatility — annualised stdev of daily returns over 20 trading days.
VOLATILITY_PERIOD = 20
TRADING_DAYS_PER_YEAR = 252

# Volume "is the institution paying attention?" multiplier — capped to a
# sane band so a single 10x volume day can't overwhelm the rest of the model.
VOLUME_PERIOD = 20
VOLUME_MULTIPLIER_FLOOR = 0.5
VOLUME_MULTIPLIER_CEILING = 3.0

# How many calendar months of history to pull per symbol. 3mo gives ~63
# trading days — enough for the 50-SMA and 20-day vol calc.
TECHNICAL_HISTORY_PERIOD = "3mo"

# MA score = clip( (price - SMA50) / SMA50 * MA_SCORE_SCALE, -1, +1 )
# Scale = 10 means a 10% deviation maps to score = ±1 (saturated).
MA_SCORE_SCALE = 10.0

# RSI score = clip( (50 - RSI) / RSI_SCORE_DIVISOR, -1, +1 )
# Divisor = 20 means RSI 30 → +1 (oversold = bullish), RSI 70 → -1.
RSI_SCORE_DIVISOR = 20.0

# ---------------------------------------------------------------------------
# Risk gates
# ---------------------------------------------------------------------------

# Annualised vol >80% means meme-stock territory. Refuse to trade.
VOLATILITY_HARD_ABORT = 0.80

# Score magnitude required to trigger a BUY or SELL (otherwise HOLD).
SIGNAL_TRIGGER_THRESHOLD = 0.25

# ---------------------------------------------------------------------------
# Market regime (SPY / VIX classification)
# ---------------------------------------------------------------------------

# How long to cache the regime decision before re-querying yfinance.
# 1 hour is a balance: regime changes are slow, but vol spikes during a
# session deserve a fresh read inside one trading day.
REGIME_CACHE_TTL_SECONDS = 3600

# VIX bands.
VIX_PANIC_THRESHOLD = 30.0       # > this = "Panic"
VIX_TRENDING_CEILING = 20.0      # < this AND price > 200SMA = "Trending"
VIX_SIDEWAYS_BAND = (20.0, 30.0) # range that, with price < 200SMA = "Sideways"

# Market trend — SPY 200-day SMA.
SPY_TREND_SMA_PERIOD = 200

# Per-regime weight overrides. The user-supplied weights are kept ONLY in
# the "Neutral" regime; in any other regime the AI uses these. The UI
# surfaces this via the `effective_weights` field so the user can see when
# their sliders were overridden.
REGIME_WEIGHTS = {
    "Panic":    {"sentiment": 0.7, "ma": 0.1, "rsi": 0.2},
    "Trending": {"sentiment": 0.3, "ma": 0.6, "rsi": 0.1},
    "Sideways": {"sentiment": 0.2, "ma": 0.1, "rsi": 0.7},
    # "Neutral" intentionally absent → use user's normalised weights.
}

# ---------------------------------------------------------------------------
# Risk allocation (formerly "Kelly")
# ---------------------------------------------------------------------------
#
# This was previously called "kelly_percentage" but that name was misleading.
# True Kelly requires backtested win/loss probabilities and payoff ratio:
#       f* = (p·b - q) / b
# This formula is a *linear interpolation* between two anchor points:
#       (score_mag = 0.25, risk = 2 %)  →  weakest actionable signal
#       (score_mag = 0.95, risk = 15 %) →  near-certain signal
# Solve for the line: y = m·x + c  →  m = 18.57, c = -2.64.
# The result is bounded to [1 %, 20 %] so neither extreme can blow up
# a portfolio.
#
# To swap in a real Kelly calculation, replace `confidence_to_risk_pct`
# in algo_engine.py with `(p*b - q)/b` using your backtested stats.
# ---------------------------------------------------------------------------

RISK_PCT_SLOPE = 18.57
RISK_PCT_INTERCEPT = -2.64
RISK_PCT_FLOOR = 1.0
RISK_PCT_CEILING = 20.0

# ---------------------------------------------------------------------------
# News refresh loop (background lifespan task in main.py)
# ---------------------------------------------------------------------------

NEWS_REFRESH_CATEGORIES = ["general", "forex", "crypto", "merger"]
NEWS_REFRESH_PER_CATEGORY = 5
NEWS_REFRESH_INTERVAL_SECONDS = 300        # every 5 min
NEWS_REFRESH_HTTP_TIMEOUT_SECONDS = 10

# How many consecutive failed news-refresh cycles before we shout louder
# in the logs (a real prod system would page on this).
NEWS_REFRESH_ALERT_AFTER_FAILURES = 3
