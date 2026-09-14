import type { Board37Data } from "./Screen";

// The exact data shown on the approved render (fragment-40-citation-explorer.html
// and docs/design/venturecite-calm-analytics-missing-desktop/12-citation-explorer.png).
// Used only by the preview route for parity checking - the live route never reads this.
export const board37Fixture: Board37Data = {
  navigation: { brandId: "fixture-venturepr", mode: "expert" },
  captureDate: "2026-09-12",
  summary: { mentions: 18, citations: 11, failures: 6, attempts: 40 },
  records: [
    {
      id: "r1",
      question: "What is VenturePR and what does it do?",
      engine: "ChatGPT",
      state: "cited",
      sourceDomain: "venturepr.com",
      sourceType: "Company site",
      sourceUrl: "https://venturepr.com/",
      capturedAt: "2026-09-12T00:00:00.000Z",
      excerpt:
        "VenturePR is a strategic communications firm that helps B2B technology companies build visibility in AI search and traditional media.",
    },
    {
      id: "r2",
      question: "How do I get my startup mentioned in ChatGPT?",
      engine: "Google",
      state: "mentioned",
      sourceDomain: "techcrunch.com",
      sourceType: "News article",
      sourceUrl: null,
      capturedAt: "2026-09-12T00:00:00.000Z",
      excerpt: null,
    },
    {
      id: "r3",
      question: "VenturePR pricing?",
      engine: "Google",
      state: "failed",
      sourceDomain: null,
      sourceType: null,
      sourceUrl: null,
      capturedAt: "2026-09-12T00:00:00.000Z",
      excerpt: null,
    },
  ],
  sourceMix: [
    { type: "Company site", count: 5 },
    { type: "Editorial", count: 3 },
    { type: "News article", count: 2 },
    { type: "Community", count: 1 },
  ],
  firstPartyShare: 45,
  thirdPartyShare: 55,
};
