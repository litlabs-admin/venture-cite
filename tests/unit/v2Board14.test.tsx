// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { board14Fixture } from "@/v2/screens/b14-learn/fixture";
import { Board14Screen, type Board14Data } from "@/v2/screens/b14-learn/Screen";
import { useBoard14Data } from "@/v2/screens/b14-learn/data";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr",
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  },
}));

const searchStub = vi.hoisted(() => ({ value: { mode: "guided" as const } }));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => searchStub.value,
}));

function renderBoard(data: Board14Data = board14Fixture) {
  return render(<Board14Screen data={data} />);
}

function unavailable(reason: string): { kind: "not-measured"; reason: string } {
  return { kind: "not-measured", reason };
}

function withUnavailable(data: Board14Data, field: keyof Board14Data): Board14Data {
  if (field === "learning") {
    return {
      ...data,
      learning: {
        level: unavailable("Learning level is not measured."),
        stage: unavailable("Learning stage is not measured."),
        points: unavailable("Learning points are not measured."),
        nextLevelPoints: unavailable("The next learning threshold is not measured."),
        progressRate: unavailable("Learning progress is not measured."),
        completedLessons: unavailable("Completed lessons are not measured."),
        totalLessons: unavailable("The lesson path is not measured."),
        minutesSpent: unavailable("Learning time is not measured."),
      },
    };
  }
  if (field === "nextLesson") {
    return { ...data, nextLesson: unavailable("The lesson catalog is not available.") };
  }
  if (field === "lessons") {
    return { ...data, lessons: unavailable("The lesson catalog is not available.") };
  }
  return { ...data, recommendedLesson: unavailable("The recommended lesson is not measured.") };
}

const summaryResponse = {
  brandId: "brand-venture-pr",
  points: 160,
  pendingCount: 1,
  milestones: ["evidenced_changes_complete"],
  currentLevel: { level: 3, name: "Improve", points: 160 },
  nextThreshold: { level: 4, name: "Learn", points: 320 },
  goal: { title: "Improve AI visibility", statement: "Increase accurate, verifiable coverage." },
  nextTask: null,
  waitingTasks: [],
  mode: "guided" as const,
};

function renderAdapter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdapterProbe />
    </QueryClientProvider>,
  );
}

function AdapterProbe() {
  const result = useBoard14Data();
  return (
    <output data-testid="adapter-state">
      {result.state.kind}
      {result.data ? `:${result.data.context.brandId}:${result.data.context.mode}` : ""}
    </output>
  );
}

beforeEach(() => {
  brandStub.value = {
    selectedBrandId: "brand-venture-pr",
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  };
  searchStub.value = { mode: "guided" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Board 14 fixture", () => {
  it("renders the title, banner, next lesson, lesson path, and progress rail", () => {
    renderBoard();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Learn what improves AI visibility",
    );
    expect(screen.getByText("A personalized learning path for your current stage")).toBeTruthy();
    expect(screen.getByText("You're in Level 3 · Improve")).toBeTruthy();
    expect(
      screen.getByText("Focus on making changes that increase accurate, verifiable coverage."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your next lesson" })).toBeTruthy();
    expect(screen.getByText("Make brand facts easy to verify")).toBeTruthy();
    expect(screen.getAllByText("8 minutes").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Understand what makes a fact verifiable for AI systems")).toBeTruthy();
    expect(screen.getByTestId("board14-start-lesson")).toHaveTextContent("Start lesson");
    expect(screen.getByRole("heading", { name: "All lessons in your path" })).toBeTruthy();
    expect(screen.getByText("AI answer visibility")).toBeTruthy();
    expect(screen.getByText("Citations and source trust")).toBeTruthy();
    expect(screen.getByText("Outcome attribution")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your learning progress" })).toBeTruthy();
    const rail = screen.getByTestId("board14-progress-rail");
    expect(rail).toHaveTextContent("160 / 320 learning points");
    expect(rail).toHaveTextContent("50%");
    expect(rail).toHaveTextContent("2 of 6");
    expect(screen.getByText("Learning points do not measure visibility.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Need help?" })).toBeTruthy();
  });

  it("keeps internal links scoped to the active brand and mode", () => {
    renderBoard();

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("/v2/")) {
        expect(href).toContain("brandId=brand-venture-pr");
        expect(href).toContain("mode=guided");
      }
    }
  });

  it("keeps completed and locked lesson states distinct", () => {
    renderBoard();
    const lessonRows = screen.getAllByTestId("board14-lesson-row");
    expect(lessonRows).toHaveLength(6);
    expect(within(lessonRows[0]).getByText("Completed")).toBeTruthy();
    expect(within(lessonRows[1]).getByText("Completed")).toBeTruthy();
    expect(within(lessonRows[2]).getByText("Not started")).toBeTruthy();
    expect(within(lessonRows[2]).getByText("After previous lesson")).toBeTruthy();
  });
});

describe("Board 14 unavailable values", () => {
  it("labels unavailable progress instead of rendering numbers", () => {
    renderBoard(withUnavailable(board14Fixture, "learning"));

    const rail = screen.getByTestId("board14-progress-rail");
    expect(rail).toHaveTextContent("Not measured");
    expect(rail).not.toHaveTextContent("160");
    expect(rail).not.toHaveTextContent("320");
    expect(rail).not.toHaveTextContent("50%");
  });

  it("labels an unavailable next lesson and lesson list", () => {
    renderBoard(withUnavailable(withUnavailable(board14Fixture, "nextLesson"), "lessons"));

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Make brand facts easy to verify")).toBeNull();
    expect(screen.queryByText("AI answer visibility")).toBeNull();
  });

  it("labels an unavailable recommendation", () => {
    renderBoard(withUnavailable(board14Fixture, "recommendedLesson"));
    const recommendation = screen.getByTestId("board14-recommendation");
    expect(recommendation).toHaveTextContent("Not measured");
    expect(recommendation).not.toHaveTextContent("Buyer-question design");
  });
});

describe("Board 14 live adapter", () => {
  it("maps the real work-summary response without converting work points into learning points", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: summaryResponse }), { status: 200 }),
      ),
    );

    renderAdapter();
    await waitFor(() =>
      expect(screen.getByTestId("adapter-state")).toHaveTextContent(
        "ready:brand-venture-pr:guided",
      ),
    );
  });

  it("returns loading while the work-summary request is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderAdapter();
    expect(screen.getByTestId("adapter-state")).toHaveTextContent("loading");
  });

  it("returns an error state when the work-summary request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 500 })),
    );

    renderAdapter();
    await waitFor(() => expect(screen.getByTestId("adapter-state")).toHaveTextContent("error"));
  });
});
