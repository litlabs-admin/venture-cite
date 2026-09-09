// @vitest-environment happy-dom
//
// The Visibility area, in every state it can reach.
//
// The three assertions that matter most here are not layout assertions:
//   - a brand with no observations reads "Not measured", never 0%;
//   - the trend carries no confidence interval, because no read returns one;
//   - every query key stays namespaced under "v2", so a write from this area
//     cannot invalidate the live dashboard's cache.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { WorkSummaryView, WorkTaskSummaryView } from "@/v2/data/workSummary";
import type { VisibilityHero, WorkHistoryEventView } from "@/v2/data/visibilityEvidence";
import type { VisibilityMentionRate } from "@/v2/data/visibilityTrend";

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

// recharts measures its container and happy-dom reports every element as
// 0x0, so the chart renders nothing here. What these tests own is which
// branch renders and what it says; the drawn geometry is judged against the
// approved designs.
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

const VisibilityPage = (await import("@/v2/visibility/VisibilityPage")).default;
const EvidencePage = (await import("@/v2/visibility/EvidencePage")).default;
const ResultsReviewPage = (await import("@/v2/visibility/ResultsReviewPage")).default;

const HERO: VisibilityHero = {
  visibilityScore: 61,
  visibilityDelta: 4,
  citedChecks: 18,
  totalChecks: 40,
  citationRate: 45,
  lastScanAt: "2026-09-08T09:30:00.000Z",
};

/** DROS AI's shape: a brand that exists but has never been observed.
 *  `citationRatePct` returns 0 for an empty sample - the screen must not
 *  print that zero. */
const HERO_UNMEASURED: VisibilityHero = {
  visibilityScore: 0,
  visibilityDelta: 0,
  citedChecks: 0,
  totalChecks: 0,
  citationRate: 0,
  lastScanAt: null,
};

// `GET /api/v2/visibility/mention-rate/:brandId`: the ONE read behind both
// the headline rate and the trend. `measured` is answers actually collected,
// so a call that returned nothing is counted in `failed` and is not in the
// denominator - which is the difference between this endpoint and the live
// dashboard's, and the reason the screens read it.
const WEEKS = [
  { weekStart: "2026-08-17", cited: 6, measured: 20, failed: 1, mentionRate: 30 },
  { weekStart: "2026-08-24", cited: 14, measured: 40, failed: 0, mentionRate: 35 },
  { weekStart: "2026-08-31", cited: 16, measured: 40, failed: 1, mentionRate: 40 },
  { weekStart: "2026-09-07", cited: 18, measured: 40, failed: 2, mentionRate: 45 },
];

const RATE: VisibilityMentionRate = {
  measured: 40,
  cited: 18,
  failed: 2,
  observed: 42,
  mentionRate: 45,
  weeks: WEEKS,
};

/** Never observed: every week holds attempts that produced no answer, or no
 *  attempt at all. `mentionRate` is 0 here the way the endpoint returns it for
 *  an empty sample, and no screen may print that zero. */
const RATE_UNMEASURED: VisibilityMentionRate = {
  measured: 0,
  cited: 0,
  failed: 0,
  observed: 0,
  mentionRate: 0,
  weeks: WEEKS.map((week) => ({ ...week, cited: 0, measured: 0, failed: 0, mentionRate: 0 })),
};

/** Engine names are payload data, never written into the tree, so the
 *  fixture's names are deliberately arbitrary. */
const ENGINES = {
  platforms: [
    {
      aiPlatform: "Engine One",
      isLive: true,
      rank: 3,
      citedCount: 6,
      totalCount: 10,
      visibilityScore: 62,
      strengthLabel: "Moderate" as const,
      latestSnippet: null,
      latestSnippetPrompt: null,
      isCitedSnippet: true,
    },
    {
      aiPlatform: "Engine Two",
      isLive: true,
      rank: 2,
      citedCount: 4,
      totalCount: 10,
      visibilityScore: 48,
      strengthLabel: "Moderate" as const,
      latestSnippet: null,
      latestSnippetPrompt: null,
      isCitedSnippet: false,
    },
  ],
};

