import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

/**
 * Read-only auth gate. The actual probe happens once in AuthProvider on app
 * mount; navigation between protected routes consumes the cached state and
 * fires no extra network calls.
 */
export default function ProtectedRoute({ children }) {
  const { isChecking, isAuthenticated } = useAuth();

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-gray-100">
        <span className="text-sm font-semibold tracking-wide uppercase text-gray-400">
          Checking session...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  return children;
}
