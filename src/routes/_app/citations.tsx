import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/citations")({
  component: () => <SpineRedirect to="/monitor" tab="citations" />,
});
