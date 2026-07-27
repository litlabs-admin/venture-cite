import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

// Wave 6.1: SPA routes the client router knows about. Anything else is a
// genuine not-found — we still serve index.html (so the client NotFound page
// renders), but with a 404 status so crawlers don't index garbage URLs.
// Keep this in sync with client/src/App.tsx `<Route path="…">` declarations.
const KNOWN_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/login$/,
  /^\/register$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
  /^\/privacy$/,
  /^\/pricing$/,
  /^\/article\/[^/]+$/,
  /^\/dashboard$/,
  /^\/content$/,
  /^\/citations$/,
  /^\/articles$/,
  /^\/brands$/,
  /^\/keyword-research$/,
  /^\/ai-visibility$/,
  /^\/ai-intelligence$/,
  /^\/geo-rankings$/,
  /^\/geo-analytics$/,
  /^\/geo-tools$/,
  /^\/geo-signals$/,
  /^\/revenue-analytics$/,
  /^\/publications$/,
  /^\/competitors$/,
  /^\/crawler-check$/,
  /^\/opportunities$/,
  /^\/agent$/,
  /^\/outreach$/,
  /^\/ai-traffic$/,
  /^\/analytics-integrations$/,
  /^\/faq-manager$/,
  /^\/brand-fact-sheet$/,
  /^\/community$/,
  /^\/settings$/,

  // --- Added 2026-07-25 ---
  // This list had silently drifted out of sync with App.tsx. It was invisible
  // because the handler used to be mounted as `app.use("*", …)`, and Express
  // strips the mount prefix — so `req.path` was ALWAYS "/" inside it and
  // `isKnownRoute` always matched. The 200/404 branch below was dead code.
  // Removing the bare "*" (required by Express 5 / path-to-regexp v8) made the
  // check live for the first time, revealing real routes returning 404.
  /^\/home2$/,
  /^\/verify-email$/,
  /^\/welcome$/,
  /^\/glossary$/,
  // Workflow spine
  /^\/monitor$/,
  /^\/diagnose$/,
  /^\/act$/,
  /^\/setup$/,
  /^\/report$/,
  // Dynamic segments
  /^\/content\/[^/]+$/,
  /^\/admin\/scrape$/,
  /^\/admin\/scrape\/[^/]+$/,
];

// NOTE: this list is also stale in the other direction — it still contains
// paths that are no longer routed in App.tsx (/pricing, /article/:id,
// /geo-rankings, /revenue-analytics, /publications, /agent, /outreach,
// /ai-traffic, /analytics-integrations). Those currently return 200 when they
// should 404. Not removed here because that flips 200 -> 404 and needs its own
// verification pass against the e2e suite.
//
// Structurally, a hand-maintained mirror of the router will keep drifting. The
// TanStack Start migration replaces this entirely — its file-based routing
// knows its own routes, so this whole allowlist disappears rather than being
// re-synced.

function isKnownRoute(pathname: string): boolean {
  return KNOWN_ROUTES.some((re) => re.test(pathname));
}

export { log } from "./log";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      // Log Vite errors, but do NOT kill the process. This previously called
      // process.exit(1), which meant any dev-mode Vite error — a transform
      // failure, an unresolved import, an HMR hiccup — terminated the whole
      // server. That produced a silent death: exit code 1, no stack trace
      // (process.exit truncates buffered output) and no graceful-shutdown log,
      // because no signal was ever sent.
      //
      // It made the e2e suite impossible to complete: the server survived
      // while idle and died partway through the first specs that navigate real
      // pages through vite.middlewares. Vite recovers from these errors on its
      // own and surfaces them in the browser overlay, so exiting gained
      // nothing and cost all in-flight requests.
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(import.meta.dirname, "..", "client", "index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      const pathname = req.path.split("?")[0];
      const status = isKnownRoute(pathname) ? 200 : 404;
      res.status(status).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // SPA fallback — serve index.html for everything that didn't match a
  // static asset. Return 404 for unknown paths so Googlebot doesn't index
  // garbage URLs; the client router still renders the NotFound page.
  app.use((req, res) => {
    const pathname = req.path.split("?")[0];
    const status = isKnownRoute(pathname) ? 200 : 404;
    res.status(status).sendFile(path.resolve(distPath, "index.html"));
  });
}
