import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

const HEALTH_INTERVAL_MS = 30_000;

/**
 * Polls the backend's AI health proxy. Returns:
 *   - status:    "checking" | "online" | "offline"
 *   - lastCheck: Date | null
 */
export function useAiHealth() {
  const [status, setStatus] = useState("checking");
  const [lastCheck, setLastCheck] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        const res = await apiClient.get("/api/v1/ai/health");
        if (cancelled) return;
        setStatus(res.data?.data?.online ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      } finally {
        if (!cancelled) setLastCheck(new Date());
      }
    };

    ping();
    const id = setInterval(ping, HEALTH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { status, lastCheck };
}
