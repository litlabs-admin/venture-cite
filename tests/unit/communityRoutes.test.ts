// HTTP-level route contracts for server/routes/community.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

const user = { id: "11111111-1111-4111-8111-111111111111", accessTier: "free" };

const { storageMock, ownershipMocks, openaiMock } = vi.hoisted(() => ({
  storageMock: {
    getCommunityPosts: vi.fn(),
    createCommunityPost: vi.fn(),
    updateCommunityPost: vi.fn(),
    deleteCommunityPost: vi.fn(),
  },
  ownershipMocks: {
    requireBrand: vi.fn(),
    requireCommunityPost: vi.fn(),
    getUserBrandIds: vi.fn(),
  },
  openaiMock: {
    chat: { completions: { create: vi.fn() } },
  },
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/lib/modelConfig", () => ({ MODELS: { misc: "gpt-test" } }));
vi.mock("../../server/lib/ownership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/ownership")>();
  return {
    ...actual,
    requireUser: () => user,
    requireBrand: ownershipMocks.requireBrand,
    requireCommunityPost: ownershipMocks.requireCommunityPost,
    getUserBrandIds: ownershipMocks.getUserBrandIds,
  };
});
vi.mock("../../server/lib/routesShared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/lib/routesShared")>();
  const { sendOwnershipError } = await import("../../server/lib/ownership");
  return {
    aiLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
    asyncHandler: (handler: unknown) => handler,
    openai: openaiMock,
    safeParseJson: actual.safeParseJson,
    sendError: (res: express.Response, err: unknown, fallback: string) => {
      if (sendOwnershipError(res, err)) return;
      res.status(500).json({ success: false, error: fallback });
    },
  };
});
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupCommunityRoutes } = await import("../../server/routes/community");
const { OwnershipError } = await import("../../server/lib/ownership");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupCommunityRoutes(app);
  return app;
}

