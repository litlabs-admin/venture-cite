// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Board20Route } from "@/v2/screens/b20-report/Route";
import { Board20Screen } from "@/v2/screens/b20-report/Screen";
import { board20Fixture } from "@/v2/screens/b20-report/fixture";

const brandState = vi.hoisted(() => ({
  selectedBrandId: "brand-venture-pr",
  selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
  brands: [{ id: "brand-venture-pr" }],
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandState,
}));

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Board20Route />
    </QueryClientProvider>,
  );
}

describe("Board 20 visibility report", () => {
  it("renders every major region from the approved fixture", () => {
    render(<Board20Screen data={board20Fixture} />);

    expect(screen.getByRole("heading", { name: "AI visibility report" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Work completed")).toBeInTheDocument();
    expect(screen.getByText("Observed visibility")).toBeInTheDocument();
    expect(screen.getByText("18 / 40 attempts")).toBeInTheDocument();
    expect(screen.getAllByText("Citations").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Visibility trend" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Engine comparison" })).toBeInTheDocument();
    expect(
      screen.getByText("Peer comparison is not available for any engine."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top buyer questions" })).toBeInTheDocument();
    expect(screen.getByText("What is VenturePR?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cited source domains" })).toBeInTheDocument();
    expect(screen.getByText("venturepr.com")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brand omissions" })).toBeInTheDocument();
    expect(screen.getByText("Best PR tools for startups")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Completed changes" })).toBeInTheDocument();
    expect(screen.getByText("Update services page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Private brand progress" })).toBeInTheDocument();
    expect(screen.getByText("Level 3 · Improve")).toBeInTheDocument();
    expect(screen.getByText("160 / 320 points")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Report notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export report" })).toBeInTheDocument();
    expect(
      screen.getByText(/A before-and-after change alone does not establish cause/),
    ).toBeInTheDocument();
    expect(screen.getByText("No points are lost when visibility falls.")).toBeInTheDocument();
  });

  it("renders an honest not-measured state instead of a fabricated number", () => {
    const data = {
      ...board20Fixture,
      observedVisibility: {
        kind: "not-measured" as const,
        reason: "No answer was collected in this period.",
      },
      citations: {
        kind: "not-measured" as const,
        reason: "No answer was collected in this period.",
      },
      trend: {
        kind: "not-measured" as const,
        reason: "Create a baseline before measuring visibility.",
      },
    };

    render(<Board20Screen data={data} />);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("18 / 40 attempts")).not.toBeInTheDocument();
  });

  it("maps the real v2 report and note projections into the live screen", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let data: unknown;
      if (url.includes("mention-rate")) {
        data = {
          measured: 40,
          cited: 18,
          failed: 2,
          observed: 42,
          mentionRate: 45,
          weeks: [{ weekStart: "2026-08-31", cited: 18, measured: 40, failed: 2, mentionRate: 45 }],
        };
      } else if (url.includes("dashboard/rankings")) {
        data = {
          platforms: [
            {
              aiPlatform: "ChatGPT",
              isLive: true,
              rank: 1,
              citedCount: 8,
              totalCount: 10,
              visibilityScore: 40,
              strengthLabel: "Strong",
              latestSnippet: null,
              latestSnippetPrompt: null,
              isCitedSnippet: true,
            },
          ],
        };
      } else if (url.includes("work/summary")) {
        data = {
          brandId: "brand-venture-pr",
          points: 160,
          pendingCount: 1,
          milestones: [],
          currentLevel: { level: 3, name: "Improve", points: 160 },
          nextThreshold: { level: 4, name: "Learn", points: 320 },
          goal: null,
          nextTask: null,
          waitingTasks: [],
          mode: "guided",
        };
      } else if (url.includes("work/history")) {
        data = {
          items: [
            {
              id: "e1",
              taskId: "t1",
              brandId: "brand-venture-pr",
              taskVersion: 1,
              taskTitle: "Update services page",
              taskType: "improve_page_for_buyer_need",
              revision: 1,
              priorState: "submitted",
              state: "verified",
              actorId: "u1",
              actorKind: "user",
              reason: null,
              verificationMethod: {
                kind: "human_confirmation",
                note: "ok",
                confirmedByUserId: "u1",
              },
              occurredAt: "2026-09-01T00:00:00.000Z",
            },
          ],
          nextCursor: null,
        };
      } else if (url.includes("/api/v2/visibility/report/") && url.endsWith("/note")) {
        data = { note: "Steady gains.", updatedAt: "2026-09-01T00:00:00.000Z" };
      } else if (url.includes("/api/v2/visibility/report/")) {
        data = {
          period: { start: "2026-08-26", end: "2026-09-08" },
          observedMentions: 18,
          observedAttempts: 40,
          citedWithLink: 14,
          buyerQuestions: [
            {
              id: "q1",
              text: "What is VenturePR?",
              attempts: 8,
              mentions: 6,
              cited: 5,
              engineCount: 4,
            },
          ],
          citedDomains: [{ domain: "venturepr.com", citations: 8, share: 36 }],
          totalCitations: 22,
          omissions: [],
        };
      } else {
        data = { items: [], nextCursor: null };
      }
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(
      await screen.findByRole("heading", { name: "AI visibility report" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("What is VenturePR?")).toBeInTheDocument();
    expect(screen.getByText("venturepr.com")).toBeInTheDocument();
    expect(screen.getByText("Level 3 · Improve")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns loading and error states through the route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Promise<Response>(() => undefined)),
    );
    renderRoute();
    expect(screen.getByTestId("v2-state-loading")).toBeInTheDocument();
    vi.unstubAllGlobals();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 500 })),
    );
    renderRoute();
    expect(await screen.findByTestId("v2-state-error")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
