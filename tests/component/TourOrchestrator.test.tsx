// @vitest-environment jsdom
// tests/component/TourOrchestrator.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TourOrchestrator } from "../../client/src/tours/engine/TourOrchestrator";
import { emptyTourState, wildcardSuppressedTourState } from "../fixtures/tourState";

vi.mock("shepherd.js", () => ({
  default: {
    Tour: vi.fn(() => ({
      addStep: vi.fn(),
      start: vi.fn(),
      cancel: vi.fn(),
      complete: vi.fn(),
      back: vi.fn(),
      next: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

vi.mock("../../client/src/tours/engine/featureFlag", () => ({
  isTourEngineEnabled: () => true,
}));

vi.mock("../../client/src/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@example.com" },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("../../client/src/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "b1", selectedBrand: { name: "Brand A" } }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard"],
  useSearch: () => "",
}));

let mockedState = emptyTourState;
vi.mock("../../client/src/hooks/useTourState", () => ({
  useTourState: () => ({ state: mockedState, isLoading: false }),
  useTourStatePatch: () => ({ mutate: vi.fn() }),
}));

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("TourOrchestrator", () => {
  beforeEach(() => {
    mockedState = emptyTourState;
  });

  it("mounts and renders nothing visible", () => {
    const { container } = render(<TourOrchestrator />, { wrapper: wrap() });
    expect(container.firstChild).toBeNull();
  });

  it("does not auto-fire when wildcard suppress is set", async () => {
    mockedState = wildcardSuppressedTourState;
    const Shepherd = await import("shepherd.js");
    const TourSpy = vi.spyOn(Shepherd.default, "Tour");
    render(<TourOrchestrator />, { wrapper: wrap() });
    await waitFor(() => {
      expect(TourSpy).not.toHaveBeenCalled();
    });
  });
});
