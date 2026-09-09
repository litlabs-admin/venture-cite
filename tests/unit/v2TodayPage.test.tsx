// @vitest-environment happy-dom
//
// Today, in every state it can actually reach.
//
// The four fixture brands map onto these branches: Venture PR is the
// populated case, Narwal and DROS AI differ only in what their tasks say,
// Feather is the empty one, and a brand-less account is the zero-brand one.
// Loading and error are reachable on every brand, so they are covered here
// rather than left to be discovered in the browser.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { WorkSummaryView, WorkTaskSummaryView } from "@/v2/data/workSummary";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "Venture PR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  } as {
    selectedBrandId: string;
    selectedBrand: { id: string; name: string } | undefined;
    brands: { id: string }[];
    isLoading: boolean;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: React.ReactNode; to?: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

// recharts measures its container, and happy-dom reports every element as
// 0x0, so ResponsiveContainer renders nothing and warns. The chart's own
// geometry is a visual matter judged against the artboard; what these tests
// own is which branch renders and what it says.
vi.mock("recharts", async () => {
  const stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: stub,
    AreaChart: stub,
    Area: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

const TodayPage = (await import("@/v2/today/TodayPage")).default;

function task(overrides: Partial<WorkTaskSummaryView> = {}): WorkTaskSummaryView {
  return {
    id: "task-1",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "key-1",
    taskVersion: 1,
    type: "repair_confirmed_access_or_factual_fault",
    state: "suggested",
    revision: 0,
    title: "Correct the service description",
    desiredResult: "The public page agrees with the approved facts.",
    buyerNeed: "Where does this company operate?",
    recommendedChange: "Your approved service region is India.",
    reason: "Your services page says worldwide.",
    confidence: 0.9,
    effort: 15,
    points: 40,
    nextCheckAt: null,
    ownerId: null,
    ownerName: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-venture-pr",
    points: 120,
    pendingCount: 2,
    milestones: ["goal_selected_and_queue_reviewed", "baseline_ready"],
    currentLevel: { level: 2, name: "Ready", points: 60 },
    nextThreshold: { level: 3, name: "Improve", points: 160 },
    goal: {
      title: "Accurate information",
      statement: "Help buyers find accurate information about VenturePR",
    },
    nextTask: task(),
    waitingTasks: [
      task({ id: "task-w", title: "Crawler access repaired", state: "waiting_for_observation" }),
    ],
    mode: "guided",
    ...overrides,
  };
}

const WEEKS = [
  { weekStart: "2026-07-13", cited: 6, total: 20, citationRate: 30 },
  { weekStart: "2026-07-20", cited: 7, total: 20, citationRate: 35 },
  { weekStart: "2026-08-24", cited: 16, total: 40, citationRate: 40 },
  { weekStart: "2026-09-07", cited: 18, total: 40, citationRate: 45 },
];

type Responses = {
  summary?: unknown;
  tasks?: unknown;
  trend?: unknown;
  fail?: "summary" | "trend";
  pending?: boolean;
};

function stubFetch(responses: Responses) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (responses.pending) return new Promise<Response>(() => {});
    const failing =
      (responses.fail === "summary" && url.includes("/work/")) ||
      (responses.fail === "trend" && url.includes("citation-trend"));
    if (failing) {
      return new Response(JSON.stringify({ success: false, error: "boom" }), { status: 500 });
    }
    const body = url.includes("/work/summary")
      ? responses.summary
      : url.includes("/work/tasks")
        ? responses.tasks
        : responses.trend;
    return new Response(JSON.stringify({ success: true, data: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderToday() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <TodayPage />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  brandStub.value = {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "Venture PR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TodayPage - populated", () => {
  it("leads with the ranked task and keeps the percentage at body weight", async () => {
    stubFetch({
      summary: summary(),
      tasks: { items: [task(), task({ id: "task-2", title: "Improve your buyer guide" })] },
      trend: { weeks: WEEKS },
    });
    renderToday();

    const title = await screen.findByTestId("v2-priority-title");
    expect(title).toHaveTextContent("Correct the service description");

    // The task's title is the largest thing on the screen after the page
    // heading; the visibility number is inline body text inside a sentence.
    const sentence = await screen.findByTestId("v2-visibility-sentence");
    expect(sentence.textContent).toContain("Brand mentioned in 18 of 40 successful test answers");
    const percentage = within(sentence).getByText("45%");
    expect(percentage.className).toContain("font-semibold");
    expect(percentage.className).not.toMatch(/text-(stat|metric|hero|page)/);
    expect(title.className).toContain("text-section");
  });

  it("shows the conflict trigger, the effort and the points", async () => {
    stubFetch({ summary: summary(), tasks: { items: [task()] }, trend: { weeks: WEEKS } });
    renderToday();

    expect(await screen.findByText("Confirmed fact conflict")).toBeInTheDocument();
    expect(screen.getByText("About 15 minutes")).toBeInTheDocument();
    expect(screen.getByText("40 work points")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review evidence" })).toBeInTheDocument();
  });

  it("ranks the rows under the lead task without repeating it", async () => {
    stubFetch({
      summary: summary(),
      tasks: {
        items: [
          task(),
          task({ id: "task-2", title: "Improve your buyer guide" }),
          task({ id: "task-3", title: "Review recent results", points: 10 }),
        ],
      },
      trend: { weeks: WEEKS },
    });
    renderToday();

    const rows = await screen.findAllByTestId("v2-queued-task");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Improve your buyer guide");
    expect(rows[1]).toHaveTextContent("Review recent results");
    expect(rows.some((row) => row.textContent?.includes("Correct the service"))).toBe(false);
  });

  it("reports level, points against the next threshold, and what is waiting", async () => {
    stubFetch({ summary: summary(), tasks: { items: [task()] }, trend: { weeks: WEEKS } });
    renderToday();

    const rail = await screen.findByTestId("v2-progress-rail");
    expect(rail).toHaveTextContent("Level 2 · Ready");
    expect(rail).toHaveTextContent("120 / 160 work points");
    expect(rail).toHaveTextContent("75%");
    expect(rail).toHaveTextContent("To reach Level 3 · Improve");
    expect(rail).toHaveTextContent("Earn 40 more points");
    expect(within(rail).getByTestId("v2-waiting-task")).toHaveTextContent(
      "Crawler access repaired",
    );
    expect(rail).toHaveTextContent("Work points do not measure visibility.");
  });

  it("namespaces its cache under v2 so an invalidation cannot reach the live dashboard", async () => {
    stubFetch({ summary: summary(), tasks: { items: [task()] }, trend: { weeks: WEEKS } });
    const { client } = renderToday();
    await screen.findByTestId("v2-priority-title");

    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => Array.isArray(key) && key[0] === "v2")).toBe(true);
  });
});

describe("TodayPage - the states that are not the happy path", () => {
  it("renders a loading frame while the work reads are in flight", () => {
    stubFetch({ pending: true });
    renderToday();
    expect(screen.getByTestId("v2-today-loading")).toBeInTheDocument();
  });

  it("renders an inline error with a retry when the work read fails", async () => {
    stubFetch({ fail: "summary" });
    renderToday();
    expect(await screen.findByTestId("v2-today-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("keeps the screen usable when only the visibility read fails", async () => {
    stubFetch({ summary: summary(), tasks: { items: [task()] }, fail: "trend" });
    renderToday();
    expect(await screen.findByTestId("v2-visibility-failed")).toBeInTheDocument();
    expect(screen.getByTestId("v2-priority-title")).toBeInTheDocument();
  });

  it("says nothing is ranked yet for a brand with no work - never a zero", async () => {
    stubFetch({
      summary: summary({ nextTask: null, waitingTasks: [], pendingCount: 0, goal: null }),
      tasks: { items: [] },
      trend: { weeks: [] },
    });
    brandStub.value = {
      selectedBrandId: "brand-feather",
      selectedBrand: { id: "brand-feather", name: "Feather" },
      brands: [{ id: "brand-feather" }],
      isLoading: false,
    };
    renderToday();

    const empty = await screen.findByTestId("v2-today-empty");
    expect(empty).toHaveTextContent("Nothing to do yet");
    expect(empty).toHaveTextContent("Feather");
    expect(empty.textContent).not.toMatch(/\b0%/);
  });

  it("names the zero-brand case instead of leaving a blank screen", () => {
    stubFetch({});
    brandStub.value = {
      selectedBrandId: "",
      selectedBrand: undefined,
      brands: [],
      isLoading: false,
    };
    renderToday();
    expect(screen.getByTestId("v2-today-no-brand")).toHaveTextContent("Add a brand to start");
  });

  it("renders 'Not measured' for a brand with no observations, not 0%", async () => {
    stubFetch({
      summary: summary(),
      tasks: { items: [task()] },
      // Eight seeded weeks with no answers in any of them - what a brand that
      // has never been measured actually returns. `citationRatePct` reports 0
      // for each, and 0% here would be a lie.
      trend: {
        weeks: [
          { weekStart: "2026-09-01", cited: 0, total: 0, citationRate: 0 },
          { weekStart: "2026-09-07", cited: 0, total: 0, citationRate: 0 },
        ],
      },
    });
    renderToday();

    const block = await screen.findByTestId("v2-visibility-empty");
    expect(block).toHaveTextContent("Not measured");
    expect(block.textContent).not.toContain("0%");
    expect(screen.queryByTestId("v2-visibility-sentence")).toBeNull();
  });
});
