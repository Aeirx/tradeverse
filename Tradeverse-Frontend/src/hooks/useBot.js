import { useEffect, useRef } from "react";
import { apiClient } from "../api/client";
import { ALL_TARGETS } from "../constants/markets";

const CYCLE_DELAY_MS = 60_000;          // wait between cycles (after one finishes)
const PER_SYMBOL_PAUSE_MS = 1_500;      // gentle pacing between symbols within a cycle
const CONFIDENCE_THRESHOLD = 65;        // ignore weak BUY/SELL signals
const MIN_RISK_PCT_FOR_TRADE = 1.0;     // bot won't trade if risk_pct rounds to 0

const formatErrorMessage = (err) =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  "Network error.";

/**
 * Auto-pilot bot.
 *
 * Each cycle (in order, sequentially — never overlapping):
 *   1. Risk pass: for every holding, check live P&L vs stopLoss / takeProfit
 *      thresholds. If breached, auto-sell the entire position.
 *   2. Signal pass: for each target symbol, ask the AI for a signal.
 *        - BUY  with confidence > 65%  → size with `kelly_percentage` of
 *          buying power, NOT raw maxCapital. Falls back to maxCapital cap.
 *        - SELL with confidence > 65%  → partial sell of `kelly_percentage`
 *          of the holding (rounded down to >=1 share).
 *
 * Scheduling: a fresh cycle is queued only AFTER the previous one finishes
 * + a 60s gap. This prevents the overlap bug from setInterval.
 */
