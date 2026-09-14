// @vitest-environment happy-dom
//
// Learn used to be a navigable prototype with no lesson content. It now
// opens a real, live screen: board 14's overview (client/src/v2/screens/
// b14-learn/) at `/v2/learn`, and the lesson reader (LessonReader.tsx) at
// `/v2/learn?lesson=<id>`. This file covers the parts LearnPage.tsx itself
// is responsible for - which view mounts for which search param, and that
// both reach real content once the underlying data is ready. Board 14's own
// region-by-region content is covered by tests/unit/v2Board14.test.tsx;
// server/routes/v2Learn.ts's HTTP contract is covered by
// tests/unit/v2LearnRoutes.test.ts.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { WorkSummaryView } from "@/v2/data/workSummary";
import type { V2LearnCompletion } from "@/v2/data/learnProgress";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr" as string | null,
    brands: [{ id: "brand-venture-pr" }] as { id: string }[],
    isLoading: false,
  },
}));

const routerStub = vi.hoisted(() => ({
  pathname: "/v2/learn",
  search: {} as Record<string, unknown>,
  matches: [{ staticData: { v2Shell: "guided" } }],
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...rest
  }: {
    children?: React.ReactNode;
    to?: string;
    search?:
      Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>);
  }) => {
    const resolvedSearch = typeof search === "function" ? search(routerStub.search) : search;
    return (
      <a href={to} data-search={JSON.stringify(resolvedSearch)} {...rest}>
        {children}
      </a>
    );
  },
  useMatches: () => routerStub.matches,
  useNavigate: () => routerStub.navigate,
  useRouterState: (options?: { select?: (state: unknown) => unknown }) =>
    options?.select
      ? options.select({ location: { pathname: routerStub.pathname } })
      : { location: { pathname: routerStub.pathname } },
  useSearch: () => routerStub.search,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "engineering@litlabs.io",
      firstName: null,
      lastName: null,
      accessTier: "pro",
      profileImageUrl: null,
    },
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
    isLoggingOut: false,
  }),
}));

// The wordmark imports an svg through the `@assets` alias, which the vitest
// resolver does not carry. Stubbed exactly as v2Shell.test.tsx does.
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("@/components/BrandSelector", () => ({
  default: () => <div data-testid="brand-selector" />,
}));

const completeLessonMock = vi.hoisted(() => vi.fn());

vi.mock("@/v2/data/workSummary", async () => {
  const actual =
    await vi.importActual<typeof import("@/v2/data/workSummary")>("@/v2/data/workSummary");
  return { ...actual, useWorkSummary: vi.fn() };
});

vi.mock("@/v2/data/learnProgress", async () => {
  const actual =
    await vi.importActual<typeof import("@/v2/data/learnProgress")>("@/v2/data/learnProgress");
  return {
    ...actual,
    useLearnProgress: vi.fn(),
    useCompleteLesson: () => ({
      mutate: completeLessonMock,
      isPending: false,
      isError: false,
    }),
  };
});

const LearnPage = (await import("@/v2/learn/LearnPage")).default;
const { V2Shell } = await import("@/v2/shell/V2Shell");
const { V2Nav } = await import("@/v2/shell/V2Nav");
const { useWorkSummary } = await import("@/v2/data/workSummary");
const { useLearnProgress } = await import("@/v2/data/learnProgress");

const mockedUseWorkSummary = vi.mocked(useWorkSummary);
const mockedUseLearnProgress = vi.mocked(useLearnProgress);

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function queryResult<T>(data: T, overrides: Record<string, unknown> = {}) {
  return {
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    isStale: false,
    dataUpdatedAt: Date.parse("2026-09-15T10:00:00.000Z"),
    ...overrides,
  } as never;
}

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-venture-pr",
    points: 20,
    pendingCount: 7,
    milestones: ["goal_selected_and_queue_reviewed"],
    currentLevel: { level: 1, name: "Start", points: 0 },
    nextThreshold: { level: 2, name: "Ready", points: 60 },
    goal: null,
    nextTask: null,
    waitingTasks: [],
    mode: "guided",
    ...overrides,
  };
}

function renderInShell() {
  return render(
    <V2Shell>
      <LearnPage />
    </V2Shell>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  brandStub.value = {
    selectedBrandId: "brand-venture-pr",
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  };
  routerStub.pathname = "/v2/learn";
  routerStub.search = {};
  mockedUseWorkSummary.mockReturnValue(queryResult(summary()));
  mockedUseLearnProgress.mockReturnValue(queryResult({ completions: [] as V2LearnCompletion[] }));
});

