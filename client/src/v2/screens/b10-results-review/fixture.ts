import type { Board10Data } from "./Screen";

export const board10Fixture: Board10Data = {
  context: { brandId: "brand-venture-pr", mode: "guided" },
  review: {
    periodStart: { kind: "measured", value: "2026-08-26" },
    periodEnd: { kind: "measured", value: "2026-09-08" },
    verifiedChanges: { kind: "measured", value: 2 },
    mentions: { kind: "measured", value: 18 },
    successfulAnswers: { kind: "measured", value: 40 },
    businessResultsState: "not-connected",
    decision: "not_conclusive",
    notes:
      "Keep the updated services page. Review another comparable answer set before making further changes.",
    awardPoints: { kind: "measured", value: 10 },
  },
  progress: {
    level: { kind: "measured", value: 3 },
    name: { kind: "measured", value: "Improve" },
    points: { kind: "measured", value: 160 },
    target: { kind: "measured", value: 320 },
    rate: { kind: "measured", value: 50 },
    next: { kind: "measured", value: { level: 4, name: "Learn", points: 320 } },
    completedRequirements: { kind: "measured", value: 2 },
    requiredRequirements: { kind: "measured", value: 2 },
    awardHistory: [
      { label: "Essential facts approved", points: { kind: "measured", value: 20 } },
      { label: "Buyer questions approved", points: { kind: "measured", value: 20 } },
      { label: "Baseline reviewed", points: { kind: "measured", value: 20 } },
      { label: "Page improved", points: { kind: "measured", value: 40 } },
      { label: "Fault repaired", points: { kind: "measured", value: 40 } },
      { label: "Earlier reviews", points: { kind: "measured", value: 20 } },
    ],
  },
};
