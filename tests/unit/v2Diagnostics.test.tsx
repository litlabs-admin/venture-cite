// @vitest-environment happy-dom
//
// Diagnostics, in every state it can reach, and the one rule the screen exists
// to enforce.
//
// THE RULE. A failed provider call is an absent observation, not a model that
// declined to mention the brand. Across the real table that is 2,604 of 7,302
// rows, and the database makes the mistake easy: a failed call is still a
// geo_rankings row with `is_cited = 0`, so any denominator of
// `platforms.length` silently counts "never answered" as "answered, brand
// absent". The assertions below pin BOTH halves - the failed model is listed
// as its own row, AND it is outside every number the screen states.
//
// The rest are honesty assertions, and several are NEGATIVE: that the three
// unbuilt tabs say they are unbuilt rather than showing a plausible-looking
// zero, and that a never-checked question is not reported as a clean result.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { buildCitationContext } from "../../server/lib/citationContextFormat";
import { CHECK_FAILED_PREFIX, isFailedCheck } from "@shared/citationFailure";
import type { BrandFactView } from "@/v2/data/brandFacts";
import type { BrandPromptView, PromptAnswerView, PromptResultsView } from "@/v2/data/promptResults";

const brandStub = vi.hoisted(() => ({
  value: {
    selectedBrandId: "brand-venture-pr" as string | null,
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" } as
      { id: string; name: string } | undefined,
    brands: [{ id: "brand-venture-pr" }] as { id: string }[],
    isLoading: false,
  },
}));

