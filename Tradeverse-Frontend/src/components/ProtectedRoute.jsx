import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import axios from "axios";

export default function ProtectedRoute({ children }) {
  const [authState, setAuthState] = useState("checking");

  useEffect(() => {
    let isMounted = true;

    axios
      .get(`${import.meta.env.VITE_API_URL}/api/v1/users/balance`)
      .then(() => {
        if (isMounted) setAuthState("authenticated");
      })
      .catch(() => {
        if (isMounted) setAuthState("unauthenticated");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (authState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-gray-100">
        <span className="text-sm font-semibold tracking-wide uppercase text-gray-400">
          Checking session...
        </span>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <Navigate to="/" replace />;
  }

  return children;
}
