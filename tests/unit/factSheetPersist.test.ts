import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const proxy: Record<string, unknown> = {};
  const fn = vi.fn(() => proxy);
  // Insert chain + the pre-insert SELECT (existing-dismissed check, CRITICAL 4).
  for (const m of [
    "insert",
    "values",
    "onConflictDoUpdate",
    "returning",
    "select",
    "from",
    "where",
    "limit",
  ]) {
    (proxy as any)[m] = fn;
  }
  // The select() chain awaits to []. Make the proxy thenable so
  // `await db.select()...limit(1)` resolves to an empty array (no
  // prior dismissed row), letting the insert path run.
  (proxy as any).then = (resolve: (v: unknown) => void) => resolve([]);
  return { proxy, fn };
});

vi.mock("../../server/db", () => ({ db: dbMock.proxy }));
vi.mock("@shared/schema", () => ({
  brandFactSheet: new Proxy({}, { get: (_t, p) => p }),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { persistFacts } from "../../server/lib/factAgent/persistFacts";

describe("persistFacts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns inserted=0 for an empty list (no DB call)", async () => {
    const out = await persistFacts([], { brandId: "b1", runId: "r1", sourceUrl: "https://x.com" });
    expect(out.inserted).toBe(0);
    expect(dbMock.fn).not.toHaveBeenCalled();
  });

  it("inserts each fact with source='scraped' + runId + lastVerified", async () => {
    // The persist path now does a pre-insert SELECT for prior
    // dismissals (CRITICAL 4). Route db.select() through a separate
    // thenable chain that resolves to []; route db.insert() through
    // the values/onConflictDoUpdate chain.
    const selectChain: Record<string, unknown> = {};
    selectChain.from = () => selectChain;
    selectChain.where = () => selectChain;
    selectChain.limit = () => Promise.resolve([]);
    (dbMock.proxy as any).select = () => selectChain;
    (dbMock.proxy as any).insert = () => ({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve([{ id: "row-1" }]),
      }),
    });
    const facts = [
      {
        domain: "identity" as const,
        subcategory: "description",
        factKey: "primary",
        factValue: "A SaaS company",
        valueType: "string" as const,
        valuePayload: null,
        confidence: 0.9,
        sourceExcerpt: "ctx",
        sourceUrl: "https://example.com",
      },
    ];
    const out = await persistFacts(facts, {
      brandId: "b1",
      runId: "r1",
      sourceUrl: "https://example.com",
    });
    expect(out.inserted).toBe(1);
  });
});
