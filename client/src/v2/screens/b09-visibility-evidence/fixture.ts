import type { Board09Data } from "./Screen";

export const board09Fixture: Board09Data = {
  context: { brandId: "brand-preview", mode: "expert" },
  visibility: {
    mentionRate: { kind: "measured", value: 0.45 },
    mentioned: { kind: "measured", value: 18 },
    successfulAnswers: { kind: "measured", value: 40 },
    failedAttempts: { kind: "measured", value: 2 },
    approvedQuestions: { kind: "measured", value: 10 },
    engines: { kind: "measured", value: 4 },
    recommendations: { kind: "not-measured", reason: "No recommendation result is recorded." },
    trend: {
      labels: {
        kind: "measured",
        value: [
          "Aug 26",
          "Aug 27",
          "Aug 28",
          "Aug 29",
          "Aug 30",
          "Aug 31",
          "Sep 1",
          "Sep 2",
          "Sep 3",
          "Sep 4",
          "Sep 5",
          "Sep 6",
          "Sep 7",
          "Sep 8",
        ],
      },
      mentionRate: {
        kind: "measured",
        value: [0.29, 0.3, 0.36, 0.37, 0.37, 0.45, 0.46, 0.44, 0.46, 0.42, 0.38, 0.37, 0.4, 0.45],
      },
      confidenceUpper: {
        kind: "measured",
        value: [0.52, 0.54, 0.55, 0.55, 0.58, 0.6, 0.55, 0.57],
      },
      confidenceLower: {
        kind: "measured",
        value: [0.21, 0.28, 0.29, 0.29, 0.37, 0.38, 0.3, 0.35],
      },
    },
  },
  filters: {
    dateWindow: { kind: "measured", value: "Last 14 days" },
    engineCount: { kind: "measured", value: 4 },
    questionCount: { kind: "measured", value: 10 },
  },
  verifiedWork: {
    totalPoints: { kind: "measured", value: 160 },
    changeCount: { kind: "measured", value: 2 },
    changeSummary: { kind: "measured", value: "Two distinct changes verified" },
    level: { kind: "measured", value: { level: 3, name: "Improve" } },
    nextLevel: { kind: "measured", value: { name: "Learn", points: 320 } },
    progressRate: { kind: "measured", value: 0.5 },
    changes: {
      kind: "measured",
      value: [
        { title: "Service description corrected", points: { kind: "measured", value: 40 } },
        { title: "Buyer page improved", points: { kind: "measured", value: 40 } },
      ],
    },
  },
  sourceEvidence: {
    kind: "measured",
    value: [
      {
        sourcePath: "/services",
        checkType: "Text checked",
        checkedAt: "8 Sep, 10:21",
        result: { kind: "measured", value: "Verified" },
        selected: true,
      },
      {
        sourcePath: "/pricing",
        checkType: "Citation recorded",
        checkedAt: "8 Sep, 09:47",
        result: { kind: "measured", value: "Verified" },
        selected: false,
      },
      {
        sourcePath: "/about",
        checkType: "Human confirmed",
        checkedAt: "7 Sep, 16:32",
        result: { kind: "measured", value: "Verified" },
        selected: false,
      },
    ],
  },
  review: {
    message:
      "Your page change is verified. Compare the next matching answer set before drawing a conclusion.",
    actionLabel: "Open results review",
    rewardPoints: { kind: "measured", value: 10 },
    businessResults: { kind: "not-measured", reason: "Analytics not connected." },
  },
  coverage: {
    successfulAnswers: { kind: "measured", value: 40 },
    failedAttempts: { kind: "measured", value: 2 },
    approvedQuestions: { kind: "measured", value: 10 },
    engines: { kind: "measured", value: 4 },
    lastChecked: { kind: "measured", value: "8 Sep 2026" },
  },
  observedEngines: {
    kind: "measured",
    value: [
      { name: "ChatGPT", answerCount: { kind: "measured", value: 10 } },
      { name: "Gemini", answerCount: { kind: "measured", value: 10 } },
      { name: "Claude", answerCount: { kind: "measured", value: 10 } },
      { name: "Perplexity", answerCount: { kind: "measured", value: 10 } },
    ],
  },
};
