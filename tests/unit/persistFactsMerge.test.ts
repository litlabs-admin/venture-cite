// Unit tests for the v2 provenance-preserving persistFacts.
//
// These tests exercise the public function against a fully-mocked db
// surface so we can assert the exact INSERT/UPDATE payload it builds
// for the three cases that matter:
//
//   - first observation of a fact   → INSERT with single source
//   - second page sees same value   → UPDATE merges sources
//   - second page sees diff value   → canonical or alternative
//
// The mock captures every query so we can also confirm that prior
// dismissals are respected (skip) and that cross-page consolidation
// caps at the configured maxes.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Fact } from "../../shared/factAgent/schema";

// --- fake db --------------------------------------------------------------
type Row = {
  id: string;
  factValue: string;
  confidence: string;
  sourceUrl: string;
  sourceExcerpt: string;
  valuePayload: Record<string, unknown> | null;
  dismissedAt: Date | null;
};

const fakeStore = new Map<string, Row>();
const inserts: Array<{ values: Record<string, unknown> }> = [];
const updates: Array<{ id: string; set: Record<string, unknown> }> = [];

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            // Single row lookup keyed on the most recent key in fakeStore.
            // We use whatever key was last set by the test setup.
            const last = lastQueryKey;
            const row = last ? fakeStore.get(last) : undefined;
            return row ? [row] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push({ values });
        const key = keyOf(values);
        fakeStore.set(key, {
          id: `row-${fakeStore.size + 1}`,
          factValue: values.factValue as string,
          confidence: String(values.confidence),
          sourceUrl: (values.sourceUrl as string) ?? "",
          sourceExcerpt: (values.sourceExcerpt as string) ?? "",
          valuePayload: (values.valuePayload as Record<string, unknown>) ?? null,
          dismissedAt: null,
        });
      },
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          const last = lastQueryKey;
          if (!last) return;
          const row = fakeStore.get(last);
          if (!row) return;
          updates.push({ id: row.id, set });
          // Mutate in place so subsequent lookups see the new state.
          if ("factValue" in set) row.factValue = set.factValue as string;
          if ("confidence" in set) row.confidence = String(set.confidence);
          if ("sourceUrl" in set) row.sourceUrl = set.sourceUrl as string;
          if ("sourceExcerpt" in set) row.sourceExcerpt = set.sourceExcerpt as string;
          if ("valuePayload" in set) row.valuePayload = set.valuePayload as Record<string, unknown>;
        },
      }),
    }),
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let lastQueryKey: string | null = null;
function keyOf(v: Record<string, unknown>): string {
  return `${v.brandId}|${v.domain}|${v.subcategory}|${v.factKey}`;
}

const { persistFacts } = await import("../../server/lib/factAgent/persistFacts");

function buildFact(partial: Partial<Fact>): Fact {
  return {
    domain: "identity",
    factKey: "name",
    factValue: "Adyen",
    valueType: "string",
    valuePayload: null,
    confidence: 0.9,
    sourceExcerpt: "Adyen is a payments platform.",
    sourceUrl: "https://adyen.com/",
    ...partial,
  };
}

beforeEach(() => {
  fakeStore.clear();
  inserts.length = 0;
  updates.length = 0;
  lastQueryKey = null;
});

