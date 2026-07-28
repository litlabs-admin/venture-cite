import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/crawler-check")({
  component: () => <SpineRedirect to="/diagnose" tab="crawler" />,
});
