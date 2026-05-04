import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { createClient } from "redis";
import axios from "axios";
import { buyStock, sellStock, getPortfolio, getHistory } from "../controllers/trade.controller.js";
// Initialize Redis client
let redisClient;
(async () => {
  redisClient = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: { reconnectStrategy: false }
  });
  redisClient.on("error", (err) => console.log("Redis Client Error:", err.message));
  try {
    await redisClient.connect();
    console.log("Redis cache connected.");
  } catch (err) {
    redisClient = null;
  }
})();

const router = Router();

// Get live price route
router.route("/price/:symbol").get(async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    // 1. Check Redis Cache First
    if (redisClient && redisClient.isOpen) {
      const cachedPrice = await redisClient.get(`price:${symbol}`);
      if (cachedPrice) {
        console.log(`Cache hit for ${symbol}`);
        return res.status(200).json({ price: Number(cachedPrice) });
      }
    }

    // Fetch from Finnhub API if cache miss
    console.log(`Cache miss. Fetching ${symbol} from Finnhub...`);
    const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`);
    let livePrice = response.data.c;
    if (!livePrice) {
      livePrice = 150.0; // Fallback for unsupported symbols so dashboard doesn't crash
    }

    // Save to Redis cache and expire after 10 seconds
    if (redisClient && redisClient.isOpen) {
        await redisClient.setEx(`price:${symbol}`, 10, livePrice.toString());
    }

    res.status(200).json({ price: livePrice });
  } catch (error) {
    console.error("FINNHUB ERROR:", error.message || error);
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
