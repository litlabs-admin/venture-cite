// @vitest-environment happy-dom
//
// B9 UI/UX audit, two fixes to client/src/pages/keyword-research.tsx:
//
// 1. WRONG EMPTY STATE: `filteredKeywords.length === 0` was the only check
//    before showing "No Keywords Found - Discover Keywords with AI". A
//    brand that already has keywords, just none matching the current status
//    filter, got offered another paid AI generation job instead of the
//    actual fix (clear the filter). Now `keywords.length === 0` (genuinely
//    empty) and `filteredKeywords.length === 0` (filter excludes
//    everything) render distinct empty states.
//
// 2. FALSY-ZERO: `keyword.searchVolume ? … : "-"` rendered a real, estimated
//    0 the same as "no estimate at all". Fixed to `!= null`.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => () => {},
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({
    selectedBrandId: "brand-1",
    selectedBrand: { id: "brand-1", name: "Acme" },
  }),
}));

vi.mock("@/hooks/use-loading-messages", () => ({
  useLoadingMessages: () => "Working…",
}));

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const KEYWORD_TRACKED = {
  id: "kw-1",
  keyword: "best crm",
  status: "tracked",
  searchVolume: 0,
  difficulty: 10,
  aiCitationPotential: 50,
  intent: "commercial",
  contentType: "comparison",
};
const KEYWORD_DISMISSED = {
  id: "kw-2",
  keyword: "worst crm",
  status: "dismissed",
  searchVolume: 500,
  difficulty: 20,
  aiCitationPotential: 30,
  intent: "informational",
  contentType: "listicle",
};

import { queryClient } from "@/lib/queryClient";
import KeywordResearchPage from "@/pages/keyword-research";

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <KeywordResearchPage />
    </QueryClientProvider>,
  );
}

describe("KeywordResearchPage", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: true, data: [KEYWORD_TRACKED, KEYWORD_DISMISSED] }),
        ),
    );
  });

  it("shows a real 0 search volume, not a dash", async () => {
    renderPage();
    const value = await screen.findByText("best crm");
    const row = value.closest("[data-testid], .rounded-lg, div");
    expect(row).toBeTruthy();
    // The tracked keyword's searchVolume is a real 0 - it must render as
    // "0", never the "-" used for "no estimate".
    expect(await screen.findByText("0")).toBeTruthy();
  });

  it("offers 'Clear filter' (not another AI job) when a filter excludes every keyword", async () => {
    renderPage();
    await screen.findByText("best crm");

    // Switch the persisted filter directly (same storage key the page
    // reads on mount) to a status neither seeded keyword has, forcing
    // filteredKeywords to empty while keywords stays non-empty.
    localStorage.setItem("vc_keywords_filter", JSON.stringify("in_progress"));

    // Re-render fresh so the page picks up the new persisted filter value.
    renderPage();

    expect(await screen.findByText("No keywords match this filter")).toBeTruthy();
    expect(screen.getByText("Clear filter")).toBeTruthy();
    expect(screen.queryByText("Discover Keywords")).toBeNull();
  });
});
