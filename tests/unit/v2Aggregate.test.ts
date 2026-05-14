import { describe, it, expect } from "vitest";
import { computeTerminalStatus, type SourceOutcome } from "../../server/lib/factAgent/v2/aggregate";

describe("computeTerminalStatus", () => {
  it("returns 'completed' when any source produced facts", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "done", factCount: 3, errorKind: null },
      { source: "search_llm", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "user_enrich", status: "done", factCount: 0, errorKind: null },
    ];
    expect(computeTerminalStatus(outcomes)).toEqual({
      status: "completed",
      errorKind: null,
    });
  });

  it("returns 'failed' with all_sources_empty when zero facts and all content-empty", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "done", factCount: 0, errorKind: null },
      { source: "search_llm", status: "done", factCount: 0, errorKind: null },
      { source: "user_enrich", status: "done", factCount: 0, errorKind: null },
    ];
    expect(computeTerminalStatus(outcomes)).toEqual({
      status: "failed",
      errorKind: "all_sources_empty",
    });
  });

  it("returns 'failed' with provider_outage when zero facts AND all sources had provider errors", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "search_llm", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "user_enrich", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
    ];
    expect(computeTerminalStatus(outcomes)).toEqual({
      status: "failed",
      errorKind: "provider_outage",
    });
  });

  it("returns 'failed' with all_sources_empty when mixed empty + provider errors but at least one content-empty", () => {
    const outcomes: SourceOutcome[] = [
      { source: "static_pages", status: "failed", factCount: 0, errorKind: "llm_unavailable" },
      { source: "search_llm", status: "done", factCount: 0, errorKind: null },
    ];
    expect(computeTerminalStatus(outcomes).errorKind).toBe("all_sources_empty");
  });
});
