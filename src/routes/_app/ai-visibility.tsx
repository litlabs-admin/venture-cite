import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/ai-visibility")({
  component: () => <SpineRedirect to="/setup" tab="visibility" />,
});
