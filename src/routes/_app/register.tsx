import { createFileRoute } from "@tanstack/react-router";

// /register used to be the standalone sign-up page. Sign-up now happens
// inside the public, pre-account /start onboarding flow (see
// docs/superpowers/specs/2026-09-18-onboarding-data-contract.md), which
// calls POST /api/auth/register from its final step. This route stays only
// as a redirect so old bookmarks, emails and any external links that still
// point at /register keep working. Forwards the full query string - /start's
// validateSearch (src/routes/-shared/searchSchemas.ts) only reads `domain`,
// but passthrough means anything else on the URL survives the hop too.
//
// A plain `window.location.replace` (not `<Navigate>`) matches the pattern
// already used by the auth-redirect gates in ../-shared/routeGates.tsx, and
// is safe here because this route is nested under `_app`, which carries
// `ssr: false` (src/routes/_app.tsx) - `window` is always defined by the
// time this runs.
export const Route = createFileRoute("/_app/register")({
  component: RegisterRedirect,
});

function RegisterRedirect() {
  if (typeof window !== "undefined") {
    window.location.replace(`/start${window.location.search}`);
  }
  return null;
}