function completionWith(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("community routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/community-posts", () => {
    it("scopes to the requested brandId when provided", async () => {
      storageMock.getCommunityPosts.mockResolvedValue([{ id: "post-1" }]);

      const response = await request(makeApp()).get(
        "/api/community-posts?brandId=brand-1&platform=reddit",
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [{ id: "post-1" }] });
      expect(storageMock.getCommunityPosts).toHaveBeenCalledWith("brand-1", {
        platform: "reddit",
        status: undefined,
      });
    });

    it("filters to the caller's own brands when brandId is omitted", async () => {
      ownershipMocks.getUserBrandIds.mockResolvedValue(new Set(["brand-1"]));
      storageMock.getCommunityPosts.mockResolvedValue([
        { id: "post-1", brandId: "brand-1" },
        { id: "post-2", brandId: "not-mine" },
      ]);

      const response = await request(makeApp()).get("/api/community-posts");

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([{ id: "post-1", brandId: "brand-1" }]);
    });
  });

  describe("POST /api/community-posts", () => {
    it("answers 400 when brandId is missing, never checking ownership", async () => {
      const response = await request(makeApp())
        .post("/api/community-posts")
        .send({ platform: "reddit", groupName: "r/seo", content: "hi" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "brandId is required" });
      expect(ownershipMocks.requireBrand).not.toHaveBeenCalled();
    });

    it("answers 404 for a brandId the caller does not own", async () => {
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp()).post("/api/community-posts").send({
        brandId: "brand-1",
        platform: "reddit",
        groupName: "r/seo",
        content: "hi",
      });

      expect(response.status).toBe(404);
      expect(storageMock.createCommunityPost).not.toHaveBeenCalled();
    });

    it("answers 400 when required post fields are missing", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });

      const response = await request(makeApp())
        .post("/api/community-posts")
        .send({ brandId: "brand-1" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "platform, groupName, and content are required",
      });
    });

    it("creates the post, dropping unlisted fields via pickFields", async () => {
      ownershipMocks.requireBrand.mockResolvedValue({ id: "brand-1", userId: user.id });
      storageMock.createCommunityPost.mockResolvedValue({ id: "post-1" });

      const response = await request(makeApp()).post("/api/community-posts").send({
        brandId: "brand-1",
        platform: "reddit",
        groupName: "r/seo",
        content: "hi",
        notAllowedField: "drop me",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { id: "post-1" } });
      const created = storageMock.createCommunityPost.mock.calls[0][0];
      expect(created).not.toHaveProperty("notAllowedField");
    });
  });

  describe("GET /api/community-posts/:id", () => {
    it("answers 404 for a post the caller does not own", async () => {
      ownershipMocks.requireCommunityPost.mockRejectedValue(
        new OwnershipError(404, "Community post not found"),
      );

      const response = await request(makeApp()).get("/api/community-posts/post-1");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Community post not found" });
    });

    it("returns the post for an owned id", async () => {
      ownershipMocks.requireCommunityPost.mockResolvedValue({ id: "post-1" });

      const response = await request(makeApp()).get("/api/community-posts/post-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { id: "post-1" } });
    });
  });

  describe("PATCH /api/community-posts/:id", () => {
    it("answers 404 for a post the caller does not own", async () => {
      ownershipMocks.requireCommunityPost.mockRejectedValue(
        new OwnershipError(404, "Community post not found"),
      );

      const response = await request(makeApp())
        .patch("/api/community-posts/post-1")
        .send({ title: "New" });

      expect(response.status).toBe(404);
      expect(storageMock.updateCommunityPost).not.toHaveBeenCalled();
    });

    it("answers 404 when re-pointing to a brandId the caller does not own", async () => {
      ownershipMocks.requireCommunityPost.mockResolvedValue({ id: "post-1" });
      ownershipMocks.requireBrand.mockRejectedValue(new OwnershipError(404, "Brand not found"));

      const response = await request(makeApp())
        .patch("/api/community-posts/post-1")
        .send({ brandId: "someone-elses-brand" });

      expect(response.status).toBe(404);
      expect(storageMock.updateCommunityPost).not.toHaveBeenCalled();
    });

    it("coerces a valid postedAt string into a Date before updating", async () => {
      ownershipMocks.requireCommunityPost.mockResolvedValue({ id: "post-1" });
      storageMock.updateCommunityPost.mockResolvedValue({ id: "post-1" });

      const response = await request(makeApp())
        .patch("/api/community-posts/post-1")
        .send({ postedAt: "2026-01-01T00:00:00.000Z" });

      expect(response.status).toBe(200);
      const [, update] = storageMock.updateCommunityPost.mock.calls[0];
      expect(update.postedAt).toBeInstanceOf(Date);
    });

    it("coerces an unparseable postedAt string to null rather than passing it through raw", async () => {
      ownershipMocks.requireCommunityPost.mockResolvedValue({ id: "post-1" });
      storageMock.updateCommunityPost.mockResolvedValue({ id: "post-1" });

      const response = await request(makeApp())
        .patch("/api/community-posts/post-1")
        .send({ postedAt: "not-a-date" });

      expect(response.status).toBe(200);
      const [, update] = storageMock.updateCommunityPost.mock.calls[0];
      expect(update.postedAt).toBeNull();
    });

    it("answers 404 when the update races a delete", async () => {
      ownershipMocks.requireCommunityPost.mockResolvedValue({ id: "post-1" });
      storageMock.updateCommunityPost.mockResolvedValue(undefined);

      const response = await request(makeApp())
        .patch("/api/community-posts/post-1")
        .send({ title: "New" });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Post not found" });
    });
  });

  describe("DELETE /api/community-posts/:id", () => {
    it("answers 404 for a post the caller does not own", async () => {
      ownershipMocks.requireCommunityPost.mockRejectedValue(
        new OwnershipError(404, "Community post not found"),
      );

      const response = await request(makeApp()).delete("/api/community-posts/post-1");

      expect(response.status).toBe(404);
      expect(storageMock.deleteCommunityPost).not.toHaveBeenCalled();
    });

    it("answers 404 when nothing was actually deleted", async () => {
      ownershipMocks.requireCommunityPost.mockResolvedValue({ id: "post-1" });
      storageMock.deleteCommunityPost.mockResolvedValue(false);

      const response = await request(makeApp()).delete("/api/community-posts/post-1");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ success: false, error: "Post not found" });
    });

    it("deletes on success", async () => {
      ownershipMocks.requireCommunityPost.mockResolvedValue({ id: "post-1" });
      storageMock.deleteCommunityPost.mockResolvedValue(true);

      const response = await request(makeApp()).delete("/api/community-posts/post-1");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe("POST /api/community-discover", () => {
    it("answers 400 when brandName or industry is missing", async () => {
      const response = await request(makeApp())
        .post("/api/community-discover")
        .send({ brandName: "Acme" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "Brand name and industry are required",
      });
      expect(openaiMock.chat.completions.create).not.toHaveBeenCalled();
    });

    it("returns the parsed groups array from the AI response", async () => {
      openaiMock.chat.completions.create.mockResolvedValue(
        completionWith(JSON.stringify([{ platform: "reddit", name: "r/seo" }])),
      );

      const response = await request(makeApp())
        .post("/api/community-discover")
        .send({ brandName: "Acme", industry: "software" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [{ platform: "reddit", name: "r/seo" }],
      });
    });

    it("unwraps a {groups: [...]} envelope when the model doesn't return a bare array", async () => {
      openaiMock.chat.completions.create.mockResolvedValue(
        completionWith(JSON.stringify({ groups: [{ platform: "hackernews", name: "HN" }] })),
      );

      const response = await request(makeApp())
        .post("/api/community-discover")
        .send({ brandName: "Acme", industry: "software" });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([{ platform: "hackernews", name: "HN" }]);
    });

    it("answers 500 when the AI call throws", async () => {
      openaiMock.chat.completions.create.mockRejectedValue(new Error("openai down"));

      const response = await request(makeApp())
        .post("/api/community-discover")
        .send({ brandName: "Acme", industry: "software" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: "Failed to discover communities",
      });
    });
  });

  describe("POST /api/community-generate", () => {
    it("answers 400 when any required field is missing", async () => {
      const response = await request(makeApp())
        .post("/api/community-generate")
        .send({ brandName: "Acme", platform: "reddit" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "Brand name, platform, group, and topic are required",
      });
      expect(openaiMock.chat.completions.create).not.toHaveBeenCalled();
    });

    it("returns the parsed post object on success", async () => {
      openaiMock.chat.completions.create.mockResolvedValue(
        completionWith(JSON.stringify({ title: "t", content: "c" })),
      );

      const response = await request(makeApp()).post("/api/community-generate").send({
        brandName: "Acme",
        platform: "reddit",
        groupName: "r/seo",
        topic: "AI SEO",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { title: "t", content: "c" } });
    });

    it("falls back to a raw {content} shape when the model's output doesn't parse as JSON", async () => {
      openaiMock.chat.completions.create.mockResolvedValue(completionWith("not json at all"));

      const response = await request(makeApp()).post("/api/community-generate").send({
        brandName: "Acme",
        platform: "reddit",
        groupName: "r/seo",
        topic: "AI SEO",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { content: "not json at all" } });
    });
  });
});
