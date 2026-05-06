import { useCallback, useState } from "react";

const MAX_LOG_ENTRIES = 200;

const INITIAL_LOGS = [
  "> System initialized...",
  "> Secure JWT Token verified.",
  "> Awaiting algorithm execution command...",
];

/**
 * Bounded execution log. Keeps the most recent MAX_LOG_ENTRIES messages so
 * long auto-pilot sessions don't leak memory.
 */
export function useExecutionLog() {
  const [logs, setLogs] = useState(INITIAL_LOGS);

  const addLog = useCallback((msg) => {
    setLogs((prev) => {
      const next = prev.length >= MAX_LOG_ENTRIES
        ? [...prev.slice(prev.length - MAX_LOG_ENTRIES + 1), msg]
        : [...prev, msg];
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, addLog, clearLogs };
}
