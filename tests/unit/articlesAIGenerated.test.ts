// Foundations Plan 4 Task 4: AI disclosure column + pill.
//
// Verifies the storage contract that the AI-disclosure pill depends on:
//   1. setArticleReady (the only worker path that flips status→ready) sets
//      aiGenerated=true in its UPDATE payload, so articles produced by the
//      content-generation worker carry the disclosure flag.
//   2. createArticle (the manual POST /api/articles path) does NOT set
//      aiGenerated, so user-authored articles stay at the column default
//      (false) and render no pill.
//
// Strategy mirrors tests/unit/mentionsStorage.test.ts — mock server/db with
// a Drizzle-chain proxy that captures the .set() / .values() payload so we
// can assert on the actual columns the DAO writes.

import { describe, it, expect, vi, beforeEach } from "vitest";

const stubs = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  capturedSet: null as Record<string, unknown> | null,
  capturedValues: null as Record<string, unknown> | null,
}));

vi.mock("../../server/db", () => ({
  db: {
    insert: stubs.insert,
    update: stubs.update,
    select: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
  pool: {},
}));

vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn(), flush: vi.fn(async () => true) },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { DatabaseStorage } from "../../server/databaseStorage";

// Drizzle-chain proxy that records the payload passed to .set() and
// .values() into the shared stubs object, then keeps the chain awaitable.
function drizzleChain(rows: unknown[]) {
  function fn(..._args: unknown[]) {
    return thenable;
  }
  const thenable: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(rows);
        }
        if (prop === "catch" || prop === "finally") {
          return Promise.resolve(rows)[prop as "catch" | "finally"].bind(Promise.resolve(rows));
        }
        if (prop === "set") {
          return (payload: Record<string, unknown>) => {
            stubs.capturedSet = payload;
            return thenable;
          };
        }
        if (prop === "values") {
          return (payload: Record<string, unknown>) => {
            stubs.capturedValues = payload;
            return thenable;
          };
        }
        return fn;
      },
    },
  );
  return thenable;
}

let storage: DatabaseStorage;

beforeEach(() => {
  storage = new DatabaseStorage();
  stubs.capturedSet = null;
  stubs.capturedValues = null;
  vi.clearAllMocks();
});

describe("setArticleReady (worker completion path)", () => {
  it("sets aiGenerated=true so the AI-disclosure pill renders", async () => {
    stubs.update.mockReturnValue(drizzleChain([]));

    await storage.setArticleReady("article-1", "# Body\n\nGenerated content.", "Title");

    expect(stubs.update).toHaveBeenCalled();
    expect(stubs.capturedSet).not.toBeNull();
    expect(stubs.capturedSet?.status).toBe("ready");
    expect(stubs.capturedSet?.aiGenerated).toBe(true);
  });
});

describe("createArticle (manual POST /api/articles path)", () => {
  it("does not flip aiGenerated — manual creates stay at the column default (false)", async () => {
    const row = {
      id: "article-2",
      brandId: "brand-1",
      title: "User-authored",
      content: "I wrote this myself.",
      aiGenerated: false,
      status: "ready",
    };
    stubs.insert.mockReturnValue(drizzleChain([row]));

    await storage.createArticle({
      brandId: "brand-1",
      title: "User-authored",
      content: "I wrote this myself.",
      status: "ready",
    } as unknown as Parameters<DatabaseStorage["createArticle"]>[0]);

    expect(stubs.insert).toHaveBeenCalled();
    expect(stubs.capturedValues).not.toBeNull();
    // The route doesn't pass aiGenerated, and the DAO must not forge it on.
    // The column's DEFAULT false handles unset values at the DB layer.
    expect(stubs.capturedValues?.aiGenerated).toBeUndefined();
  });
});
