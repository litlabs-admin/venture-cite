import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

const PromptDetail = lazy(() => import("@/pages/prompt-detail"));

export const Route = createFileRoute("/_app/prompts/$promptId/")({
  component: () => <AuthenticatedRoute component={PromptDetail} />,
});
