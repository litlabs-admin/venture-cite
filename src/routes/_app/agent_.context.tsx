import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRailRoute } from "../-shared/routeGates";
import { askContextSearchSchema } from "../-shared/searchSchemas";

// Business context (docs/ask-feature's business-context.md): the full-page
// editor behind the Ask top bar's "Business context" button and the "What I
// know" drawer's "Open brief" / "Manage memory and sources" links. Same
// AuthenticatedRailRoute as /agent itself (07-integration-and-hardening.md
// §3.1) - the AI Tutor's floating pill would otherwise sit over this page's
// own chrome exactly as it would over the Ask composer.
//
// FILENAME: `agent_.context.tsx`, not `agent.context.tsx`. TanStack Router's
// flat file convention nests any `agent.*.tsx` file under `agent.tsx`'s own
// route by default - which requires `agent.tsx`'s component to render an
// `<Outlet />` for the child to ever appear. `agent.tsx` (AskWorkspace) has
// none; it is a leaf page, not a layout. Under the plain dot name, clicking
// "Business context" updated the URL/search state but the screen never
// changed - the child route matched with nowhere to render into. The
// trailing underscore on `agent_` is the documented escape: it keeps the
// URL at `/agent/context` (see `path` below) while making this a SIBLING of
// `/agent` under `_app`, not a child of it. Verified against the generated
// src/routeTree.gen.ts: this route's `getParentRoute` now resolves to the
// `_app` layout route, and `/agent` (agent.tsx) carries no children at all.
const AgentContext = lazy(() => import("@/pages/agentContext"));

export const Route = createFileRoute("/_app/agent_/context")({
  validateSearch: askContextSearchSchema,
  component: () => <AuthenticatedRailRoute component={AgentContext} />,
});
