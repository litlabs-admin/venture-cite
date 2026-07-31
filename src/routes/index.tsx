import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import Landing from "@/pages/landing";

// The public marketing homepage, server-rendered. This route is
// deliberately NOT auth-conditional the way client/src/App.tsx's old
// wouter HomePage was — a per-route SSR flag can't straddle "landing for
// logged-out visitors, dashboard for logged-in ones" at the same URL. The
// server never needs to know who the request is from: it always renders
// Landing. Authenticated visitors are bounced to /dashboard (which renders
// the same Home component wouter's HomePage rendered) client-side, after
// hydration, in the effect below — see the plan doc's "splitting /"
// decision (docs/superpowers/plans/2026-07-27-phase2-tanstack-start-migration.md).
export const Route = createFileRoute("/")({
  // Overrides the root's default description (title text is identical,
  // description is landing-page-specific) — verbatim from what
  // client/src/pages/landing/index.tsx used to render itself via a raw
  // <title>/<meta> pair before this task moved metadata to the route.
  head: () => ({
    meta: [
      { title: "VentureCite — Get recommended by AI engines" },
      {
        name: "description",
        content:
          "See which brands AI recommends when your buyers ask, why it picks them, and what it takes to be on that list.",
      },
    ],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    // Router navigation, not `window.location.href`: a location assignment
    // triggers a full document reload AND drops the query string, which
    // silently lost params on links into `/` that carry state (e.g. the
    // `?brandId=` a freshly created brand arrives with). `replace` keeps the
    // public landing page out of history, so Back from the dashboard does
    // not bounce through a redirect that immediately fires again.
    void navigate({ to: "/dashboard", search, replace: true });
  }, [isLoading, isAuthenticated, navigate, search]);

  return <Landing />;
}
