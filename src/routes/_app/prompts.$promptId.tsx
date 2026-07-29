import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Prompt detail — its own page, matching the reference's /prompts/p/:id.
// Clicking a row in the prompts table navigates here instead of opening the
// shell inspector.
const PromptDetail = lazy(() => import("@/pages/prompt-detail"));

export const Route = createFileRoute("/_app/prompts/$promptId")({
  component: () => <AuthenticatedRoute component={PromptDetail} />,
});
