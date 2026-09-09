// @vitest-environment happy-dom
//
// Brand facts, in every state it can reach, and the accept-or-amend gate.
//
// The gate is the reason this file exists. The owner's requirement is that
// approval is attributed and never silent: a fact must not become approved as
// a side effect of viewing the page, of approving a different fact, or of a
// bulk control. Every one of those is asserted below as a NEGATIVE - that no
// request was sent - because a screen that quietly approves looks identical to
// a correct one in a screenshot.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { BrandFactView } from "@/v2/data/brandFacts";
import type { WorkSummaryView } from "@/v2/data/workSummary";

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

const BrandFactsPage = (await import("@/v2/brandfacts/BrandFactsPage")).default;

function fact(overrides: Partial<BrandFactView> = {}): BrandFactView {
  return {
    id: "fact-1",
    brandId: "brand-venture-pr",
    domain: "identity",
    subcategory: "identity",
    factKey: "brand_name",
    factValue: "VenturePR",
    confidence: "0.90",
    sourceExcerpt: "We support startup teams across India.",
    sourceUrl: "https://venturepr.example/about",
    source: "scraped",
    acceptedAt: "2026-09-08T00:00:00.000Z",
    dismissedAt: null,
    lastVerified: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function summary(overrides: Partial<WorkSummaryView> = {}): WorkSummaryView {
  return {
    brandId: "brand-venture-pr",
    points: 0,
    pendingCount: 0,
    milestones: [],
    currentLevel: { level: 1, name: "Start", points: 0 },
    nextThreshold: { level: 2, name: "Ready", points: 60 },
    goal: null,
    nextTask: null,
    waitingTasks: [],
    mode: "guided",
    ...overrides,
  };
}

// The four rows the artboard draws: two confirmed, two needing review, one of
// which is user-supplied and therefore has no source page.
const POPULATED: BrandFactView[] = [
  fact(),
  fact({
    id: "fact-2",
    factKey: "service_region",
    factValue: "India",
    sourceUrl: "https://venturepr.example/services",
    acceptedAt: null,
  }),
  fact({
    id: "fact-3",
    factKey: "main_service",
    factValue: "Startup public relations",
    sourceUrl: "https://venturepr.example/services",
  }),
  fact({
    id: "fact-4",
    factKey: "target_buyer",
    factValue: "Early-stage founders",
    sourceUrl: null,
    sourceExcerpt: null,
    source: "user",
    acceptedAt: null,
  }),
];

type Responses = {
  facts?: BrandFactView[];
  fail?: boolean;
  pending?: boolean;
};

/** Every non-GET request the screen made, in order. A test that asserts
 *  "nothing was approved" asserts against this. */
const writes: { method: string; url: string; body: unknown }[] = [];

function stubFetch(responses: Responses) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      // Both write endpoints answer under `fact`, not `data`.
      return new Response(JSON.stringify({ success: true, fact: {}, data: {} }), { status: 200 });
    }
    if (url.includes("/work/summary")) {
      return new Response(JSON.stringify({ success: true, data: summary() }), { status: 200 });
    }
    if (responses.pending) return new Promise<Response>(() => {});
    if (responses.fail) {
      return new Response(JSON.stringify({ success: false, error: "boom" }), { status: 500 });
    }
    return new Response(JSON.stringify({ success: true, data: responses.facts ?? [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderFacts() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <BrandFactsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  writes.length = 0;
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

describe("BrandFactsPage - populated", () => {
  it("puts every fact, its value, its source and its review state on a row", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    const rows = await screen.findAllByTestId("v2-fact-row");
    expect(rows).toHaveLength(4);

    expect(rows[0]).toHaveTextContent("Brand name");
    expect(rows[0]).toHaveTextContent("VenturePR");
    expect(rows[0]).toHaveTextContent("/about");
    expect(rows[0]).toHaveTextContent("Confirmed");

    expect(rows[1]).toHaveTextContent("Service region");
    expect(rows[1]).toHaveTextContent("India");
    expect(rows[1]).toHaveTextContent("Needs review");

    // A fact with no page is labelled, not left blank.
    expect(rows[3]).toHaveTextContent("User supplied");
  });

  it("counts what is outstanding without offering a control that hides it", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    expect(await screen.findByTestId("v2-facts-review-count")).toHaveTextContent(
      "2 of 4 still need your review",
    );
    // No bulk accept: the one the API offers cannot name the facts it would
    // accept before acting, which is the condition this screen is held to.
    expect(screen.queryByText(/approve all/i)).toBeNull();
    expect(screen.queryByText(/accept all/i)).toBeNull();
  });

  it("shows the excerpt beside the page it came from - the screen's argument", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    const excerpt = await screen.findByTestId("v2-fact-excerpt");
    expect(excerpt).toHaveTextContent("We support startup teams across India.");
    expect(screen.getByTestId("v2-fact-source-link")).toHaveAttribute(
      "href",
      "https://venturepr.example/services",
    );
  });

  it("says so plainly when a value has no excerpt rather than showing a gap", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    // fact-4 is the user-supplied one, with no excerpt and no page.
    await userEvent.click(await screen.findByText("Early-stage founders"));
    expect(await screen.findByTestId("v2-fact-no-excerpt")).toHaveTextContent(
      /no quoted wording to check it against/i,
    );
    expect(screen.getByTestId("v2-fact-source-none")).toBeTruthy();
    expect(screen.queryByTestId("v2-fact-source-link")).toBeNull();
  });

  it("lists where the facts came from without claiming full page coverage", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    const pages = await screen.findAllByTestId("v2-scanned-page");
    expect(pages[0]).toHaveTextContent("/services");
    expect(pages[0]).toHaveTextContent("2 facts extracted");
    expect(screen.getByTestId("v2-pages-scanned")).toHaveTextContent(
      /a page that was read and yielded nothing does not appear/i,
    );
  });

  it("tells the three review states apart by glyph and by word, never by hue alone", async () => {
    stubFetch({
      facts: [
        fact({ id: "a", factKey: "one" }),
        fact({ id: "b", factKey: "two", acceptedAt: null }),
        fact({ id: "c", factKey: "three", dismissedAt: "2026-09-08T00:00:00.000Z" }),
      ],
    });
    renderFacts();

    const rows = await screen.findAllByTestId("v2-fact-row");
    const words = rows.map((row) => row.querySelector("[data-review-state]")!.textContent!.trim());
    const glyphs = rows.map((row) => row.querySelector("[data-glyph]")!.getAttribute("data-glyph"));

    expect(new Set(words).size).toBe(3);
    expect(new Set(glyphs).size).toBe(3);
    expect(words).toEqual(["Confirmed", "Needs review", "Dismissed"]);
  });
});

