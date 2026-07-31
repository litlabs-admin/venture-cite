import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Lazy, matching client/src/App.tsx (deleted as of Phase 2 Task 6a; see
// src/routes/__root.tsx for where its other pieces went).
const AdminScrapeInspector = lazy(() => import("@/pages/admin-scrape-inspector"));

// Phase 2 Task 6a: the wouter <Route path="/admin/scrape/:runId"> wrapper
// Task 5 added here (purely to populate wouter's ParamsCtx ancestor context
// for admin-scrape-inspector.tsx's `useParams<{ runId: string }>()`) is now
// removed. Verified this is safe, not assumed: TanStack's own useParams
// (strict or not) resolves via useMatch() reading React context set at THIS
// route's own component boundary (node_modules/@tanstack/react-router/dist/
// esm/useMatch.js: `React.useContext(matchContext)`), not an opt-in
// registration a wouter-style ancestor <Route> would need to populate. That
// context is available to any descendant of this route's rendered component
// tree - including AdminScrapeInspector nested one level deeper inside
// AuthenticatedRoute - with no wrapper required. $runId is this route's own
// path param, so match.params already contains it.
//
// client/src/pages/admin-scrape-inspector.tsx reads `runId` with
// `useParams({ from: "/_app/admin/scrape/$runId" })` rather than
// `{ strict: false }`: per the paragraph above it is a descendant of this
// exact route's match context, not a shared multi-route component, so it can
// name its route and get the param fully typed.
export const Route = createFileRoute("/_app/admin/scrape/$runId")({
  // AdminScrapeInspector used to set `<title>{`Scrape inspector - ${brand?.
  // name ?? run.id}`}</title>` itself, computed from a client-side useQuery
  // result - there is no loader here to compute that server-side, and this
  // task's file scope doesn't add one. Falls back to a static title
  // matching the sibling /admin/scrape list route's "Recent scrapes -
  // admin" naming convention; this is an admin-only, auth-gated page so
  // the exact title has no SEO stakes.
  head: () => ({ meta: [{ title: "Scrape inspector - admin" }] }),
  component: () => <AuthenticatedRoute component={AdminScrapeInspector} />,
});
