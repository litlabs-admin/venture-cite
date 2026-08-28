// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TourOrchestrator } from "../../client/src/tours/engine/TourOrchestrator";

const testState = vi.hoisted(() => ({
  user: { id: "user-1", isAdmin: false },
}));
const runTour = vi.hoisted(() => vi.fn(() => ({ cancel: vi.fn() })));

vi.mock("../../client/src/tours/engine/shepherdAdapter", () => ({ runTour }));
vi.mock("../../client/src/tours/engine/featureFlag", () => ({ isTourEngineEnabled: () => true }));
vi.mock("../../client/src/hooks/use-auth", () => ({ useAuth: () => ({ user: testState.user }) }));
vi.mock("../../client/src/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "brand-1", selectedBrand: { name: "Acme" } }),
}));
vi.mock("../../client/src/hooks/useTourState", () => ({
  useTourState: () => ({ state: {}, isReady: false }),
  useTourStatePatch: () => ({ mutate: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => "/dashboard" }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("TourOrchestrator preview parameter", () => {
  it("does not run a preview tour for a non-admin user", () => {
    window.history.replaceState({}, "", "/dashboard?previewTour=global-welcome");

    render(<TourOrchestrator />, { wrapper });

    expect(runTour).not.toHaveBeenCalled();
  });
});
