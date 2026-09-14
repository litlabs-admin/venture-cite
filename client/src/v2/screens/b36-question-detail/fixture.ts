import type { Board36Data } from "./Screen";

// The exact data shown on the approved render (fragment-39-question-detail.html
// and docs/design/venturecite-calm-analytics-missing-desktop/11-buyer-question-detail.png).
// Used only by the preview route for parity checking - the live route never reads this.
export const board36Fixture: Board36Data = {
  navigation: { brandId: "fixture-venturepr", mode: "expert" },
  question: {
    id: "Q-1042",
    text: "Which PR service supports early-stage founders in India?",
    status: "tracked",
    paused: false,
    category: "Compare",
    journeyStage: "Consideration",
    region: "IN",
    createdAt: "2026-09-02T00:00:00.000Z",
  },
  trend: {
    kind: "measured",
    value: [
      { weekStart: "2026-08-13", mentionRate: 30, citationRate: 18, failureRate: 12 },
      { weekStart: "2026-08-20", mentionRate: 34, citationRate: 20, failureRate: 10 },
      { weekStart: "2026-08-27", mentionRate: 38, citationRate: 24, failureRate: 9 },
      { weekStart: "2026-09-03", mentionRate: 40, citationRate: 26, failureRate: 8 },
      { weekStart: "2026-09-10", mentionRate: 42, citationRate: 28, failureRate: 8 },
    ],
  },
  metrics: {
    mentionRate: { kind: "measured", value: 42 },
    citationRate: { kind: "measured", value: 28 },
    failureRate: { kind: "measured", value: 8 },
    mentionCount: 17,
    citationCount: 11,
    failedCount: 3,
    attemptCount: 40,
  },
  engineRecords: [
    { engine: "ChatGPT", total: 10, answered: 9, mentioned: 4, cited: 3, failed: 1 },
    { engine: "Gemini", total: 10, answered: 8, mentioned: 4, cited: 3, failed: 2 },
    { engine: "Claude", total: 10, answered: 7, mentioned: 3, cited: 2, failed: 2 },
    { engine: "Perplexity", total: 10, answered: 8, mentioned: 6, cited: 3, failed: 1 },
  ],
  citedUrls: [
    { url: "https://venturepr.co/services", citations: 5, engineCount: 3 },
    { url: "https://venturepr.co/", citations: 3, engineCount: 3 },
    { url: "https://venturepr.co/blog/startup-pr-india", citations: 2, engineCount: 2 },
  ],
  competitors: [
    { name: "Edelman", mentions: 6, engineCount: 3 },
    { name: "Value360", mentions: 4, engineCount: 3 },
    { name: "Avian WE", mentions: 3, engineCount: 3 },
  ],
  health: "good",
  onTogglePause: () => undefined,
  pauseSaving: false,
};