const CITED = {
  items: [
    {
      platform: "Engine One",
      prompt: "Who provides launch communications in India?",
      url: "https://venturepr.example/services",
      citedAt: "2026-09-08T10:21:00.000Z",
    },
    {
      platform: "Engine Two",
      prompt: "What does a launch retainer cost?",
      url: "https://venturepr.example/pricing",
      citedAt: "2026-09-08T09:47:00.000Z",
    },
  ],
  total: 12,
  truncated: false,
};

function historyEvent(overrides: Partial<WorkHistoryEventView> = {}): WorkHistoryEventView {
  return {
    id: "event-1",
    taskId: "task-1",
    brandId: "brand-venture-pr",
    taskVersion: 1,
    taskTitle: "Service description corrected",
    taskType: "repair_confirmed_access_or_factual_fault",
    revision: 3,
    priorState: "submitted",
    state: "verified",
    actorId: "user-1",
    actorKind: "user",
    reason: null,
    verificationMethod: { kind: "system_check", checkId: "check-1" },
    occurredAt: "2026-09-08T08:00:00.000Z",
    award: {
      awardKey: "award-1",
      points: 40,
      taskType: "repair_confirmed_access_or_factual_fault",
      taskVersion: 1,
      ruleVersion: 1,
      cycleKey: "2026-09-07",
      verification: { kind: "system_check", checkId: "check-1" },
      evidenceCount: 2,
      awarded: true,
      awardedAt: "2026-09-08T08:00:00.000Z",
      awardStatus: "awarded",
    },
    ...overrides,
  };
}

function reviewTask(overrides: Partial<WorkTaskSummaryView> = {}): WorkTaskSummaryView {
  return {
    id: "task-review",
    brandId: "brand-venture-pr",
    goalId: null,
    taskKey: "review-1",
    taskVersion: 1,
    type: "review_results_and_record_decision",
    state: "accepted",
    revision: 2,
    title: "Review recent results",
    desiredResult: "A decision is recorded against the observed period.",
    buyerNeed: null,
    recommendedChange: "Review your updated services page against the next comparable answer set.",
    reason: null,
    confidence: null,
    effort: 10,
    points: 10,
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
    points: 160,
    pendingCount: 1,
    milestones: ["goal_selected_and_queue_reviewed", "baseline_ready"],
    currentLevel: { level: 3, name: "Improve", points: 160 },
    nextThreshold: { level: 4, name: "Learn", points: 320 },
    goal: null,
    nextTask: reviewTask(),
    waitingTasks: [],
    mode: "guided",
    ...overrides,
  };
}

type Responses = {
  hero?: unknown;
  rate?: unknown;
  cited?: unknown;
  engines?: unknown;
  history?: unknown;
  summary?: unknown;
  tasks?: unknown;
  pending?: boolean;
  fail?: "hero" | "summary" | "rate" | "cited";
  onPost?: (body: unknown) => Response;
};

