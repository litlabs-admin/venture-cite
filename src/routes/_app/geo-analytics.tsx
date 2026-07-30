import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/geo-analytics")({
  component: () => <SpineRedirect to="/monitor" tab="citations" />,
});
