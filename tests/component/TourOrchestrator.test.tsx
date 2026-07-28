// @vitest-environment jsdom
// tests/component/TourOrchestrator.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TourOrchestrator } from "../../client/src/tours/engine/TourOrchestrator";
import { emptyTourState, wildcardSuppressedTourState } from "../fixtures/tourState";

vi.mock("shepherd.js", () => ({
  default: {
    // vitest 4 calls this with `new` (Shepherd.Tour is instantiated via
    // `new`), so the implementation must be a real function — arrow
    // functions cannot be constructor-called and would throw.
    Tour: vi.fn(function () {
      return {
        addStep: vi.fn(),
        start: vi.fn(),
        cancel: vi.fn(),
        complete: vi.fn(),
        back: vi.fn(),
        next: vi.fn(),
        on: vi.fn(),
      };
    }),
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

// Partial mock — the module also exports createFileRoute and the route-tree
// machinery, so the whole module must not be replaced.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouterState: () => "/dashboard",
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
    // The first test's auto-fire effect can resolve asynchronously after
    // its own assertions finish, leaking a Shepherd.Tour() call into the
    // next test's spy. Clear call history (not implementations) so each
    // test's assertions only see calls it caused itself. This was
    // previously invisible because the whole file crashed at import time
    // with "React is not defined" before either test ever ran.
    vi.clearAllMocks();
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
