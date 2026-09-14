// @vitest-environment happy-dom
//
// Board 14 (Learn overview), live. Two things are under test:
//   - Board14Screen renders every real region from real data, with no
//     fabricated "not measured" placeholder anywhere a value is genuinely
//     known once the screen is ready (unlike boards whose individual metrics
//     can independently fail, Learn's only real absence is "no more lessons
//     to recommend", which gets its own honest copy - not a generic badge).
//   - mapBoard14Data (client/src/v2/screens/b14-learn/data.ts) turns a real
//     work-summary response shape (captured 2026-09-15 via
//     GET /api/brands/470b15fe-606b-4d96-ab62-69a01e08b237/work/summary
//     against the local branch `feat/screens` dev server, brand "Venture
//     PR") and a completions list into the screen contract correctly.

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Board14Screen, type Board14Data } from "@/v2/screens/b14-learn/Screen";
import { board14Fixture } from "@/v2/screens/b14-learn/fixture";
import { mapBoard14Data, LEARNING_STAGES } from "@/v2/screens/b14-learn/data";
import type { WorkSummaryView } from "@/v2/data/workSummary";
import type { V2LearnCompletion } from "@/v2/data/learnProgress";
import { V2_LESSONS, V2_TOTAL_LESSON_POINTS } from "@shared/v2Lessons";
import { V2_ICON_NAMES } from "@/v2/contracts/icons";

// The real shape GET /api/brands/:id/work/summary returned for Venture PR
// (brandId 470b15fe-606b-4d96-ab62-69a01e08b237) on the running feat/screens
// dev server, via the LIVE-RULES token-mint recipe. Only the fields
// mapBoard14Data reads are asserted on below, but the whole captured object
// is kept so the fixture stays a faithful shape, not a hand-trimmed one.
const REAL_WORK_SUMMARY: WorkSummaryView = {
  brandId: "470b15fe-606b-4d96-ab62-69a01e08b237",
  points: 20,
  pendingCount: 7,
  milestones: ["goal_selected_and_queue_reviewed"],
  currentLevel: { level: 1, name: "Start", points: 0 },
  nextThreshold: { level: 2, name: "Ready", points: 60 },
  goal: {
    title: "Help buyers find accurate information about Venture PR",
    statement:
      "Buyers researching Venture PR should find correct, current facts about it wherever they ask, not stale or fabricated claims.",
  },
  nextTask: null,
  waitingTasks: [],
  mode: "guided",
};

function completion(
  lessonId: string,
  overrides: Partial<V2LearnCompletion> = {},
): V2LearnCompletion {
  return {
    lessonId,
    completedAt: "2026-09-10T12:00:00.000Z",
    brandId: REAL_WORK_SUMMARY.brandId,
    ...overrides,
  };
}

describe("shared/v2Lessons content", () => {
  it("uses only real V2Icon names", () => {
    for (const lesson of V2_LESSONS) {
      expect(V2_ICON_NAMES).toContain(lesson.icon);
    }
  });

  it("has exactly the six lessons the board lists, each with content", () => {
    expect(V2_LESSONS.map((lesson) => lesson.id)).toEqual([
      "ai-answer-visibility",
      "citations-and-source-trust",
      "buyer-question-design",
      "site-accessibility-for-ai",
      "experiment-limits",
      "outcome-attribution",
    ]);
    for (const lesson of V2_LESSONS) {
      expect(lesson.sections.length).toBeGreaterThan(0);
      expect(lesson.goals.length).toBeGreaterThan(0);
      expect(lesson.points).toBe(lesson.durationMinutes * 5);
    }
  });
});