export function useBot({
  isActive,
  targets,
  weights,
  maxCapital,
  stopLossPct,
  takeProfitPct,
  portfolio,
  livePrices,
  addLog,
  refreshWallet,
}) {
  // Refs let the running cycle see the latest state without re-binding the
  // schedule loop on every keystroke.
  const stateRef = useRef({
    targets,
    weights,
    maxCapital,
    stopLossPct,
    takeProfitPct,
    portfolio,
    livePrices,
  });
  useEffect(() => {
    stateRef.current = {
      targets,
      weights,
      maxCapital,
      stopLossPct,
      takeProfitPct,
      portfolio,
      livePrices,
    };
  }, [targets, weights, maxCapital, stopLossPct, takeProfitPct, portfolio, livePrices]);

  const callbacksRef = useRef({ addLog, refreshWallet });
  useEffect(() => {
    callbacksRef.current = { addLog, refreshWallet };
  }, [addLog, refreshWallet]);

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    let timeoutId = null;
    callbacksRef.current.addLog("> 🤖 AUTO-PILOT ACTIVATED. Scanning targets...");

    const sleep = (ms) =>
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          resolve();
        }, ms);
      });

    /** Risk pass — auto-exit any position breaching its stop-loss or take-profit. */
    const runRiskChecks = async () => {
      const { portfolio, livePrices, stopLossPct, takeProfitPct } = stateRef.current;
      const { addLog, refreshWallet } = callbacksRef.current;
      for (const holding of portfolio || []) {
        if (cancelled) return;
        if (!holding.stockSymbol || !holding.quantity) continue;
        const live = livePrices[holding.stockSymbol];
        const avg = Number(holding.averagePrice || 0);
        if (!live || !avg) continue;
        const pnlPct = ((Number(live) - avg) / avg) * 100;
        const breachedStop = pnlPct <= -Math.abs(stopLossPct);
        const breachedTake = pnlPct >= Math.abs(takeProfitPct);
        if (!breachedStop && !breachedTake) continue;
        const reason = breachedStop ? "STOP-LOSS" : "TAKE-PROFIT";
        addLog(
          `> 🛑 ${reason} TRIGGERED on ${holding.stockSymbol} (P&L ${pnlPct.toFixed(2)}%) — exiting position.`
        );
        try {
          await apiClient.post("/api/v1/trades/sell", {
            symbol: holding.stockSymbol,
            quantity: holding.quantity,
          });
          addLog(`> ✅ ${reason} SELL FILLED: ${holding.quantity} share(s) of ${holding.stockSymbol}`);
          await refreshWallet();
        } catch (err) {
          addLog(`> ⚠️ ${reason} sell failed for ${holding.stockSymbol}: ${formatErrorMessage(err)}`);
        }
        if (cancelled) return;
        await sleep(PER_SYMBOL_PAUSE_MS);
      }
    };

    /** Signal pass — ask AI per symbol, size with Kelly, execute partial sells. */
    const runSignalScan = async () => {
      const { targets, weights, maxCapital, portfolio } = stateRef.current;
      const { addLog, refreshWallet } = callbacksRef.current;
      const list = (targets && targets.length > 0) ? targets : ALL_TARGETS;

      for (const symbol of list) {
        if (cancelled) return;
        addLog(`> 🔍 Scanning ${symbol}...`);
        try {
          const aiRes = await apiClient.post("/api/v1/ai/predict", { symbol, weights });
          const payload = aiRes.data?.data || {};
          const signal = (payload.signal || "").toUpperCase();
          const confidence = payload.confidence ?? 0;
          // Field renamed in Phase 5 (#43); tolerate the old name for one cycle.
          const riskPct = Number(payload.risk_pct ?? payload.kelly_percentage ?? 0);
          const regime = payload.regime || "—";
          addLog(
            `> 📊 ${symbol}: ${signal} (${confidence.toFixed(1)}% confidence, risk ${riskPct}%, regime ${regime})`
          );

          if (signal.includes("BUY") && confidence > CONFIDENCE_THRESHOLD) {
            if (riskPct < MIN_RISK_PCT_FOR_TRADE) {
              addLog(`> ⏸ ${symbol}: BUY signal but risk ${riskPct}% — too small to act.`);
            } else {
              const priceRes = await apiClient.get(`/api/v1/trades/price/${symbol}`);
              const livePrice = priceRes.data?.price ?? priceRes.data?.data?.price;
              if (!livePrice) {
                addLog(`> ⚠️ ${symbol}: live price unavailable, skipping BUY.`);
              } else {
                const wallet = await refreshWallet();
                const buyingPower = Math.max(0, Number(wallet?.walletBalance ?? 0));
                const riskDollars = (buyingPower * riskPct) / 100;
                const cappedDollars = Math.min(riskDollars, Number(maxCapital));
                const qty = Math.max(0, Math.floor(cappedDollars / Number(livePrice)));
                if (qty < 1) {
                  addLog(
                    `> ⏸ ${symbol}: BUY allowance $${cappedDollars.toFixed(2)} below 1 share @ $${Number(livePrice).toFixed(2)}.`
                  );
                } else {
                  addLog(
                    `> 🟢 BOT EXECUTING BUY: ${qty} share(s) of ${symbol} @ $${Number(livePrice).toFixed(2)} ` +
                      `(risk $${riskDollars.toFixed(2)} capped at $${cappedDollars.toFixed(2)})`
                  );
                  await apiClient.post("/api/v1/trades/buy", { symbol, quantity: qty });
                  addLog(`> ✅ BUY ORDER FILLED: ${qty} share(s) of ${symbol}`);
                  await refreshWallet();
                }
              }
            }
          } else if (signal.includes("SELL") && confidence > CONFIDENCE_THRESHOLD) {
            const holding = (portfolio || []).find((s) => s.stockSymbol === symbol);
            if (!holding || holding.quantity <= 0) {
              addLog(`> ⏭️ ${symbol}: SELL signal — no shares held, skipping.`);
            } else {
              // Partial sell sized by risk_pct. Falls back to "sell all" only if
              // risk_pct is 0 (the AI signalled SELL but provided no sizing).
              const riskShares = Math.floor((holding.quantity * riskPct) / 100);
              const sellQty = riskPct > 0
                ? Math.max(1, Math.min(holding.quantity, riskShares))
                : holding.quantity;
              addLog(
                `> 🔴 BOT EXECUTING PARTIAL SELL: ${sellQty}/${holding.quantity} share(s) of ${symbol} ` +
                  `(risk ${riskPct}%)`
              );
              await apiClient.post("/api/v1/trades/sell", { symbol, quantity: sellQty });
              addLog(`> ✅ SELL ORDER FILLED: ${sellQty} share(s) of ${symbol}`);
              await refreshWallet();
            }
          } else {
            addLog(`> ⏸ ${symbol}: HOLD — signal below confidence threshold.`);
          }
        } catch (err) {
          const status = err?.response?.status;
          const serverMsg = formatErrorMessage(err);
          if (status === 400) addLog(`> 🚧 ${symbol}: ${serverMsg}`);
          else if (status === 502) addLog(`> 🔥 ${symbol}: AI proxy error — ${serverMsg}`);
          else if (status === 500) addLog(`> 🔥 ${symbol}: Server error — ${serverMsg}`);
          else addLog(`> ⚠️ ${symbol}: ${serverMsg}`);
        }
        if (cancelled) return;
        await sleep(PER_SYMBOL_PAUSE_MS);
      }
    };

    /** Run one full cycle then schedule the next AFTER it finishes. */
    const runCycleAndReschedule = async () => {
      try {
        await runRiskChecks();
        if (cancelled) return;
        await runSignalScan();
      } catch (err) {
        callbacksRef.current.addLog(
          `> ⚠️ Bot cycle aborted: ${formatErrorMessage(err)}`
        );
      }
      if (cancelled) return;
      timeoutId = setTimeout(runCycleAndReschedule, CYCLE_DELAY_MS);
    };

    runCycleAndReschedule();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      callbacksRef.current.addLog("> ⏹ AUTO-PILOT DEACTIVATED.");
    };
  }, [isActive]);
}
