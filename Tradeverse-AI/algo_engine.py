"""
Tradeverse-AI ensemble decision engine.

Composition: weighted average of FinBERT sentiment + 50-day SMA momentum +
14-day RSI, with a market-regime overlay (SPY / VIX) that can override the
user-supplied weights, a hard volatility abort, and a confidence-to-risk-%
mapping (formerly mislabelled "Kelly" — see config.py for the full note).

All thresholds and tunables live in config.py. Don't add new magic numbers
to this file — promote them to config.py first.
"""

import logging
import re
import time
from typing import Optional

import numpy as np
import yfinance as yf
from transformers import pipeline

import config

logger = logging.getLogger("tradeverse-ai.algo")
logger.info("Initializing Quant Ensemble Engine...")

# ---------------------------------------------------------------------------
# Lazy FinBERT loader (warmed at app startup; see main.py)
# ---------------------------------------------------------------------------

nlp_pipeline = None


def get_nlp_pipeline():
    global nlp_pipeline
    if nlp_pipeline is None:
        try:
            logger.info("Loading FinBERT Sentiment Engine (%s)...", config.FINBERT_MODEL)
            nlp_pipeline = pipeline(
                "sentiment-analysis",
                model=config.FINBERT_MODEL,
            )
        except Exception as e:
            logger.exception("Failed to load FinBERT: %s", e)
    return nlp_pipeline


# ---------------------------------------------------------------------------
# Technicals
# ---------------------------------------------------------------------------


def get_live_technicals(symbol):
    """Return (ma_score, rsi_score, volatility, volume_multiplier).

    Returns (0, 0, 0, 1) on data failure so the caller can decide how to
    handle a missing-technicals scenario (see #50: we no longer treat
    (0, 0) as bullish-AND-bearish — that's now a fail-safe HOLD).
    """
    try:
        ticker = yf.Ticker(symbol, session=None)
        df = ticker.history(period=config.TECHNICAL_HISTORY_PERIOD)
        if df.empty:
            return None, None, None

        close = df["Close"]
        if len(close) < config.SMA_PERIOD:
            return 0.0, 0.0, 0.0, 1.0

        # 50-day SMA momentum
        sma = close.rolling(window=config.SMA_PERIOD).mean().iloc[-1]
        current_price = close.iloc[-1]
        ma_diff_pct = (current_price - sma) / sma
        ma_score = min(max(ma_diff_pct * config.MA_SCORE_SCALE, -1.0), 1.0)

        # 14-day Wilder RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=config.RSI_PERIOD).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=config.RSI_PERIOD).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        current_rsi = rsi.iloc[-1]
        rsi_score = (50 - current_rsi) / config.RSI_SCORE_DIVISOR
        rsi_score = min(max(rsi_score, -1.0), 1.0)

        # 20-day annualised volatility
        returns = close.pct_change()
        volatility = returns.tail(config.VOLATILITY_PERIOD).std() * np.sqrt(
            config.TRADING_DAYS_PER_YEAR
        )

        # Volume multiplier — capped to a sane band
        volume = df["Volume"]
        if len(volume) < config.VOLUME_PERIOD:
            volume_multiplier = 1.0
        else:
            avg_volume = volume.rolling(window=config.VOLUME_PERIOD).mean().iloc[-1]
            current_volume = volume.iloc[-1]
            volume_multiplier = current_volume / avg_volume if avg_volume > 0 else 1.0
            volume_multiplier = max(
                config.VOLUME_MULTIPLIER_FLOOR,
                min(volume_multiplier, config.VOLUME_MULTIPLIER_CEILING),
            )

        return float(ma_score), float(rsi_score), float(volatility), float(volume_multiplier)

    except Exception as e:
        logger.warning("YFinance error for %s: %s", symbol, e)
        return 0.0, 0.0, 0.0, 1.0


# ---------------------------------------------------------------------------
# Market regime — cached for REGIME_CACHE_TTL_SECONDS to avoid hammering
# yfinance on every prediction (#45).
# ---------------------------------------------------------------------------

_regime_cache: dict = {"value": None, "expires_at": 0.0}


