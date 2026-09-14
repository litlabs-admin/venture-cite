import type { Board20Data } from "./Screen";

// The exact data shown on the approved render (fragment-23-report.html and
// docs/design/venturecite-calm-analytics-desktop/08-report.png). Used only by
// the preview route for parity checking - the live route never reads this.
export const board20Fixture: Board20Data = {
  navigation: { brandId: "fixture-venturepr", mode: "guided" },
  period: { kind: "measured", value: { start: "26 Aug 2026", end: "8 Sep 2026" } },
  workCompleted: { kind: "measured", value: 2 },
  observedVisibility: { kind: "measured", value: { mentions: 18, attempts: 40 } },
  citations: { kind: "measured", value: { count: 14, attempts: 40 } },
  businessResultsDetail:
    "Connect an analytics source to measure referral visits and qualified leads.",
  trend: {
    kind: "measured",
    value: {
      points: [6, 9, 11, 14, 16, 18],
      xLabels: ["Aug 26", "Sep 1", "Sep 8"],
    },
  },
  engineComparison: {
    kind: "measured",
    value: [
      { engine: "ChatGPT", rate: 40 },
      { engine: "Claude", rate: 25 },
      { engine: "Perplexity", rate: 15 },
      { engine: "Google AI", rate: 10 },
    ],
  },
  buyerQuestions: [
    { id: "q1", text: "What is VenturePR?", mentions: 6, attempts: 8, cited: 5, engineCount: 4 },
    { id: "q2", text: "VenturePR pricing", mentions: 4, attempts: 8, cited: 2, engineCount: 4 },
    { id: "q3", text: "Best PR for startups", mentions: 3, attempts: 8, cited: 2, engineCount: 3 },
    {
      id: "q4",
      text: "How does VenturePR compare?",
      mentions: 3,
      attempts: 8,
      cited: 1,
      engineCount: 3,
    },
    {
      id: "q5",
      text: "Is VenturePR worth it?",
      mentions: 2,
      attempts: 8,
      cited: 1,
      engineCount: 4,
    },
  ],
  citedDomains: [
    { domain: "venturepr.com", citations: 8, share: 36 },
    { domain: "techcrunch.com", citations: 4, share: 18 },
    { domain: "forbes.com", citations: 3, share: 14 },
    { domain: "linkedin.com", citations: 2, share: 9 },
    { domain: "openai.com", citations: 2, share: 9 },
  ],
  omissions: [
    {
      questionId: "o1",
      text: "Best PR tools for startups",
      engineCount: 4,
      engineTotal: 4,
      competitorNames: ["Harpo", "Stripe", "PrePR"],
    },
    {
      questionId: "o2",
      text: "VenturePR alternatives",
      engineCount: 4,
      engineTotal: 4,
      competitorNames: ["HypeKit", "Newsroom", "Rize"],
    },
  ],
  completedChanges: [
    { title: "Update services page", status: "Verified", verifiedAt: "1 Sep 2026" },
    { title: "Add FAQ to pricing page", status: "Verified", verifiedAt: "28 Aug 2026" },
  ],
  progress: {
    kind: "measured",
    value: {
      level: 3,
      levelName: "Improve",
      pointsEarned: 160,
      pointsTarget: 320,
      nextLevelName: "Level 4 Learn",
    },
  },
  reportNote: {
    value:
      "Steady gains across engines. Continue executing the updated services page and monitor new recommendations next period.",
    savedAt: "1 Sep 2026",
  },
  onSaveNote: () => undefined,
  noteSaving: false,
  onExport: () => undefined,
};