const api = vi.hoisted(() => ({
  handlers: new Map<string, () => unknown>(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children?: React.ReactNode; to?: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: () => "/v2/diagnostics",
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandStub.value,
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: async (_method: string, url: string) => {
    for (const [fragment, handler] of api.handlers) {
      if (url.includes(fragment)) {
        const value = handler();
        if (value instanceof Error) throw value;
        return { json: async () => value };
      }
    }
    throw new Error(`unstubbed request: ${url}`);
  },
}));

const DiagnosticsPage = (await import("@/v2/diagnostics/DiagnosticsPage")).default;
const { V2Nav } = await import("@/v2/shell/V2Nav");
const { NOT_BUILT_LABEL } = await import("@/v2/diagnostics/NotBuiltNotice");

// ── Fixtures, shaped exactly as the endpoints return them ────────────────

function prompt(overrides: Partial<BrandPromptView> = {}): BrandPromptView {
  return {
    id: "prompt-1",
    brandId: "brand-venture-pr",
    prompt: "Which PR service supports early-stage founders in India?",
    rationale: null,
    orderIndex: 0,
    status: "tracked",
    category: "Comparison",
    funnelStage: "MOFU",
    paused: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function answer(overrides: Partial<PromptAnswerView> = {}): PromptAnswerView {
  return {
    platform: "ChatGPT",
    isCited: false,
    rank: null,
    snippet: "Recommended multiple PR agencies for startups in India.",
    fullResponse: null,
    checkedAt: "2026-09-08T00:00:00.000Z",
    reDetectedAt: null,
    citingOutletUrl: null,
    citingOutletName: null,
    citedUrls: [],
    sourceType: null,
    ...overrides,
  };
}

/** The board's four models: three answered, one provider call failed. */
const BOARD_ANSWERS: PromptAnswerView[] = [
  answer({ platform: "ChatGPT" }),
  answer({ platform: "Gemini", snippet: "Listed several PR services for early-stage founders." }),
  answer({
    platform: "Claude",
    // Written by citationChecker's `fetchError` branch. `is_cited` is 0 here
    // and means nothing at all.
    snippet: `${CHECK_FAILED_PREFIX} upstream timeout`,
  }),
  answer({ platform: "Perplexity", snippet: "Showed PR firms for startups in India." }),
];

function results(overrides: Partial<PromptResultsView> = {}): PromptResultsView {
  return {
    byPrompt: [
      {
        promptId: "prompt-1",
        prompt: "Which PR service supports early-stage founders in India?",
        rationale: null,
        platforms: BOARD_ANSWERS,
        reportCount: 1,
        lastCheckedAt: "2026-09-08T00:00:00.000Z",
      },
    ],
    byPlatform: [],
    totalChecks: 4,
    totalCited: 0,
    citationRate: 0,
    sourceCounts: {},
    brandDomain: "venturepr.example",
    ...overrides,
  };
}

function fact(overrides: Partial<BrandFactView> = {}): BrandFactView {
  return {
    id: "fact-1",
    brandId: "brand-venture-pr",
    domain: "identity",
    subcategory: "identity",
    factKey: "main_service",
    factValue: "Startup public relations",
    confidence: "0.9",
    sourceExcerpt: "Public relations services for growing businesses.",
    sourceUrl: "https://venturepr.example/services",
    source: "scraped",
    acceptedAt: null,
    dismissedAt: null,
    lastVerified: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function stub({
  prompts = [prompt()],
  promptResults = results(),
  facts = [fact()],
  tasks = { items: [], nextCursor: null },
}: {
  prompts?: BrandPromptView[] | Error;
  promptResults?: PromptResultsView | Error;
  facts?: BrandFactView[];
  tasks?: { items: unknown[]; nextCursor: null };
} = {}) {
  api.handlers.clear();
  // Longest fragment first - `/results` also contains `/api/brand-prompts/`.
  api.handlers.set("/results", () =>
    promptResults instanceof Error ? promptResults : { success: true, data: promptResults },
  );
  api.handlers.set("/api/brand-facts/", () => ({ success: true, data: facts }));
  api.handlers.set("/work/tasks", () => ({ success: true, data: tasks }));
  api.handlers.set("/api/brand-prompts/", () =>
    prompts instanceof Error ? prompts : { success: true, data: prompts },
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DiagnosticsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  brandStub.value = {
    selectedBrandId: "brand-venture-pr",
    selectedBrand: { id: "brand-venture-pr", name: "VenturePR" },
    brands: [{ id: "brand-venture-pr" }],
    isLoading: false,
  };
  stub();
});

// ── The classifier ───────────────────────────────────────────────────────

describe("isFailedCheck, ported from feat/v2-ui-vis", () => {
  it("keeps the name and the semantics it was verified with", () => {
    expect(isFailedCheck("Check failed: upstream timeout")).toBe(true);
    expect(isFailedCheck("  check FAILED: rate limited")).toBe(true);
    expect(isFailedCheck("Not cited")).toBe(false);
    expect(isFailedCheck(null)).toBe(false);
    expect(isFailedCheck("")).toBe(false);
  });

  it("classifies the status line a real stored row carries", () => {
    const stored = buildCitationContext("Check failed: upstream timeout", "");
    expect(isFailedCheck(stored)).toBe(true);
  });
});

// ── Navigation ───────────────────────────────────────────────────────────

describe("Diagnostics navigation", () => {
  it("is a real nav destination in the board's position", () => {
    render(<V2Nav />);
    const row = screen.getByText("Diagnostics").closest("[data-v2-nav]");
    expect(row?.tagName.toLowerCase()).toBe("a");
    expect(row?.getAttribute("href")).toBe("/v2/diagnostics");
    expect(within(row as HTMLElement).queryByText(/soon/i)).toBeNull();

    const labels = Array.from(document.querySelectorAll("[data-v2-nav]")).map((node) =>
      node.getAttribute("data-v2-nav"),
    );
    expect(labels).toEqual([
      "Today",
      "Visibility",
      "Diagnostics",
      "My work",
      "Brand facts",
      "Learn",
    ]);
  });
});

// ── The populated screen, and the failed row ─────────────────────────────

describe("Prompt diagnosis, populated", () => {
  it("renders the question and its recorded intent", async () => {
    renderPage();
    expect(await screen.findByTestId("v2-diagnosis-question")).toHaveTextContent(
      "Which PR service supports early-stage founders in India?",
    );
    expect(screen.getByText("Approved buyer question · Comparison intent")).toBeTruthy();
  });

  it("lists the failed model as its own row", async () => {
    renderPage();
    await screen.findByTestId("v2-diagnosis-answers");
    const rows = screen.getAllByTestId("v2-diagnosis-answer-row");
    expect(rows).toHaveLength(4);

    const failed = rows.find((row) => row.getAttribute("data-platform") === "Claude")!;
    expect(failed.getAttribute("data-failed")).toBe("true");
    expect(within(failed).getByText("Failed (excluded)")).toBeTruthy();
    // The note must not claim anything about the brand: nothing was read.
    expect(within(failed).getByText("No answer generated.")).toBeTruthy();
    expect(within(failed).queryByText(/not mentioned/i)).toBeNull();
  });

  it("excludes the failed call from every count it states", async () => {
    renderPage();
    const count = await screen.findByTestId("v2-diagnosis-answer-count");
    // Three answers came back, none mentioned the brand. Never "3 of 4".
    expect(count.textContent).toContain("Brand absent in all 3 successful answers");
    expect(count.textContent).toContain("1 failed attempt excluded from this count");
    expect(count.textContent).not.toContain("of 4");

    const observed = screen.getByTestId("v2-boundary-observed");
    expect(observed.textContent).toContain("Brand absent in all 3 successful answers");
    expect(observed.textContent).toContain("1 provider call failed");
  });

  it("names the denominator as successful answers wherever a ratio appears", async () => {
    stub({
      promptResults: results({
        byPrompt: [
          {
            promptId: "prompt-1",
            prompt: "Which PR service supports early-stage founders in India?",
            rationale: null,
            platforms: [
              answer({ platform: "ChatGPT", isCited: true }),
              answer({ platform: "Gemini" }),
              answer({ platform: "Perplexity" }),
              answer({ platform: "Claude", snippet: "Check failed: upstream timeout" }),
            ],
            reportCount: 1,
            lastCheckedAt: "2026-09-08T00:00:00.000Z",
          },
        ],
      }),
    });
    renderPage();
    const count = await screen.findByTestId("v2-diagnosis-answer-count");
    expect(count.textContent).toContain("Brand absent in 2 of 3 successful answers");
  });

  it("never asserts a cause", async () => {
    renderPage();
    await screen.findByTestId("v2-prompt-diagnosis");
    expect(screen.getByTestId("v2-assessment-value")).toHaveTextContent(
      "Hypothesis — needs testing",
    );
    expect(screen.getByTestId("v2-no-causal-claim")).toHaveTextContent(
      "No false definitive causal claim.",
    );
    const panel = screen.getByTestId("v2-no-fault-confirmed");
    expect(panel.textContent).toContain("No fault confirmed");
    expect(panel.textContent).toContain("This task tests a content hypothesis.");
    expect(panel.textContent).toContain("We avoid blame and focus on useful experiments.");
    expect(screen.getByTestId("v2-boundary-unknown").textContent).toContain(
      "Why each model omitted the brand",
    );
  });

  it("quotes the captured page wording rather than describing it", async () => {
    renderPage();
    expect(await screen.findByTestId("v2-diagnosis-excerpt")).toHaveTextContent(
      "Public relations services for growing businesses.",
    );
    expect(screen.getByTestId("v2-diagnosis-excerpt-link")).toHaveTextContent("/services");
  });

  it("offers no invented experiment when the planner produced none", async () => {
    renderPage();
    const block = await screen.findByTestId("v2-diagnosis-no-experiment");
    expect(block.textContent).toContain("No experiment has been generated for this question");
    expect(screen.queryByText(/create improvement task/i)).toBeNull();
    expect(screen.queryByText(/work points/i)).toBeNull();
  });
});

// ── Never measured ───────────────────────────────────────────────────────

describe("Prompt diagnosis, never measured", () => {
  it("says no observation exists rather than reporting a clean result", async () => {
    stub({ promptResults: results({ byPrompt: [], totalChecks: 0 }) });
    renderPage();
    const note = await screen.findByTestId("v2-diagnosis-never-checked");
    expect(note.textContent).toContain("never been checked");
    expect(note.textContent).toContain("no observation exists at all");
    expect(screen.queryByTestId("v2-diagnosis-answer-row")).toBeNull();

    // The observation row carries the "Not measured" vocabulary, not a zero.
    expect(screen.getByTestId("v2-row-observation").textContent).toContain("Not measured");
    expect(screen.getByTestId("v2-boundary-observed").textContent).toContain(
      "No model returned an answer",
    );
  });

  it("distinguishes every-call-failed from never-checked", async () => {
    stub({
      promptResults: results({
        byPrompt: [
          {
            promptId: "prompt-1",
            prompt: "Which PR service supports early-stage founders in India?",
            rationale: null,
            platforms: [answer({ platform: "ChatGPT", snippet: "Check failed: upstream timeout" })],
            reportCount: 1,
            lastCheckedAt: "2026-09-08T00:00:00.000Z",
          },
        ],
      }),
    });
    renderPage();
    await screen.findByTestId("v2-diagnosis-answers");
    // A check ran and failed, so the state is "Failed", not "Not measured".
    expect(screen.getByTestId("v2-row-observation").textContent).toContain("Failed");
    expect(screen.getByTestId("v2-row-observation").textContent).not.toContain("Not measured");
    expect(screen.getAllByTestId("v2-diagnosis-answer-row")).toHaveLength(1);
    expect(screen.getByTestId("v2-diagnosis-answer-count").textContent).toContain(
      "No model returned an answer",
    );
  });

  it("names a brand with no approved question", async () => {
    stub({ prompts: [], promptResults: results({ byPrompt: [], totalChecks: 0 }) });
    renderPage();
    const block = await screen.findByTestId("v2-diagnostics-no-prompts");
    expect(block.textContent).toContain("No buyer question has been approved yet");
    expect(block.textContent).toContain("no observation exists at all");
  });
});

// ── Loading and error ────────────────────────────────────────────────────

describe("Prompt diagnosis, loading and error", () => {
  it("renders a skeleton while the reads are pending", () => {
    renderPage();
    expect(screen.getByTestId("v2-diagnostics-loading")).toBeTruthy();
    expect(screen.queryByTestId("v2-prompt-diagnosis")).toBeNull();
  });

  it("reports a failed read without claiming anything was measured", async () => {
    stub({ promptResults: new Error("boom") });
    renderPage();
    const block = await screen.findByTestId("v2-diagnostics-error");
    expect(block.textContent).toContain("Your answers could not be loaded");
    expect(block.textContent).toContain("nothing has been measured or changed");
    expect(screen.queryByTestId("v2-diagnosis-answer-row")).toBeNull();
  });
});

// ── The three unbuilt tabs ───────────────────────────────────────────────

describe("The sibling tabs", () => {
  it.each([
    ["site_health", "Site health"],
    ["geo_signals", "GEO signals"],
    ["perception", "Perception"],
  ])("%s states that it is not built", async (id, label) => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("v2-prompt-diagnosis");

    await user.click(screen.getByTestId(`v2-diagnostics-tab-${id}`));
    const panel = await screen.findByTestId("v2-diagnostics-not-built");

    expect(panel.textContent).toContain(NOT_BUILT_LABEL);
    expect(panel.textContent).toContain(`${label} has not been built yet`);
    expect(panel.textContent).toContain("no finding, no score, and no count, not even a zero");

    // Nothing that could be mistaken for a measurement.
    expect(within(panel).queryByText(/%/)).toBeNull();
    expect(panel.textContent).not.toMatch(/\b\d+ of \d+\b/);
    expect(screen.queryByTestId("v2-diagnosis-answer-row")).toBeNull();
  });

  it("does not leave the evidence boundaries standing beside an unbuilt tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("v2-prompt-diagnosis");
    await user.click(screen.getByTestId("v2-diagnostics-tab-perception"));

    await waitFor(() => expect(screen.getByTestId("v2-diagnostics-unbuilt-rail")).toBeTruthy());
    expect(screen.queryByTestId("v2-boundary-observed")).toBeNull();
  });

  it("says Change history does not exist rather than showing an empty timeline", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("v2-prompt-diagnosis");
    await user.click(screen.getByTestId("v2-diagnosis-subtab-history"));

    const block = await screen.findByTestId("v2-diagnosis-history-not-built");
    expect(block.textContent).toContain("Change history has not been built");
    expect(block.textContent).toContain("not an empty one, none at all");
  });
});