def get_market_regime():
    now = time.time()
    if _regime_cache["value"] is not None and now < _regime_cache["expires_at"]:
        return _regime_cache["value"]

    try:
        spy = yf.Ticker("SPY", session=None).history(period="1y")
        vix = yf.Ticker("^VIX", session=None).history(period="1mo")
        if spy.empty or vix.empty:
            regime = "Neutral"
        else:
            spy_close = spy["Close"]
            vix_close = vix["Close"]
            current_vix = vix_close.iloc[-1]
            current_spy = spy_close.iloc[-1]

            if len(spy_close) < config.SPY_TREND_SMA_PERIOD:
                regime = "Neutral"
            else:
                spy_sma = (
                    spy_close.rolling(window=config.SPY_TREND_SMA_PERIOD).mean().iloc[-1]
                )
                low, high = config.VIX_SIDEWAYS_BAND
                if current_vix > config.VIX_PANIC_THRESHOLD:
                    regime = "Panic"
                elif current_spy > spy_sma and current_vix < config.VIX_TRENDING_CEILING:
                    regime = "Trending"
                elif current_spy < spy_sma and low <= current_vix <= high:
                    regime = "Sideways"
                else:
                    regime = "Neutral"
    except Exception as e:
        logger.warning("Market regime detection failed: %s", e)
        regime = "Neutral"

    _regime_cache["value"] = regime
    _regime_cache["expires_at"] = now + config.REGIME_CACHE_TTL_SECONDS
    return regime


# ---------------------------------------------------------------------------
# Sentiment — fake-news filter runs BEFORE FinBERT (#48), so a neutral
# label can no longer slip through unfiltered.
# ---------------------------------------------------------------------------

_RUMOR_RE = re.compile(config.RUMOR_PATTERN, re.IGNORECASE)


def is_rumor(headline: str) -> bool:
    return bool(_RUMOR_RE.search(headline or ""))


def get_finbert_sentiment(headline: str) -> float:
    """Score one headline. Returns float in [-1, +1]."""
    if not headline:
        return 0.0
    pipeline_obj = get_nlp_pipeline()
    if pipeline_obj is None:
        return 0.0
    try:
        # truncation=True lets the tokenizer cap by *tokens* (#49) instead of
        # the old `headline[:512]` which was truncating by *characters*.
        res = pipeline_obj(headline, truncation=True, max_length=config.FINBERT_MAX_INPUT_TOKENS)[0]
        label = res["label"]
        confidence = res["score"]
        if label == "positive":
            return confidence
        if label == "negative":
            return -confidence
        return 0.0
    except Exception as e:
        logger.warning("FinBERT error on headline: %s", e)
        return 0.0


def get_averaged_sentiment(headlines: list) -> float:
    """Run FinBERT on up to 5 headlines after filtering out rumors.

    First-headline weight = SENTIMENT_TOP_HEADLINE_WEIGHT (typically 2.0);
    every other headline = SENTIMENT_OTHER_HEADLINE_WEIGHT (typically 1.0).
    """
    if not headlines:
        return 0.0

    # Filter rumor-language BEFORE FinBERT — see #48.
    cleaned = []
    for h in headlines[:config.PINECONE_TOP_K]:
        if is_rumor(h):
            logger.debug("FinBERT skipped (rumor): '%s...'", h[:60])
            continue
        cleaned.append(h)

    if not cleaned:
        return 0.0

    scores = []
    for headline in cleaned:
        s = get_finbert_sentiment(headline)
        scores.append(s)
        logger.debug("FinBERT: %+.3f | '%s...'", s, headline[:60])

    weights = [config.SENTIMENT_TOP_HEADLINE_WEIGHT] + [
        config.SENTIMENT_OTHER_HEADLINE_WEIGHT
    ] * (len(scores) - 1)
    weighted_avg = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
    logger.debug("Averaged sentiment: %+.3f across %d headlines", weighted_avg, len(scores))
    return weighted_avg


# ---------------------------------------------------------------------------
# Risk allocation (formerly "Kelly" — see config.py for the full note on
# why this is mislabelled and how to swap in a real Kelly calculation).
# ---------------------------------------------------------------------------


def confidence_to_risk_pct(score: float) -> float:
    """Map an absolute final-score in [0, 1] to a risk-allocation %."""
    score_mag = abs(score)
    raw = (score_mag * config.RISK_PCT_SLOPE) + config.RISK_PCT_INTERCEPT
    return max(config.RISK_PCT_FLOOR, min(raw, config.RISK_PCT_CEILING))


# ---------------------------------------------------------------------------
# Ensemble
# ---------------------------------------------------------------------------


