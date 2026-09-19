// Coverage for server/routes/publicOnboarding.ts, using the same fake
// req/res harness askRoutes.test.ts proved out for SSE + JSON routes on this
// codebase. The store and pipeline are mocked at their own module
// boundaries; this file only exercises route-level behaviour: validation,
// rate limiting, 404s, and the SSE replay-then-stream sequence.
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const stubs = vi.hoisted(() => ({
  admitSession: vi.fn(async () => ({
    kind: "created" as const,
    session: { id: "11111111-1111-4111-8111-111111111111" },
  })),
  getSession: vi.fn(async () => null as any),
  setAnswers: vi.fn(async () => undefined),
  runSessionPipeline: vi.fn(async () => undefined),
  waitUntil: vi.fn((p: Promise<unknown>) => p),
}));

vi.mock("../../server/onboardingSession/store", () => ({
  admitSession: stubs.admitSession,
  getSession: stubs.getSession,
  setAnswers: stubs.setAnswers,
}));
vi.mock("../../server/onboardingSession/pipeline", () => ({
  runSessionPipeline: stubs.runSessionPipeline,
}));
vi.mock("@vercel/functions", () => ({ waitUntil: stubs.waitUntil }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { setupPublicOnboardingRoutes } = await import("../../server/routes/publicOnboarding");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  setupPublicOnboardingRoutes(app);
  return app;
}

// Same fake req/res harness as askRoutes.test.ts, extended with a
// configurable ip and an emit hook so SSE tests can drive the mocked store
// forward mid-stream.
function callRoute(
  app: express.Express,
  method: string,
  url: string,
  opts: { body?: unknown; ip?: string; onWrite?: (raw: string) => void } = {},
): Promise<{ status: number; body: any; sseEvents: any[]; sseRaw: string; endReq: () => void }> {
  return new Promise((resolve, reject) => {
    let closeHandler: (() => void) | null = null;
    const req = {
      method,
      url,
      ip: opts.ip ?? "203.0.113.5",
      headers: { host: "localhost", "content-type": "application/json" },
      query: Object.fromEntries(new URL(`http://localhost${url}`).searchParams),
      params: {} as Record<string, string>,
      body: opts.body,
      on(event: string, cb: () => void) {
        if (event === "close") closeHandler = cb;
        return req;
      },
    } as unknown as express.Request;

    let statusCode = 200;
    let payload: any = null;
    let headersSent = false;
    let sseRaw = "";
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      const events: any[] = [];
      for (const block of sseRaw.split("\n\n")) {
        const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          events.push(JSON.parse(dataLine.slice(6)));
        } catch {
          // ignore
        }
      }
      resolve({
        status: statusCode,
        body: payload,
        sseEvents: events,
        sseRaw,
        endReq: () => closeHandler?.(),
      });
    };
    const res = {
      get headersSent() {
        return headersSent;
      },
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(p: any) {
        payload = p;
        finish();
        return res;
      },
      setHeader() {
        return res;
      },
      writeHead(code: number) {
        statusCode = code;
        headersSent = true;
        return res;
      },
      flushHeaders() {
        headersSent = true;
        return res;
      },
      write(chunk: string) {
        sseRaw += chunk;
        opts.onWrite?.(sseRaw);
        return true;
      },
      end() {
        finish();
      },
      on() {
        return res;
      },
    } as unknown as express.Response;

    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.admitSession.mockResolvedValue({
    kind: "created",
    session: { id: "11111111-1111-4111-8111-111111111111" },
  });
  stubs.getSession.mockResolvedValue(null);
});

