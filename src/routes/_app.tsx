import { Outlet, createFileRoute } from "@tanstack/react-router";

// This is the ssr:false cascade point. Every remaining route from
// client/src/App.tsx - auth pages, the auth-gated dashboard/spine/admin
// pages, the legacy redirects, and the catch-all 404 - is nested under this
// pathless layout (its children live in src/routes/_app/). `ssr: false` on a
// parent applies to every child and cannot be loosened by them (confirmed
// applies to every child and cannot be loosened by them.
// One flag here covers all 34 routes instead of repeating it per file.
//
// This layout intentionally does nothing besides opt out of SSR and render
// its outlet - AppShell/auth-gating stays exactly where it already lived
// (the per-route gate helpers in src/routes/-shared/routeGates.tsx, copied
// unchanged from client/src/App.tsx), so `/welcome` continues to render
// without AppShell exactly as it does today.
export const Route = createFileRoute("/_app")({
  ssr: false,
  component: () => <Outlet />,
});
