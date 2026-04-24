import { createRoot } from "react-dom/client";
import App from "./App";
import { initSentry } from "./lib/sentry";
import "./index.css";

// Init Sentry as the very first thing so any subsequent error during the
// initial render is captured. No-op if VITE_SENTRY_DSN is unset.
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
