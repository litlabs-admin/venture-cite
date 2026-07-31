import { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

// Wave 6.1 added a KNOWN_ROUTES allowlist here to decide 200 vs 404 for the
// dev SPA-fallback and (at the time) a prod serveStatic() fallback. It
// drifted badly (9 phantom entries for routes that no longer exist, 12 real
// routes missing at one point) because it was a hand-maintained mirror of
// client/src/App.tsx with no mechanism keeping the two in sync. Removed
// (Phase 2 Task 6): the dev fallback below always answers 200 instead of
// consulting an allowlist. This changes the status code returned for
// genuinely unknown paths (previously 404, now 200) but not routing or
// content - the client-side router still owns deciding what renders, and
// still shows its NotFound page for a path it doesn't know, exactly as
// before. serveStatic() itself (the prod fallback this allowlist also used
// to gate) was removed entirely in Phase 2 Task 7 - see the comment below.
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
      // process.exit(1), which meant any dev-mode Vite error - a transform
      // failure, an unresolved import, an HMR hiccup - terminated the whole
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
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

// `serveStatic()` and the dist/public SPA fallback were REMOVED here in
// Phase 2 Task 7. Nitro's own generated server (dist/server/index.mjs,
// built by `npm run build`, run by `npm start`) is now the real production
// entry point, not server/index.ts. The `node-server`/`render-com` Nitro
// presets already set `serveStatic: true` and serve static assets
// themselves, and with `rootDir` pointed at the repo root (vite.config.ts)
// Nitro renders every route through real SSR per request - there is no
// static `dist/public/index.html` shell to fall back to, and there does
// not need to be one. Proved with a real production build + a real running
// `node dist/server/index.mjs` server (see
// scratchpad/p2/task-7-batch5-report.md): `/`, `/privacy`, `/glossary` all
// return real server-rendered HTML; `/health` and `/api/*` reach the same
// Express app via the Nitro/srvx bridge (src/server/expressBridge.ts).
// server/index.ts (this file's only remaining caller) is dev-only now -
// see its top-of-file comment.
