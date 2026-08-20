import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type RequestHandler } from "express";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/lib/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: RequestHandler) => handler,
}));
vi.mock("../../server/auth", () => ({
  isAdmin: ((req, res, next) => {
    const role = req.header("x-test-role");
    if (!role) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    if (role !== "admin") {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }
    next();
  }) satisfies RequestHandler,
}));

import { setupBoardRoutes } from "../../server/routes/board";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupBoardRoutes(app);
  return app;
}

describe("board routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({ limit: async () => [] }),
      }),
    });
    dbMock.insert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    });
  });

  it("rejects anonymous reads and writes", async () => {
    const app = makeApp();

    const read = await request(app).get("/api/board");
    const write = await request(app).put("/api/board").send({ tickets: [] });

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it("rejects non-administrator reads and writes", async () => {
    const app = makeApp();

    const read = await request(app).get("/api/board").set("x-test-role", "member");
    const write = await request(app)
      .put("/api/board")
      .set("x-test-role", "member")
      .send({ tickets: [] });

    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
  });

  it("allows an administrator to read and write the board", async () => {
    const app = makeApp();

    const read = await request(app).get("/api/board").set("x-test-role", "admin");
    const write = await request(app)
      .put("/api/board")
      .set("x-test-role", "admin")
      .send({ tickets: [] });

    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(write.body).toEqual({ saved: true, count: 0 });
  });
});
