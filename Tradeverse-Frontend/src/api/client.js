import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// --- Deduped refresh: every concurrent 401 waits behind ONE refresh call ---
let refreshPromise = null;
const onUnauthorized = [];

const triggerRefresh = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/api/v1/users/refresh-token`, null, { withCredentials: true })
      .finally(() => {
        // Clear AFTER the in-flight queue has consumed it so a subsequent
        // 401 (e.g. five minutes later) starts a fresh refresh attempt.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      });
  }
  return refreshPromise;
};

/** Subscribe to global "session lost" events (e.g. AuthContext signs the user out). */
export const onSessionLost = (cb) => {
  onUnauthorized.push(cb);
  return () => {
    const i = onUnauthorized.indexOf(cb);
    if (i >= 0) onUnauthorized.splice(i, 1);
  };
};

const notifySessionLost = () => {
  for (const cb of onUnauthorized) {
    try {
      cb();
    } catch (e) {
      console.error("onSessionLost handler threw:", e);
    }
  }
};

apiClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = originalRequest?.url || "";

    // Don't try to refresh on the refresh endpoint itself, or on login/register.
    const isAuthEndpoint =
      url.includes("/users/refresh-token") ||
      url.includes("/users/login") ||
      url.includes("/users/register");

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        await triggerRefresh();
        return apiClient(originalRequest);
      } catch (refreshError) {
        notifySessionLost();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
