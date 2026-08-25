import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

const Prompts = lazy(() => import("@/pages/prompts"));

export const Route = createFileRoute("/_app/prompts/")({
  component: () => <AuthenticatedRoute component={Prompts} />,
});
