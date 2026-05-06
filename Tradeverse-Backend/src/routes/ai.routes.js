import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  getAiInsight,
  proxyPredict,
  checkAiHealth,
} from "../controllers/ai.controller.js";

const router = Router();

// All AI routes require an authenticated user; the backend then forwards the
// request to FastAPI with a service-level shared secret.
router.route("/ask").post(verifyJWT, getAiInsight);
router.route("/predict").post(verifyJWT, proxyPredict);
router.route("/health").get(verifyJWT, checkAiHealth);

export default router;
