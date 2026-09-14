import type { Board04Data } from "./Screen";

export const board04Fixture: Board04Data = {
  task: {
    id: "task-repair-1",
    revision: 2,
    state: "submitted",
    verificationEvidence: [],
    brandId: "brand-venture-pr",
    title: "Correct the service description",
    points: 40,
    steps: [
      { label: "Review evidence", node: { kind: "completed" } },
      { label: "Update your page", node: { kind: "completed" } },
      { label: "Verify work", node: { kind: "active", number: 3 } },
    ],
    before: { claim: { kind: "measured", value: "Services available worldwide" } },
    after: { claim: { kind: "measured", value: "Services available in India" } },
    sourcePath: { kind: "measured", value: "/services" },
    approvedFact: { kind: "measured", value: "Service region: India" },
    note: { kind: "measured", value: "Illustrative evidence" },
    checkedAt: { kind: "measured", value: "8 Sep 2026" },
  },
  checks: {
    urlReachable: { kind: "passed" },
    textPresent: { kind: "passed" },
    factConfirmed: { kind: "pending" },
  },
  progress: {
    currentLevel: { level: 2, name: "Ready" },
    currentPoints: 120,
    nextPoints: 160,
    awardedPoints: 40,
    nextLevel: { kind: "measured", value: "Improve" },
    verifiedChanges: { kind: "measured", value: 1 },
    requiredChanges: { kind: "measured", value: 2 },
    completionMessage: { kind: "measured", value: "This completes your second\nverified change" },
  },
};
