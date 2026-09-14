// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  Board07Screen,
  type Board07Data,
  type Board07Value,
} from "@/v2/screens/b07-brand-facts/Screen";
import { board07Fixture } from "@/v2/screens/b07-brand-facts/fixture";
import { useBoard07Data } from "@/v2/screens/b07-brand-facts/data";

const brandSelection = vi.hoisted(() => ({
  selectedBrandId: "brand-live",
  selectedBrand: { id: "brand-live", name: "Acme PR" },
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandSelection,
}));

function liveFact(overrides: Record<string, unknown> = {}) {
  return {
    id: "live-fact-service-region",
    brandId: "brand-live",
    domain: "service",
    subcategory: "service",
    factKey: "service_region",
    factValue: "India",
    confidence: "0.92",
    sourceExcerpt: "We serve teams across India.",
    sourceUrl: "https://acme.example/services",
    source: "scraped",
    acceptedAt: null,
    dismissedAt: null,
    lastVerified: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function stubLiveFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/brand-facts/")) {
      return new Response(JSON.stringify({ success: true, data: [liveFact()] }), { status: 200 });
    }
    if (url.includes("/work/summary")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            brandId: "brand-live",
            points: 40,
            pendingCount: 1,
            milestones: ["goal_selected_and_queue_reviewed"],
            currentLevel: { level: 1, name: "Start", points: 0 },
            nextThreshold: { level: 2, name: "Ready", points: 60 },
            goal: null,
            nextTask: null,
            waitingTasks: [],
            mode: "guided",
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("latest-completed")) {
      return new Response(
        JSON.stringify({
          success: true,
          run: {
            id: "run-live",
            brandId: "brand-live",
            status: "completed",
            completedAt: "2026-09-08T00:00:00.000Z",
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/runs/run-live")) {
      return new Response(
        JSON.stringify({
          success: true,
          run: {
            id: "run-live",
            brandId: "brand-live",
            status: "completed",
            completedAt: "2026-09-08T00:00:00.000Z",
          },
          pages: [
            {
              id: "page-live",
              runId: "run-live",
              url: "https://acme.example/services",
              canonicalUrl: "https://acme.example/services",
              status: "completed",
              fetchedAt: "2026-09-08T00:00:00.000Z",
              factCount: 3,
              statusCode: 200,
              errorKind: null,
            },
          ],
        }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("Board 07 fixture screen", () => {
  it("renders every board region with the approved strings and numbers", () => {
    render(<Board07Screen data={board07Fixture} />);

    expect(screen.getByRole("heading", { name: "Build a reliable starting point" })).toBeVisible();
    expect(
      screen.getByText("Review what VentureCite knows before measuring your visibility."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /1 Brand facts/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /2 Buyer questions/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /3 Baseline/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Confirm your essential facts" })).toBeVisible();

    const table = screen.getByRole("table");
    expect(within(table).getByText("Brand name")).toBeVisible();
    expect(within(table).getByText("VenturePR")).toBeVisible();
    expect(within(table).getByText("Service region")).toBeVisible();
    expect(within(table).getByText("India")).toBeVisible();
    expect(within(table).getByText("Startup public relations")).toBeVisible();
    expect(within(table).getByText("Early-stage founders")).toBeVisible();
    expect(within(table).getAllByText("Needs review")).toHaveLength(2);
    expect(within(table).getAllByText("Confirmed")).toHaveLength(2);

    expect(screen.getByText("Source excerpt")).toBeVisible();
    expect(screen.getByText("“We support startup teams across India.”")).toBeVisible();
    expect(screen.getAllByText("/services").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Extracted 8 Sep 2026")).toBeVisible();
    expect(screen.getByText("Approved service region")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve this fact" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit value" })).toBeEnabled();

    const pages = screen.getByRole("region", { name: "Pages scanned for these facts" });
    expect(within(pages).getByText("/services")).toBeVisible();
    expect(within(pages).getByText("3 facts extracted")).toBeVisible();
    expect(within(pages).getByText("/about")).toBeVisible();
    expect(within(pages).getByText("1 fact extracted")).toBeVisible();
    expect(within(pages).getByText("/pricing")).toBeVisible();
    expect(within(pages).getByText("No facts found")).toBeVisible();

    const rail = screen.getByRole("complementary", { name: "Level progress" });
    expect(within(rail).getByText("Level 1 · Start")).toBeVisible();
    expect(within(rail).getByText("work points").parentElement).toHaveTextContent("0");
    expect(within(rail).getByText("Reach Level 2 · Ready")).toBeVisible();
    expect(within(rail).getAllByText("20")).toHaveLength(3);
    expect(within(rail).getByText("All three steps are required.")).toBeVisible();
    expect(within(rail).getByText("Why this matters")).toBeVisible();
    expect(within(rail).getByText("After Level 2")).toBeVisible();
    expect(
      within(rail).getByText(
        "Your first observation runs, and the ranked task list on Today opens.",
      ),
    ).toBeVisible();
  });

  it("renders unavailable values with a state label instead of a number", () => {
    const data = {
      ...board07Fixture,
      progress: {
        ...board07Fixture.progress,
        workPoints: { kind: "not-measured", reason: "Points are not available." },
      },
      facts: board07Fixture.facts.map((fact) =>
        fact.id === "fact-service-region"
          ? { ...fact, value: { kind: "not-measured", reason: "This fact is not measured." } }
          : fact,
      ),
    } satisfies Board07Data;

    render(<Board07Screen data={data} />);

    expect(screen.getAllByText("Not measured")).toHaveLength(3);
    expect(screen.queryByText("0 work points")).toBeNull();
    expect(screen.queryByText("India")).toBeNull();
  });

  it.each([
    ["failed", { kind: "failed", reason: "The points request failed." }, "Failed"],
    ["stale", { kind: "stale", reason: "The points are stale.", asOf: "2026-09-08" }, "Stale"],
    ["empty", { kind: "empty", reason: "No points exist yet." }, "Empty"],
  ] as Array<[string, Board07Value<string>, string]>)(
    "renders the %s state label for an unavailable value",
    (_kind, target, label) => {
      const data = {
        ...board07Fixture,
        progress: { ...board07Fixture.progress, target },
      } satisfies Board07Data;

      render(<Board07Screen data={data} />);

      expect(screen.getByText(label)).toBeVisible();
      expect(screen.queryByText("Reach Level 2 · Ready")).toBeNull();
    },
  );
});

describe("Board 07 live adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubLiveFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the real fact, summary, run, and page response shapes", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 30_000 } },
    });
    const result = renderHook(() => useBoard07Data(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.result.current.state.kind).toBe("ready"));
    if (result.result.current.data === undefined) throw new Error("Expected Board 07 data.");

    expect(result.result.current.data.brand.name).toEqual({ kind: "available", value: "Acme PR" });
    expect(result.result.current.data.facts[0]?.name).toBe("Service region");
    expect(result.result.current.data.facts[0]?.value).toEqual({
      kind: "available",
      value: "India",
    });
    expect(result.result.current.data.pages).toEqual({
      kind: "available",
      value: [
        expect.objectContaining({ path: "/services", factCount: { kind: "available", value: 3 } }),
      ],
    });
    expect(result.result.current.data.progress.workPoints).toEqual({
      kind: "available",
      value: 40,
    });
  });

  it.each([
    ["loading", () => new Promise<Response>(() => {})],
    ["error", () => Promise.resolve(new Response("failure", { status: 500 }))],
  ] as const)(
    "returns the %s state when the fact request does not provide data",
    async (kind, response) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => response()),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      const result = renderHook(() => useBoard07Data(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      });

      await waitFor(() => expect(result.result.current.state.kind).toBe(kind));
      expect(result.result.current.data).toBeUndefined();
    },
  );
});
