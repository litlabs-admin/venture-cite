import { describe, it, expect, vi } from "vitest";

// perceptionScorer constructs `new OpenAI(...)` at module load time, so it
// must be mocked the same way sentimentBatcher.test.ts mocks it - as a real
// constructor function, not an arrow function (vitest calls it with `new`).
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: vi.fn() } } };
  }),
}));
vi.mock("../../server/lib/aiLogger", () => ({ attachAiLogger: vi.fn() }));

import {
  gatherEvidence,
  parseScoreResponse,
  computeOverall,
  type EvidenceRow,
} from "../../server/lib/perceptionScorer";

const RAW_DELIM = "||| RAW_RESPONSE |||";

function row(citationContext: string | null, aiPlatform = "ChatGPT"): EvidenceRow {
  return { citationContext, aiPlatform };
}

describe("gatherEvidence", () => {
  it("strips everything before the RAW_RESPONSE delimiter", () => {
    const longAnswer = "A".repeat(100);
    const out = gatherEvidence([row(`Cited\n\n${RAW_DELIM}\n${longAnswer}`)]);
    expect(out).toEqual([{ text: longAnswer, platform: "ChatGPT" }]);
  });

  it("keeps the text as-is when the delimiter is absent", () => {
    const longAnswer = "B".repeat(100);
    const out = gatherEvidence([row(longAnswer)]);
    expect(out).toEqual([{ text: longAnswer, platform: "ChatGPT" }]);
  });

  it("drops entries shorter than 80 chars after trimming", () => {
    const short = `${RAW_DELIM}\n   short answer   `; // well under 80 chars trimmed
    const out = gatherEvidence([row(short)]);
    expect(out).toEqual([]);
  });

  it("truncates each snippet to 1200 chars", () => {
    const long = "C".repeat(2000);
    const out = gatherEvidence([row(`${RAW_DELIM}\n${long}`)]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toHaveLength(1200);
    expect(out[0].text).toBe(long.slice(0, 1200));
  });

  it("respects maxSnippets", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`${RAW_DELIM}\n${"D".repeat(90)}-${i}`, "ChatGPT"),
    );
    const out = gatherEvidence(rows, { maxSnippets: 3 });
    expect(out).toHaveLength(3);
  });

  it("round-robins across platforms so one chatty platform can't dominate", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) =>
        row(`${RAW_DELIM}\n${"E".repeat(90)}-${i}`, "ChatGPT"),
      ),
      row(`${RAW_DELIM}\n${"F".repeat(90)}`, "Claude"),
    ];
    const out = gatherEvidence(rows, { maxSnippets: 3 });
    expect(out).toHaveLength(3);
    // ChatGPT should not fill all 3 slots when Claude has evidence too.
    const platforms = out.map((o) => o.platform);
    expect(platforms).toContain("Claude");
    expect(platforms[0]).toBe("ChatGPT");
    expect(platforms[1]).toBe("Claude");
  });
});

describe("parseScoreResponse", () => {
  it("parses valid JSON", () => {
    const result = parseScoreResponse(
      JSON.stringify({
        trust: 80,
        quality: 70,
        value: 60,
        market: 50,
        innovation: 90,
        praised: ["fast support"],
        questioned: ["pricing tiers"],
      }),
    );
    expect(result).toEqual({
      trust: 80,
      quality: 70,
      value: 60,
      market: 50,
      innovation: 90,
      praised: ["fast support"],
      questioned: ["pricing tiers"],
    });
  });

  it("clamps out-of-range numbers", () => {
    const result = parseScoreResponse(
      JSON.stringify({ trust: 150, quality: -20, value: 50.6, market: null, innovation: null }),
    );
    expect(result.trust).toBe(100);
    expect(result.quality).toBe(0);
    expect(result.value).toBe(50.6);
  });

  it("rounds axis values to one decimal", () => {
    const result = parseScoreResponse(JSON.stringify({ trust: 66.64, quality: 65.849 }));
    expect(result.trust).toBe(66.6);
    expect(result.quality).toBe(65.8);
  });

  it("returns null for a string/garbage axis value", () => {
    const result = parseScoreResponse(JSON.stringify({ trust: "high", quality: {}, value: [] }));
    expect(result.trust).toBeNull();
    expect(result.quality).toBeNull();
    expect(result.value).toBeNull();
  });

  it("returns null for a missing axis", () => {
    const result = parseScoreResponse(JSON.stringify({ trust: 80 }));
    expect(result.quality).toBeNull();
    expect(result.value).toBeNull();
    expect(result.market).toBeNull();
    expect(result.innovation).toBeNull();
  });

  it("caps praised/questioned to 8 items, each truncated to 60 chars", () => {
    const longPhrase = "x".repeat(100);
    const result = parseScoreResponse(
      JSON.stringify({
        praised: Array.from({ length: 12 }, () => longPhrase),
        questioned: Array.from({ length: 12 }, () => longPhrase),
      }),
    );
    expect(result.praised).toHaveLength(8);
    expect(result.questioned).toHaveLength(8);
    expect(result.praised[0]).toHaveLength(60);
    expect(result.questioned[0]).toHaveLength(60);
  });

  it("throws a clear Error on malformed JSON", () => {
    expect(() => parseScoreResponse("not json")).toThrow(/malformed JSON/i);
  });
});

describe("computeOverall", () => {
  it("computes the mean of non-null axes", () => {
    const overall = computeOverall({
      trust: 80,
      quality: 60,
      value: 40,
      market: null,
      innovation: null,
    });
    expect(overall).toBe(60);
  });

  it("ignores nulls rather than counting them as 0", () => {
    const overall = computeOverall({
      trust: 100,
      quality: null,
      value: null,
      market: null,
      innovation: null,
    });
    expect(overall).toBe(100);
  });

  it("returns null when all axes are null", () => {
    const overall = computeOverall({
      trust: null,
      quality: null,
      value: null,
      market: null,
      innovation: null,
    });
    expect(overall).toBeNull();
  });

  it("returns a one-decimal mean, not a rounded integer (80 and 61 -> 70.5)", () => {
    const overall = computeOverall({
      trust: 80,
      quality: 61,
      value: null,
      market: null,
      innovation: null,
    });
    expect(overall).toBe(70.5);
  });
});
