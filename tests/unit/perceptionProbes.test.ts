import { describe, it, expect } from "vitest";
import { buildProbeQuestions } from "../../server/lib/perceptionProbeQuestions";
import { axisAverage, type Probe } from "../../client/src/components/perception/ProbeMatrix";
import { PERCEPTION_AXES } from "../../server/lib/perceptionScorer";
import type { Brand } from "@shared/schema";

// The probe pipeline's whole justification is that it refuses to convert an
// absence of information into a bad score. These tests pin that: the question
// wording that makes "I don't know" reachable, and the aggregation that must
// never average a non-answer in as a zero.

const brand = {
  id: "b1",
  name: "Venture PR",
  website: "https://venturepr.com",
  industry: "Tech Startup PR",
} as unknown as Brand;

describe("buildProbeQuestions", () => {
  it("asks exactly one question per scored axis", () => {
    const qs = buildProbeQuestions(brand);
    expect(qs.map((q) => q.axis).sort()).toEqual([...PERCEPTION_AXES].sort());
  });

  it("invites a non-answer in every question", () => {
    // Without this clause the model treats the question as a demand to produce
    // something, and a brand it has never heard of gets a confident fiction.
    // This is the single load-bearing sentence in the whole pipeline.
    for (const q of buildProbeQuestions(brand)) {
      expect(q.question).toMatch(/do not have reliable information/i);
      expect(q.question).toMatch(/say so plainly/i);
    }
  });

  it("warns the model off similarly named companies", () => {
    for (const q of buildProbeQuestions(brand)) {
      expect(q.question).toMatch(/similarly named company/i);
    }
  });

  it("asks about pricing explicitly on the value axis", () => {
    // `value` was null on essentially every derived run because a "best
    // agencies for X" answer never discusses cost. The probe has to ask.
    const value = buildProbeQuestions(brand).find((q) => q.axis === "value")!;
    expect(value.question).toMatch(/pricing/i);
    expect(value.question).toMatch(/what do they charge/i);
  });

  it("names the brand and its site in every question", () => {
    for (const q of buildProbeQuestions(brand)) {
      expect(q.question).toContain("Venture PR");
      expect(q.question).toContain("venturepr.com");
    }
  });

  it("omits the industry clause rather than inventing one when unknown", () => {
    const noIndustry = { ...brand, industry: null } as unknown as Brand;
    for (const q of buildProbeQuestions(noIndustry)) {
      expect(q.question).not.toMatch(/in the null industry/i);
      expect(q.question).not.toMatch(/in the undefined industry/i);
    }
  });

  it("does not lead the model toward a positive answer", () => {
    // A question like "why is X so well regarded?" manufactures the result it
    // claims to measure.
    for (const q of buildProbeQuestions(brand)) {
      expect(q.question).not.toMatch(/\bwhy is\b/i);
      expect(q.question).not.toMatch(/\bso (?:good|popular|well)\b/i);
      expect(q.question).not.toMatch(/\bleading (?:brand|company|agency)\b/i);
    }
  });
});

function probe(over: Partial<Probe>): Probe {
  return {
    platform: "ChatGPT",
    axis: "trust",
    question: "q",
    status: "scored",
    answer: "a",
    sources: [],
    score: 80,
    noInformation: false,
    note: null,
    errorMessage: null,
    ...over,
  };
}

describe("axisAverage", () => {
  it("averages only the engines that actually scored the axis", () => {
    const avg = axisAverage(
      [
        probe({ platform: "ChatGPT", score: 80 }),
        probe({ platform: "Gemini", score: 60 }),
        probe({ platform: "Grok", axis: "value", score: 10 }),
      ],
      "trust",
    );
    expect(avg).toBe(70);
  });

  it("excludes no-information engines instead of counting them as zero", () => {
    // THE load-bearing assertion. Two engines said 80; one had never heard of
    // the brand. The answer is 80, not 53.3 - silence is not a bad review.
    const avg = axisAverage(
      [
        probe({ platform: "ChatGPT", score: 80 }),
        probe({ platform: "Gemini", score: 80 }),
        probe({ platform: "Grok", score: null, noInformation: true }),
      ],
      "trust",
    );
    expect(avg).toBe(80);
  });

  it("excludes failed probes rather than treating a hole as a zero", () => {
    const avg = axisAverage(
      [
        probe({ platform: "ChatGPT", score: 90 }),
        probe({ platform: "Gemini", status: "failed", score: null, errorMessage: "timeout" }),
      ],
      "trust",
    );
    expect(avg).toBe(90);
  });

  it("returns null - never 0 - when no engine scored the axis", () => {
    const avg = axisAverage(
      [
        probe({ platform: "ChatGPT", score: null, noInformation: true }),
        probe({ platform: "Gemini", status: "failed", score: null }),
      ],
      "trust",
    );
    expect(avg).toBeNull();
  });

  it("returns null for an axis with no probes at all", () => {
    expect(axisAverage([], "trust")).toBeNull();
  });
});
