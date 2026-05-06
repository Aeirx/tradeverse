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
 */
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
    (async () => {
      try {
        await apiClient.get("/api/v1/users/balance");
        if (!cancelled) setAuthState("authenticated");
      } catch {
        if (!cancelled) setAuthState("unauthenticated");
      }
    })();
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
