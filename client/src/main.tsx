import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { initSentry } from "./lib/sentry";

// Phase 2 Task 6a: TanStack Start's documented client-entry pattern for the
// installed version (@tanstack/react-start@1.168.32) - copied from this
// exact package's own bundled default entry at
// node_modules/@tanstack/react-start/src/default-entry/client.tsx, not from
// memory or docs, since this is a pre-1.0/pre-stable package where the
// pattern can change between versions. `StartClient` internally calls
// hydrateStart(), which resolves the router via src/router.tsx's
// getRouter() (the framework's required router factory) - no manual router
// wiring needed here. `hydrateRoot(document, ...)` hydrates the WHOLE
// document (html/head/body), because src/routes/__root.tsx's RootDocument
// now renders the entire <html> element server-side; this replaces
// `createRoot(document.getElementById("root")!).render(<App />)`, which
// only ever mounted into a <div id="root"> that client/index.html no
// longer supplies content for (it's server-rendered by Start now).
//
// App.tsx is deleted (nothing imports it anymore, per the task's direction
// to remove App.tsx's routing shell and move anything still needed into
// __root.tsx - see that file and the Task 6a report for what moved where).
// "./index.css" also moved to __root.tsx: it's part of Start's own client
// module graph now (see that file's import comment for why that matters).

// Init Sentry as the very first thing so any subsequent error during the
// initial render is captured. No-op if VITE_SENTRY_DSN is unset.
initSentry();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
  // Tells the hydration watchdog in src/routes/__root.tsx that hydration
  // reached this line. Without it the watchdog strips the `js` class from
  // <html> and the landing page falls back to its static, always-visible
  // rendering (see the fallback rule in pages/landing/styles.css).
  //
  // Set here rather than in a component effect on purpose: this must be
  // reached whether or not any particular route renders successfully, and
  // hydrateRoot() returning means React owns the document. A component that
  // throws is exactly the case the watchdog exists for, so the signal must
  // not live inside one.
  document.documentElement.setAttribute("data-hydrated", "");
});
