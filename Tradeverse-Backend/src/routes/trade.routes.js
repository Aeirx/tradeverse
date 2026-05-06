import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { createClient } from "redis";
import axios from "axios";
import { buyStock, sellStock, getPortfolio, getHistory } from "../controllers/trade.controller.js";
import { logger } from "../utils/logger.js";

// Initialize Redis client
let redisClient;
(async () => {
  redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: { reconnectStrategy: false }
  });
  redisClient.on("error", (err) => logger.warn({ err }, "Redis client error"));
  try {
    await redisClient.connect();
    logger.info("Redis cache connected");
  } catch (err) {
    logger.warn({ err }, "Redis cache unavailable — continuing without cache");
    redisClient = null;
  }
})();

const router = Router();

// Get live price route — JWT-protected to prevent open Finnhub-quota abuse
router.route("/price/:symbol").get(verifyJWT, async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    // 1. Check Redis Cache First
    if (redisClient && redisClient.isOpen) {
      const cachedPrice = await redisClient.get(`price:${symbol}`);
      if (cachedPrice) {
        logger.debug({ symbol }, "Price cache hit");
        return res.status(200).json({ price: Number(cachedPrice) });
      }
    }

    // Fetch from Finnhub API if cache miss
    logger.debug({ symbol }, "Price cache miss — fetching from Finnhub");
    const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`);
    const livePrice = response.data.c;
    if (!livePrice) {
      return res.status(503).json({ error: `Live price unavailable for ${symbol}. Finnhub may be rate-limited or the symbol is unsupported.` });
    }

    // Save to Redis cache and expire after 10 seconds
    if (redisClient && redisClient.isOpen) {
        await redisClient.setEx(`price:${symbol}`, 10, livePrice.toString());
    }

    res.status(200).json({ price: livePrice });
  } catch (error) {
    logger.error({ err: error }, "Finnhub price fetch failed");
    res.status(500).json({ error: "Failed to fetch live market data." });
  }
});

// Execute a buy order
// Transaction is used to prevent double-spend race conditions
router.route("/buy").post(verifyJWT, buyStock);

// Execute a sell order
// Transaction is used to ensure consistency
router.route("/sell").post(verifyJWT, sellStock);

// Portfolio and History
router.route("/portfolio").get(verifyJWT, getPortfolio);
router.route("/history").get(verifyJWT, getHistory);

export default router;
