// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board08Screen, type Board08Data } from "@/v2/screens/b08-visibility-overview/Screen";
import {
  board08QueryResult,
  mapBoard08Data,
  type Board08ApiSnapshot,
  useBoard08Data,
} from "@/v2/screens/b08-visibility-overview/data";
import { board08Fixture } from "@/v2/screens/b08-visibility-overview/fixture";

function renderScreen(data: Board08Data = board08Fixture) {
  return render(<Board08Screen data={data} />);
}

describe("Board 08 visibility overview", () => {
  it("renders every major region from the approved fixture", () => {
    renderScreen();

    expect(screen.getByRole("heading", { name: "Understand what changed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/v2/visibility?brandId=fixture-venturepr&mode=expert",
    );
    expect(screen.getByText("Answers")).toBeInTheDocument();
    expect(screen.getByText("Citations")).toBeInTheDocument();
    expect(screen.getByText("Buyer questions")).toBeInTheDocument();
    expect(screen.getByText("Competitors")).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("Report")).toBeInTheDocument();
    expect(screen.getByText("Outcome review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Mention rate")).toBeInTheDocument();
    expect(screen.getAllByText("45%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("18 of 40 successful test answers")).toBeInTheDocument();
    expect(screen.getByText("Same question set")).toBeInTheDocument();
    expect(screen.getByText("4 engines")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /mention rate trend/i })).toBeInTheDocument();
    expect(
      screen.getByText("Latest sample: 40 successful answers · 2 failed attempts excluded"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Visibility varies between observations. A page change does not prove causation.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Completed work" })).toBeInTheDocument();
    expect(screen.getByText("Service description corrected")).toBeInTheDocument();
    expect(screen.getByText("Buyer guide improved")).toBeInTheDocument();
    expect(screen.getAllByText("+40 work points", { exact: false }).length).toBe(2);
    expect(screen.getByRole("heading", { name: "Observed outcomes" })).toBeInTheDocument();
    expect(screen.getByText("Recommendations")).toBeInTheDocument();
    expect(screen.getByText("Answers with citations")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Business results" })).toBeInTheDocument();
    expect(screen.getByText("Analytics not connected")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coverage and evidence" })).toBeInTheDocument();
    expect(screen.getByText("Approved questions")).toBeInTheDocument();
    expect(screen.getByText("Successful answers")).toBeInTheDocument();
    expect(screen.getByText("Failed attempts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Inspect answers/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next useful action" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open results review" })).toBeInTheDocument();
  });

  it("renders the unavailable state label instead of a number", () => {
    const data: Board08Data = {
      ...board08Fixture,
      visibility: {
        ...board08Fixture.visibility,
        mentionRate: { kind: "not-measured", reason: "No successful answers exist." },
        recommendations: {
          kind: "not-measured",
          reason: "Recommendation outcomes are not stored.",
        },
        citations: { kind: "not-measured", reason: "Citation outcomes are not available." },
        trend: { kind: "not-measured", reason: "Create a baseline before measuring visibility." },
      },
    };

    renderScreen(data);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("45%")).not.toBeInTheDocument();
    expect(screen.queryByText("9 / 40")).not.toBeInTheDocument();
    expect(screen.queryByText("6 / 40")).not.toBeInTheDocument();
    expect(screen.getByText("Create a baseline before measuring visibility.")).toBeInTheDocument();
  });
});

describe("Board 08 live adapter", () => {
  it("maps the server projections into measured and honest pending values", () => {
    const snapshot: Board08ApiSnapshot = {
      brandId: "brand-1",
      rate: {
        measured: 40,
        cited: 18,
        failed: 2,
        observed: 42,
        mentionRate: 45,
        weeks: [
          { weekStart: "2026-08-03", cited: 8, measured: 20, failed: 1, mentionRate: 40 },
          { weekStart: "2026-08-10", cited: 10, measured: 20, failed: 1, mentionRate: 50 },
        ],
      },
      hero: {
        visibilityScore: 45,
        visibilityDelta: 0,
        citedChecks: 6,
        totalChecks: 40,
        citationRate: 15,
        lastScanAt: "2026-09-08T00:00:00.000Z",
      },
      rankings: {
        platforms: [
          {
            aiPlatform: "ChatGPT",
            isLive: true,
            rank: 1,
            citedCount: 12,
            totalCount: 40,
            visibilityScore: 30,
            strengthLabel: "Strong",
            latestSnippet: null,
            latestSnippetPrompt: null,
            isCitedSnippet: true,
          },
          {
            aiPlatform: "Claude",
            isLive: true,
            rank: 2,
            citedCount: 10,
            totalCount: 40,
            visibilityScore: 25,
            strengthLabel: "Moderate",
            latestSnippet: null,
            latestSnippetPrompt: null,
            isCitedSnippet: true,
          },
          {
            aiPlatform: "Perplexity",
            isLive: true,
            rank: 3,
            citedCount: 8,
            totalCount: 40,
            visibilityScore: 20,
            strengthLabel: "Moderate",
            latestSnippet: null,
            latestSnippetPrompt: null,
            isCitedSnippet: true,
          },
          {
            aiPlatform: "Gemini",
            isLive: true,
            rank: 4,
            citedCount: 5,
            totalCount: 40,
            visibilityScore: 12.5,
            strengthLabel: "Weak",
            latestSnippet: null,
            latestSnippetPrompt: null,
            isCitedSnippet: false,
          },
        ],
      },
      approvedQuestions: {
        items: [
          {
            state: "verified",
            updatedAt: "2026-09-08T00:00:00.000Z",
            completionRule: {
              questionIds: ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"],
            },
          },
        ],
        nextCursor: null,
      },
      verifiedWork: {
        items: [
          {
            id: "event-1",
            taskId: "task-1",
            brandId: "brand-1",
            taskVersion: 1,
            taskTitle: "Service description corrected",
            taskType: "repair_confirmed_access_or_factual_fault",
            revision: 2,
            priorState: "submitted",
            state: "verified",
            actorId: "user-1",
            actorKind: "user",
            reason: null,
            verificationMethod: { kind: "system_check", checkId: "check-1" },
            occurredAt: "2026-09-07T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
      awardEvents: {
        items: [
          {
            id: "award-event-1",
            taskId: "task-1",
            brandId: "brand-1",
            taskVersion: 1,
            taskTitle: "Service description corrected",
            taskType: "repair_confirmed_access_or_factual_fault",
            revision: 2,
            priorState: "submitted",
            state: "verified",
            actorId: "user-1",
            actorKind: "user",
            reason: null,
            verificationMethod: { kind: "system_check", checkId: "check-1" },
            occurredAt: "2026-09-07T00:00:00.000Z",
            award: {
              awardKey: "award-1",
              points: 40,
              taskType: "repair_confirmed_access_or_factual_fault",
              taskVersion: 1,
              ruleVersion: 1,
              cycleKey: "cycle-1",
              verification: { kind: "system_check", checkId: "check-1" },
              evidenceCount: 1,
              awarded: true,
              awardedAt: "2026-09-07T00:00:00.000Z",
              awardStatus: "awarded",
            },
          },
        ],
        nextCursor: null,
      },
    };

    const result = mapBoard08Data(snapshot);

    expect(result.navigation).toEqual({ brandId: "brand-1", mode: "expert" });
    expect(result.visibility.mentionRate).toEqual({ kind: "measured", value: 0.45 });
    expect(result.visibility.mentioned).toEqual({ kind: "measured", value: 18 });
    expect(result.visibility.successfulAnswers).toEqual({ kind: "measured", value: 40 });
    expect(result.visibility.failedAttempts).toEqual({ kind: "measured", value: 2 });
    expect(result.visibility.recommendations.kind).toBe("not-measured");
    expect(result.visibility.citations).toEqual({ kind: "measured", value: 6 });
    expect(result.visibility.engineCount).toEqual({ kind: "measured", value: 4 });
    expect(result.visibility.approvedQuestionCount).toEqual({ kind: "measured", value: 10 });
    expect(result.completedWork[0]?.points).toEqual({ kind: "measured", value: 40 });
    expect(result.businessResults.kind).toBe("not-measured");
    expect(result.nextAction.kind).toBe("not-measured");
  });

  it("returns loading, error, and not-measured query states", () => {
    expect(board08QueryResult({ kind: "loading" })).toEqual({ state: { kind: "loading" } });
    expect(board08QueryResult({ kind: "error", message: "Visibility request failed." })).toEqual({
      state: { kind: "error", message: "Visibility request failed." },
    });
    expect(board08QueryResult({ kind: "not-measured", reason: "No brand is selected." })).toEqual({
      state: { kind: "not-measured", reason: "No brand is selected." },
    });
  });
});

describe("Board 08 query integration", () => {
  function AdapterProbe() {
    const result = useBoard08Data();
    return (
      <output data-testid="adapter-state">
        {result.state.kind}
        {result.state.kind === "error" ? `:${result.state.message}` : ""}
      </output>
    );
  }

  function renderAdapter() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AdapterProbe />
      </QueryClientProvider>,
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    brandSelectionState.selectedBrandId = "brand-1";
  });

  it("returns loading while the live endpoints are pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderAdapter();

    expect(screen.getByTestId("adapter-state")).toHaveTextContent("loading");
  });

  it("returns an error when a live endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, error: "upstream failed" }), {
            status: 500,
          }),
      ),
    );
    renderAdapter();

    await waitFor(() => expect(screen.getByTestId("adapter-state")).toHaveTextContent("error:500"));
  });

  it("returns not-measured when no brand is selected", () => {
    brandSelectionState.selectedBrandId = "";
    vi.stubGlobal("fetch", vi.fn());
    renderAdapter();

    expect(screen.getByTestId("adapter-state")).toHaveTextContent("not-measured");
  });
});

const brandSelectionState = vi.hoisted(() => ({
  selectedBrandId: "brand-1",
  selectedBrand: { id: "brand-1", name: "VenturePR" },
  brands: [{ id: "brand-1", name: "VenturePR" }],
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandSelectionState,
}));
