import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// Importing the client here side-effect-installs the global axios refresh
// interceptor (deduped) on the shared apiClient instance.
import "./api/client";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
