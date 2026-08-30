// @vitest-environment happy-dom
//
// Confirms the test-mode banner is actually mounted where a source-text
// version of this file only checked for the literal string "<TestModeBanner
// />" inside AppShell.tsx and pricing.tsx. A string match survives the
// import being deleted while the JSX tag stays in a comment, and it says
// nothing about whether the component renders unconditionally or is buried
// behind a condition that never resolves true.
//
// @/components/TrialGate is mocked here to a marker component rather than
// imported for real, which is why this lives in its own file: rendering the
// REAL TestModeBanner (tests/unit/stripeTestModeBannerComponent.test.tsx)
// and mocking it to a marker cannot coexist in one module - vi.mock is
// file-scoped, not describe-scoped.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/TrialGate", () => ({
  TestModeBanner: () => <div data-testid="test-mode-banner-marker" />,
  TrialBanner: () => null,
  TrialGate: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
  useRouterState: () => "/dashboard",
  useSearch: () => ({}),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { success: true, data: [] }, isLoading: false }),
  useMutation: () => ({ mutate: () => {}, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));
vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "", brands: [] }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/urlSafety", () => ({ isAllowedStripeRedirect: () => true }));
vi.mock("@/components/CalendlyInline", () => ({ CalendlyInline: () => null }));
vi.mock("@/lib/calendly", () => ({ CALENDLY_BOOKING_URL: "https://calendly.test/book" }));
vi.mock("@/components/dashboard-panels/HeaderActions", () => ({ HeaderActions: () => null }));
vi.mock("@/components/Sidebar", () => ({ default: () => null, SidebarContent: () => null }));
vi.mock("@/components/EducationAssistant", () => ({ default: () => null }));
vi.mock("@/components/CommandPalette", () => ({ default: () => null }));
vi.mock("@/components/BrandSelector", () => ({ default: () => null }));
vi.mock("@/components/PageHeaderHelp", () => ({ PageHeaderHelp: () => null }));
vi.mock("@/lib/spineStages", () => ({ spineTitleFor: () => null, pageTourFor: () => undefined }));
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => null }));

describe("the test-mode banner is mounted where money is entered", () => {
  it("AppShell mounts it inside the canvas, unconditionally - every authenticated route gets it", async () => {
    const AppShell = (await import("@/components/AppShell")).default;
    render(<AppShell>{null}</AppShell>);
    expect(screen.getByTestId("test-mode-banner-marker")).toBeTruthy();
  });

  it("the pricing page mounts it - this is the page where the card is actually entered", async () => {
    const Pricing = (await import("@/pages/pricing")).default;
    render(<Pricing />);
    expect(screen.getByTestId("test-mode-banner-marker")).toBeTruthy();
  });
});
