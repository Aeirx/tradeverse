import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import tradeRouter from "./routes/trade.routes.js";
import aiRouter from "./routes/ai.routes.js";
import userRouter from "./routes/user.routes.js";
import { logger } from "./utils/logger.js";

const app = express();

// --- Structured request logging ---
// Skip /healthz so Render's probe doesn't dominate the log volume.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/healthz",
    },
  })
);

// --- Security headers ---
app.use(helmet());

// --- Rate limiting ---
// Sized for *real* dashboard usage. The bot polls AI for up to 9 symbols
// every minute (~135 calls / 15 min just from that), useAiHealth adds 30
// background pings, plus wallet refreshes and live prices for each portfolio
// item. 100/15min — the old limit — would block a single logged-in user
// within ~4 minutes of normal use. 600/15min ≈ 40 req/min, generous for
// one user, still tight enough to throttle a runaway loop or scraper.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
  // Skip background polls — they're idempotent and cheap, no abuse vector.
  skip: (req) =>
    req.originalUrl === "/api/v1/ai/health" ||
    req.originalUrl === "/healthz",
});

// Strict limiter for auth endpoints: 15 attempts per 15 min per IP.
// Tight because these are the brute-force surface.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please try again later." },
});

// --- Manual CORS middleware — prevents duplicate headers from Render's proxy ---
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
app.use((req, res, next) => {
  // Overwrite (not append) the header so Render's proxy can't create duplicates
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// --- Health check endpoint ---
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Routes ---
// /login and /register get the *strict* auth limiter (brute-force surface).
// They're mounted FIRST so the stricter middleware wins for those paths;
// every other /users route then falls through to the general limiter.
app.use("/api/v1/users/login", authLimiter);
app.use("/api/v1/users/register", authLimiter);

app.use("/api/v1/trades", generalLimiter, tradeRouter);
app.use("/api/v1/users", generalLimiter, userRouter);
app.use("/api/v1/ai", generalLimiter, aiRouter);

// --- Global Error Handling Middleware ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const errors = err.errors || [];

  // pino-http attaches a per-request logger as req.log; use it so the
  // request id propagates into the error line.
  const log = req.log || logger;
  if (statusCode >= 500) {
    log.error({ err, statusCode, url: req.originalUrl, method: req.method }, "Request failed");
  } else {
    log.warn({ statusCode, url: req.originalUrl, method: req.method, message }, "Request rejected");
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
});

export { app };
