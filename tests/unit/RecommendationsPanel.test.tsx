// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock auth + brand selection so we control user.id and brandId.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: vi.fn(),
}));

// Mock Wouter Link as a plain anchor — renders the children directly.
vi.mock("wouter", () => ({
  Link: ({ href, children, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import RecommendationsPanel from "@/components/dashboard/RecommendationsPanel";

function renderPanel(opts: { userId?: string; brandId?: string; recs?: any[] }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (opts.recs !== undefined && opts.brandId) {
    qc.setQueryData([`/api/brands/${opts.brandId}/recommendations`], {
      success: true,
      data: opts.recs,
    });
  }
  return render(
    <QueryClientProvider client={qc}>
      <RecommendationsPanel />
    </QueryClientProvider>,
  );
}

const SAMPLE_P0_REC = {
  id: "create-brand",
  title: "Create your first brand",
  why: "Brand profiles are the foundation.",
  ctaLabel: "Create brand",
  ctaHref: "/brands",
  priority: "P0",
  category: "setup",
  dismissible: false,
};

const SAMPLE_P1_REC = {
  id: "add-brand-fact-sheet",
  title: "Add a brand fact sheet",
  why: "Improves citation accuracy.",
  ctaLabel: "Add facts",
  ctaHref: "/brand-fact-sheet",
  priority: "P1",
  category: "citations",
  dismissible: true,
};

describe("RecommendationsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-A" },
      isLoading: false,
    } as any);
    vi.mocked(useBrandSelection).mockReturnValue({
      selectedBrandId: "brand-1",
      selectedBrand: { id: "brand-1", name: "Acme" },
      brands: [],
      isLoading: false,
    } as any);
  });
  afterEach(() => localStorage.clear());

  it("renders multiple P0 cards correctly with no dismiss button", () => {
    renderPanel({
      brandId: "brand-1",
      recs: [
        SAMPLE_P0_REC,
        { ...SAMPLE_P0_REC, id: "add-brand-industry", title: "Add industry" },
        { ...SAMPLE_P0_REC, id: "generate-first-article", title: "Generate first article" },
      ],
    });
    expect(screen.getByText("Create your first brand")).toBeInTheDocument();
    expect(screen.getByText("Add industry")).toBeInTheDocument();
    expect(screen.getByText("Generate first article")).toBeInTheDocument();
    // P0 cards have no dismiss button.
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("dismiss button on P1 card removes it + writes localStorage with timestamp", async () => {
    renderPanel({ brandId: "brand-1", recs: [SAMPLE_P1_REC] });
    expect(screen.getByText("Add a brand fact sheet")).toBeInTheDocument();

    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    await userEvent.click(dismissBtn);

    // Card removed from view.
    expect(screen.queryByText("Add a brand fact sheet")).not.toBeInTheDocument();
    // localStorage written with timestamp keyed by user.id.
    const raw = localStorage.getItem("venturecite-recs-dismissed:user-A");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed["add-brand-fact-sheet"]).toBeTruthy();
    // Value is an ISO timestamp.
    expect(() => new Date(parsed["add-brand-fact-sheet"])).not.toThrow();
  });

  it("different user.id sees fresh recommendations (dismissals don't leak)", () => {
    // user-A dismissed it.
    localStorage.setItem(
      "venturecite-recs-dismissed:user-A",
      JSON.stringify({ "add-brand-fact-sheet": new Date().toISOString() }),
    );

    // Switch to user-B.
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-B" },
      isLoading: false,
    } as any);

    renderPanel({ brandId: "brand-1", recs: [SAMPLE_P1_REC] });

    // user-B sees the recommendation (their localStorage is empty).
    expect(screen.getByText("Add a brand fact sheet")).toBeInTheDocument();
  });
});
