import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pure layout route. /prompts/$promptId and /prompts/$promptId/diagnose show
// genuinely different components (detail vs diagnose), so this file stays a
// passthrough and each leaf (prompts.$promptId.index.tsx,
// prompts.$promptId.diagnose.tsx) wraps itself in AuthenticatedRoute
// independently - mirroring prompts.tsx's split for /prompts vs /prompts/$promptId.
export const Route = createFileRoute("/_app/prompts/$promptId")({
  component: Outlet,
});
