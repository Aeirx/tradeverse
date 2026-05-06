import axios from "axios";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logger } from "../utils/logger.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8001";
const AI_SERVICE_SECRET = process.env.AI_SERVICE_SECRET || "";

const aiHeaders = () => ({
  "Content-Type": "application/json",
  "X-API-Secret": AI_SERVICE_SECRET,
});

const upstreamErrorMessage = (error, fallback) => {
  const status = error?.response?.status;
  const upstreamMsg =
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message;
  if (status === 401 || status === 403) {
    return "AI service rejected the backend's credentials.";
  }
  return upstreamMsg || fallback;
};

const getAiInsight = asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new ApiError(400, "Please provide a non-empty `query` string.");
  }

  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/search`,
      { text: query.trim() },
      { headers: aiHeaders(), timeout: 30_000 }
    );
    return res
      .status(200)
      .json(new ApiResponse(200, aiResponse.data, "AI search completed."));
  } catch (error) {
    logger.error({ err: error }, "AI /search proxy error");
    throw new ApiError(
      502,
      upstreamErrorMessage(error, "AI service is unavailable.")
    );
  }
});

const checkAiHealth = asyncHandler(async (req, res) => {
  try {
    const aiResponse = await axios.get(`${AI_SERVICE_URL}/`, { timeout: 5_000 });
    return res
      .status(200)
      .json(new ApiResponse(200, { online: true, upstream: aiResponse.data }, "AI online."));
  } catch (error) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { online: false, error: error.message },
          "AI service is offline."
        )
      );
  }
});

const proxyPredict = asyncHandler(async (req, res) => {
  const { symbol, weights } = req.body;

  if (!symbol || typeof symbol !== "string") {
    throw new ApiError(400, "`symbol` is required.");
  }
  if (
    !weights ||
    typeof weights.sentiment !== "number" ||
    typeof weights.ma !== "number" ||
    typeof weights.rsi !== "number"
  ) {
    throw new ApiError(
      400,
      "`weights` must include numeric `sentiment`, `ma`, and `rsi`."
    );
  }

  try {
    const aiResponse = await axios.post(
      `${AI_SERVICE_URL}/api/predict`,
      { symbol: symbol.toUpperCase(), weights },
      { headers: aiHeaders(), timeout: 60_000 }
    );
    return res
      .status(200)
      .json(new ApiResponse(200, aiResponse.data, "AI prediction completed."));
  } catch (error) {
    logger.error({ err: error }, "AI /api/predict proxy error");
    throw new ApiError(
      502,
      upstreamErrorMessage(error, "AI prediction service is unavailable.")
    );
  }
});

export { getAiInsight, proxyPredict, checkAiHealth };
