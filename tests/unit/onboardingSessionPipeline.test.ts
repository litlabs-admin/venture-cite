// Coverage for server/onboardingSession/pipeline.ts. Every producer is
// mocked at its own module boundary (site.ts, analyze.ts, and Agent B's
// readiness.ts/firstRead.ts/insight.ts against contracts.ts's signatures) so
// this test only exercises pipeline.ts's own wiring: event order, the
// step_error fallback, and the two failure conditions that mark the whole
// session "failed".
import { describe, it, expect, beforeEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  appendEvent: vi.fn(async () => undefined),
  setStatus: vi.fn(async () => undefined),
  readSite: vi.fn(async () => ({
    site: { domain: "acme.com", title: "Acme", faviconUrl: "/api/logo-proxy?url=x" },
    pageText: "Acme sells widgets.",
    html: "<html></html>",
  })),
  writeLoadingLines: vi.fn(async () => [
    "Reading acme.com...",
    "Checking...",
    "Mapping...",
    "Done soon...",
  ]),
  analyzeBrand: vi.fn(async () => ({
    profile: {
      name: "Acme",
      industry: "Enterprise Widget Platforms",
      descriptor: "Widgets for enterprises",
      description: "Acme makes widgets.",
      audience: "Ops managers",
    },
    competitors: { shown: [], totalFound: 0 },
    topics: [{ topic: "widgets", prompts: ["best widget platforms for enterprise ops teams"] }],
  })),
  readReadiness: vi.fn(async () => ({
    crawlers: [{ bot: "GPTBot", allowed: true }],
    llmsTxt: false,
    sitemap: true,
    schemaTypes: [],
  })),
  runFirstRead: vi.fn(async () => ({
    probe: { results: [], promptsTested: 0, brandAppearances: 0, competitorAppearances: 0 },
    sources: [],
  })),
  buildInsight: vi.fn(async () => ({
    headline: "Not yet cited",
    detail: "No engine named Acme in the sampled prompts.",
    evidenceQuote: null,
    tone: "gap" as const,
  })),
}));

vi.mock("../../server/onboardingSession/store", () => ({
  appendEvent: stubs.appendEvent,
  setStatus: stubs.setStatus,
}));
vi.mock("../../server/onboardingSession/site", () => ({ readSite: stubs.readSite }));
vi.mock("../../server/onboardingSession/analyze", () => ({
  writeLoadingLines: stubs.writeLoadingLines,
  analyzeBrand: stubs.analyzeBrand,
}));
vi.mock("../../server/onboardingSession/readiness", () => ({ readReadiness: stubs.readReadiness }));
vi.mock("../../server/onboardingSession/firstRead", () => ({ runFirstRead: stubs.runFirstRead }));
vi.mock("../../server/onboardingSession/insight", () => ({ buildInsight: stubs.buildInsight }));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { runSessionPipeline } = await import("../../server/onboardingSession/pipeline");

function emittedTypes(): string[] {
  return stubs.appendEvent.mock.calls.map((c) => (c[1] as { type: string }).type);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.readSite.mockResolvedValue({
    site: { domain: "acme.com", title: "Acme", faviconUrl: "/api/logo-proxy?url=x" },
    pageText: "Acme sells widgets.",
    html: "<html></html>",
  });
  stubs.writeLoadingLines.mockResolvedValue([
    "Reading acme.com...",
    "Checking...",
    "Mapping...",
    "Done soon...",
  ]);
  stubs.analyzeBrand.mockResolvedValue({
    profile: {
      name: "Acme",
      industry: "Enterprise Widget Platforms",
      descriptor: "Widgets for enterprises",
      description: "Acme makes widgets.",
      audience: "Ops managers",
    },
    competitors: { shown: [], totalFound: 0 },
    topics: [{ topic: "widgets", prompts: ["best widget platforms for enterprise ops teams"] }],
  });
  stubs.readReadiness.mockResolvedValue({
    crawlers: [{ bot: "GPTBot", allowed: true }],
    llmsTxt: false,
    sitemap: true,
    schemaTypes: [],
  });
  stubs.runFirstRead.mockResolvedValue({
    probe: { results: [], promptsTested: 0, brandAppearances: 0, competitorAppearances: 0 },
    sources: [],
  });
  stubs.buildInsight.mockResolvedValue({
    headline: "Not yet cited",
    detail: "No engine named Acme in the sampled prompts.",
    evidenceQuote: null,
    tone: "gap",
  });
});

describe("runSessionPipeline: happy path", () => {
  it("emits every event in the spec order and ends done", async () => {
    await runSessionPipeline("session-1", "acme.com");
    const types = emittedTypes();
    expect(types).toContain("site");
    expect(types).toContain("loading_lines");
    expect(types).toContain("profile");
    expect(types).toContain("competitors");
    expect(types).toContain("topics");
    expect(types).toContain("readiness");
    expect(types).toContain("probe");
    expect(types).toContain("sources");
    expect(types).toContain("insight");
    expect(types[types.length - 1]).toBe("done");
    expect(types.indexOf("site")).toBeLessThan(types.indexOf("profile"));
    expect(types.indexOf("profile")).toBeLessThan(types.indexOf("probe"));
    expect(stubs.setStatus).toHaveBeenCalledWith("session-1", "done");
  });
});

describe("runSessionPipeline: readSite fails", () => {
  it("emits a step_error for site and marks the session failed, with no other events", async () => {
    stubs.readSite.mockRejectedValue(new Error("unreachable"));
    await runSessionPipeline("session-1", "acme.com");
    const types = emittedTypes();
    expect(types).toEqual(["step_error"]);
    expect(stubs.setStatus).toHaveBeenCalledWith("session-1", "failed");
  });
});

describe("runSessionPipeline: analyzeBrand fails", () => {
  it("still emits site/readiness/loading_lines but marks the session failed, with no probe", async () => {
    stubs.analyzeBrand.mockRejectedValue(new Error("LLM timed out"));
    await runSessionPipeline("session-1", "acme.com");
    const types = emittedTypes();
    expect(types).toContain("site");
    expect(types).toContain("step_error");
    expect(types).not.toContain("probe");
    expect(types).not.toContain("insight");
    expect(types).not.toContain("done");
    expect(stubs.setStatus).toHaveBeenCalledWith("session-1", "failed");
  });
});

describe("runSessionPipeline: a downstream producer fails", () => {
  it("readiness failing does not stop probe/insight/done, and yields a step_error", async () => {
    stubs.readReadiness.mockRejectedValue(new Error("robots.txt fetch failed"));
    await runSessionPipeline("session-1", "acme.com");
    const types = emittedTypes();
    expect(types).toContain("step_error");
    expect(types).toContain("profile");
    // No readiness means buildInsight is never called (it needs readiness).
    expect(stubs.buildInsight).not.toHaveBeenCalled();
    expect(types[types.length - 1]).toBe("done");
    expect(stubs.setStatus).toHaveBeenCalledWith("session-1", "done");
  });

  it("firstRead failing still lets insight and done through", async () => {
    stubs.runFirstRead.mockRejectedValue(new Error("citation check failed"));
    await runSessionPipeline("session-1", "acme.com");
    const types = emittedTypes();
    expect(types).toContain("step_error");
    expect(types).toContain("insight");
    expect(types).not.toContain("probe");
    expect(types[types.length - 1]).toBe("done");
    expect(stubs.setStatus).toHaveBeenCalledWith("session-1", "done");
  });
});
