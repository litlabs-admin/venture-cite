// The logo proxy serves a neutral transparent icon when UPSTREAM has no image
// for a domain, instead of 404ing into a broken <img> and a red console line.
//
// The point of these tests is the boundary, not the happy path: exactly one
// failure mode degrades quietly, and the three that indicate OUR problem must
// keep failing loudly. A regression that "helpfully" extends the fallback to
// 400/415/502 would turn every malformed request and every proxy outage into a
// silent blank icon, which is precisely the bug this endpoint should not have.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const ssrfStubs = vi.hoisted(() => ({ safeFetchBuffer: vi.fn() }));

vi.mock("../../server/lib/ssrf", () => ({
  safeFetchBuffer: ssrfStubs.safeFetchBuffer,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// routesShared pulls in ownership -> db, which demands a live DATABASE_URL at
// import time. Only asyncHandler is needed here. Same pattern as the other
// route tests in this directory.
vi.mock("../../server/lib/routesShared", async () => {
  const { asyncHandler } = await import("../../server/lib/asyncHandler");
  return { asyncHandler };
});

const { setupLogoProxyRoutes } = await import("../../server/routes/logoProxy");

function buildApp(): express.Express {
  const app = express();
  setupLogoProxyRoutes(app);
  return app;
}

const UPSTREAM = "https://www.google.com/s2/favicons?domain=pcworld.com&sz=64";

describe("logo proxy fallback icon", () => {
  beforeEach(() => {
    ssrfStubs.safeFetchBuffer.mockReset();
  });

  it("serves a cacheable transparent icon when upstream has no favicon", async () => {
    // The real pcworld.com case: Google's favicon service answers 404.
    ssrfStubs.safeFetchBuffer.mockResolvedValue({
      status: 404,
      buffer: Buffer.alloc(0),
      contentType: "",
    });

    const res = await request(buildApp()).get("/api/logo-proxy").query({ url: UPSTREAM });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");
    expect(res.headers["x-logo-fallback"]).toBe("1");
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("does not mark the fallback immutable, so a later real favicon is picked up", async () => {
    ssrfStubs.safeFetchBuffer.mockResolvedValue({
      status: 404,
      buffer: Buffer.alloc(0),
      contentType: "",
    });

    const res = await request(buildApp()).get("/api/logo-proxy").query({ url: UPSTREAM });

    expect(res.headers["cache-control"]).toContain("max-age=");
    expect(res.headers["cache-control"]).not.toContain("immutable");
  });

  it("still streams the real bytes when upstream does have an icon", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    ssrfStubs.safeFetchBuffer.mockResolvedValue({
      status: 200,
      buffer: bytes,
      contentType: "image/png",
    });

    const res = await request(buildApp()).get("/api/logo-proxy").query({ url: UPSTREAM });

    expect(res.status).toBe(200);
    expect(res.headers["x-logo-fallback"]).toBeUndefined();
    expect(res.headers["content-type"]).toContain("image/png");
  });

  // ── The loud failures. These must NOT become fallback icons. ──────────────

  it("400s on a missing url rather than serving a placeholder", async () => {
    const res = await request(buildApp()).get("/api/logo-proxy");
    expect(res.status).toBe(400);
    expect(res.headers["x-logo-fallback"]).toBeUndefined();
  });

  it("400s on a non-http protocol rather than serving a placeholder", async () => {
    const res = await request(buildApp())
      .get("/api/logo-proxy")
      .query({ url: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(ssrfStubs.safeFetchBuffer).not.toHaveBeenCalled();
  });

  it("415s when upstream returns a non-image body rather than serving a placeholder", async () => {
    ssrfStubs.safeFetchBuffer.mockResolvedValue({
      status: 200,
      buffer: Buffer.from("<html>nope</html>"),
      contentType: "text/html",
    });

    const res = await request(buildApp()).get("/api/logo-proxy").query({ url: UPSTREAM });

    expect(res.status).toBe(415);
    expect(res.headers["x-logo-fallback"]).toBeUndefined();
  });

  it("502s when the fetch itself throws rather than serving a placeholder", async () => {
    ssrfStubs.safeFetchBuffer.mockRejectedValue(new Error("connect ETIMEDOUT"));

    const res = await request(buildApp()).get("/api/logo-proxy").query({ url: UPSTREAM });

    expect(res.status).toBe(502);
    expect(res.headers["x-logo-fallback"]).toBeUndefined();
  });
});
