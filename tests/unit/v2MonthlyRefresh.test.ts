// Smoke test: just verify the module exports the function and that it
// returns processed:0 when no stale brands exist (mocked DB).
import { describe, it, expect, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  insertFactScrapeLog: vi.fn().mockResolvedValue(undefined),
  withDynamicAdvisoryLock: vi.fn().mockResolvedValue({ ran: false }),
  runStaticSource: vi.fn().mockResolvedValue({ status: "done", facts: [], diagnostics: {} }),
  runSearchSource: vi.fn().mockResolvedValue({
    status: "done",
    facts: [],
    diagnostics: { cacheHit: false },
  }),
  runUserEnrichSource: vi.fn().mockResolvedValue({
    status: "done",
    facts: [],
    diagnostics: { usedFallback: false },
  }),
  runAggregate: vi.fn().mockResolvedValue({ status: "completed", totalFacts: 0 }),
  persistFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
  persistUserFacts: vi.fn().mockResolvedValue({ inserted: 0 }),
}));

vi.mock("../../server/db", () => ({
  db: {
    execute: stubs.dbExecute,
    insert: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {},
}));

vi.mock("@shared/schema", async () => {
  const real = await vi.importActual<Record<string, unknown>>("@shared/schema");
  return real;
});

vi.mock("../../server/storage", () => ({
  storage: {
    insertFactScrapeLog: stubs.insertFactScrapeLog,
  },
}));

vi.mock("../../server/lib/factAgent/v2/sourceStatic", () => ({
  runStaticSource: stubs.runStaticSource,
}));
vi.mock("../../server/lib/factAgent/v2/sourceSearch", () => ({
  runSearchSource: stubs.runSearchSource,
}));
vi.mock("../../server/lib/factAgent/v2/sourceUserEnrich", () => ({
  runUserEnrichSource: stubs.runUserEnrichSource,
}));
vi.mock("../../server/lib/factAgent/v2/aggregate", () => ({
  runAggregate: stubs.runAggregate,
}));
vi.mock("../../server/lib/advisoryLock", () => ({
  withDynamicAdvisoryLock: stubs.withDynamicAdvisoryLock,
  dynamicLockNamespaces: { citationRunSlice: 920001 },
}));
vi.mock("../../server/lib/ssrf", () => ({
  safeFetchTextWithLockedIp: vi.fn().mockResolvedValue({
    status: 200,
    text: "",
    contentType: "text/html",
    headers: {},
  }),
}));
vi.mock("../../server/lib/factAgent/robotsCache", () => ({
  createRobotsCache: vi.fn().mockReturnValue({
    isAllowed: vi.fn().mockResolvedValue(true),
    raw: vi.fn().mockReturnValue(null),
  }),
}));
vi.mock("../../server/lib/factAgent/persistFacts", () => ({
  persistFacts: stubs.persistFacts,
}));
vi.mock("../../server/lib/factAgent/v2/persistUserFacts", () => ({
  persistUserFacts: stubs.persistUserFacts,
}));
vi.mock("../../server/lib/factAgent/v2/llmFailover", () => ({
  callWithFailover: vi.fn().mockResolvedValue("{}"),
}));
vi.mock("../../server/lib/factAgent/v2/sitemapDiscovery", () => ({
  discoverSitemapUrls: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../server/lib/factAgent/v2/urlTierScoring", () => ({
  selectTopUrls: vi.fn().mockReturnValue([]),
}));
vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { misc: "gpt-4o-mini", citationClaude: "claude-3-5-sonnet" },
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
}));
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } },
  })),
}));

import { runMonthlyFactRefresh } from "../../server/lib/factAgent/v2/runMonthlyRefresh";

describe("runMonthlyFactRefresh", () => {
  it("returns processed:0 when no stale brands found", async () => {
    stubs.dbExecute.mockResolvedValueOnce({ rows: [] });
    const result = await runMonthlyFactRefresh();
    expect(result.processed).toBe(0);
  });
});
