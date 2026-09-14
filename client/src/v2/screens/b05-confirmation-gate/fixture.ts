import type { Board05Data } from "./Screen";

export const board05Fixture: Board05Data = {
  task: {
    brandId: "brand-venture-pr",
    title: "Correct the service description",
    points: 40,
    steps: [
      { label: "Review evidence", node: { kind: "completed" } },
      { label: "Update page", node: { kind: "completed" } },
      { label: "Verify work", node: { kind: "active", number: 3 } },
    ],
    beforeText: { kind: "measured", value: "Services available worldwide" },
    updatedText: { kind: "measured", value: "Services available in India" },
    approvedFact: { kind: "measured", value: "India" },
    sourcePath: { kind: "measured", value: "/services" },
    checkedAt: { kind: "measured", value: "8 Sep 2026" },
  },
  checks: {
    urlReachable: { kind: "passed" },
    textPresent: { kind: "passed" },
  },
  confirmation: {
    accepted: false,
    value: { kind: "measured", value: "India" },
  },
  progress: {
    currentLevel: { level: 2, name: "Ready" },
    currentPoints: 120,
    taskPoints: 40,
    nextLevel: { kind: "measured", value: "Level 3 · Improve" },
    verifiedChanges: { kind: "measured", value: 1 },
    requiredChanges: { kind: "measured", value: 2 },
    completionMessage: { kind: "measured", value: "Second verified change complete" },
  },
};
