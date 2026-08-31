// HTTP-level contract tests for:
//   POST /api/brands/create-from-website  (server/routes/brands.ts)
//   POST /api/enterprise-inquiry          (server/routes/enterpriseInquiry.ts)
//
// tests/unit/brandRequestRoutes.test.ts already covers every other
// registration in brands.ts (GET /api/brands, GET/PUT/DELETE
// /api/brands/:id, GET /api/brands/:id/deletion-preview, POST /api/brands).
// create-from-website is the one registration it does not touch.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

// ─── brands.ts: create-from-website ────────────────────────────────────────

const { authState, requestDataMock, repositories, safeFetchTextMock, openrouterMock } = vi.hoisted(
  () => {
    const brands = {
      list: vi.fn(),
      createWithQuota: vi.fn(),
    };
    return {
      authState: { user: { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" } },
      repositories: { brands },
      requestDataMock: { forActor: vi.fn(() => ({ brands, users: {} })) },
      safeFetchTextMock: vi.fn(),
      openrouterMock: vi.fn(),
    };
  },
);

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/data/requestData", () => ({ requestData: requestDataMock }));
vi.mock("../../server/lib/ownership", () => ({ requireUser: () => authState.user }));
vi.mock("../../server/lib/routesShared", () => ({
  aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  asyncHandler: (handler: unknown) => handler,
  sendError: (res: express.Response, _error: unknown, fallback: string) =>
    res.status(500).json({ success: false, error: fallback }),
}));
vi.mock("../../server/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../../server/lib/ssrf", () => ({ safeFetchText: safeFetchTextMock }));
vi.mock("../../server/lib/pageText", () => ({
  extractPageContent: (text: string) => ({ text }),
}));
vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: openrouterMock,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

const { setupBrandRoutes } = await import("../../server/routes/brands");

function makeBrandsApp() {
  const app = express();
  app.use(express.json());
  setupBrandRoutes(app);
  return app;
}

function makeChatClient(content: string) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content }, finish_reason: "stop" }],
        }),
      },
    },
  };
}

describe("POST /api/brands/create-from-website", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = user;
    repositories.brands.list.mockResolvedValue([]);
  });

  it("answers 400 when the url is missing", async () => {
    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Please enter a website URL" });
    expect(repositories.brands.createWithQuota).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed hostname", async () => {
    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "not a url" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("valid URL");
  });

  it("answers 403 when the caller is already at their brand limit", async () => {
    repositories.brands.list.mockResolvedValue([{ id: "b1" }]);

    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "example.com" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, limitReached: true });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });

  it("answers 503 when the AI client is not configured", async () => {
    openrouterMock.mockReturnValue(null);

    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "example.com" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ success: false, error: "AI service is not configured" });
  });

  it("answers 422 when the site returns no usable content", async () => {
    openrouterMock.mockReturnValue(makeChatClient("{}"));
    safeFetchTextMock.mockResolvedValue({
      status: 200,
      text: "hi",
      contentType: "text/html",
    });

    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "example.com" });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });

  it("answers 400 when the fetch layer rejects the URL as disallowed", async () => {
    openrouterMock.mockReturnValue(makeChatClient("{}"));
    safeFetchTextMock.mockRejectedValue(new Error("private IP not allowed"));

    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "http://169.254.169.254" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "This URL is not allowed" });
  });

  it("answers 502 when the model response is unparseable", async () => {
    openrouterMock.mockReturnValue(makeChatClient("not json"));
    safeFetchTextMock.mockResolvedValue({
      status: 200,
      text: "a".repeat(100),
      contentType: "text/html",
    });

    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "example.com" });

    expect(response.status).toBe(502);
    expect(response.body.success).toBe(false);
    expect(repositories.brands.createWithQuota).not.toHaveBeenCalled();
  });

  it("answers 409 when a brand with the same name already exists and force is not set", async () => {
    // beta tier (maxBrands: 3) so the pre-existing brand below doesn't
    // also trip the (unrelated) brand-limit check this test isn't after.
    authState.user = { ...user, accessTier: "beta" };
    openrouterMock.mockReturnValue(makeChatClient(JSON.stringify({ name: "Acme" })));
    safeFetchTextMock.mockResolvedValue({
      status: 200,
      text: "a".repeat(100),
      contentType: "text/html",
    });
    repositories.brands.list.mockResolvedValue([{ id: "b1", name: "Acme" }]);

    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "example.com" });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(repositories.brands.createWithQuota).not.toHaveBeenCalled();
  });

  it("creates the brand from the analyzed website content", async () => {
    openrouterMock.mockReturnValue(makeChatClient(JSON.stringify({ name: "Acme" })));
    safeFetchTextMock.mockResolvedValue({
      status: 200,
      text: "a".repeat(100),
      contentType: "text/html",
    });
    const created = { id: "brand-new", userId: user.id, name: "Acme" };
    repositories.brands.createWithQuota.mockResolvedValue(created);

    const response = await request(makeBrandsApp())
      .post("/api/brands/create-from-website")
      .send({ url: "example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: created, analysisQuality: "full" });
  });
});

// ─── enterpriseInquiry.ts ───────────────────────────────────────────────────

const { emailMock } = vi.hoisted(() => ({ emailMock: vi.fn() }));

vi.mock("../../server/emailService", () => ({ sendOutreachEmailViaResend: emailMock }));

const { setupEnterpriseInquiryRoutes } = await import("../../server/routes/enterpriseInquiry");

function makeEnterpriseApp() {
  const app = express();
  app.use(express.json());
  setupEnterpriseInquiryRoutes(app);
  return app;
}

describe("POST /api/enterprise-inquiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 400 when name or email is missing", async () => {
    const response = await request(makeEnterpriseApp())
      .post("/api/enterprise-inquiry")
      .send({ name: "Ada" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "Name and email are required." });
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed email", async () => {
    const response = await request(makeEnterpriseApp())
      .post("/api/enterprise-inquiry")
      .send({ name: "Ada", email: "not-an-email" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, error: "That email doesn't look right." });
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("sends the notification email and answers success", async () => {
    emailMock.mockResolvedValue(undefined);

    const response = await request(makeEnterpriseApp()).post("/api/enterprise-inquiry").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      company: "Analytical Engines",
      message: "Tell me more",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(emailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Analytical Engines"),
      }),
    );
  });

  it("still answers success when the notification email fails to send", async () => {
    emailMock.mockRejectedValue(new Error("resend down"));

    const response = await request(makeEnterpriseApp())
      .post("/api/enterprise-inquiry")
      .send({ name: "Ada", email: "ada@example.com" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});
