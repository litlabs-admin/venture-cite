import { describe, expect, it } from "vitest";
import {
  awardDecision,
  awardKey,
  levelForProgress,
  pointsForTask,
  transitionTask,
  validateEvidenceForTask,
  verifyTask,
  waitForObservation,
} from "../../server/domains/work/policy";
import {
  TASK_TYPES,
  type CapabilityMilestone,
  type EvidenceReference,
  type TaskType,
} from "@shared/work";

const evidenceFor = (kind: EvidenceReference["kind"]): EvidenceReference => {
  switch (kind) {
    case "source":
      return {
        kind,
        label: "Approved fact source",
        sourceUrl: "https://example.com/fact",
        finalUrl: "https://example.com/final",
        canonicalUrl: "https://example.com/canonical",
        retrievedAt: "2026-09-08T00:00:00.000Z",
        excerpt: "The approved fact appears here.",
      };
    case "artifact":
      return {
        kind,
        label: "Buyer question set",
        artifactId: "questions-1",
        version: 2,
        reviewedByUserId: "user-1",
        coverage: "All target buyer stages",
        duplicateCheck: "No duplicate questions",
      };
    case "measurement":
      return {
        kind,
        label: "Visibility baseline",
        measurementId: "measurement-1",
        scopeId: "scope-1",
        provider: "fixture-provider",
        promptVersion: "prompt-v2",
        startedAt: "2026-09-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:05:00.000Z",
        coverage: "10 prompts across 2 providers",
      };
    case "fault_repair":
      return {
        kind,
        label: "Confirmed access repair",
        faultId: "fault-1",
        beforeCheckId: "check-before",
        afterCheckId: "check-after",
        checkedAt: "2026-09-08T00:00:00.000Z",
      };
    case "content_change":
      return {
        kind,
        label: "Published buyer page",
        changeId: "change-1",
        pageUrl: "https://example.com/buyers",
        buyerNeed: "Compare the product with alternatives",
        publishedAt: "2026-09-08T00:00:00.000Z",
      };
    case "authored_work":
      return {
        kind,
        label: "Authored community submission",
        submissionId: "submission-1",
        destinationUrl: "https://community.example.com/post/1",
        authoredByUserId: "user-1",
        submittedAt: "2026-09-08T00:00:00.000Z",
      };
    case "confirmation":
      return {
        kind,
        label: "Named reviewer confirmation",
        confirmedByUserId: "user-1",
        note: "I reviewed the completed work.",
        confirmedAt: "2026-09-08T00:00:00.000Z",
      };
    case "decision":
      return {
        kind,
        label: "Review decision",
        decisionId: "decision-1",
        reviewPeriod: "2026-09",
        decision: "Keep the page change and measure again.",
        basedOnMeasurementId: "measurement-1",
      };
    case "experiment":
      return {
        kind,
        label: "Visibility experiment",
        experimentId: "experiment-1",
        hypothesis: "A direct comparison page will improve buyer prompt coverage.",
        baselineMeasurementId: "measurement-1",
        changedAt: "2026-09-04T00:00:00.000Z",
        laterMeasurementId: "measurement-2",
        conclusion: "The later window supports the hypothesis.",
      };
  }
};

const requiredKinds: Record<TaskType, readonly EvidenceReference["kind"][]> = {
  approve_essential_brand_facts: ["source", "confirmation"],
  approve_buyer_question_set: ["artifact", "confirmation"],
  establish_measurement_baseline: ["measurement"],
  repair_confirmed_access_or_factual_fault: ["fault_repair"],
  improve_page_for_buyer_need: ["content_change", "confirmation"],
  complete_earned_media_or_community_work: ["authored_work", "confirmation"],
  review_results_and_record_decision: ["measurement", "decision"],
  complete_visibility_experiment: ["experiment", "measurement", "decision"],
};

const evidenceForTask = (taskType: TaskType): EvidenceReference[] =>
  requiredKinds[taskType].map(evidenceFor);

