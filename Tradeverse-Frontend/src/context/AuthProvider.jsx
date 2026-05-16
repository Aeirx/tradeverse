import { useEffect, useState, useCallback } from "react";
import { apiClient, onSessionLost } from "../api/client";
import { AuthContext } from "./AuthContext";

/**
 * Auth state cache.
 * - "checking"        first probe in flight (initial app mount)
 * - "authenticated"   user session is known to be valid
 * - "unauthenticated" no/expired session
 *
 * The single network probe runs on mount. After that, ProtectedRoute and
 * other consumers read state from this cache instead of pinging /balance
 * on every navigation.
 *
 * Cold-start handling: free-tier Render sleeps the backend after 15 min
 * idle. A returning user with a valid auth cookie would otherwise get a
 * 502/503 on the probe and be bounced to /login. We retry once with an
 * 8 s delay specifically for those waking-from-sleep status codes — for
 * a real 401 (expired/invalid token) we don't retry, we just mark
 * unauthenticated immediately.
 */
const SLEEPING_STATUSES = new Set([502, 503, 504]);
const WAKE_DELAY_MS = 8_000;

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState("checking");

  const probe = useCallback(async () => {
    try {
      await apiClient.get("/api/v1/users/balance");
      setAuthState("authenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const probeWithColdStartRetry = async () => {
      try {
        await apiClient.get("/api/v1/users/balance");
        if (!cancelled) setAuthState("authenticated");
        return;
      } catch (err) {
        const status = err?.response?.status;
        const isColdStart =
          SLEEPING_STATUSES.has(status) || err?.code === "ECONNABORTED";
        if (!isColdStart) {
          if (!cancelled) setAuthState("unauthenticated");
          return;
        }
        // Backend looks asleep, not logged out — wait + retry once before
        // bouncing the user to /login.
      }

      await new Promise((resolve) => setTimeout(resolve, WAKE_DELAY_MS));
      if (cancelled) return;
      try {
        await apiClient.get("/api/v1/users/balance");
        if (!cancelled) setAuthState("authenticated");
      } catch {
        if (!cancelled) setAuthState("unauthenticated");
      }
    };

    probeWithColdStartRetry();

    return () => {
      cancelled = true;
    };
  }, []);

  // If the axios client gives up trying to refresh, mark us logged out.
  useEffect(() => onSessionLost(() => setAuthState("unauthenticated")), []);

  const value = {
    authState,
    isAuthenticated: authState === "authenticated",
    isChecking: authState === "checking",
    markAuthenticated: () => setAuthState("authenticated"),
    markUnauthenticated: () => setAuthState("unauthenticated"),
    recheck: probe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
