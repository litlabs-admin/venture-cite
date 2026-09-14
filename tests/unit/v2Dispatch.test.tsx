import { describe, expect, it } from "vitest";
import { SCREENS } from "@/v2/screens/registry";
import { DIAGNOSTICS_TABS } from "@/v2/dispatch/diagnosticsTabs";
import { SETTINGS_TABS } from "@/v2/dispatch/settingsTabs";
import {
  taskDetailDispatch,
  type TaskDetailDispatchSummary,
} from "@/v2/dispatch/taskDetailDispatch";
import { todayDispatch, type TodayDispatchSummary } from "@/v2/dispatch/todayDispatch";
import { VISIBILITY_TABS } from "@/v2/dispatch/visibilityTabs";

function boardForRoute(route: () => unknown): string | undefined {
  return Object.entries(SCREENS).find(([, entry]) => entry.Route === route)?.[0];
}

function todaySummary(overrides: Partial<TodayDispatchSummary> = {}): TodayDispatchSummary {
  return {
    measurement: {
      kind: "available",
      failedAttempts: 0,
      reliabilityThreshold: 2,
      isStale: false,
    },
    baselineComplete: false,
    goalSet: true,
    levelCompletedSinceLastSeen: false,
    ...overrides,
  };
}

function taskSummary(
  overrides: Partial<TaskDetailDispatchSummary> = {},
): TaskDetailDispatchSummary {
  return {
    taskType: "improve_page_for_buyer_need",
    taskKey: "content:bofu:page-1",
    state: "in_progress",
    ...overrides,
  };
}

describe("today dispatch", () => {
  it("selects board 45 when the brand has no measurement", () => {
    const route = todayDispatch(
      todaySummary({ measurement: { kind: "none", reason: "No measurement exists." } }),
    );

    expect(boardForRoute(route)).toBe("b45");
  });

  it("selects board 33 when the baseline is complete without a goal", () => {
    const route = todayDispatch(todaySummary({ baselineComplete: true, goalSet: false }));

    expect(boardForRoute(route)).toBe("b33");
  });

  it("selects board 46 when failed attempts exceed the reliability threshold", () => {
    const route = todayDispatch(
      todaySummary({
        measurement: {
          kind: "available",
          failedAttempts: 3,
          reliabilityThreshold: 2,
          isStale: false,
        },
      }),
    );

    expect(boardForRoute(route)).toBe("b46");
  });

  it("selects board 46 when the latest measurement is stale", () => {
    const route = todayDispatch(
      todaySummary({
        measurement: {
          kind: "available",
          failedAttempts: 0,
          reliabilityThreshold: 2,
          isStale: true,
        },
      }),
    );

    expect(boardForRoute(route)).toBe("b46");
  });

  it("selects board 47 after a level completion that the user has not seen", () => {
    const route = todayDispatch(todaySummary({ levelCompletedSinceLastSeen: true }));

    expect(boardForRoute(route)).toBe("b47");
  });

  it("selects board 01 for the ordinary measured state", () => {
    const route = todayDispatch(todaySummary());

    expect(boardForRoute(route)).toBe("b01");
  });

  it("never selects the board 02 alternate design", () => {
    const routes = [
      todayDispatch(todaySummary({ measurement: { kind: "none", reason: "none" } })),
      todayDispatch(todaySummary({ baselineComplete: true, goalSet: false })),
      todayDispatch(
        todaySummary({
          measurement: {
            kind: "available",
            failedAttempts: 3,
            reliabilityThreshold: 2,
            isStale: false,
          },
        }),
      ),
      todayDispatch(todaySummary({ levelCompletedSinceLastSeen: true })),
      todayDispatch(todaySummary()),
    ];

    expect(routes.every((route) => boardForRoute(route) !== "b02")).toBe(true);
  });

  it("uses the documented priority when multiple Today conditions are true", () => {
    const route = todayDispatch(
      todaySummary({
        measurement: { kind: "none", reason: "No measurement exists." },
        baselineComplete: true,
        goalSet: false,
        levelCompletedSinceLastSeen: true,
      }),
    );

    expect(boardForRoute(route)).toBe("b45");
  });
});

describe("task detail dispatch", () => {
  it("uses board 04 for factual or access repair tasks", () => {
    const route = taskDetailDispatch(
      taskSummary({ taskType: "repair_confirmed_access_or_factual_fault" }),
    );

    expect(boardForRoute(route)).toBe("b04");
  });

  it("uses board 06 for a buyer-guide editor step", () => {
    const route = taskDetailDispatch(taskSummary({ step: "editor", contentKind: "buyer-guide" }));

    expect(boardForRoute(route)).toBe("b06");
  });

  it("uses board 19 for an ordinary content editor step", () => {
    const route = taskDetailDispatch(taskSummary({ step: "editor", contentKind: "other" }));

    expect(boardForRoute(route)).toBe("b19");
  });

  it.each([
    ["revision", "b15"],
    ["publication-check", "b16"],
    ["confirmation", "b05"],
  ] as const)("selects the matching board for the %s step", (step, board) => {
    const route = taskDetailDispatch(taskSummary({ step }));

    expect(boardForRoute(route)).toBe(board);
  });

  it("uses board 17 for experiment-backed tasks", () => {
    const route = taskDetailDispatch(
      taskSummary({ taskType: "complete_visibility_experiment", taskKey: "experiment:bofu:1" }),
    );

    expect(boardForRoute(route)).toBe("b17");
  });

  it("defaults an unclassifiable content step to board 19", () => {
    const route = taskDetailDispatch(taskSummary({ step: undefined }));

    expect(boardForRoute(route)).toBe("b19");
  });

  it("defaults unsupported task types to board 19", () => {
    const route = taskDetailDispatch(
      taskSummary({
        taskType: "approve_buyer_question_set",
        taskKey: "questions:g1:set-1",
        state: "suggested",
      }),
    );

    expect(boardForRoute(route)).toBe("b19");
  });
});

describe("shared tab registries", () => {
  it("defines all five Diagnostics tabs with their board routes", () => {
    expect(DIAGNOSTICS_TABS).toEqual([
      { label: "Site health", route: "/v2/diagnostics/site-health", board: "b18" },
      { label: "GEO signals", route: "/v2/diagnostics/geo-signals", board: "b12" },
      { label: "Perception", route: "/v2/diagnostics/perception", board: "b13" },
      { label: "Prompt diagnosis", route: "/v2/diagnostics/prompts", board: "b11" },
      {
        label: "Competitor gap",
        route: "/v2/diagnostics/competitor-gap",
        board: "b38",
      },
    ]);
  });

  it("defines the rendered Visibility tab destinations", () => {
    expect(VISIBILITY_TABS).toEqual([
      { label: "Overview", route: "/v2/visibility", board: "b08" },
      { label: "Answers", route: "/v2/visibility/evidence", board: "b09" },
      { label: "Citations", route: "/v2/visibility/citations", board: "b37" },
      { label: "Competitors", route: "/v2/diagnostics/competitor-gap", board: "b38" },
      { label: "Results", route: "/v2/visibility/results", board: "b10" },
    ]);
  });

  it("defines the rendered Settings tab destinations", () => {
    expect(SETTINGS_TABS).toEqual([
      { label: "Brand", route: "/v2/settings", board: "b24" },
      { label: "Measurement", route: "/v2/settings", board: "b24" },
      { label: "Team", route: "/v2/settings/team", board: "b42" },
      { label: "Notifications", route: "/v2/notifications", board: "b43" },
      { label: "Privacy", route: "/privacy", board: "b24" },
    ]);
  });
});
