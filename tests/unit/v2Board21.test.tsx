// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Board21Route } from "@/v2/screens/b21-outcome-review/Route";
import { Board21Screen } from "@/v2/screens/b21-outcome-review/Screen";
import { board21Fixture } from "@/v2/screens/b21-outcome-review/fixture";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Board21Route />
    </QueryClientProvider>,
  );
}

describe("Board 21 outcome review", () => {
  it("renders the outcome evidence, form, and progress regions", () => {
    render(<Board21Screen data={board21Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Connect visibility work to business results" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("9 Sep 2026").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Completed change")).toBeInTheDocument();
    expect(screen.getByText("Services page update")).toBeInTheDocument();
    expect(screen.getByText("Observation window")).toBeInTheDocument();
    expect(screen.getAllByText(/9 Sep/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/7 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText("18 / 40 mentions")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Application-verified data" })).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    expect(screen.getByText("2 verified referral sessions")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your confirmed outcomes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Qualified inquiries")).toHaveValue(1);
    expect(screen.getByLabelText("Demo requests")).toHaveValue(0);
    expect(
      screen.getByDisplayValue(
        "One inbound inquiry from a startup founder via the contact form. Not yet a demo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save outcome review" })).toBeInTheDocument();
    expect(screen.getByText("Evidence strength")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("Attribution limits")).toBeInTheDocument();
    expect(screen.getByText("Connection options")).toBeInTheDocument();
    expect(screen.getByText("Connect HubSpot")).toBeInTheDocument();
    expect(screen.getByText("Connect Salesforce")).toBeInTheDocument();
    expect(screen.getByText("10 work points")).toBeInTheDocument();
    expect(screen.getByText(/Once per review period/)).toBeInTheDocument();
  });

  it("labels missing outcome measurements without showing fixture numbers", () => {
    const data = {
      ...board21Fixture,
      referralRows: { kind: "not-measured" },
      qualifiedInquiries: { kind: "not-measured" },
      demoRequests: { kind: "not-measured" },
      crmOpportunityCount: { kind: "not-measured" },
    };

    render(<Board21Screen data={data} />);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByDisplayValue("1")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("0")).not.toBeInTheDocument();
  });

  it("maps measured visibility and work data while keeping referrals unavailable", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes("mention-rate")
        ? {
            measured: 40,
            cited: 18,
            failed: 2,
            observed: 42,
            mentionRate: 45,
            weeks: [
              { weekStart: "2026-09-07", cited: 18, measured: 40, failed: 2, mentionRate: 45 },
            ],
          }
        : url.includes("work/summary")
          ? {
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
            }
          : { items: [], nextCursor: null };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute();

    expect(await screen.findByText("18 / 40 mentions")).toBeInTheDocument();
    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
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