describe("BrandFactsPage - the other states", () => {
  it("renders a labelled loading frame, not a blank page", async () => {
    stubFetch({ pending: true });
    renderFacts();
    expect(await screen.findByTestId("v2-brand-facts-loading")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("says the facts did not load, and that nothing was approved", async () => {
    stubFetch({ fail: true });
    renderFacts();

    const error = await screen.findByTestId("v2-brand-facts-error");
    expect(error).toHaveTextContent(/could not be loaded/i);
    expect(error).toHaveTextContent(/nothing has been approved/i);
    expect(writes).toHaveLength(0);
  });

  it("names the no-brand case instead of leaving a hole", async () => {
    brandStub.value = {
      selectedBrandId: "",
      selectedBrand: undefined,
      brands: [],
      isLoading: false,
    };
    stubFetch({ facts: [] });
    renderFacts();

    expect(await screen.findByTestId("v2-brand-facts-no-brand")).toHaveTextContent(
      /add a brand to start/i,
    );
  });

  // The zero-fact case for a real brand, e.g. Narwal. It must not read as a
  // clean bill of health.
  it("says nothing has been extracted, and never implies the facts were checked", async () => {
    stubFetch({ facts: [] });
    renderFacts();

    const empty = await screen.findByTestId("v2-brand-facts-empty");
    expect(empty).toHaveTextContent(/no facts have been extracted yet/i);
    expect(empty).toHaveTextContent(/nothing has been read from Venture PR/i);
    expect(empty).toHaveTextContent(/this is not a clean bill of health/i);

    // Nothing that could be read as reassurance about the facts themselves.
    expect(empty.textContent).not.toMatch(/all (facts|clear|good)/i);
    expect(empty.textContent).not.toMatch(/looks correct|everything (is )?correct|up to date/i);
    expect(screen.queryByTestId("v2-fact-table")).toBeNull();
  });
});

describe("BrandFactsPage - the accept-or-amend gate", () => {
  it("approves nothing merely because the page was viewed", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await screen.findAllByTestId("v2-fact-row");
    // Let every query settle, then assert no write of any kind was sent.
    await waitFor(() => expect(screen.getByTestId("v2-fact-review")).toBeTruthy());
    expect(writes).toHaveLength(0);
  });

  it("approves nothing merely because a row was selected", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await userEvent.click(await screen.findByText("Early-stage founders"));
    await userEvent.click(screen.getByText("Startup public relations"));
    expect(writes).toHaveLength(0);
  });

  it("offers two explicit actions, and makes neither of them a default", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    const approve = await screen.findByTestId("v2-fact-approve");
    const edit = screen.getByTestId("v2-fact-edit");

    // Both are present and both are live.
    expect(approve).toBeEnabled();
    expect(edit).toBeEnabled();

    // NEITHER IS A DEFAULT. Nothing is autofocused, neither is a submit
    // button that a stray Return would fire, and neither is pre-selected.
    expect(document.activeElement).toBe(document.body);
    expect(approve.getAttribute("type")).toBe("button");
    expect(edit.getAttribute("type")).toBe("button");
    expect(approve.getAttribute("autofocus")).toBeNull();
    expect(edit.getAttribute("autofocus")).toBeNull();

    // A Return press with nothing focused approves nothing.
    await userEvent.keyboard("{Enter}");
    expect(writes).toHaveLength(0);
  });

  it("sends the accept only when the owner presses Approve, and only for that fact", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await userEvent.click(await screen.findByTestId("v2-fact-approve"));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("POST");
    // The first fact needing review is `fact-2`; `fact-1` and `fact-3` are
    // already confirmed and must not be touched.
    expect(writes[0].url).toContain("/api/brand-fact-sheet/facts/fact-2/accept");
    expect(writes[0].body).toEqual({ dismissOtherSide: false });
  });

  it("does not approve a second fact when one fact is approved", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await userEvent.click(await screen.findByTestId("v2-fact-approve"));
    await waitFor(() => expect(writes).toHaveLength(1));

    // fact-4 also needs review and must be untouched.
    expect(writes.some((write) => write.url.includes("fact-4"))).toBe(false);
  });

  it("cannot approve an amendment until the value actually differs", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await userEvent.click(await screen.findByTestId("v2-fact-edit"));
    const save = screen.getByTestId("v2-fact-save-amend");

    // Opening the editor pre-fills the current value, so Save is genuinely
    // disabled - the `disabled` property, not a grey skin - until the owner
    // makes a change. Re-saving the same value is not an amendment.
    expect(save).toBeDisabled();

    const input = screen.getByTestId("v2-fact-amend-input");
    await userEvent.clear(input);
    expect(save).toBeDisabled(); // an empty value is not an amendment either

    await userEvent.type(input, "India and Singapore");
    expect(save).toBeEnabled();
    expect(writes).toHaveLength(0);
  });

  it("saves the amended value and then approves it, in that order", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await userEvent.click(await screen.findByTestId("v2-fact-edit"));
    const input = screen.getByTestId("v2-fact-amend-input");
    await userEvent.clear(input);
    await userEvent.type(input, "India and Singapore");
    await userEvent.click(screen.getByTestId("v2-fact-save-amend"));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toContain("/api/brand-facts/fact-2");
    expect(writes[0].body).toEqual({ factValue: "India and Singapore" });
    expect(writes[1].method).toBe("POST");
    expect(writes[1].url).toContain("/api/brand-fact-sheet/facts/fact-2/accept");
  });

  it("abandons an edit without writing anything when it is cancelled", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await userEvent.click(await screen.findByTestId("v2-fact-edit"));
    const input = screen.getByTestId("v2-fact-amend-input");
    await userEvent.clear(input);
    await userEvent.type(input, "Something else");
    await userEvent.click(screen.getByTestId("v2-fact-cancel-amend"));

    expect(writes).toHaveLength(0);
    expect(screen.queryByTestId("v2-fact-amend-input")).toBeNull();
    expect(screen.getByTestId("v2-fact-review")).toHaveTextContent("India");
  });

  it("does not carry a half-typed value from one fact onto another", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    await userEvent.click(await screen.findByTestId("v2-fact-edit"));
    const input = screen.getByTestId("v2-fact-amend-input");
    await userEvent.clear(input);
    await userEvent.type(input, "Draft for the wrong fact");

    // Move to another row mid-edit.
    await userEvent.click(screen.getByText("Early-stage founders"));

    expect(screen.queryByTestId("v2-fact-amend-input")).toBeNull();
    const review = screen.getByTestId("v2-fact-review");
    expect(review).toHaveTextContent("Early-stage founders");
    expect(review.textContent).not.toContain("Draft for the wrong fact");
    expect(writes).toHaveLength(0);
  });

  it("says approval is the owner's act, and that viewing changes nothing", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    expect(await screen.findByTestId("v2-fact-review")).toHaveTextContent(
      /nothing is approved until you approve it/i,
    );
  });

  it("will not re-approve a fact the owner already confirmed", async () => {
    stubFetch({ facts: [fact()] });
    renderFacts();

    const approve = await screen.findByTestId("v2-fact-approve");
    expect(approve).toBeDisabled();
    expect(approve).toHaveTextContent("Approved");
    // Amending a confirmed fact stays available - a decision can be revised.
    expect(screen.getByTestId("v2-fact-edit")).toBeEnabled();
  });

  it("reports a half-completed amendment honestly", async () => {
    // The PATCH lands; the accept then fails. Saying "that change was not
    // saved" would send the owner looking for a change that IS saved.
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "PATCH") {
        writes.push({ method, url, body: JSON.parse(String(init!.body)) });
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      }
      if (method === "POST") {
        writes.push({ method, url, body: null });
        return new Response(JSON.stringify({ success: false, error: "accept exploded" }), {
          status: 500,
        });
      }
      if (url.includes("/work/summary")) {
        return new Response(JSON.stringify({ success: true, data: summary() }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: POPULATED }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderFacts();

    await userEvent.click(await screen.findByTestId("v2-fact-edit"));
    const input = screen.getByTestId("v2-fact-amend-input");
    await userEvent.clear(input);
    await userEvent.type(input, "India and Singapore");
    await userEvent.click(screen.getByTestId("v2-fact-save-amend"));

    const error = await screen.findByTestId("v2-fact-amend-error");
    expect(error).toHaveTextContent(/your new value was saved/i);
    expect(error).toHaveTextContent(/approval was not recorded/i);
  });
});

describe("BrandFactsPage - the starting rail", () => {
  it("marks the fact step done only when nothing is left to review", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    const steps = await screen.findAllByTestId("v2-start-step");
    expect(steps[0]).toHaveAttribute("data-done", "false");
    expect(steps[0]).toHaveTextContent("Approve 2 facts on this page");
  });

  it("does not print a per-step point value that no contract supplies", async () => {
    stubFetch({ facts: POPULATED });
    renderFacts();

    const rail = await screen.findByTestId("v2-start-rail");
    const steps = within(rail).getAllByTestId("v2-start-step");
    for (const step of steps) expect(step.textContent).not.toMatch(/\b\d+\s*(work )?points?\b/i);
    // The one real figure, from `nextThreshold.points - points`, is stated once.
    expect(rail).toHaveTextContent("60 more work points to go.");
  });
});
