"""
Test isolation harness for the AI engine.

`algo_engine.py` imports yfinance, transformers, and (transitively) torch
at module load. Those are huge — and irrelevant for unit-testing the pure
math (confidence_to_risk_pct, is_rumor, regime cache, ensemble logic).

So we install lightweight stub modules in `sys.modules` BEFORE algo_engine
gets imported, allowing pytest to run on a vanilla Python install with
only pytest and numpy on PATH.
"""

import os
import sys
import types
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# Stub `yfinance`
# ---------------------------------------------------------------------------

class _StubTicker:
    def __init__(self, symbol, session=None):
        self.symbol = symbol

    def history(self, period=None):
        # Return an "empty" object with .empty attribute so algo_engine's
        # `if df.empty: return None, None, None` branch kicks in.
        class _Empty:
            empty = True

            def __getitem__(self, _):
                return self

        return _Empty()


yfinance_stub = types.ModuleType("yfinance")
yfinance_stub.Ticker = _StubTicker
sys.modules["yfinance"] = yfinance_stub


# ---------------------------------------------------------------------------
# Stub `transformers.pipeline`
# ---------------------------------------------------------------------------

def _stub_pipeline(*args, **kwargs):
    def runner(text, **_kw):
        # Default: emit a "neutral" label with confidence 0.5 — tests that
        # care about specific sentiment override `algo_engine.nlp_pipeline`
        # directly via monkeypatch.
        return [{"label": "neutral", "score": 0.5}]

    return runner


transformers_stub = types.ModuleType("transformers")
transformers_stub.pipeline = _stub_pipeline
sys.modules["transformers"] = transformers_stub


# ---------------------------------------------------------------------------
# numpy is a real, lightweight dep — leave it alone if it's available, but
# fall back to a tiny shim if it isn't (CI minimal env).
# ---------------------------------------------------------------------------

try:
    import numpy  # noqa: F401
except ImportError:  # pragma: no cover
    numpy_stub = types.ModuleType("numpy")
    numpy_stub.sqrt = lambda x: x ** 0.5
    sys.modules["numpy"] = numpy_stub


# Tests don't need a real Pinecone / dotenv; main.py loads those, but
# algo_engine.py itself doesn't import them, so no stub needed.

# Keep test runs deterministic: an empty regime cache and any env nullables.
os.environ.setdefault("API_SECRET", "test-secret")
