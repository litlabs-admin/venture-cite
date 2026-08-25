import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type RequestHandler } from "express";
import request from "supertest";

// The board routes are PUBLIC by deliberate decision of the repo owner: the
// /internal-page workspace has no sign-in, so its storage must be reachable
// without a token. An earlier revision gated these behind `isAdmin`; that gate
// was removed on purpose, so these tests assert the open behaviour rather than
// the closed one. If the gate is ever restored, this file is the first thing
// that should fail.

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/lib/logger", () => ({ logger: { info: vi.fn() } }));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: RequestHandler) => handler,
}));

import { setupBoardRoutes } from "../../server/routes/board";

function makeApp() {
  const app = express();
  app.use(express.json());
  setupBoardRoutes(app);
  return app;
}

const BOARD_IDS = ["engineering", "marketing", "content", "aeo", "ben"] as const;

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

  it("allows anonymous reads and writes on the legacy route", async () => {
    const app = makeApp();

    const read = await request(app).get("/api/board");
    const write = await request(app).put("/api/board").send({ tickets: [] });

    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(write.body).toEqual({ saved: true, count: 0 });
  });

  it.each(BOARD_IDS)("allows anonymous reads and writes on the %s board", async (boardId) => {
    const app = makeApp();

    const read = await request(app).get(`/api/board/${boardId}`);
    const write = await request(app).put(`/api/board/${boardId}`).send({ tickets: [] });

    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(write.body).toEqual({ saved: true, count: 0 });
  });

  // An unknown id must not quietly fall through to the engineering board, or a
  // typo in the client would read and overwrite the wrong team's work.
  it("404s an unknown board id instead of falling back to a default", async () => {
    const app = makeApp();

    const read = await request(app).get("/api/board/nope");
    const write = await request(app).put("/api/board/nope").send({ tickets: [] });

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("drops malformed tickets rather than storing them", async () => {
    const app = makeApp();

    const write = await request(app)
      .put("/api/board/marketing")
      .send({
        tickets: [
          { id: "keep", title: "A real task" },
          { id: "", title: "no id" },
          { id: "no-title", title: "" },
          "not an object",
        ],
      });

    expect(write.status).toBe(200);
    expect(write.body).toEqual({ saved: true, count: 1 });
  });

  it("rejects a payload that is not an array", async () => {
    const app = makeApp();

    const write = await request(app).put("/api/board/marketing").send({ tickets: "nope" });

    expect(write.status).toBe(400);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