describe("mapBoard14Data", () => {
  it("maps the real work summary and an empty completion list honestly", () => {
    const data = mapBoard14Data(REAL_WORK_SUMMARY, [], "guided");

    expect(data.context.brandId).toBe(REAL_WORK_SUMMARY.brandId);
    expect(data.banner.label).toBe("Real work level: Start (Level 1)");
    expect(data.lessons.every((lesson) => lesson.state === "not-started")).toBe(true);
    expect(data.nextLesson?.id).toBe("ai-answer-visibility");
    expect(data.recommendedLesson?.id).toBe("ai-answer-visibility");
    expect(data.learning).toEqual({
      level: 1,
      stage: LEARNING_STAGES[0],
      points: 0,
      totalPoints: V2_TOTAL_LESSON_POINTS,
      progressRate: 0,
      completedLessons: 0,
      totalLessons: 6,
      minutesSpent: 0,
    });
  });

  it("sums points and minutes only over completed lessons", () => {
    const data = mapBoard14Data(
      REAL_WORK_SUMMARY,
      [completion("ai-answer-visibility"), completion("citations-and-source-trust")],
      "guided",
    );

    expect(data.learning.completedLessons).toBe(2);
    expect(data.learning.points).toBe(30 + 40); // 6*5 + 8*5
    expect(data.learning.minutesSpent).toBe(6 + 8);
    expect(data.learning.stage).toBe(LEARNING_STAGES[2]);
    expect(data.learning.level).toBe(3);
    expect(data.nextLesson?.id).toBe("buyer-question-design");
    expect(data.recommendedLesson?.id).toBe("buyer-question-design");

    const first = data.lessons.find((lesson) => lesson.id === "ai-answer-visibility");
    expect(first?.state).toBe("completed");
    expect(first?.completedAt).toBe("2026-09-10T12:00:00.000Z");
    const third = data.lessons.find((lesson) => lesson.id === "buyer-question-design");
    expect(third?.state).toBe("not-started");
    expect(third?.prerequisite).toBe("After Citations and source trust");
  });

  it("reports no next or recommended lesson once every lesson is complete", () => {
    const data = mapBoard14Data(
      REAL_WORK_SUMMARY,
      V2_LESSONS.map((lesson) => completion(lesson.id)),
      "guided",
    );

    expect(data.nextLesson).toBeNull();
    expect(data.recommendedLesson).toBeNull();
    expect(data.learning.completedLessons).toBe(6);
    expect(data.learning.points).toBe(V2_TOTAL_LESSON_POINTS);
    expect(data.learning.progressRate).toBe(1);
    expect(data.learning.stage).toBe("Course complete");
  });
});

describe("Board14Screen render", () => {
  it("renders every real region with the fixture's values", () => {
    render(<Board14Screen data={board14Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Learn what improves AI visibility" }),
    ).toBeInTheDocument();
    expect(screen.getByText(board14Fixture.banner.label)).toBeInTheDocument();
    expect(screen.getByTestId("board14-next-lesson")).toHaveTextContent(
      board14Fixture.nextLesson!.title,
    );
    expect(screen.getAllByTestId("board14-lesson-row")).toHaveLength(6);
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not started").length).toBeGreaterThan(0);
    expect(
      screen.getByText(`Level ${board14Fixture.learning.level} · ${board14Fixture.learning.stage}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${board14Fixture.learning.points} / ${board14Fixture.learning.totalPoints}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Learning points do not measure visibility.")).toBeInTheDocument();

    // "Open help center" links back to the lesson list - there is no real
    // help-center route to send it to, and this tree never links to one that
    // doesn't exist.
    const helpLink = screen.getByTestId("board14-help-link");
    expect(helpLink.getAttribute("href")).toMatch(/^\/v2\/learn\?/);
  });

  it("every lesson row and the start-lesson button link into the lesson reader via ?lesson=", () => {
    render(<Board14Screen data={board14Fixture} />);

    for (const row of screen.getAllByTestId("board14-lesson-row")) {
      const link = row.closest("a");
      expect(link?.getAttribute("href")).toMatch(/[?&]lesson=/);
    }
    const start = screen.getByTestId("board14-start-lesson").closest("a");
    expect(start?.getAttribute("href")).toMatch(/[?&]lesson=/);
  });

  it("states plainly that the path is complete instead of a generic unavailable badge", () => {
    const data: Board14Data = {
      ...board14Fixture,
      nextLesson: null,
      recommendedLesson: null,
    };
    render(<Board14Screen data={data} />);

    expect(screen.getByTestId("board14-next-lesson-complete")).toHaveTextContent(
      /completed every lesson/i,
    );
    expect(screen.getByTestId("board14-recommendation-complete")).toHaveTextContent(
      /every lesson in the path is complete/i,
    );
    expect(screen.queryByText("Not measured")).toBeNull();
  });

  it("carries brandId and mode on the banner and rail links", () => {
    render(<Board14Screen data={board14Fixture} />);

    const links = within(screen.getByTestId("board14-progress-rail")).getAllByRole("link");
    const todayLink = screen.getByRole("link", { name: /see your progress/i });
    for (const link of [...links, todayLink]) {
      const href = link.getAttribute("href") ?? "";
      expect(href).toContain(`brandId=${board14Fixture.context.brandId}`);
      expect(href).toContain(`mode=${board14Fixture.context.mode}`);
    }
  });
});
