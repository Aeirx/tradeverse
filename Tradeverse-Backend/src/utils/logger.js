import pino from "pino";

/**
 * Single shared logger. Set LOG_LEVEL via env var
 * (trace | debug | info | warn | error | fatal). Defaults to "info" in
 * production and "debug" in development for visibility.
 */
const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

export const logger = pino({
  level,
  // Time-stamp formatting that's readable in `docker logs` without pretty-print.
  timestamp: pino.stdTimeFunctions.isoTime,
  // Keep PII out of structured logs by default; controllers should never
  // pass entire request objects, only the bits they want logged.
  redact: {
    paths: ["password", "*.password", "req.headers.authorization", "req.headers.cookie"],
    remove: true,
  },
});
