// @vitest-environment happy-dom
//
// Tests for MentionsTab composition - Task 20 of the Mentions Rebuild plan.
// Tests: empty states, list render, loadMore, detail-sheet URL, filter URL
// persistence, delete undo toast, and a11y (axe skipped until Task 24).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// vitest-axe - enabled in Task 24
// ---------------------------------------------------------------------------
// `toHaveNoViolations` was never actually exported from vitest-axe's main
// entry (it only lives in "vitest-axe/matchers") - importing it from
// "vitest-axe" silently resolved to `undefined` under vitest 3's more
// lenient expect.extend(). vitest 4's expect.extend() accesses matcher
// internals eagerly and throws on an undefined matcher, which is what
// surfaced this pre-existing bad import.
import { axe } from "vitest-axe";
import { toHaveNoViolations } from "vitest-axe/matchers.js";

expect.extend({ toHaveNoViolations });

// ---------------------------------------------------------------------------
// Mock TanStack Router's navigation hooks so URL-driven tests work.
//
// useSearch returns a parsed OBJECT (src/router.tsx pins the router to
// string-in/string-out search params); the old wouter shim returned a raw
// query STRING. navigate() receives { to, search, replace } where `search`
// is an UPDATER FUNCTION, so unrelated params survive.
// ---------------------------------------------------------------------------

let _location = "/geo-tools";
let _search: Record<string, string> = {};
const navigateMock = vi.fn(
  (opts: {
    to?: string;
    search?: (prev: Record<string, string>) => Record<string, string>;
    replace?: boolean;
  }) => {
    if (opts.to) _location = opts.to;
    if (typeof opts.search === "function") {
      _search = opts.search(_search) as Record<string, string>;
    }
  },
);

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigateMock,
  useRouterState: () => _location,
  useSearch: () => _search,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) =>
    React.createElement("a", { href: to }, children),
}));

// ---------------------------------------------------------------------------
// Mock apiRequest so TanStack Query doesn't hit the network
// ---------------------------------------------------------------------------

const apiRequestMock = vi.fn();

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  isApiError: (err: unknown) => err instanceof Error && "status" in err,
}));

// ---------------------------------------------------------------------------
// Mock useToast
// ---------------------------------------------------------------------------

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

// ---------------------------------------------------------------------------
// Mock ToastAction (Radix won't render in happy-dom without a Provider)
// ---------------------------------------------------------------------------

vi.mock("@/components/ui/toast", () => ({
  ToastAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    altText?: string;
  }) => React.createElement("button", { onClick }, children),
}));

// ---------------------------------------------------------------------------
// Mock useMentions - controls all hook output from one place
// ---------------------------------------------------------------------------

const useMentionsMock = vi.fn();
vi.mock("@/hooks/useMentions", () => ({
  useMentions: (...args: unknown[]) => useMentionsMock(...args),
}));

// ---------------------------------------------------------------------------
// Mock child components that have side-effects / Radix Portal issues
// ---------------------------------------------------------------------------

vi.mock("@/components/geo-tools/ScanStatusPanel", () => ({
  ScanStatusPanel: ({ brandId }: { brandId: string }) =>
    React.createElement("div", { "data-testid": "scan-status-panel", "data-brand": brandId }),
}));

vi.mock("@/components/geo-tools/MentionDetailSheet", () => ({
  default: ({
    mention,
    onClose,
  }: {
    mention: { id: string; sourceTitle?: string } | null;
    onClose: () => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "mention-detail-sheet" },
      mention
        ? React.createElement(
            "div",
            null,
            React.createElement("span", null, mention.sourceTitle ?? mention.id),
            React.createElement(
              "button",
              { onClick: onClose, "data-testid": "close-sheet" },
              "Close",
            ),
          )
        : null,
    ),
}));

vi.mock("@/components/geo-tools/MentionCard", () => ({
  default: ({
    mention,
    onOpen,
    onDelete,
  }: {
    mention: { id: string; sourceTitle?: string };
    onOpen: (m: { id: string }) => void;
    onDelete: (id: string) => void;
  }) =>
    // Two sibling interactive controls, not nested - axe flags a <button>
    // nested inside a role="button" container as "nested-interactive".
    React.createElement(
      "div",
      { "data-testid": `mention-card-${mention.id}` },
      React.createElement(
        "button",
        { onClick: () => onOpen(mention) },
        mention.sourceTitle ?? mention.id,
      ),
      React.createElement(
        "button",
        {
          "data-testid": `delete-mention-${mention.id}`,
          onClick: () => onDelete(mention.id),
        },
        "Delete",
      ),
    ),
}));

