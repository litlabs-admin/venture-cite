// @vitest-environment happy-dom
//
// B9 UI/UX audit: client/src/pages/brand-fact-sheet.tsx used to gate its
// entire body on `{selectedBrand && (...)}` with no else branch. `selectedBrand`
// is falsy in three real situations - the brands query is still loading, the
// account has no brands yet, and a failed /api/brands request - and all three
// rendered literally nothing inside <PanelPage>, which reads as a broken,
// blank page rather than any of loading/empty/error. The fix adds explicit
// loading and "select a brand" branches so the page always shows something.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const brandSelectionState = vi.hoisted(() => ({
  selectedBrandId: "",
  selectedBrand: undefined as { id: string; name: string } | undefined,
  isLoading: false,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => brandSelectionState,
}));

vi.mock("@/hooks/useScrapeRunStream", () => ({
  useScrapeRunStream: () => ({
    events: [],
    status: "idle",
    isStreaming: false,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

import BrandFactSheet from "@/pages/brand-fact-sheet";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrandFactSheet />
    </QueryClientProvider>,
  );
}

describe("BrandFactSheet - no blank page while unresolved", () => {
  it("shows a loading skeleton (not a blank page) while brands are loading", () => {
    brandSelectionState.selectedBrandId = "";
    brandSelectionState.selectedBrand = undefined;
    brandSelectionState.isLoading = true;

    const { container } = renderPage();

    expect(screen.queryByText("Select a brand to get started")).toBeNull();
    // A real loading placeholder (Skeleton renders "shimmer-sweep") is
    // present - the page is not empty.
    expect(container.querySelectorAll(".shimmer-sweep").length).toBeGreaterThan(0);
  });

  it("shows a 'select a brand' message (not a blank page) once loading settles with no brand chosen", () => {
    brandSelectionState.selectedBrandId = "";
    brandSelectionState.selectedBrand = undefined;
    brandSelectionState.isLoading = false;

    renderPage();

    expect(screen.getByText("Select a brand to get started")).toBeTruthy();
  });
});
