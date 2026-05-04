// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the auth hook so we can swap user.id between tests.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

// Mock Wouter Link so click navigation is testable without a router.
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { useAuth } from "@/hooks/use-auth";
import OnboardingProgressRing from "@/components/dashboard/OnboardingProgressRing";

function renderWithQueries(opts: {
  brands?: unknown[] | null;
  articles?: unknown[] | null;
  status?: { visibilityVisited: boolean; citationRunsCount: number } | null;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (opts.brands !== null && opts.brands !== undefined) {
    qc.setQueryData(["/api/brands"], { success: true, data: opts.brands });
  }
  if (opts.articles !== null && opts.articles !== undefined) {
    qc.setQueryData(["/api/articles"], { success: true, data: opts.articles });
  }
  if (opts.status !== null && opts.status !== undefined) {
    qc.setQueryData(["/api/onboarding-status"], { success: true, data: opts.status });
  }
  return render(
    <QueryClientProvider client={qc}>
      <OnboardingProgressRing />
    </QueryClientProvider>,
  );
}

describe("OnboardingProgressRing", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-A" },
      isLoading: false,
      logout: vi.fn(),
    } as any);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders skeleton when any query is still loading", () => {
    renderWithQueries({ brands: null, articles: [], status: null });
    expect(screen.getByTestId("onboarding-ring-skeleton")).toBeInTheDocument();
  });

  it("renders correct completed/total when all queries loaded with partial data", () => {
    renderWithQueries({
      brands: [{ id: "b-1" }],
      articles: [],
      status: { visibilityVisited: false, citationRunsCount: 0 },
    });
    expect(screen.getByText(/1\s*\/\s*4/i)).toBeInTheDocument();
  });

  it("auto-dismisses + writes localStorage when all 4 steps complete", async () => {
    renderWithQueries({
      brands: [{ id: "b-1" }],
      articles: [{ id: "a-1" }],
      status: { visibilityVisited: true, citationRunsCount: 1 },
    });
    expect(screen.getByText(/you're set/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem("venturecite-onboarding-ring-dismissed:user-A")).toBe("true");
    });
  });

  it("scopes dismissal by user.id — different user sees fresh ring", () => {
    localStorage.setItem("venturecite-onboarding-ring-dismissed:user-A", "true");
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-B" },
      isLoading: false,
      logout: vi.fn(),
    } as any);
    renderWithQueries({
      brands: [],
      articles: [],
      status: { visibilityVisited: false, citationRunsCount: 0 },
    });
    expect(screen.getByText(/0\s*\/\s*4/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're set/i)).not.toBeInTheDocument();
  });
});
