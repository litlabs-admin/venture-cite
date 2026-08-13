import { Suspense, type ComponentType } from "react";
import { Navigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useAuth } from "@/hooks/use-auth";
import { RouteSpinner, ContentSkeleton } from "@/components/foundations";
import { resolveTier, usageLimits } from "@shared/schema";

// Phase 2 Task 5: verbatim copies of the four small route-gate helpers that
// used to live inline in client/src/App.tsx (AuthenticatedRoute, AuthenticatedBareRoute,
// FirstRunGate, SpineRedirect). client/src/App.tsx has since been deleted
// (Phase 2 Task 6a - its <Switch>/<Route> table was superseded by src/routes/
// itself, and it did not export these; they were local functions). They stay
// duplicated here rather than re-consolidated, since this file lives under
// `-shared/`, a directory prefixed with the router plugin's default
// `routeFileIgnorePrefix` ("-"), so the codegen does not try to treat it as
// a route.
//
// Every gated route in the new tree is nested under `_app.tsx`, which carries
// `ssr: false` (see src/routes/_app.tsx) - so, exactly as before, `window` is
// always defined by the time these run; none of the auth-redirect-during-render
// behavior needed to change to make this safe.
//
// Phase 2 Task 7: the router-compat shim (client/src/lib/router-compat.tsx)
// is deleted project-wide, so both local helpers move onto TanStack Router's
// own `<Navigate>` (native-api-contract.md). The blocker recorded in the
// previous version of this comment - `<Navigate>`'s `to` resolving as
// REQUIRED even when only `href` is given - no longer applies: neither
// helper below passes `href` at all now, and FirstRunGate's target
// ("/welcome") is a real literal route id, so `to="/welcome"` alone
// type-checks with no `href` escape hatch needed.
//
// SpineRedirect is different: its `to` prop is a runtime string chosen by
// each of the 12 legacy-route files that render it (competitors.tsx,
// community.tsx, citations.tsx, brand-fact-sheet.tsx, ai-visibility.tsx,
// ai-intelligence.tsx, geo-analytics.tsx, opportunities.tsx,
// crawler-check.tsx, geo-tools.tsx, faq-manager.tsx, geo-signals.tsx - all
// outside this task's file scope, so their call sites could not be edited
// here), and a plain `to: string` cannot satisfy `<Navigate>`'s route-tree-literal
// typing without a cast (forbidden by the contract). Grepping every call site
// (src/routes/_app/*.tsx) shows exactly four distinct targets - "/monitor",
// "/act", "/setup", "/diagnose" - each a real top-level route id in
// src/routeTree.gen.ts. `SpineTarget` below narrows `to` to that literal
// union instead of `string`, which both satisfies `<Navigate>`'s typing with
// zero casts and makes an unknown future target a compile error at the call
// site instead of a silent runtime 404.

export type SpineTarget = "/monitor" | "/act" | "/setup" | "/diagnose";

export function AuthenticatedRoute({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteSpinner />;
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  return (
    <AppShell>
      <ErrorBoundary>
        {/* AppShell (sidebar/header) is already mounted here, so the loading
            shape is knowable at the content-region level - unlike the bare
            `isLoading` gate above (no layout rendered yet) and
            AuthenticatedBareRoute's Suspense below (no shell at all), both
            of which keep RouteSpinner. */}
        <Suspense fallback={<ContentSkeleton />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export function AuthenticatedBareRoute({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteSpinner />;
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  return (
    <ErrorBoundary>
      {/* No AppShell here - this route has no chrome mounted at all yet, so
          there's no knowable content shape to skeleton against. Keep the
          bare spinner. */}
      <Suspense fallback={<RouteSpinner />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

export function FirstRunGate({ component: Component }: { component: ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  // The /api/brands response is { success: true, data: Brand[] }.
  // Unwrap it so the redirect check below sees the array, not the envelope.
  const brandsQuery = useQuery<{ success: boolean; data: unknown[] }>({
    queryKey: ["/api/brands"],
    enabled: isAuthenticated,
  });

  if (isLoading || (isAuthenticated && brandsQuery.isLoading)) {
    return <RouteSpinner />;
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  // The plan comes before the brand. Someone with no plan cannot create one -
  // usageLimits gives them 0 brands and the server returns 403 - so sending
  // them to /welcome first walked every new signup into a form that scrapes
  // their site, runs an LLM over it, and only then refuses to save. Checking
  // maxBrands rather than naming tiers keeps this true if the tiers change,
  // and covers the lapsed account too: readonly is also 0, and a lapsed
  // customer with nothing left to look at belongs on pricing, not on a brand
  // form that will reject them.
  const brands = brandsQuery.data?.data;
  if (Array.isArray(brands) && brands.length === 0) {
    const canCreateBrand = user ? usageLimits[resolveTier(user)].maxBrands !== 0 : true;
    return <Navigate to={canCreateBrand ? "/welcome" : "/pricing"} />;
  }

  return (
    <AppShell>
      <ErrorBoundary>
        {/* Same reasoning as AuthenticatedRoute above: AppShell is already
            mounted, so a shape-matched skeleton fits better than a spinner. */}
        <Suspense fallback={<ContentSkeleton />}>
          <Component />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

/**
 * 301s a retired feature path into its workflow-spine home, preserving every
 * existing query param (brandId, action, autoScrape, …) and adding `?tab=`.
 * The spine target is itself auth-gated, so unauthenticated hits still bounce
 * to /login. `replace` keeps the old URL out of history so Back doesn't loop.
 */
export function SpineRedirect({ to, tab }: { to: SpineTarget; tab: string }) {
  const search = useSearch({ strict: false });
  return <Navigate to={to} search={{ ...search, tab }} replace />;
}
