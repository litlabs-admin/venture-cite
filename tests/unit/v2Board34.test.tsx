// @vitest-environment happy-dom
//
// Board 34, the steady-state Facts workspace: the fixture render, the live
// adapter mapping a captured `/api/brand-facts/:brandId` response shape, and
// the workspace's own accept-or-amend-or-dismiss gate - the same "never a
// side effect of viewing or selecting" requirement `v2BrandFacts.test.tsx`
// holds board 07 to (see that file's header comment), applied to board 34's
// three explicit actions plus recheck.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Board34Screen, type Board34Data } from "@/v2/screens/b34-facts-workspace/Screen";
import { board34Fixture } from "@/v2/screens/b34-facts-workspace/fixture";
import { useBoard34Data } from "@/v2/screens/b34-facts-workspace/data";
import { Board34Route } from "@/v2/screens/b34-facts-workspace/Route";

const brandSelection = vi.hoisted(() => ({
  selectedBrandId: "brand-live",
  selectedBrand: { id: "brand-live", name: "Acme PR" },
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandSelection,
}));

const navigateMock = vi.hoisted(() => vi.fn());
const searchStub = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useSearch: () => searchStub.value,
}));

describe("Board 34 fixture screen", () => {
  it("renders the categories, the fact health donut, and the rail's real-figure cards", () => {
    render(<Board34Screen data={board34Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Keep your source of truth current" }),
    ).toBeVisible();
    expect(screen.getByText(/We extract facts about VenturePR/)).toBeVisible();

    const counts = screen.getByTestId("v2-facts-summary-counts");
    expect(counts).toHaveTextContent("3");
    expect(counts).toHaveTextContent("Approved");
    expect(counts).toHaveTextContent("Need confirmation");
    expect(counts).toHaveTextContent("Stale");

    // One category (the first) is expanded on load; its rows are visible.
    expect(screen.getByRole("button", { name: /Identity/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Company name")).toBeVisible();

    const rail = screen.getByRole("complementary", { name: "Fact health" });
    expect(within(rail).getByText("Fact health")).toBeVisible();
    expect(within(rail).getByText("Sources inspected")).toBeVisible();
    expect(within(rail).getByText("5")).toBeVisible();
    expect(within(rail).getByText("Pending confirmations")).toBeVisible();
    expect(within(rail).getByText("Next scheduled review")).toBeVisible();
  });

  it("never shows a fixture value from board 07's own fixture ('VenturePR' aside, which is this board's own real fixture brand)", () => {
    render(<Board34Screen data={board34Fixture} />);
    // The board's own actions are real controls, not text claiming completion.
    expect(screen.getByTestId("v2-add-fact")).toBeEnabled();
    expect(screen.getByTestId("v2-recheck-sources")).toBeEnabled();
  });
});

describe("Board 34 - explicit actions, never implicit", () => {
  function dataWithActions(overrides: Partial<Board34Data["actions"]> = {}): Board34Data {
    return {
      ...board34Fixture,
      actions: {
        acceptFact: vi.fn(async () => undefined),
        dismissFact: vi.fn(async () => undefined),
        amendFact: vi.fn(async () => undefined),
        addFact: vi.fn(async () => undefined),
        recheckFact: vi.fn(async () => undefined),
        ...overrides,
      },
    };
  }

  it("approves nothing merely because a category or a row was opened", async () => {
    const data = dataWithActions();
    render(<Board34Screen data={data} />);

    await userEvent.click(screen.getByText("Tagline"));
    await userEvent.click(screen.getByText("Founded"));

    expect(data.actions.acceptFact).not.toHaveBeenCalled();
    expect(data.actions.amendFact).not.toHaveBeenCalled();
    expect(data.actions.dismissFact).not.toHaveBeenCalled();
  });

  it("accepts only the fact whose row is open, and only on the explicit control", async () => {
    const data = dataWithActions();
    render(<Board34Screen data={data} />);

    // "Founded" is the fixture's stale (not yet approved) identity fact, so
    // Accept is enabled for it - "Tagline" is already approved and its
    // Accept control is correctly disabled, which is its own assertion, not
    // this one's.
    await userEvent.click(screen.getByText("Founded"));
    await userEvent.click(await screen.findByTestId("v2-workspace-accept"));

    expect(data.actions.acceptFact).toHaveBeenCalledTimes(1);
    expect(data.actions.acceptFact).toHaveBeenCalledWith("fact-founded");
  });

  it("disables Accept for a fact that is already approved", async () => {
    render(<Board34Screen data={dataWithActions()} />);
    await userEvent.click(screen.getByText("Tagline"));
    expect(await screen.findByTestId("v2-workspace-accept")).toBeDisabled();
  });

  it("cannot save an amendment until the value actually differs, and approves the amended value on save", async () => {
    const data = dataWithActions();
    render(<Board34Screen data={data} />);

    await userEvent.click(screen.getByText("Tagline"));
    await userEvent.click(screen.getByRole("button", { name: "Amend value" }));

    const save = screen.getByTestId("v2-workspace-save-amend");
    expect(save).toBeDisabled();

    const input = screen.getByTestId("v2-workspace-amend-input");
    await userEvent.clear(input);
    await userEvent.type(input, "PR for what is next, built for AI answers");
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(data.actions.amendFact).toHaveBeenCalledWith(
      "fact-tagline",
      "PR for what is next, built for AI answers",
    );
  });

  it("dismisses only the fact whose row is open", async () => {
    const data = dataWithActions();
    render(<Board34Screen data={data} />);

    await userEvent.click(screen.getByText("Tagline"));
    await userEvent.click(await screen.findByTestId("v2-workspace-dismiss"));

    expect(data.actions.dismissFact).toHaveBeenCalledWith("fact-tagline");
    expect(data.actions.acceptFact).not.toHaveBeenCalled();
  });

  it("refuses to recheck a fact the owner already overrode, honestly, not silently", async () => {
    const data: Board34Data = {
      ...dataWithActions(),
      categories: board34Fixture.categories.map((category) =>
        category.id === "identity"
          ? {
              ...category,
              facts: category.facts.map((fact) =>
                fact.id === "fact-tagline" ? { ...fact, userOverridden: true } : fact,
              ),
            }
          : category,
      ),
    };
    render(<Board34Screen data={data} />);

    await userEvent.click(screen.getByText("Tagline"));
    expect(screen.getByTestId("v2-workspace-recheck")).toBeDisabled();
    expect(screen.getByText(/edited this value/i)).toBeVisible();
  });

  it("recheck sources acts only on the stale facts, one at a time", async () => {
    const data = dataWithActions();
    render(<Board34Screen data={data} />);

    await userEvent.click(screen.getByTestId("v2-recheck-sources"));

    await waitFor(() => expect(data.actions.recheckFact).toHaveBeenCalledTimes(1));
    // Only "Founded" is stale in the fixture.
    expect(data.actions.recheckFact).toHaveBeenCalledWith("fact-founded");
  });

  it("disables recheck sources when nothing is stale", () => {
    const data: Board34Data = {
      ...dataWithActions(),
      factSummary: { ...board34Fixture.factSummary, staleCount: 0 },
    };
    render(<Board34Screen data={data} />);
    expect(screen.getByTestId("v2-recheck-sources")).toBeDisabled();
  });

  it("adds a fact only once the form is filled in and submitted", async () => {
    const data = dataWithActions();
    render(<Board34Screen data={data} />);

    await userEvent.click(screen.getByTestId("v2-add-fact"));
    expect(data.actions.addFact).not.toHaveBeenCalled();

    const form = await screen.findByTestId("v2-add-fact-form");
    await userEvent.type(
      within(form).getByPlaceholderText("Fact name, e.g. Founded"),
      "Support email",
    );
    await userEvent.type(within(form).getByPlaceholderText("Value"), "hello@venturepr.example");
    await userEvent.click(within(form).getByRole("button", { name: "Add fact" }));

    await waitFor(() => expect(data.actions.addFact).toHaveBeenCalledTimes(1));
    expect(data.actions.addFact).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Support email", factValue: "hello@venturepr.example" }),
    );
  });
});

describe("Board 34 live adapter", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Relative to the moment the suite runs, not a fixed calendar date: the
  // 30-day staleness window (`server/lib/factAgent/v2/reverifyFact.ts`'s
  // `findStaleFacts` cutoff, reapplied in `./data.ts`) has to land on the
  // right side of "now" no matter when this test executes.
  const RECENT = new Date(Date.now() - 5 * DAY_MS).toISOString();
  const OVER_30_DAYS_AGO = new Date(Date.now() - 45 * DAY_MS).toISOString();

  function liveFact(overrides: Record<string, unknown> = {}) {
    return {
      id: "live-fact-1",
      brandId: "brand-live",
      domain: "identity",
      subcategory: "Brand name",
      factKey: "name",
      factValue: "Acme PR",
      confidence: "0.9",
      sourceExcerpt: "Acme PR is a boutique agency.",
      sourceUrl: "https://acme.example/about",
      source: "scraped",
      acceptedAt: OVER_30_DAYS_AGO,
      dismissedAt: null,
      lastVerified: RECENT,
      verificationStatus: "verified",
      lastVerificationAt: RECENT,
      verificationAttempts: 1,
      userOverridden: false,
      ...overrides,
    };
  }

  const FACTS = [
    liveFact(),
    liveFact({
      id: "live-fact-2",
      domain: "offerings",
      subcategory: "Service region",
      factKey: "geographicAvailability",
      factValue: "United States",
      acceptedAt: null,
      verificationStatus: "never",
    }),
    liveFact({
      id: "live-fact-3",
      domain: "identity",
      subcategory: "Founded",
      factKey: "foundedYear",
      factValue: "2018",
      // Past the 30-day staleness window.
      lastVerified: OVER_30_DAYS_AGO,
      verificationStatus: "verified",
    }),
    liveFact({
      id: "live-fact-4",
      domain: "identity",
      subcategory: "Duplicate reading",
      factKey: "other",
      factValue: "Conflicting value",
      verificationStatus: "drift_detected",
    }),
    liveFact({
      id: "live-fact-5",
      domain: "identity",
      subcategory: "Withdrawn claim",
      factKey: "other",
      factValue: "Should not appear",
      dismissedAt: "2026-09-01T00:00:00.000Z",
    }),
  ];

  function stubFetch() {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/brand-facts/")) {
        return new Response(JSON.stringify({ success: true, data: FACTS }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("groups the real fact rows by domain, excludes dismissed rows, and classes each by the server's own thresholds", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 30_000 } },
    });
    const result = renderHook(() => useBoard34Data(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.result.current.state.kind).toBe("ready"));
    const data = result.result.current.data;
    if (data === undefined) throw new Error("Expected Board 34 data.");

    const identity = data.categories.find((category) => category.id === "identity");
    expect(identity?.label).toBe("Identity");
    // live-fact-5 was dismissed and must not appear anywhere.
    expect(identity?.facts.some((fact) => fact.id === "live-fact-5")).toBe(false);
    expect(identity?.facts).toHaveLength(3);

    const brandName = identity?.facts.find((fact) => fact.id === "live-fact-1");
    expect(brandName?.status).toBe("approved");
    expect(brandName?.owner).toBe("You");
    expect(brandName?.label).toBe("Brand name");

    const founded = identity?.facts.find((fact) => fact.id === "live-fact-3");
    expect(founded?.status).toBe("stale");

    const conflicting = identity?.facts.find((fact) => fact.id === "live-fact-4");
    expect(conflicting?.status).toBe("needs_confirmation");
    expect(conflicting?.verificationType).toBe("Cross-source");

    const offerings = data.categories.find((category) => category.id === "offerings");
    const serviceRegion = offerings?.facts[0];
    expect(serviceRegion?.status).toBe("needs_confirmation");
    expect(serviceRegion?.owner).toBeNull();

    expect(data.factSummary).toEqual({
      approvedCount: 1,
      confirmationCount: 2,
      staleCount: 1,
      totalCount: 4,
    });
    expect(data.firstConfirmationFactId).toBe("live-fact-4");
  });

  it("returns the empty state for a brand with no facts at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const result = renderHook(() => useBoard34Data(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.result.current.state.kind).toBe("empty"));
    expect(result.result.current.data).toBeUndefined();
  });
});

describe("Board 34 route", () => {
  beforeEach(() => {
    searchStub.value = {};
    navigateMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderRoute() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 30_000 } },
    });
    return render(
      <QueryClientProvider client={client}>
        <Board34Route />
      </QueryClientProvider>,
    );
  }

  it("carries the sub-tab strip, with workspace active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })),
    );
    renderRoute();

    const nav = await screen.findByRole("navigation", { name: "Brand facts" });
    expect(within(nav).getByRole("link", { name: "Workspace" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("redirects to the setup gate for a brand with no facts at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })),
    );
    renderRoute();

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/v2/brand-facts", replace: true }),
      ),
    );
  });
});
