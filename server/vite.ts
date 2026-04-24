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
  /^\/client-reports$/,
  /^\/brand-fact-sheet$/,
  /^\/community$/,
  /^\/settings$/,
];

function isKnownRoute(pathname: string): boolean {
  return KNOWN_ROUTES.some((re) => re.test(pathname));
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
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
  app.use("*", (req, res) => {
    const pathname = req.path.split("?")[0];
    const status = isKnownRoute(pathname) ? 200 : 404;
    res.status(status).sendFile(path.resolve(distPath, "index.html"));
  });
}
