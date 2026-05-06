import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";

/**
 * Wallet + portfolio state. Single source of truth — all bot/algo handlers
 * call refresh() after a successful trade to pull a fresh server snapshot.
 */
export function useWallet() {
  const [balance, setBalance] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await apiClient.get("/api/v1/users/balance");
      const payload = response.data?.data || {};
      setBalance(payload.walletBalance ?? 0);
      setPortfolio(payload.portfolio || []);
      setError(null);
      return payload;
    } catch (err) {
      console.error("Failed to fetch balance:", err);
      setError(err);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiClient.get("/api/v1/users/balance");
        if (cancelled) return;
        const payload = response.data?.data || {};
        setBalance(payload.walletBalance ?? 0);
        setPortfolio(payload.portfolio || []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to fetch balance:", err);
        setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { balance, portfolio, error, refresh };
}