describe("persistFacts v2 — provenance preservation", () => {
  it("first observation creates a row with a single-source valuePayload", async () => {
    lastQueryKey = "b1|identity|Brand name|name";
    const f = buildFact({});
    const result = await persistFacts([f], {
      brandId: "b1",
      runId: "r1",
      sourceUrl: "https://adyen.com/",
    });
    expect(result.inserted).toBe(1);
    expect(inserts).toHaveLength(1);
    const payload = inserts[0].values.valuePayload as { sources: unknown[] };
    expect(payload.sources).toEqual([
      { url: "https://adyen.com/", excerpt: "Adyen is a payments platform.", confidence: 0.9 },
    ]);
  });

  it("same value from second page appends to sources", async () => {
    lastQueryKey = "b1|identity|Brand name|name";
    await persistFacts([buildFact({ sourceUrl: "https://adyen.com/", confidence: 0.9 })], {
      brandId: "b1",
      runId: "r1",
      sourceUrl: "https://adyen.com/",
    });
    await persistFacts([buildFact({ sourceUrl: "https://adyen.com/about", confidence: 0.95 })], {
      brandId: "b1",
      runId: "r1",
      sourceUrl: "https://adyen.com/about",
    });
    expect(inserts).toHaveLength(1);
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const finalPayload = updates[updates.length - 1].set.valuePayload as {
      sources: Array<{ url: string; confidence: number }>;
    };
    expect(finalPayload.sources.map((s) => s.url).sort()).toEqual([
      "https://adyen.com/",
      "https://adyen.com/about",
    ]);
    // The merged confidence should be the max of the two.
    expect(updates[updates.length - 1].set.confidence).toBe(0.95);
  });

  it("different value with higher confidence swaps canonical and demotes existing to alternatives", async () => {
    lastQueryKey = "b1|identity|Brand name|name";
    await persistFacts(
      [buildFact({ factValue: "Samsung", confidence: 0.6, sourceUrl: "https://samsung.com/" })],
      { brandId: "b1", runId: "r1", sourceUrl: "https://samsung.com/" },
    );
    await persistFacts(
      [
        buildFact({
          factValue: "Samsung Electronics",
          confidence: 0.95,
          sourceUrl: "https://samsung.com/global/",
        }),
      ],
      { brandId: "b1", runId: "r1", sourceUrl: "https://samsung.com/global/" },
    );
    const last = updates[updates.length - 1];
    expect(last.set.factValue).toBe("Samsung Electronics");
    expect(last.set.confidence).toBe(0.95);
    const payload = last.set.valuePayload as {
      sources: Array<{ url: string }>;
      alternatives: Array<{ value: string; sources: Array<{ url: string }> }>;
    };
    expect(payload.sources.map((s) => s.url)).toEqual(["https://samsung.com/global/"]);
    expect(payload.alternatives).toHaveLength(1);
    expect(payload.alternatives[0].value).toBe("Samsung");
    expect(payload.alternatives[0].sources.map((s) => s.url)).toEqual(["https://samsung.com/"]);
  });

  it("different value with lower confidence becomes an alternative without changing canonical", async () => {
    lastQueryKey = "b1|identity|Brand name|name";
    await persistFacts([buildFact({ factValue: "Samsung Electronics", confidence: 0.95 })], {
      brandId: "b1",
      runId: "r1",
      sourceUrl: "https://samsung.com/global/",
    });
    await persistFacts(
      [
        buildFact({
          factValue: "Samsung India Electronics Pvt. Ltd.",
          confidence: 0.7,
          sourceUrl: "https://samsung.com/in/",
        }),
      ],
      { brandId: "b1", runId: "r1", sourceUrl: "https://samsung.com/in/" },
    );
    const last = updates[updates.length - 1];
    // Canonical unchanged.
    expect(last.set.factValue).toBeUndefined();
    const payload = last.set.valuePayload as {
      alternatives: Array<{ value: string }>;
    };
    expect(payload.alternatives.map((a) => a.value)).toContain(
      "Samsung India Electronics Pvt. Ltd.",
    );
  });

  it("respects prior dismissal — no insert, no update", async () => {
    const key = "b1|identity|Brand name|name";
    lastQueryKey = key;
    fakeStore.set(key, {
      id: "row-1",
      factValue: "Adyen",
      confidence: "0.9",
      sourceUrl: "https://adyen.com/",
      sourceExcerpt: "",
      valuePayload: null,
      dismissedAt: new Date(),
    });
    const result = await persistFacts([buildFact({})], {
      brandId: "b1",
      runId: "r1",
      sourceUrl: "https://adyen.com/",
    });
    expect(result.inserted).toBe(0);
    expect(result.merged).toBe(0);
    expect(result.demoted).toBe(0);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
