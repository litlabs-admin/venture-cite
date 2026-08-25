import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

const PromptDiagnose = lazy(() => import("@/pages/prompt-diagnose"));

export const Route = createFileRoute("/_app/prompts/$promptId/diagnose")({
  component: () => <AuthenticatedRoute component={PromptDiagnose} />,
});
