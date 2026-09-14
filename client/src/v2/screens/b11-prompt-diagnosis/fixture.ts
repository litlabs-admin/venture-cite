import type { Board11Data } from "./Screen";

function measured<T>(value: T): { kind: "measured"; value: T } {
  return { kind: "measured", value };
}

export const board11Fixture: Board11Data = {
  brandId: "fixture-brand",
  brandName: "VenturePR",
  buyerQuestion: {
    text: "Which PR service supports early-stage founders in India?",
    state: measured("Approved buyer question"),
    intent: measured("Comparison intent"),
  },
  answerObservation: {
    brandMentioned: measured(false),
    successfulCount: measured(3),
    successfulTotal: measured(4),
    failedCount: measured(1),
  },
  sourceCoverage: { retrieved: measured(true) },
  pageEvidence: { text: measured("Startup specialization unclear") },
  assessment: { state: measured("Hypothesis — needs testing") },
  source: {
    path: measured("/services"),
    excerpt: measured("Public relations services for growing businesses."),
  },
  experiment: {
    title: measured("Clarify who your service supports"),
    points: measured(40),
    timing: measured("after published change and editorial confirmation"),
    action: measured({ kind: "create" }),
  },
  answerRecords: [
    {
      model: "ChatGPT",
      status: "successful",
      snippet: measured("Recommended multiple PR agencies for startups in India."),
      note: measured("VenturePR not mentioned."),
      fullResponse: measured("Recommended multiple PR agencies for startups in India."),
      sourceUrls: measured([]),
      checkedAt: measured("8 Sep 2026"),
    },
    {
      model: "Gemini",
      status: "successful",
      snippet: measured("Listed several PR services for early-stage founders."),
      note: measured("VenturePR not mentioned."),
      fullResponse: measured("Listed several PR services for early-stage founders."),
      sourceUrls: measured([]),
      checkedAt: measured("8 Sep 2026"),
    },
    {
      model: "Claude",
      status: "failed",
      snippet: measured("No relevant PR services found."),
      note: measured("No answer generated."),
      fullResponse: measured("No relevant PR services found."),
      sourceUrls: measured([]),
      checkedAt: measured("8 Sep 2026"),
    },
    {
      model: "Perplexity",
      status: "successful",
      snippet: measured("Showed PR firms for startups in India."),
      note: measured("VenturePR not mentioned."),
      fullResponse: measured("Showed PR firms for startups in India."),
      sourceUrls: measured([]),
      checkedAt: measured("8 Sep 2026"),
    },
  ],
  changeHistory: { kind: "not-measured", reason: "Change history is not stored." },
};
