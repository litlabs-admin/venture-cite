// @vitest-environment happy-dom
//
// The order of the two first-run gates, and where checkout lets go.
//
// Both of these are journey bugs, not logic bugs - every individual piece
// worked, they were just wired in the wrong order, so the customer met them
// back to front:
//
//   1. a brand-less account went to /welcome regardless of plan. usageLimits
//      gives an unsubscribed account 0 brands, so that form CANNOT succeed -
//      it scraped their site, ran an LLM over it, and only then returned 403.
//   2. checkout dropped them back on /pricing with a green tick, the page they
//      had just left, instead of moving them forward into the product.
//
// A source-text version of this file used to grep src/routes/-shared/routeGates.tsx
// for the literal substrings "canCreateBrand", '"/pricing"' and
// "usageLimits[resolveTier(user)].maxBrands". None of that proves the gate
// actually SENDS a brand-less account anywhere in particular - it proves
// those tokens exist somewhere in the file, in any order, even in a comment.
// The test below instead renders the real FirstRunGate against every real
// tier in shared/schema's usageLimits and checks where it actually navigates.
//
// Checkout's redirect URLs (bullet 2) are exercised behaviourally in
// tests/unit/billingCheckoutSafety.test.ts ("uses only server-controlled
// redirect URLs" hits the real POST /api/stripe/checkout route and asserts
// the exact success_url/cancel_url Stripe is given) - not duplicated here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolveTier, usageLimits } from "@shared/schema";

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  user: undefined as { accessTier?: string } | undefined,
}));
const brandsQueryState = vi.hoisted(() => ({
  isLoading: false,
  data: { success: true, data: [] as unknown[] },
}));
const queryClientSpy = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => authState }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: readonly unknown[] }) =>
    opts.queryKey[0] === "/api/brands" ? brandsQueryState : { data: undefined, isLoading: false },
  useMutation: () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false }),
  useQueryClient: () => queryClientSpy,
}));
vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-marker" data-to={to} />,
  useNavigate: () => () => {},
}));
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));
vi.mock("@/components/ErrorBoundary", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/foundations", () => ({
  RouteSpinner: () => <div data-testid="spinner" />,
  ContentSkeleton: () => null,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), refetchQueries: vi.fn() },
}));
vi.mock("@/lib/authStore", () => ({ getAccessToken: vi.fn() }));

const { FirstRunGate } = await import("../../src/routes/-shared/routeGates");
const Welcome = (await import("@/pages/welcome")).default;

function BrandForm() {
  return <div data-testid="brand-form" />;
}

describe("FirstRunGate - plan comes before brand", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    authState.user = undefined;
    brandsQueryState.isLoading = false;
    brandsQueryState.data = { success: true, data: [] };
  });

  // Every real tier from shared/schema's usageLimits, not a hardcoded list
  // written into this test - if a tier's entitlements changed shape, this
  // loop reflects that automatically instead of silently drifting from the
  // gate's own logic.
  for (const tier of Object.keys(usageLimits) as (keyof typeof usageLimits)[]) {
    const maxBrands = usageLimits[tier].maxBrands;
    const expectedDestination = maxBrands === 0 ? "/pricing" : "/welcome";

    it(`sends a brand-less "${tier}" account (maxBrands=${maxBrands}) to ${expectedDestination}`, () => {
      authState.user = { accessTier: tier };
      expect(resolveTier(authState.user)).toBe(tier); // sanity: not silently falling back to "pending"

      render(<FirstRunGate component={BrandForm} />);

      const marker = screen.getByTestId("navigate-marker");
      expect(marker.getAttribute("data-to")).toBe(expectedDestination);
    });
  }

  it("renders the brand form, not a redirect, once the account already has a brand", () => {
    authState.user = { accessTier: "pending" };
    brandsQueryState.data = { success: true, data: [{ id: "brand-1" }] };

    render(<FirstRunGate component={BrandForm} />);

    expect(screen.getByTestId("brand-form")).toBeTruthy();
    expect(screen.queryByTestId("navigate-marker")).toBeNull();
  });

  it("agrees with the entitlements it is reading - unsubscribed tiers really are 0 brands", () => {
    // The gate is only correct if these really are 0 - otherwise it sends
    // people who could create a brand to pricing instead.
    expect(usageLimits[resolveTier({ accessTier: "pending" })].maxBrands).toBe(0);
    expect(usageLimits[resolveTier({ accessTier: "readonly" })].maxBrands).toBe(0);
    // ...and paying accounts must NOT be diverted.
    expect(usageLimits[resolveTier({ accessTier: "pro" })].maxBrands).toBeGreaterThan(0);
    expect(usageLimits[resolveTier({ accessTier: "agency" })].maxBrands).toBeGreaterThan(0);
  });
});

describe("welcome.tsx - refreshes the cached user coming back from checkout", () => {
  const ORIGINAL_SEARCH = window.location.search;

  afterEach(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${ORIGINAL_SEARCH}`);
    queryClientSpy.invalidateQueries.mockClear();
  });

  it("invalidates the cached /api/auth/me when arriving with ?checkout=success", () => {
    window.history.replaceState(null, "", "/welcome?checkout=success");

    render(<Welcome />);

    expect(queryClientSpy.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["/api/auth/me"],
    });
  });

  it("does not invalidate anything on a plain visit with no checkout param", () => {
    window.history.replaceState(null, "", "/welcome");

    render(<Welcome />);

    expect(queryClientSpy.invalidateQueries).not.toHaveBeenCalled();
  });
});
