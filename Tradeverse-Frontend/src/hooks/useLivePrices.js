import { useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";

/**
 * Fetch live prices for the given set of symbols. Refetches when the symbol
 * set changes (compared by sorted-join, so order doesn't matter).
 *
 * Returns: { prices: { SYM: number }, loading: bool }
 */
export function useLivePrices(symbols) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  // Track the requested set so an in-flight stale response can't overwrite a fresher one.
  const requestIdRef = useRef(0);

  const key = (symbols || []).filter(Boolean).sort().join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) {
      setPrices({});
      return;
    }

    const reqId = ++requestIdRef.current;
    setLoading(true);

    (async () => {
      try {
        const results = await Promise.all(
          list.map(async (symbol) => {
            try {
              const res = await apiClient.get(`/api/v1/trades/price/${symbol}`);
              const price = res.data?.price ?? res.data?.data?.price;
              return [symbol, price];
            } catch {
              return [symbol, null];
            }
          })
        );
        if (reqId !== requestIdRef.current) return; // a newer request superseded us
        const next = {};
        for (const [sym, price] of results) {
          if (price != null) next[sym] = price;
        }
        setPrices(next);
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    })();
  }, [key]);

  return { prices, loading };
}