def run_ensemble_model(symbol: str, weights: dict, headlines: Optional[list] = None) -> dict:
    if headlines is None:
        headlines = []

    logger.info("Running ensemble for %s | %d headlines", symbol, len(headlines))

    # 1. Multi-headline FinBERT sentiment (after rumor filter).
    raw_sent_score = get_averaged_sentiment(headlines)

    # 2. Live technical indicators.
    technicals = get_live_technicals(symbol)
    if technicals[0] is None:
        ma_score, rsi_score, volatility, vol_multiplier = 0.0, 0.0, 0.0, 1.0
        logger.warning("No pricing data for %s — using neutral technical indicators", symbol)
    else:
        ma_score, rsi_score, volatility, vol_multiplier = technicals

    # 3. Scale sentiment by volume — news only matters if institutions are paying attention.
    sent_score = raw_sent_score * vol_multiplier
    sent_score = max(-1.0, min(1.0, sent_score))

    logger.debug(
        "Technicals %s — MA %+.2f, RSI %+.2f, vol %.2f%%, vol_mult %.2fx, sent %+.2f (raw %+.2f)",
        symbol, ma_score, rsi_score, volatility * 100, vol_multiplier, sent_score, raw_sent_score,
    )

    # 4. Hard abort: extreme vol = meme-stock territory.
    if volatility > config.VOLATILITY_HARD_ABORT:
        logger.warning("Volatility hard-abort for %s (annualised vol %.2f%%)", symbol, volatility * 100)
        return {
            "final_score": 0.0,
            "signal": "⚪ HOLD",
            "risk_pct": 0.0,
            "regime": "Neutral",
            "effective_weights": {
                "sentiment": round(weights.get("sentiment", 0), 3),
                "ma": round(weights.get("ma", 0), 3),
                "rsi": round(weights.get("rsi", 0), 3),
            },
            "abort_reason": "volatility_hard_abort",
        }

    # 5. Regime override.
    regime = get_market_regime()
    logger.debug("Market regime: %s", regime)
    if regime in config.REGIME_WEIGHTS:
        weights = config.REGIME_WEIGHTS[regime]

    total_w = sum(weights.values())
    if total_w > 0:
        weights = {k: v / total_w for k, v in weights.items()}

    # 6. Weighted score.
    final_weighted_score = (
        sent_score * weights["sentiment"]
        + ma_score * weights["ma"]
        + rsi_score * weights["rsi"]
    )

    # 7. Stricter signal logic with FAIL-SAFE technicals (#50).
    # If both technicals are exactly 0 (i.e. yfinance failed), neither
    # confirms — fall through to HOLD instead of the old fail-open behaviour
    # where (0, 0) counted as both bullish and bearish.
    technicals_available = not (ma_score == 0.0 and rsi_score == 0.0)
    technicals_bullish = technicals_available and (ma_score > 0 or rsi_score > 0)
    technicals_bearish = technicals_available and (ma_score < 0 or rsi_score < 0)
    sentiment_positive = sent_score > 0
    sentiment_negative = sent_score < 0

    if (
        final_weighted_score >= config.SIGNAL_TRIGGER_THRESHOLD
        and technicals_bullish
    ):
        if sentiment_negative:
            logger.info("Caution: technical BUY but negative news for %s — downgrading to HOLD", symbol)
            signal = "⚪ HOLD"
        else:
            signal = "🟢 BUY"
    elif (
        final_weighted_score <= -config.SIGNAL_TRIGGER_THRESHOLD
        and technicals_bearish
    ):
        if sentiment_positive:
            logger.info("Caution: technical SELL but positive news for %s — downgrading to HOLD", symbol)
            signal = "⚪ HOLD"
        else:
            signal = "🔴 SELL"
    else:
        signal = "⚪ HOLD"

    # 8. Risk allocation %.
    risk_pct = (
        confidence_to_risk_pct(final_weighted_score)
        if signal in ("🟢 BUY", "🔴 SELL")
        else 0.0
    )

    logger.info(
        "Decision %s | signal=%s score=%+.3f risk=%.2f%% | weights S=%.1f%% MA=%.1f%% RSI=%.1f%%",
        symbol, signal, final_weighted_score, risk_pct,
        weights["sentiment"] * 100, weights["ma"] * 100, weights["rsi"] * 100,
    )

    return {
        "final_score": round(final_weighted_score, 3),
        "signal": signal,
        # Renamed from "kelly_percentage" — see config.py for the rationale.
        "risk_pct": round(risk_pct, 2),
        "regime": regime,
        "effective_weights": {
            "sentiment": round(weights["sentiment"], 3),
            "ma": round(weights["ma"], 3),
            "rsi": round(weights["rsi"], 3),
        },
    }


# ---------------------------------------------------------------------------
# Local smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    user_weights = {"sentiment": 0.5, "ma": 0.3, "rsi": 0.2}
    run_ensemble_model("TSLA", user_weights, headlines=[
        "Rumor: Elon Musk allegedly steps down, market panics!"
    ])
    run_ensemble_model("AAPL", user_weights, headlines=[
        "Apple smashes earnings expectations natively!",
        "iPhone 17 demand surges across Asia markets",
        "Apple stock hits all-time high after record quarter",
    ])