vi.mock("@/components/geo-tools/MentionsFilters", () => ({
  default: ({
    filters,
    onChange,
    onClear,
  }: {
    filters: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
    onClear: () => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "mentions-filters" },
      React.createElement(
        "button",
        {
          "data-testid": "filter-status-btn",
          onClick: () => onChange("status", "new"),
        },
        "Set status=new",
      ),
      React.createElement(
        "button",
        { "data-testid": "clear-filters-btn", onClick: onClear },
        "Clear",
      ),
      React.createElement("span", null, JSON.stringify(filters)),
    ),
}));

vi.mock("@/components/geo-tools/AddMentionDialog", () => ({
  AddMentionDialog: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", { "data-testid": "add-mention-dialog" }) : null,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BRAND_ID = "brand-abc-123";

function makeMention(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    brandId: BRAND_ID,
    platform: "reddit",
    sourceUrl: `https://reddit.com/r/test/comments/${id}`,
    sourceTitle: `Post title ${id}`,
    mentionContext: "context",
    sentiment: "neutral",
    sentimentScore: "0.50",
    engagementScore: null,
    authorUsername: null,
    isVerified: 0,
    status: "new",
    mentionedAt: null,
    discoveredAt: new Date().toISOString(),
    metadata: null,
    mentionLocation: "post",
    linkStatus: "unknown",
    lastVerifiedAt: null,
    matchedVariation: null,
    matchedField: null,
    source: "scanner",
    scannerVersion: 2,
    sentimentSource: "llm",
    engagementNormalized: null,
    ...overrides,
  };
}

const DEFAULT_STATS = {
  total: 0,
  byPlatform: {},
  bySentiment: { positive: 0, neutral: 0, negative: 0 },
  byStatus: {},
};

function makeHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    mentions: [],
    isLoading: false,
    isError: false,
    hasMore: false,
    loadMore: vi.fn(),
    filters: {},
    setFilter: vi.fn((key: string, value: unknown) => {
      // Simulate URL update against the parsed search object.
      const next = { ..._search };
      if (value === undefined || value === "" || value === false) {
        delete next[key];
      } else {
        next[key] = String(value);
      }
      _search = next;
    }),
    clearFilters: vi.fn(),
    stats: DEFAULT_STATS,
    activeScan: null,
    startScan: vi.fn(),
    scanCooldown: { canStart: true, nextAvailableAt: null },
    updateStatus: vi.fn(),
    deleteMention: vi.fn(),
    bulkDelete: vi.fn(),
    deleteAllForBrand: vi.fn(),
    markFalsePositive: vi.fn(),
    manualAdd: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

// We need to import MentionsTab AFTER mocks are set up.
// Dynamic import is used to avoid hoisting issues.
import MentionsTab from "@/components/geo-tools/MentionsTab";

function renderTab(brandId: string | null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  // Seed brands cache so the tab can find brand name
  if (brandId) {
    qc.setQueryData(["/api/brands"], {
      success: true,
      data: [
        { id: brandId, name: "AcmeCorp", nameVariations: ["acme", "Acme"], monitorMentions: false },
      ],
    });
  }
  return render(
    <QueryClientProvider client={qc}>
      <MentionsTab brandId={brandId} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MentionsTab", () => {
  beforeEach(() => {
    _location = "/geo-tools";
    _search = {};
    navigateMock.mockClear();
    toastMock.mockClear();
    apiRequestMock.mockResolvedValue(
      new Response(JSON.stringify({ rows: [] }), {
        headers: { "content-type": "application/json" },
      }),
    );
  });

  // 1. No brandId - select-brand empty state
  it("renders 'select a brand' when brandId is null", () => {
    useMentionsMock.mockReturnValue(makeHookReturn());
    renderTab(null);
    expect(screen.getByText(/select a brand/i)).toBeTruthy();
  });

  // 2. brandId set, no scans run yet (lastCompletedScan null + mentions empty)
  it("renders no-scans-yet empty state when brand set but no scans completed", () => {
    useMentionsMock.mockReturnValue(
      makeHookReturn({
        mentions: [],
        stats: DEFAULT_STATS,
      }),
    );
    renderTab(BRAND_ID);
    expect(screen.getByText(/no scans yet/i)).toBeTruthy();
  });

  // 3. brandId set, scan ran, 0 mentions
  it("renders scan-ran-but-no-mentions state when lastCompletedScan exists and list is empty", () => {
    useMentionsMock.mockReturnValue(
      makeHookReturn({
        mentions: [],
        // Simulate that a scan has run by having activeScan completed
        activeScan: null,
      }),
    );
    // Pass a brand with a completed scan via a lastCompletedScan-aware prop
    // Since hook doesn't expose lastCompletedScan, MentionsTab fetches it separately.
    // We inject via the qc seed.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    qc.setQueryData(["/api/brands"], {
      success: true,
      data: [{ id: BRAND_ID, name: "AcmeCorp", nameVariations: [], monitorMentions: false }],
    });
    // Seed last-completed-scan data
    qc.setQueryData(["/api/brand-mentions/scans/last", BRAND_ID], {
      data: {
        id: "scan-1",
        brandId: BRAND_ID,
        status: "complete",
        trigger: "manual",
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        perSource: {},
      },
    });
    render(
      <QueryClientProvider client={qc}>
        <MentionsTab brandId={BRAND_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/no mentions found/i)).toBeTruthy();
  });

  // 4. Renders the list when mentions are present
  it("renders mention cards when mentions are present", () => {
    const mentions = [makeMention("m1"), makeMention("m2")];
    useMentionsMock.mockReturnValue(makeHookReturn({ mentions }));
    renderTab(BRAND_ID);
    expect(screen.getByTestId("mention-card-m1")).toBeTruthy();
    expect(screen.getByTestId("mention-card-m2")).toBeTruthy();
  });

  // 5. "Load more" calls hook's loadMore
  it("calls loadMore when Load more button is clicked", async () => {
    const loadMoreMock = vi.fn();
    const mentions = [makeMention("m1")];
    useMentionsMock.mockReturnValue(
      makeHookReturn({ mentions, hasMore: true, loadMore: loadMoreMock }),
    );
    renderTab(BRAND_ID);
    const loadMoreBtn = screen.getByRole("button", { name: /load more/i });
    await userEvent.click(loadMoreBtn);
    expect(loadMoreMock).toHaveBeenCalledOnce();
  });

  // 6. Clicking a card opens detail sheet (URL has ?mention=<id>)
  it("opens detail sheet and writes mention id to URL when a card is clicked", async () => {
    const mentions = [makeMention("m1", { sourceTitle: "Hello Reddit" })];
    useMentionsMock.mockReturnValue(makeHookReturn({ mentions }));
    renderTab(BRAND_ID);
    const card = screen.getByText("Hello Reddit");
    await userEvent.click(card);
    // URL should now include mention=m1. navigate() takes `search` as an
    // updater function, so assert on what the updater actually produces -
    // a shallow argument match cannot see through the closure.
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ replace: true, search: expect.any(Function) }),
    );
    const call = navigateMock.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, string>) => Record<string, string>;
    };
    expect(call.search({})).toEqual({ mention: "m1" });
    // Unrelated params must survive - dropping brandId here would silently
    // reset the user's brand selection when they open a mention.
    expect(call.search({ brandId: "b1" })).toEqual({ brandId: "b1", mention: "m1" });
  });

  // 7. Status filter URL persistence
  it("persists status filter to URL via setFilter", async () => {
    const setFilterMock = vi.fn();
    useMentionsMock.mockReturnValue(makeHookReturn({ setFilter: setFilterMock }));
    renderTab(BRAND_ID);
    const filterBtn = screen.getByTestId("filter-status-btn");
    await userEvent.click(filterBtn);
    expect(setFilterMock).toHaveBeenCalledWith("status", "new");
  });

  // 8. Delete control on the rendered card is wired to the hook's deleteMention.
  //
  // The undo toast itself is fired inside useMentions' onSuccess callback and
  // is covered end-to-end (real hook, real toast call) by
  // tests/unit/useMentions.test.tsx ("deleteMention removes the row
  // optimistically and shows an undo toast"). This test's job is the part
  // that lives in THIS component: that clicking the card's delete control
  // actually invokes the hook's deleteMention with the clicked mention's id -
  // i.e. that `onDelete={deleteMention}` is really passed to MentionCard.
  it("wires the rendered card's delete control to the hook's deleteMention", async () => {
    const deleteMentionMock = vi.fn();
    const mentions = [makeMention("m1"), makeMention("m2")];
    useMentionsMock.mockReturnValue(makeHookReturn({ mentions, deleteMention: deleteMentionMock }));
    renderTab(BRAND_ID);

    const deleteBtn = screen.getByTestId("delete-mention-m1");
    await userEvent.click(deleteBtn);

    expect(deleteMentionMock).toHaveBeenCalledExactlyOnceWith("m1");
    // Clicking m1's delete control must not also open the detail sheet or
    // delete an unrelated mention.
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // 9. axe a11y - Task 24: assert no critical/serious violations
  it("MentionsTab passes axe-core (no critical or serious violations)", async () => {
    const mentions = [makeMention("m1")];
    useMentionsMock.mockReturnValue(makeHookReturn({ mentions }));
    const { container } = renderTab(BRAND_ID);
    const results = await axe(container);
    // Filter to critical + serious only - minor/moderate are deferred
    const blocking = (results.violations ?? []).filter(
      (v: any) => v.impact === "critical" || v.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
});
