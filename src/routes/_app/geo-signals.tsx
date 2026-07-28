import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/geo-signals")({
  component: () => <SpineRedirect to="/diagnose" tab="signals" />,
});
