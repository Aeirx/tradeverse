"""
Unit tests for algo_engine.py.

Covers:
  - confidence_to_risk_pct (anchor points + clamping)
  - is_rumor (regex)
  - get_market_regime (TTL cache)
  - get_finbert_sentiment (label → score mapping, error path)
  - run_ensemble_model (volatility hard-abort, fail-safe HOLD,
    sentiment-veto downgrade, regime-override of weights)

The tests run without yfinance / transformers / torch installed because
conftest.py stubs those modules before import.
"""

import time

import pytest

import algo_engine
import config


# ---------------------------------------------------------------------------
# Helpers — patch dependencies at the function level for each test.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_regime_cache():
    """Each test starts with a fresh regime cache so cached state from a
    previous test can't leak in."""
    algo_engine._regime_cache["value"] = None
    algo_engine._regime_cache["expires_at"] = 0.0
    yield
    algo_engine._regime_cache["value"] = None
    algo_engine._regime_cache["expires_at"] = 0.0


# ---------------------------------------------------------------------------
# confidence_to_risk_pct (the renamed "Kelly")
# ---------------------------------------------------------------------------


class TestConfidenceToRiskPct:
    def test_anchor_low(self):
        # score 0.25 → ≈ 2 % (the "weakest actionable signal" anchor).
        assert algo_engine.confidence_to_risk_pct(0.25) == pytest.approx(2.0, abs=0.01)

    def test_anchor_high(self):
        # score 0.95 → ≈ 15 % (the "near-certain signal" anchor).
        assert algo_engine.confidence_to_risk_pct(0.95) == pytest.approx(15.0, abs=0.01)

    def test_zero_score_floors_at_min(self):
        # Below the lower anchor, the linear formula goes negative, so the
        # clamp at RISK_PCT_FLOOR kicks in.
        assert algo_engine.confidence_to_risk_pct(0.0) == config.RISK_PCT_FLOOR

    def test_huge_score_clamps_at_ceiling(self):
        assert algo_engine.confidence_to_risk_pct(2.0) == config.RISK_PCT_CEILING

    def test_negative_score_treated_as_magnitude(self):
        # SELL signals also get sized — only |score| matters.
        assert algo_engine.confidence_to_risk_pct(-0.5) == algo_engine.confidence_to_risk_pct(0.5)


# ---------------------------------------------------------------------------
# is_rumor (regex-based fake news filter)
# ---------------------------------------------------------------------------


class TestIsRumor:
    @pytest.mark.parametrize("headline", [
        "Rumor: CEO is stepping down",
        "Allegedly, the company is bankrupt",
        "Unverified claims about a merger",
        "FBI calls the report a SCAM",
        "He falsely claimed record earnings",
    ])
    def test_rumor_words_match(self, headline):
        assert algo_engine.is_rumor(headline) is True

    @pytest.mark.parametrize("headline", [
        "Apple smashes earnings expectations",
        "iPhone 17 demand surges across Asia",
        "Tesla announces new factory in Berlin",
        "",
        None,
    ])
    def test_neutral_headlines_dont_match(self, headline):
        assert algo_engine.is_rumor(headline) is False


# ---------------------------------------------------------------------------
# get_market_regime — TTL cache (#45)
# ---------------------------------------------------------------------------


class TestRegimeCache:
    def test_cache_hit_skips_yfinance(self, monkeypatch):
        algo_engine._regime_cache["value"] = "Trending"
        algo_engine._regime_cache["expires_at"] = time.time() + 3600

        called = {"n": 0}

        def fake_ticker(*args, **kwargs):
            called["n"] += 1
            raise AssertionError("Should not have called yfinance — cache should hit")

        monkeypatch.setattr(algo_engine.yf, "Ticker", fake_ticker)

        assert algo_engine.get_market_regime() == "Trending"
        assert called["n"] == 0

    def test_cache_expiry_triggers_refetch(self, monkeypatch):
        algo_engine._regime_cache["value"] = "Trending"
        algo_engine._regime_cache["expires_at"] = time.time() - 1  # already expired

        # Force the yfinance call to throw → algo_engine falls back to "Neutral".
        def boom(*args, **kwargs):
            raise RuntimeError("simulated yfinance failure")

        monkeypatch.setattr(algo_engine.yf, "Ticker", boom)
        assert algo_engine.get_market_regime() == "Neutral"


# ---------------------------------------------------------------------------
# get_finbert_sentiment
# ---------------------------------------------------------------------------


