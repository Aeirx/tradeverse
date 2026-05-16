import { apiClient } from "./client";

const SLEEPING_STATUSES = new Set([502, 503, 504]);
const WAKE_DELAY_MS = 8_000;

/**
 * POST /api/v1/ai/predict with cold-start resilience.
 *
 * Free-tier hosting reality: the Render backend sleeps after 15 min idle,
 * and the Hugging Face Space sleeps after 48 h of zero traffic. A user
 * clicking "Execute Strategy" cold can hit either or both.
 *
 * Sequence on a 502 / 503 / 504:
 *   1. Hit /api/v1/ai/health — this wakes the backend if it was asleep,
 *      and the backend fires a fire-and-forget /warmup ping at the AI
 *      service which starts loading models in the background.
 *   2. Wait 8 s for things to come up.
 *   3. Retry the predict call once.
 *
 * Anything other than 502/503/504 (e.g. 400 bad input, 401 auth) goes
 * straight through — those aren't cold-start errors.
 */
export async function callAiPredict({ symbol, weights, addLog }) {
  const body = { symbol, weights };

  try {
    return await apiClient.post("/api/v1/ai/predict", body);
  } catch (err) {
    const status = err?.response?.status;
    const isColdStartish =
      SLEEPING_STATUSES.has(status) || err?.code === "ECONNABORTED";
    if (!isColdStartish) throw err;

    addLog?.(
      `> ⏳ AI/backend appears to be waking up (status ${status || "timeout"}). Pinging health, retrying in ${WAKE_DELAY_MS / 1000}s...`
    );
    // Best-effort wake-up — don't propagate errors from the probe itself.
    try {
      await apiClient.get("/api/v1/ai/health");
    } catch {
      /* health probe failure is just informational here */
    }
    await new Promise((resolve) => setTimeout(resolve, WAKE_DELAY_MS));

    return await apiClient.post("/api/v1/ai/predict", body);
  }
}
