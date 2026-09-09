import { Outlet, createFileRoute } from "@tanstack/react-router";

// Pure layout route, following `prompts.tsx`. The overview, the evidence
// screen and the results review are three different components rather than
// one component with a tab parameter, so this file is a passthrough and each
// leaf owns its own reads. The gate and the search schema live on `v2.tsx`
// and are not repeated here.
export const Route = createFileRoute("/_app/v2/visibility")({
  component: Outlet,
});