function stubFetch(responses: Responses) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && responses.onPost) {
      return responses.onPost(init.body ? JSON.parse(String(init.body)) : null);
    }
    if (responses.pending) return new Promise<Response>(() => {});

    const failing =
      (responses.fail === "hero" && url.includes("/dashboard/hero/")) ||
      (responses.fail === "summary" && url.includes("/work/summary")) ||
      (responses.fail === "rate" && url.includes("/v2/visibility/mention-rate/")) ||
      (responses.fail === "cited" && url.includes("cited-urls"));
    if (failing) {
      return new Response(JSON.stringify({ success: false, error: "boom" }), { status: 500 });
    }

    const body = url.includes("/dashboard/hero/")
      ? responses.hero
      : url.includes("/v2/visibility/mention-rate/")
        ? responses.rate
        : url.includes("cited-urls")
          ? responses.cited
          : url.includes("/dashboard/rankings/")
            ? responses.engines
            : url.includes("/work/history")
              ? responses.history
              : url.includes("/work/summary")
                ? responses.summary
                : responses.tasks;

    return new Response(JSON.stringify({ success: true, data: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function populated(overrides: Partial<Responses> = {}): Responses {
  return {
    hero: HERO,
    rate: RATE,
    cited: CITED,
    engines: ENGINES,
    history: {
      items: [
        historyEvent(),
        historyEvent({ id: "event-2", taskId: "task-2", taskTitle: "Buyer guide improved" }),
      ],
      nextCursor: null,
    },
    summary: summary(),
    tasks: { items: [reviewTask()], nextCursor: null },
    ...overrides,
  };
}

function renderPage(Page: () => React.JSX.Element) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <Page />
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

describe("Visibility overview - populated", () => {
  it("leads with the measured rate and the sample behind it", async () => {
    stubFetch(populated());
    renderPage(VisibilityPage);

    expect(await screen.findByTestId("v2-vis-rate")).toHaveTextContent("45%");
    expect(screen.getByText("18 of 40 successful test answers")).toBeInTheDocument();
    expect(screen.getByText("Latest sample: 40 successful answers")).toBeInTheDocument();
  });

  it("says no confidence interval is drawn, because none is measured", async () => {
    stubFetch(populated());
    renderPage(VisibilityPage);

    await screen.findByTestId("v2-vis-rate");
    expect(
      screen.getByText(/no confidence interval is drawn because none is measured/i),
    ).toBeInTheDocument();
  });

  it("reports mentions from the payload and refuses to invent the rest", async () => {
    stubFetch(populated());
    renderPage(VisibilityPage);

    await screen.findByTestId("v2-vis-rate");
    // Mentions is measured.
    const mentions = screen.getByText("Mentions").closest("li");
    expect(mentions).not.toBeNull();
    expect(mentions).toHaveTextContent("18");
    expect(mentions).toHaveTextContent("40");

    // Recommendations has no source of any kind, so it is stated as absent.
    const recommendations = screen.getByText("Recommendations").closest("li");
    expect(recommendations).toHaveTextContent("Not measured");

    // The cited-urls feed counts attributed sources, not answers, and is
    // labelled as what it counts.
    expect(screen.getByText("Attributed sources").closest("li")).toHaveTextContent("12");
  });

  it("separates a count no read returns from a failure count one does", async () => {
    stubFetch(populated());
    renderPage(VisibilityPage);

    await screen.findByTestId("v2-vis-rate");
    // Nothing in this area returns an approved-question count.
    expect(screen.getByText("Approved questions").parentElement).toHaveTextContent("Not measured");
    // Failed attempts ARE returned, so stating them as unmeasured would be its
    // own false state. Not measured and Failed are different facts.
    expect(screen.getByText("Failed attempts").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Failed attempts").parentElement).not.toHaveTextContent("Not measured");
    expect(screen.getByText("Successful answers").parentElement).toHaveTextContent("40");
  });

  it("lists verified work with the points it actually earned", async () => {
    stubFetch(populated());
    renderPage(VisibilityPage);

    const rows = await screen.findAllByTestId("v2-vis-work-row");
    expect(rows[0]).toHaveTextContent("Service description corrected");
    expect(rows[0]).toHaveTextContent("+40 work points");
  });

  it("namespaces every key under v2 so the live dashboard's cache is untouched", async () => {
    stubFetch(populated());
    const { client } = renderPage(VisibilityPage);
    await screen.findByTestId("v2-vis-rate");

    const keys = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => Array.isArray(key) && key[0] === "v2")).toBe(true);
  });
});

describe("Visibility overview - the states that are not the happy path", () => {
  it("renders a loading frame while the reads are in flight", () => {
    stubFetch({ pending: true });
    renderPage(VisibilityPage);
    expect(screen.getByTestId("v2-vis-loading")).toBeInTheDocument();
  });

  it("offers a retry when the measurement read fails", async () => {
    stubFetch(populated({ fail: "hero" }));
    renderPage(VisibilityPage);

    expect(await screen.findByTestId("v2-vis-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  // The trend has no failure of its own to test: it is drawn from the same
  // payload as the headline rate, so a screen can never show one without the
  // other. A read that IS separate carries the same resilience question.
  it("keeps the screen standing when a secondary read fails", async () => {
    stubFetch(populated({ fail: "cited" }));
    renderPage(VisibilityPage);

    expect(await screen.findByTestId("v2-vis-rate")).toHaveTextContent("45%");
    expect(screen.getByTestId("v2-vis-trend")).toBeInTheDocument();
    // The count that did not load is stated as absent, not as a zero.
    expect(screen.getByText("Attributed sources").closest("li")).toHaveTextContent("Not measured");
  });

  it("shows one error frame with a retry when the visibility read fails", async () => {
    stubFetch(populated({ fail: "rate" }));
    renderPage(VisibilityPage);

    expect(await screen.findByTestId("v2-vis-error")).toBeInTheDocument();
    expect(screen.queryByTestId("v2-vis-rate")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("reads Not measured, never 0%, for a brand with no observations", async () => {
    stubFetch(
      populated({
        hero: HERO_UNMEASURED,
        rate: RATE_UNMEASURED,
        cited: { items: [], total: 0, truncated: false },
        engines: { platforms: [] },
        history: { items: [], nextCursor: null },
      }),
    );
    renderPage(VisibilityPage);

    const block = await screen.findByTestId("v2-vis-not-measured");
    expect(block).toHaveTextContent("Not measured");
    expect(screen.queryByTestId("v2-vis-rate")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByTestId("v2-vis-work-empty")).toBeInTheDocument();
  });

  it("asks for a brand when the account has none", async () => {
    brandStub.value = {
      selectedBrandId: "",
      selectedBrand: undefined,
      brands: [],
      isLoading: false,
    };
    stubFetch(populated());
    renderPage(VisibilityPage);

    expect(await screen.findByTestId("v2-vis-no-brand")).toBeInTheDocument();
  });
});

describe("Visibility evidence", () => {
  it("shows the source rows, their engine and when they were checked", async () => {
    stubFetch(populated());
    renderPage(EvidencePage);

    const rows = await screen.findAllByTestId("v2-evidence-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("/services");
    expect(rows[0]).toHaveTextContent("Engine One");
    expect(rows[0]).toHaveTextContent("Citation recorded");
  });

  it("opens the question behind a selected source", async () => {
    stubFetch(populated());
    renderPage(EvidencePage);

    const rows = await screen.findAllByTestId("v2-evidence-row");
    await userEvent.click(within(rows[0]).getByRole("radio"));
    expect(screen.getByTestId("v2-evidence-detail")).toHaveTextContent(
      "Who provides launch communications in India?",
    );
  });

  it("marks recommendations as unmeasured rather than dropping or faking them", async () => {
    stubFetch(populated());
    renderPage(EvidencePage);

    expect(await screen.findByTestId("v2-evidence-tab-recommendations")).toHaveTextContent(
      "Not measured",
    );
  });

  it("counts the engines that answered, using the names the payload carries", async () => {
    stubFetch(populated());
    renderPage(EvidencePage);

    const engines = await screen.findByTestId("v2-evidence-engines");
    expect(within(engines).getByText("Engine One")).toBeInTheDocument();
    expect(engines).toHaveTextContent("10");
    expect(screen.getByText("Engines").parentElement).toHaveTextContent("2");
  });

  it("reports the verified work total against the next threshold", async () => {
    stubFetch(populated());
    renderPage(EvidencePage);

    expect(await screen.findByTestId("v2-evidence-points")).toHaveTextContent("160");
    expect(screen.getByText("2 distinct changes verified")).toBeInTheDocument();
    expect(screen.getByText(/Next: Learn — 320 points and a results review/)).toBeInTheDocument();
  });

  it("says Not measured when nothing has been observed", async () => {
    stubFetch(
      populated({
        hero: HERO_UNMEASURED,
        rate: RATE_UNMEASURED,
        cited: { items: [], total: 0, truncated: false },
        engines: { platforms: [] },
        history: { items: [], nextCursor: null },
      }),
    );
    renderPage(EvidencePage);

    expect(await screen.findByTestId("v2-vis-not-measured")).toHaveTextContent("Not measured");
    expect(screen.getByTestId("v2-evidence-sources-empty")).toBeInTheDocument();
    expect(screen.getByTestId("v2-evidence-no-engines")).toBeInTheDocument();
  });

  it("renders a loading frame, then an error with a retry", async () => {
    stubFetch({ pending: true });
    const { unmount } = renderPage(EvidencePage);
    expect(screen.getByTestId("v2-evidence-loading")).toBeInTheDocument();
    unmount();

    vi.unstubAllGlobals();
    stubFetch(populated({ fail: "hero" }));
    renderPage(EvidencePage);
    expect(await screen.findByTestId("v2-evidence-error")).toBeInTheDocument();
  });
});

describe("Results review", () => {
  it("summarises the work, the observation and the missing business source", async () => {
    stubFetch(populated());
    renderPage(ResultsReviewPage);

    expect(await screen.findByTestId("v2-results")).toBeInTheDocument();
    expect(screen.getByText("2 verified changes")).toBeInTheDocument();
    expect(screen.getByText("Work completed")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByTestId("v2-results-period")).toHaveTextContent("week of");
  });

  it("records the decision against the observed period, once", async () => {
    const posted: unknown[] = [];
    stubFetch(
      populated({
        onPost: (body) => {
          posted.push(body);
          return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
        },
      }),
    );
    renderPage(ResultsReviewPage);

    await screen.findByTestId("v2-results");
    await userEvent.click(screen.getByRole("radio", { name: /evidence is not yet conclusive/i }));
    await userEvent.type(screen.getByLabelText("Record your decision"), "Keep the page.");
    await userEvent.click(screen.getByTestId("v2-results-save"));

    expect(await screen.findByTestId("v2-results-saved")).toBeInTheDocument();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      expectedRevision: 2,
      // The latest OBSERVED week - the window the screen draws - is the
      // period reviewed and the server's once-per-period key.
      cycleKey: "2026-09-07",
      measurementScope: { kind: "period", period: "2026-09-07" },
      decision: "no_material_change",
      notes: "Keep the page.",
    });
  });

  it("cannot save without a review task, and says why", async () => {
    stubFetch(populated({ tasks: { items: [], nextCursor: null } }));
    renderPage(ResultsReviewPage);

    expect(await screen.findByTestId("v2-results-blocked")).toHaveTextContent(
      "No results review is in the queue",
    );
    expect(screen.getByTestId("v2-results-save")).toBeDisabled();
  });

  it("cannot save without an observed period, and says why", async () => {
    stubFetch(
      populated({
        hero: HERO_UNMEASURED,
        rate: RATE_UNMEASURED,
      }),
    );
    renderPage(ResultsReviewPage);

    expect(await screen.findByTestId("v2-results-no-period")).toHaveTextContent("Not measured");
    expect(screen.getByTestId("v2-results-blocked")).toHaveTextContent("no period to review");
    expect(screen.getByTestId("v2-results-save")).toBeDisabled();
  });

  it("sums only the awards that were actually granted", async () => {
    stubFetch(
      populated({
        history: {
          items: [
            historyEvent(),
            historyEvent({
              id: "event-r",
              taskId: "task-r",
              taskTitle: "Reversed change",
              award: { ...historyEvent().award!, awardStatus: "reversed", points: 40 },
            }),
          ],
          nextCursor: null,
        },
      }),
    );
    renderPage(ResultsReviewPage);

    expect(await screen.findByTestId("v2-results-award-sum")).toHaveTextContent("40");
  });

  it("reports a failed save without claiming anything was recorded", async () => {
    stubFetch(
      populated({
        onPost: () =>
          new Response(JSON.stringify({ success: false, error: "conflict" }), { status: 409 }),
      }),
    );
    renderPage(ResultsReviewPage);

    await screen.findByTestId("v2-results");
    await userEvent.click(screen.getByRole("radio", { name: /Visibility improved/i }));
    await userEvent.click(screen.getByTestId("v2-results-save"));

    expect(await screen.findByTestId("v2-results-failed")).toBeInTheDocument();
    expect(screen.queryByTestId("v2-results-saved")).not.toBeInTheDocument();
  });

  it("renders a loading frame, then an error with a retry", async () => {
    stubFetch({ pending: true });
    const { unmount } = renderPage(ResultsReviewPage);
    expect(screen.getByTestId("v2-results-loading")).toBeInTheDocument();
    unmount();

    vi.unstubAllGlobals();
    stubFetch(populated({ fail: "summary" }));
    renderPage(ResultsReviewPage);
    expect(await screen.findByTestId("v2-results-error")).toBeInTheDocument();
  });
});