describe("POST /api/public/onboarding/sessions", () => {
  it("400s on an invalid domain", async () => {
    const app = buildApp();
    const { status, body } = await callRoute(app, "POST", "/api/public/onboarding/sessions", {
      body: { domain: "not a domain" },
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("429s once the per-IP hourly limit is reached", async () => {
    stubs.admitSession.mockResolvedValue({ kind: "rate_limited" });
    const app = buildApp();
    const { status, body } = await callRoute(app, "POST", "/api/public/onboarding/sessions", {
      body: { domain: "acme.com" },
    });
    expect(status).toBe(429);
    expect(body.success).toBe(false);
    expect(stubs.runSessionPipeline).not.toHaveBeenCalled();
  });

  it("creates a session, starts the pipeline without awaiting it, and returns the id", async () => {
    const app = buildApp();
    const { status, body } = await callRoute(app, "POST", "/api/public/onboarding/sessions", {
      body: { domain: "https://Acme.com/" },
    });
    expect(status).toBe(200);
    expect(body.sessionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(stubs.admitSession).toHaveBeenCalledWith({
      domain: "acme.com",
      ipHash: expect.any(String),
    });
    expect(stubs.runSessionPipeline).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "acme.com",
    );
  });

  it("resumes an existing live session for the same domain with 200, without starting a new pipeline", async () => {
    stubs.admitSession.mockResolvedValue({
      kind: "live_session_exists",
      sessionId: "22222222-2222-4222-8222-222222222222",
      domain: "acme.com",
    });
    const app = buildApp();
    const { status, body } = await callRoute(app, "POST", "/api/public/onboarding/sessions", {
      body: { domain: "acme.com" },
    });
    expect(status).toBe(200);
    expect(body.sessionId).toBe("22222222-2222-4222-8222-222222222222");
    expect(stubs.runSessionPipeline).not.toHaveBeenCalled();
  });

  it("409s a live session for a different domain from the same network", async () => {
    stubs.admitSession.mockResolvedValue({
      kind: "live_session_exists",
      sessionId: "22222222-2222-4222-8222-222222222222",
      domain: "other.com",
    });
    const app = buildApp();
    const { status, body } = await callRoute(app, "POST", "/api/public/onboarding/sessions", {
      body: { domain: "acme.com" },
    });
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(stubs.runSessionPipeline).not.toHaveBeenCalled();
  });
});

describe("GET /api/public/onboarding/sessions/:id/events", () => {
  it("404s for a malformed id", async () => {
    const app = buildApp();
    const { status } = await callRoute(
      app,
      "GET",
      "/api/public/onboarding/sessions/not-a-uuid/events",
    );
    expect(status).toBe(404);
  });

  it("404s for an unknown or expired session", async () => {
    stubs.getSession.mockResolvedValue(null);
    const app = buildApp();
    const { status } = await callRoute(
      app,
      "GET",
      "/api/public/onboarding/sessions/11111111-1111-4111-8111-111111111111/events",
    );
    expect(status).toBe(404);
  });

  it("replays stored events in order, then ends immediately when status is already done", async () => {
    stubs.getSession.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "done",
      events: [
        { type: "site", data: { domain: "acme.com", title: "Acme", faviconUrl: "/x" } },
        { type: "done", data: {} },
      ],
    });
    const app = buildApp();
    const { status, sseEvents } = await callRoute(
      app,
      "GET",
      "/api/public/onboarding/sessions/11111111-1111-4111-8111-111111111111/events",
    );
    expect(status).toBe(200);
    expect(sseEvents.map((e) => e.type)).toEqual(["site", "done"]);
  });
});

describe("POST /api/public/onboarding/sessions/:id/answers", () => {
  it("404s for an unknown session id", async () => {
    stubs.getSession.mockResolvedValue(null);
    const app = buildApp();
    const { status } = await callRoute(
      app,
      "POST",
      "/api/public/onboarding/sessions/11111111-1111-4111-8111-111111111111/answers",
      { body: { audience: "own" } },
    );
    expect(status).toBe(404);
  });

  it("400s on an invalid body (client relationship without an agency name)", async () => {
    stubs.getSession.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "running",
      claimedBy: null,
    });
    const app = buildApp();
    const { status } = await callRoute(
      app,
      "POST",
      "/api/public/onboarding/sessions/11111111-1111-4111-8111-111111111111/answers",
      { body: { audience: "client" } },
    );
    expect(status).toBe(400);
  });

  it("stores valid answers", async () => {
    stubs.getSession.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "running",
      claimedBy: null,
    });
    const app = buildApp();
    const { status } = await callRoute(
      app,
      "POST",
      "/api/public/onboarding/sessions/11111111-1111-4111-8111-111111111111/answers",
      { body: { audience: "own" } },
    );
    expect(status).toBe(200);
    expect(stubs.setAnswers).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ audience: "own" }),
    );
  });
});
