// HTTP-level contract for server/routes/businessResults.ts - the manual
// business-result entry endpoint the outcome-review screen (board 21) saves
// to. Before this route existed, `business_result_events` had no writer
// anywhere in the server.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const user = { id: "11111111-1111-4111-8111-111111111111" };
const ownedBrand = { id: "brand-1", userId: user.id };

const { dbMock, transactionMock } = vi.hoisted(() => {
  const transactionMock = {
    execute: vi.fn(async () => undefined),
    insert: vi.fn(),
  };
  return {
    transactionMock,
    dbMock: {
      transaction: vi.fn(async (fn: (tx: typeof transactionMock) => unknown) =>
        fn(transactionMock),
      ),
    },
  };
});

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as unknown as { user: typeof user }).user = user;
    next();
  },
}));
vi.mock("../../server/lib/ownership", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/ownership")>(
    "../../server/lib/ownership",
  );
  return {
    ...actual,
    requireUser: () => user,
    requireBrand: vi.fn(async (id: string) => {
      if (id !== ownedBrand.id) throw new actual.OwnershipError(404, "Brand not found");
      return ownedBrand;
    }),
  };
});
vi.mock("../../server/lib/routesShared", async () => {
  const { OwnershipError, sendOwnershipError } = await vi.importActual<
    typeof import("../../server/lib/ownership")
  >("../../server/lib/ownership");
  return {
    asyncHandler: (handler: unknown) => handler,
    sendError: (res: express.Response, error: unknown, fallback: string) => {
      if (error instanceof OwnershipError && sendOwnershipError(res, error)) return;
      res.status(500).json({ success: false, error: fallback });
    },
  };
});
vi.mock("../../server/data/restrictedRequestTransaction", () => ({
  setRestrictedRequestContext: vi.fn(async () => undefined),
}));

const { setupBusinessResultsRoutes } = await import("../../server/routes/businessResults");

function makeApp() {
  const app = express();
  app.use(express.json());
  setupBusinessResultsRoutes(app);
  return app;
}

function stubInsert(rows: unknown[]) {
  transactionMock.insert.mockReturnValue({
    values: (input: unknown[]) => ({
      returning: async () =>
        rows.length > 0
          ? rows
          : input.map((value, index) => ({
              id: `event-${index}`,
              ...(value as Record<string, unknown>),
              occurredAt: new Date((value as { occurredAt: Date }).occurredAt),
            })),
    }),
  });
}

describe("POST /api/brands/:brandId/business-results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.transaction.mockImplementation(async (fn: (tx: typeof transactionMock) => unknown) =>
      fn(transactionMock),
    );
    stubInsert([]);
  });

  it("records a manually entered outcome for the caller's brand", async () => {
    const app = makeApp();

    const response = await request(app)
      .post("/api/brands/brand-1/business-results")
      .send({
        events: [
          {
            eventKind: "qualified_lead",
            value: 3,
            valueUnit: "count",
            occurredAt: "2026-09-09T00:00:00.000Z",
            notes: "Two came from the updated services page.",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ eventKind: "qualified_lead", value: 3 });
    expect(transactionMock.insert).toHaveBeenCalledTimes(1);
  });

  it("writes every event in the batch scoped to the brand and the confirming user", async () => {
    const app = makeApp();
    let insertedValues: Record<string, unknown>[] = [];
    transactionMock.insert.mockReturnValue({
      values: (input: Record<string, unknown>[]) => {
        insertedValues = input;
        return {
          returning: async () =>
            input.map((value, index) => ({
              id: `event-${index}`,
              eventKind: value.eventKind,
              value: value.value,
              valueUnit: value.valueUnit,
              occurredAt: value.occurredAt,
              notes: value.notes,
            })),
        };
      },
    });

    await request(app)
      .post("/api/brands/brand-1/business-results")
      .send({
        events: [
          { eventKind: "qualified_lead", value: 1, occurredAt: "2026-09-09T00:00:00.000Z" },
          { eventKind: "inquiry", value: 0, occurredAt: "2026-09-09T00:00:00.000Z" },
        ],
      });

    expect(insertedValues).toHaveLength(2);
    for (const row of insertedValues) {
      expect(row.brandId).toBe(ownedBrand.id);
      expect(row.userId).toBe(user.id);
      expect(row.confirmedBy).toBe(user.id);
      expect(row.confirmationState).toBe("confirmed");
      expect(row.attributionMethod).toBe("manual");
      expect(typeof row.eventKey).toBe("string");
      expect((row.eventKey as string).length).toBeGreaterThan(0);
    }
  });

  it("rejects an event kind outside the four the table allows", async () => {
    const app = makeApp();

    const response = await request(app)
      .post("/api/brands/brand-1/business-results")
      .send({
        events: [{ eventKind: "demo_request", value: 1, occurredAt: "2026-09-09T00:00:00.000Z" }],
      });

    expect(response.status).toBe(400);
    expect(transactionMock.insert).not.toHaveBeenCalled();
  });

  it("rejects an empty batch", async () => {
    const app = makeApp();

    const response = await request(app)
      .post("/api/brands/brand-1/business-results")
      .send({ events: [] });

    expect(response.status).toBe(400);
    expect(transactionMock.insert).not.toHaveBeenCalled();
  });

  it("404s for a brand the caller does not own, and writes nothing", async () => {
    const app = makeApp();

    const response = await request(app)
      .post("/api/brands/someone-elses-brand/business-results")
      .send({
        events: [{ eventKind: "inquiry", value: 1, occurredAt: "2026-09-09T00:00:00.000Z" }],
      });

    expect(response.status).toBe(404);
    expect(transactionMock.insert).not.toHaveBeenCalled();
  });
});
