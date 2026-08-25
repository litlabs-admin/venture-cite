import { createFileRoute, Outlet } from "@tanstack/react-router";

// Pure layout route. /prompts and /prompts/$promptId show genuinely
// different components (list vs detail - unlike content.tsx/content.$articleId.tsx,
// which share one component and so never needed an Outlet), so this file
// stays a passthrough and each leaf (prompts.index.tsx, prompts.$promptId.tsx)
// wraps itself in AuthenticatedRoute independently.
export const Route = createFileRoute("/_app/prompts")({
  component: Outlet,
});
