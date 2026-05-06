import { useCallback, useState } from "react";
import { apiClient } from "../api/client";

const formatErrorMessage = (err) =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  "Network error.";

/**
 * Manual algorithm + buy/sell execution. Pure orchestration — owns:
 *   - lastSignal: most recent AI response (for the status card)
 *   - isRunning:  true while the AI is thinking (for the button spinner)
 *
 * #44: First call after a cold AI boot can take 10+ s while FinBERT and
 * MiniLM lazy-load. We surface that explicitly via `isRunning` and an
 * informational log line so the UI can show a spinner instead of looking
 * frozen.
 */
export function useAlgoExecution({
  activeSymbol,
  weights,
  tradeQuantity,
  addLog,
  refreshWallet,
}) {
  const [lastSignal, setLastSignal] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const buy = useCallback(async () => {
    try {
      addLog(`> Executing BUY order for ${tradeQuantity} shares of ${activeSymbol}...`);
      const response = await apiClient.post("/api/v1/trades/buy", {
        symbol: activeSymbol,
        quantity: Number(tradeQuantity),
      });
      addLog(`> SUCCESS: ${response.data.message}`);
      await refreshWallet();
    } catch (err) {
      addLog(`> ORDER REJECTED: ${formatErrorMessage(err)}`);
    }
  }, [activeSymbol, tradeQuantity, addLog, refreshWallet]);

  const sell = useCallback(async () => {
    try {
      addLog(`> Executing SELL order for ${tradeQuantity} shares of ${activeSymbol}...`);
      const response = await apiClient.post("/api/v1/trades/sell", {
        symbol: activeSymbol,
        quantity: Number(tradeQuantity),
      });
      addLog(`> SUCCESS: ${response.data.message}`);
      await refreshWallet();
    } catch (err) {
      addLog(`> ORDER REJECTED: ${formatErrorMessage(err)}`);
    }
  }, [activeSymbol, tradeQuantity, addLog, refreshWallet]);

  const runAlgorithm = useCallback(async () => {
    if (isRunning) return; // ignore double-clicks while a call is in flight
    setIsRunning(true);
    const startedAt = Date.now();
    addLog(`> Initiating sequence for ${activeSymbol}...`);
    addLog(
      `> Requested weights → Sentiment(${weights.sentiment}) RSI(${weights.rsi}) MA(${weights.ma})`
    );
    addLog(`> ⏳ Asking AI engine... (first call after a cold boot can take ~15s)`);
    try {
      const response = await apiClient.post("/api/v1/ai/predict", {
        symbol: activeSymbol,
        weights,
      });
      const payload = response.data?.data || {};
      const signal = (payload.signal || "").toUpperCase();
      const confidence = payload.confidence ?? 0;
      const regime = payload.regime || "Unknown";
      const eff = payload.effective_weights;
      // Field renamed in Phase 5 (#43). Tolerate the old name for one cycle
      // in case a stale AI deploy is still serving kelly_percentage.
      const riskPct = payload.risk_pct ?? payload.kelly_percentage ?? 0;
      const elapsedMs = Date.now() - startedAt;

      setLastSignal({
        symbol: activeSymbol,
        signal,
        confidence,
        regime,
        riskPct,
        effectiveWeights: eff,
        elapsedMs,
        at: new Date(),
      });

      addLog(`> AI Analysis Complete (${(elapsedMs / 1000).toFixed(1)}s). Regime: ${regime}`);
      addLog(`> SIGNAL: ${signal} (Confidence: ${confidence}%, Risk ${riskPct}%)`);
      if (eff) {
        const wMatchesRequest =
          Math.abs(eff.sentiment - weights.sentiment) < 0.02 &&
          Math.abs(eff.ma - weights.ma) < 0.02 &&
          Math.abs(eff.rsi - weights.rsi) < 0.02;
        if (!wMatchesRequest) {
          addLog(
            `> ⚠️ Regime override: actual weights → Sentiment(${eff.sentiment}) RSI(${eff.rsi}) MA(${eff.ma})`
          );
        }
      }

      if (signal.includes("BUY")) {
        addLog(`> 🤖 BOT OVERRIDE: Automatically executing BUY order...`);
        await buy();
      } else if (signal.includes("SELL")) {
        addLog(`> 🤖 BOT OVERRIDE: Automatically executing SELL order...`);
        await sell();
      } else {
        addLog(`> 🤖 BOT STANDING BY: No favorable trade setup found.`);
      }
    } catch (err) {
      addLog(`> ERROR: ${formatErrorMessage(err)}`);
    } finally {
      setIsRunning(false);
    }
  }, [activeSymbol, weights, addLog, buy, sell, isRunning]);

  return { buy, sell, runAlgorithm, lastSignal, isRunning };
}