class TestFinBertSentiment:
    def test_positive_label_returns_positive_score(self, monkeypatch):
        monkeypatch.setattr(algo_engine, "nlp_pipeline", lambda text, **_: [
            {"label": "positive", "score": 0.87}
        ])
        assert algo_engine.get_finbert_sentiment("Apple beats earnings") == pytest.approx(0.87)

    def test_negative_label_returns_negative_score(self, monkeypatch):
        monkeypatch.setattr(algo_engine, "nlp_pipeline", lambda text, **_: [
            {"label": "negative", "score": 0.71}
        ])
        assert algo_engine.get_finbert_sentiment("Stock crashes overnight") == pytest.approx(-0.71)

    def test_neutral_label_returns_zero(self, monkeypatch):
        monkeypatch.setattr(algo_engine, "nlp_pipeline", lambda text, **_: [
            {"label": "neutral", "score": 0.99}
        ])
        assert algo_engine.get_finbert_sentiment("Markets open Monday") == 0.0

    def test_pipeline_failure_returns_zero(self, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("simulated pipeline failure")

        monkeypatch.setattr(algo_engine, "nlp_pipeline", boom)
        assert algo_engine.get_finbert_sentiment("Whatever") == 0.0

    def test_empty_headline_short_circuits(self):
        # Empty input never even calls FinBERT.
        assert algo_engine.get_finbert_sentiment("") == 0.0


# ---------------------------------------------------------------------------
# run_ensemble_model — the integration paths
# ---------------------------------------------------------------------------


def _patch_technicals(monkeypatch, ma=0.5, rsi=0.3, vol=0.2, vmult=1.0):
    monkeypatch.setattr(
        algo_engine,
        "get_live_technicals",
        lambda symbol: (ma, rsi, vol, vmult),
    )


def _patch_regime(monkeypatch, regime="Neutral"):
    monkeypatch.setattr(algo_engine, "get_market_regime", lambda: regime)


def _patch_sentiment(monkeypatch, score=0.0):
    monkeypatch.setattr(algo_engine, "get_averaged_sentiment", lambda h: score)


class TestRunEnsemble:
    def test_volatility_hard_abort_returns_hold(self, monkeypatch):
        _patch_technicals(monkeypatch, ma=0.9, rsi=0.9, vol=0.95, vmult=1.0)
        _patch_regime(monkeypatch, "Neutral")
        _patch_sentiment(monkeypatch, 0.9)

        result = algo_engine.run_ensemble_model(
            "MEME",
            {"sentiment": 0.5, "ma": 0.3, "rsi": 0.2},
            headlines=[],
        )

        assert "HOLD" in result["signal"]
        assert result["risk_pct"] == 0.0
        assert result["abort_reason"] == "volatility_hard_abort"

    def test_fail_safe_when_technicals_unavailable(self, monkeypatch):
        # yfinance returns (None, None, None) — ma/rsi default to 0,0.
        _patch_technicals(monkeypatch, ma=0.0, rsi=0.0, vol=0.0, vmult=1.0)
        _patch_regime(monkeypatch, "Neutral")
        # Strong sentiment alone shouldn't trip BUY — that was the old
        # fail-open bug. With #50 fixed, (0,0) technicals → HOLD.
        _patch_sentiment(monkeypatch, 0.9)

        result = algo_engine.run_ensemble_model(
            "AAPL",
            {"sentiment": 1.0, "ma": 0.0, "rsi": 0.0},
            headlines=["Some headline"],
        )

        assert "HOLD" in result["signal"]
        assert result["risk_pct"] == 0.0

    def test_strong_buy_with_confirming_technicals(self, monkeypatch):
        _patch_technicals(monkeypatch, ma=0.8, rsi=0.6, vol=0.2, vmult=1.0)
        _patch_regime(monkeypatch, "Neutral")
        _patch_sentiment(monkeypatch, 0.8)

        result = algo_engine.run_ensemble_model(
            "AAPL",
            {"sentiment": 0.5, "ma": 0.3, "rsi": 0.2},
            headlines=["Apple smashes earnings"],
        )

        assert "BUY" in result["signal"]
        assert result["final_score"] > config.SIGNAL_TRIGGER_THRESHOLD
        assert result["risk_pct"] >= config.RISK_PCT_FLOOR

    def test_negative_news_downgrades_technical_buy_to_hold(self, monkeypatch):
        # Strong technicals push the score over the BUY threshold, but
        # negative sentiment vetoes it.
        _patch_technicals(monkeypatch, ma=0.9, rsi=0.9, vol=0.2, vmult=1.0)
        _patch_regime(monkeypatch, "Neutral")
        _patch_sentiment(monkeypatch, -0.3)

        result = algo_engine.run_ensemble_model(
            "AAPL",
            {"sentiment": 0.1, "ma": 0.5, "rsi": 0.4},
            headlines=["Bad news headline"],
        )

        assert "HOLD" in result["signal"]

    def test_panic_regime_overrides_user_weights(self, monkeypatch):
        _patch_technicals(monkeypatch, ma=0.5, rsi=0.5, vol=0.2, vmult=1.0)
        _patch_regime(monkeypatch, "Panic")
        _patch_sentiment(monkeypatch, 0.0)

        # User asks for MA-heavy weights, but Panic regime forces a
        # sentiment-heavy override.
        result = algo_engine.run_ensemble_model(
            "AAPL",
            {"sentiment": 0.0, "ma": 1.0, "rsi": 0.0},
            headlines=[],
        )

        eff = result["effective_weights"]
        # Panic = sentiment 0.7, ma 0.1, rsi 0.2 (post-normalisation)
        assert eff["sentiment"] == pytest.approx(0.7, abs=0.01)
        assert eff["ma"] == pytest.approx(0.1, abs=0.01)
        assert eff["rsi"] == pytest.approx(0.2, abs=0.01)
        assert result["regime"] == "Panic"