describe("work policy", () => {
  it("covers every approved customer transition", () => {
    const transitions: Array<
      [
        "suggested" | "accepted" | "in_progress" | "reopened" | "waiting_for_observation",
        TaskType,
        Parameters<typeof transitionTask>[2],
        string,
      ]
    > = [
      ["suggested", "approve_essential_brand_facts", { kind: "accept" }, "accepted"],
      [
        "suggested",
        "approve_essential_brand_facts",
        { kind: "dismiss", reason: "Out of scope" },
        "dismissed",
      ],
      [
        "suggested",
        "approve_essential_brand_facts",
        { kind: "mark_not_applicable", reason: "Not relevant" },
        "not_applicable",
      ],
      ["accepted", "approve_essential_brand_facts", { kind: "start" }, "in_progress"],
      [
        "accepted",
        "approve_essential_brand_facts",
        { kind: "dismiss", reason: "Out of scope" },
        "dismissed",
      ],
      [
        "in_progress",
        "approve_essential_brand_facts",
        { kind: "submit", evidence: evidenceForTask("approve_essential_brand_facts") },
        "submitted",
      ],
      ["reopened", "approve_essential_brand_facts", { kind: "start" }, "in_progress"],
      [
        "waiting_for_observation",
        "approve_essential_brand_facts",
        { kind: "reopen", reason: "New evidence" },
        "reopened",
      ],
    ];
    for (const [state, taskType, command, expected] of transitions) {
      expect(transitionTask(state, taskType, command)).toBe(expected);
    }
  });

  it("rejects commands outside the approved graph", () => {
    expect(() =>
      transitionTask("suggested", "approve_essential_brand_facts", { kind: "start" }),
    ).toThrow(expect.objectContaining({ code: "invalid_transition" }));
    expect(() =>
      transitionTask("submitted", "approve_essential_brand_facts", { kind: "start" }),
    ).toThrow(expect.objectContaining({ code: "invalid_transition" }));
    expect(() =>
      transitionTask("verified", "approve_essential_brand_facts", {
        kind: "reopen",
        reason: "Review",
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_transition" }));
    expect(() =>
      transitionTask("dismissed", "approve_essential_brand_facts", {
        kind: "reopen",
        reason: "Review",
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_transition" }));
  });

  it("uses explicit system transitions for verification and observation", () => {
    expect(verifyTask("submitted", { kind: "system_check", checkId: "facts-approved" })).toBe(
      "verified",
    );
    expect(
      verifyTask("submitted", {
        kind: "human_confirmation",
        confirmedByUserId: "user-1",
        note: "Reviewed",
      }),
    ).toBe("verified");
    expect(waitForObservation("verified")).toBe("waiting_for_observation");
    expect(() =>
      verifyTask("in_progress", { kind: "system_check", checkId: "facts-approved" }),
    ).toThrow(expect.objectContaining({ code: "invalid_transition" }));
    expect(() => waitForObservation("submitted")).toThrow(
      expect.objectContaining({ code: "invalid_transition" }),
    );
  });

  it("validates verification fields", () => {
    expect(() => verifyTask("submitted", { kind: "system_check", checkId: "" })).toThrow(
      expect.objectContaining({ code: "invalid_verification" }),
    );
    expect(() =>
      verifyTask("submitted", {
        kind: "human_confirmation",
        confirmedByUserId: "",
        note: "Reviewed",
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_verification" }));
    expect(() =>
      verifyTask("submitted", {
        kind: "human_confirmation",
        confirmedByUserId: "user-1",
        note: "",
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_verification" }));
  });

  it("requires the correct evidence kinds for every task type", () => {
    for (const taskType of TASK_TYPES) {
      expect(validateEvidenceForTask(taskType, evidenceForTask(taskType))).toHaveLength(
        requiredKinds[taskType].length,
      );
      for (const requiredKind of requiredKinds[taskType]) {
        const incomplete = evidenceForTask(taskType).filter(
          (reference) => reference.kind !== requiredKind,
        );
        expect(() => validateEvidenceForTask(taskType, incomplete)).toThrow(
          expect.objectContaining({ code: "missing_evidence" }),
        );
      }
    }
  });

  it("requires evidence before submission", () => {
    expect(() =>
      transitionTask("in_progress", "establish_measurement_baseline", {
        kind: "submit",
        evidence: [],
      }),
    ).toThrow(expect.objectContaining({ code: "missing_evidence" }));
  });

  it("requires valid HTTP or HTTPS source, final, and canonical URLs", () => {
    for (const field of ["sourceUrl", "finalUrl", "canonicalUrl"] as const) {
      const invalid = {
        ...evidenceFor("source"),
        [field]: "javascript:alert(1)",
      } as EvidenceReference;
      expect(() =>
        validateEvidenceForTask("approve_essential_brand_facts", [
          invalid,
          evidenceFor("confirmation"),
        ]),
      ).toThrow(expect.objectContaining({ code: "invalid_evidence" }));
    }
  });

  it("uses all approved point values", () => {
    expect(TASK_TYPES.map(pointsForTask)).toEqual([20, 20, 20, 40, 40, 30, 10, 50]);
  });

  it("requires the threshold and matching capability milestone for every level", () => {
    const levels: Array<[number, CapabilityMilestone, string]> = [
      [0, "goal_selected_and_queue_reviewed", "Start"],
      [60, "baseline_ready", "Ready"],
      [160, "evidenced_changes_complete", "Improve"],
      [320, "decision_recorded", "Learn"],
      [550, "multi_period_maintenance", "Maintain"],
    ];
    for (const [points, milestone, name] of levels) {
      expect(levelForProgress({ points, milestones: new Set([milestone]) }).name).toBe(name);
      if (name !== "Start") {
        expect(levelForProgress({ points, milestones: new Set() }).name).not.toBe(name);
      }
    }
  });

  it("uses a digest over every required award scope field", () => {
    const first = awardKey({
      accountId: "account:one",
      brandId: "brand",
      taskId: "task",
      taskVersion: 1,
      cycleKey: "cycle",
      ruleVersion: 1,
    });
    const second = awardKey({
      accountId: "account",
      brandId: "one:brand",
      taskId: "task",
      taskVersion: 1,
      cycleKey: "cycle",
      ruleVersion: 1,
    });
    expect(first).not.toBe(second);
    expect(first).toMatch(/^work_award_v1_[a-f0-9]{64}$/);
  });

  it("validates evidence before creating an award decision", () => {
    expect(() =>
      awardDecision({
        accountId: "account",
        brandId: "brand",
        taskId: "task",
        taskType: "approve_essential_brand_facts",
        taskVersion: 1,
        cycleKey: "2026-09",
        verification: { kind: "system_check", checkId: "facts" },
        evidence: [evidenceFor("source")],
        awarded: true,
      }),
    ).toThrow(expect.objectContaining({ code: "missing_evidence" }));
    expect(
      awardDecision({
        accountId: "account",
        brandId: "brand",
        taskId: "task",
        taskType: "approve_essential_brand_facts",
        taskVersion: 1,
        cycleKey: "2026-09",
        verification: { kind: "system_check", checkId: "facts" },
        evidence: evidenceForTask("approve_essential_brand_facts"),
        awarded: true,
      }),
    ).toMatchObject({ points: 20, awarded: true });
  });
});
