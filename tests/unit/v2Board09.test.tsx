// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { board09Fixture } from "@/v2/screens/b09-visibility-evidence/fixture";
import {
  Board09Screen,
  type Board09Data,
  type Board09QuerySnapshot,
} from "@/v2/screens/b09-visibility-evidence/Screen";
import {
  board09ResultFromQueries,
  mapBoard09Queries,
} from "@/v2/screens/b09-visibility-evidence/data";

function withMentionRate(mentionRate: Board09Data["visibility"]["mentionRate"]): Board09Data {
  return {
    ...board09Fixture,
    visibility: { ...board09Fixture.visibility, mentionRate },
  };
}

describe("Board 09 visibility evidence", () => {
  it("renders the approved evidence layout and its key values", () => {
    render(<Board09Screen data={board09Fixture} />);

    expect(screen.getByRole("heading", { name: "Visibility and evidence" })).toBeTruthy();
    expect(screen.getByTestId("board09-rate-value")).toHaveTextContent("45%");
    expect(screen.getByText("18 of 40 successful answers")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Mentions" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Recommendations" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Citations" })).toBeTruthy();
    expect(screen.getByText("Last 14 days")).toBeTruthy();
    expect(screen.getByText("Mention rate")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("Aug 26")).toBeTruthy();
    expect(
      screen.getByText("Controlled test answers. These are not customer conversations."),
    ).toBeTruthy();
    expect(screen.getByText("160")).toBeTruthy();
    expect(screen.getByText("Two distinct changes verified")).toBeTruthy();
    expect(screen.getByText("Service description corrected")).toBeTruthy();
    expect(screen.getByText("/services")).toBeTruthy();
    expect(screen.getByText("Text checked")).toBeTruthy();
    expect(screen.getAllByText("Verified")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Measurement coverage" })).toBeTruthy();
    expect(screen.getByText("Successful answers")).toBeTruthy();
    expect(screen.getAllByText("40").length).toBeGreaterThan(0);
    expect(screen.getByText("Engines observed")).toBeTruthy();
    expect(screen.getByText("ChatGPT")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open results review" })).toBeTruthy();
  });

  it.each([
    ["not-measured", "Not measured"],
    ["failed", "Failed"],
    ["stale", "Stale"],
  ] as const)("renders the %s state label instead of a rate", (kind, label) => {
    const state =
      kind === "stale"
        ? { kind, value: 0.45, asOf: "2026-09-08T10:21:00.000Z" }
        : { kind, reason: "The measurement is unavailable." };

    render(<Board09Screen data={withMentionRate(state)} />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByTestId("board09-rate-value")).toBeNull();
  });

  it("shows every visibility tab, linking Answers as the active one", () => {
    render(<Board09Screen data={board09Fixture} />);

    for (const label of [
      "Overview",
      "Answers",
      "Citations",
      "Buyer questions",
      "Competitors",
      "Results",
      "Report",
      "Outcome review",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Answers" })).toHaveAttribute("aria-current", "page");
  });

  it("sends verified work to the work queue, not the page-changes feed", () => {
    render(<Board09Screen data={board09Fixture} />);

    const href = screen.getByRole("link", { name: /View all verified work/i }).getAttribute("href");
    expect(href).toContain("/v2/my-work");
  });
});

const snapshot: Board09QuerySnapshot = {
  brandId: "brand-1",
  rate: {
    data: {
      measured: 40,
      cited: 18,
      failed: 2,
      observed: 42,
      mentionRate: 0.45,
      weeks: [
        { weekStart: "2026-08-26", cited: 3, measured: 10, failed: 0, mentionRate: 0.3 },
        { weekStart: "2026-09-08", cited: 18, measured: 40, failed: 2, mentionRate: 0.45 },
      ],
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  hero: {
    data: {
      visibilityScore: 45,
      visibilityDelta: 0,
      citedChecks: 18,
      totalChecks: 40,
      citationRate: 45,
      lastScanAt: "2026-09-08T10:21:00.000Z",
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  cited: {
    data: {
      total: 3,
      truncated: false,
      items: [
        {
          platform: "ChatGPT",
          prompt: "Which service helps teams improve visibility?",
          url: "https://venturepr.example/services",
          citedAt: "2026-09-08T10:21:00.000Z",
        },
      ],
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  engines: {
    data: {
      platforms: [
        {
          aiPlatform: "ChatGPT",
          isLive: true,
          rank: 1,
          citedCount: 10,
          totalCount: 10,
          visibilityScore: 100,
          strengthLabel: "Strong",
          latestSnippet: null,
          latestSnippetPrompt: null,
          isCitedSnippet: true,
        },
      ],
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  approvedQuestions: {
    data: {
      items: [
        {
          state: "verified",
          updatedAt: "2026-09-08T10:21:00.000Z",
          completionRule: {
            questionIds: ["q-1", "q-2", "q-3", "q-4", "q-5", "q-6", "q-7", "q-8", "q-9", "q-10"],
          },
        },
      ],
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  work: {
    data: {
      items: [
        {
          id: "event-1",
          taskId: "task-1",
          brandId: "brand-1",
          taskVersion: 1,
          taskTitle: "Service description corrected",
          taskType: "improve_page_for_buyer_need",
          revision: 2,
          priorState: "submitted",
          state: "verified",
          actorId: "user-1",
          actorKind: "user",
          reason: null,
          verificationMethod: {
            kind: "human_confirmation",
            confirmedByUserId: "user-1",
            note: "Checked",
          },
          occurredAt: "2026-09-08T10:21:00.000Z",
        },
      ],
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  awards: {
    data: {
      items: [
        {
          id: "award-event-1",
          taskId: "task-1",
          brandId: "brand-1",
          taskVersion: 1,
          taskTitle: "Service description corrected",
          taskType: "improve_page_for_buyer_need",
          revision: 2,
          priorState: "submitted",
          state: "verified",
          actorId: "user-1",
          actorKind: "user",
          reason: null,
          verificationMethod: {
            kind: "human_confirmation",
            confirmedByUserId: "user-1",
            note: "Checked",
          },
          occurredAt: "2026-09-08T10:21:00.000Z",
          award: {
            awardKey: "award-1",
            points: 40,
            taskType: "improve_page_for_buyer_need",
            taskVersion: 1,
            ruleVersion: 1,
            cycleKey: "2026-09-08",
            verification: {
              kind: "human_confirmation",
              confirmedByUserId: "user-1",
              note: "Checked",
            },
            evidenceCount: 1,
            awarded: true,
            awardedAt: "2026-09-08T10:21:00.000Z",
            awardStatus: "awarded",
          },
        },
      ],
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  summary: {
    data: {
      brandId: "brand-1",
      points: 160,
      pendingCount: 0,
      milestones: [],
      currentLevel: { level: 3, name: "Improve", points: 160 },
      nextThreshold: { level: 4, name: "Learn", points: 320 },
      goal: null,
      nextTask: { points: 10 },
      waitingTasks: [],
      mode: "expert",
    },
    isPending: false,
    isError: false,
    isStale: false,
  },
  review: {
    data: { items: [{ points: 10 }] },
    isPending: false,
    isError: false,
    isStale: false,
  },
};

describe("Board 09 live adapter", () => {
  it("maps the representative API projections into the screen contract", () => {
    const result = mapBoard09Queries(snapshot);

    expect(result.visibility.mentionRate).toEqual({ kind: "measured", value: 0.45 });
    expect(result.visibility.mentioned).toEqual({ kind: "measured", value: 18 });
    expect(result.visibility.successfulAnswers).toEqual({ kind: "measured", value: 40 });
    expect(result.visibility.failedAttempts).toEqual({ kind: "measured", value: 2 });
    expect(result.visibility.approvedQuestions).toEqual({ kind: "measured", value: 10 });
    expect(result.sourceEvidence).toMatchObject({ kind: "measured" });
    expect(
      result.sourceEvidence.kind === "measured" ? result.sourceEvidence.value[0] : undefined,
    ).toMatchObject({
      sourcePath: "/services",
      checkType: "ChatGPT",
      checkedAt: "8 Sep, 10:21",
    });
    expect(
      result.observedEngines.kind === "measured" ? result.observedEngines.value[0] : undefined,
    ).toMatchObject({ name: "ChatGPT", answerCount: { kind: "measured", value: 10 } });
    expect(result.verifiedWork.totalPoints).toEqual({ kind: "measured", value: 160 });
    expect(result.review.rewardPoints).toEqual({ kind: "measured", value: 10 });
    expect(result.review.businessResults.kind).toBe("not-measured");
  });

  it("returns loading, error, and not-measured states from query conditions", () => {
    expect(board09ResultFromQueries({ ...snapshot, loading: true })).toEqual({
      state: { kind: "loading" },
    });

    expect(
      board09ResultFromQueries({ ...snapshot, rate: { ...snapshot.rate, isError: true } }),
    ).toEqual({ state: { kind: "error", message: "Visibility measurement could not be loaded." } });

    const noMeasurement = {
      ...snapshot,
      rate: {
        ...snapshot.rate,
        data: {
          ...snapshot.rate.data!,
          measured: 0,
          cited: 0,
          failed: 0,
          observed: 0,
          mentionRate: 0,
        },
      },
    };
    expect(board09ResultFromQueries(noMeasurement)).toEqual({
      state: {
        kind: "not-measured",
        reason: "No controlled answer has been measured for this brand.",
      },
    });
  });
});
