import type { Board08Data } from "./Screen";

export const board08Fixture: Board08Data = {
  navigation: { brandId: "fixture-venturepr", mode: "expert" },
  visibility: {
    mentionRate: { kind: "measured", value: 0.45 },
    mentioned: { kind: "measured", value: 18 },
    successfulAnswers: { kind: "measured", value: 40 },
    failedAttempts: { kind: "measured", value: 2 },
    recommendations: { kind: "measured", value: 9 },
    citations: { kind: "measured", value: 6 },
    engineCount: { kind: "measured", value: 4 },
    approvedQuestionCount: { kind: "measured", value: 10 },
    lastObservedAt: { kind: "measured", value: "8 Sep 2026" },
    trend: {
      kind: "measured",
      value: {
        points: [29, 30, 36, 37, 37, 45, 46, 44, 46, 42, 38, 36, 40, 45],
        xLabels: ["Aug 26", "Sep 1", "Sep 8"],
      },
    },
  },
  completedWork: [
    {
      title: "Service description corrected",
      icon: "doc",
      state: { kind: "measured", value: "Verified" },
      points: { kind: "measured", value: 40 },
    },
    {
      title: "Buyer guide improved",
      icon: "map",
      state: { kind: "measured", value: "Confirmed by owner" },
      points: { kind: "measured", value: 40 },
    },
  ],
  businessResults: {
    kind: "not-measured",
    label: "Analytics not connected",
    detail: "Connect a source to measure referral visits and qualified leads.",
  },
  nextAction: {
    kind: "measured",
    value: {
      description: "Review your updated services page against the next comparable answer set.",
      rewardPoints: 10,
    },
  },
};
