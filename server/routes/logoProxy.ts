// Logo image proxy.
//
// CSP locks img-src to 'self' + data: + blob:, so the browser refuses to load
// scraped brand favicons directly. This endpoint fetches the image server-side
// (through safeFetchBuffer's SSRF guards) and streams the bytes back from our
// own origin, keeping the CSP tight. Also used for competitor favicons (which
// would otherwise hit google.com/s2/favicons).

import type { Express } from "express";
import { safeFetchBuffer } from "../lib/ssrf";
import { logger } from "../lib/logger";

const ALLOWED_CONTENT_TYPE_PREFIXES = ["image/"];
const ALLOWED_CONTENT_TYPE_SUBSTRINGS = ["icon"];
const CACHE_SECONDS = 60 * 60 * 24; // 1 day browser cache

export function setupLogoProxyRoutes(app: Express) {
  app.get("/api/logo-proxy", async (req, res) => {
    const raw = typeof req.query.url === "string" ? req.query.url : "";
    if (!raw) {
      res.status(400).json({ success: false, error: "url query param required" });
      return;
    }

    // Parse + protocol check before handing to safeFetchBuffer so we bail
    // early on javascript:/file:/data: schemes.
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      res.status(400).json({ success: false, error: "invalid url" });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      res.status(400).json({ success: false, error: "unsupported protocol" });
      return;
    }

    try {
      const { status, buffer, contentType } = await safeFetchBuffer(raw, {
        maxBytes: 1 * 1024 * 1024,
        timeoutMs: 6_000,
      });
      if (status < 200 || status >= 300) {
        res.status(404).end();
        return;
      }
      const ct = contentType.toLowerCase();
      const isImage =
        ALLOWED_CONTENT_TYPE_PREFIXES.some((p) => ct.startsWith(p)) ||
        ALLOWED_CONTENT_TYPE_SUBSTRINGS.some((s) => ct.includes(s));
      if (!isImage) {
        res.status(415).json({ success: false, error: "not an image" });
        return;
      }
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.setHeader("Cache-Control", `public, max-age=${CACHE_SECONDS}, immutable`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).send(buffer);
    } catch (err) {
      logger.warn({ err, url: raw }, "logoProxy: fetch failed");
      res.status(502).end();
    }
  });
}