describe("Learn navigation", () => {
  it("is a real nav destination, not a Soon row", () => {
    render(
      <V2Nav
        variant="guided"
        pathname={routerStub.pathname}
        brandId="brand-venture-pr"
        mode="guided"
        search={routerStub.search}
      />,
    );
    const row = screen.getByText("Learn").closest("[data-v2-nav]");
    expect(row).toBeTruthy();
    expect(row?.getAttribute("aria-disabled")).toBeNull();
    expect(row?.tagName.toLowerCase()).toBe("a");
    expect(row?.getAttribute("href")).toBe("/v2/learn");
    expect(within(row as HTMLElement).queryByText(/soon/i)).toBeNull();
  });

  it("has a route file behind that href", () => {
    const source = readFileSync(
      path.join(REPO_ROOT, "src", "routes", "_app", "v2.learn.tsx"),
      "utf8",
    );
    expect(source).toContain('createFileRoute("/_app/v2/learn")');
    expect(source).toContain("LearnPage");
  });

  it("is registered in the generated route tree under the gated v2 parent", () => {
    const tree = readFileSync(path.join(REPO_ROOT, "src", "routeTree.gen.ts"), "utf8");
    expect(tree).toContain("'/_app/v2/learn'");
    expect(tree).toContain("AppV2LearnRoute: typeof AppV2LearnRoute");
    expect(tree).toMatch(/AppV2LearnRoute = AppV2LearnRouteImport\.update\(\{[\s\S]*?AppV2Route/);
  });
});

describe("Learn overview (no ?lesson param)", () => {
  it("mounts the real board 14 overview inside the shell's main region", () => {
    const { container } = renderInShell();
    const main = container.querySelector("#v2-main-content");
    expect(main).toBeTruthy();
    expect(within(main as HTMLElement).getByTestId("board14-screen")).toBeTruthy();
    expect(container.querySelector("aside")?.className).toContain("w-[200px]");
  });

  it("names a real lesson, not a placeholder, and never claims the area is unwritten", () => {
    const { container } = renderInShell();
    const text = (container.querySelector("#v2-main-content") as HTMLElement).textContent ?? "";

    expect(text).toContain("AI answer visibility");
    expect(text).not.toMatch(/not ready yet/i);
    expect(text).not.toMatch(/no lessons have been written/i);
    expect(text).not.toMatch(/\bsoon\b/i);
    expect(text).not.toMatch(/coming soon/i);
    expect(text).not.toMatch(/prototype/i);
  });

  it("every lesson row links to the lesson reader via ?lesson=", () => {
    renderInShell();
    for (const row of screen.getAllByTestId("board14-lesson-row")) {
      const link = row.closest("a");
      expect(link?.getAttribute("href")).toMatch(/[?&]lesson=/);
    }
  });

  it("shows a loading skeleton while brands are still loading, and no lesson content yet", () => {
    brandStub.value = { selectedBrandId: null, brands: [], isLoading: true };
    const { container } = renderInShell();
    expect(container.querySelector('[data-testid="v2-state-loading"]')).toBeTruthy();
    expect(screen.queryByTestId("board14-screen")).toBeNull();
  });

  // This tree's gate does not redirect a brand-less account away (see
  // src/routes/_app/v2.tsx), so the case is reachable and must be named
  // rather than left blank.
  it("names the no-brand case honestly instead of showing lesson content", () => {
    brandStub.value = { selectedBrandId: null, brands: [], isLoading: false };
    const { container } = renderInShell();
    expect(container.querySelector('[data-testid="v2-state-empty"]')).toBeTruthy();
    expect(screen.queryByTestId("board14-screen")).toBeNull();
  });
});

describe("Learn lesson reader (?lesson=<id>)", () => {
  it("renders the named lesson's real content and its learning goals", () => {
    routerStub.search = { lesson: "citations-and-source-trust" };
    renderInShell();

    expect(screen.getByRole("heading", { name: "Citations and source trust" })).toBeInTheDocument();
    expect(screen.getByTestId("v2-lesson-why")).toBeTruthy();
    expect(screen.getByTestId("v2-lesson-sections").textContent).toMatch(/source hierarchy/i);
    expect(screen.getByText("Lesson 2 of 6")).toBeInTheDocument();
  });

  it("shows Mark complete when not yet completed, and calls the completion mutation", () => {
    routerStub.search = { lesson: "ai-answer-visibility" };
    renderInShell();

    const button = screen.getByTestId("v2-lesson-mark-complete");
    fireEvent.click(button);
    expect(completeLessonMock).toHaveBeenCalledWith({
      lessonId: "ai-answer-visibility",
      brandId: "brand-venture-pr",
    });
  });

  it("shows a completed badge instead of the button once the progress endpoint reports it done", () => {
    mockedUseLearnProgress.mockReturnValue(
      queryResult({
        completions: [
          {
            lessonId: "ai-answer-visibility",
            completedAt: "2026-09-10T12:00:00.000Z",
            brandId: "brand-venture-pr",
          },
        ] as V2LearnCompletion[],
      }),
    );
    routerStub.search = { lesson: "ai-answer-visibility" };
    renderInShell();

    expect(screen.getByTestId("v2-lesson-completed-badge")).toBeTruthy();
    expect(screen.queryByTestId("v2-lesson-mark-complete")).toBeNull();
  });

  it("links to the next lesson, and to the overview from the last lesson", () => {
    routerStub.search = { lesson: "ai-answer-visibility" };
    const { unmount } = renderInShell();
    expect(screen.getByTestId("v2-lesson-next").textContent).toMatch(/citations and source trust/i);
    unmount();

    routerStub.search = { lesson: "outcome-attribution" };
    renderInShell();
    expect(screen.getByTestId("v2-lesson-finish")).toBeTruthy();
    expect(screen.queryByTestId("v2-lesson-next")).toBeNull();
  });

  it("falls back to the overview for an id outside the six-lesson catalog", () => {
    routerStub.search = { lesson: "not-a-real-lesson" };
    renderInShell();

    expect(screen.getByTestId("board14-screen")).toBeTruthy();
    expect(screen.queryByTestId("v2-lesson-reader")).toBeNull();
  });
});
