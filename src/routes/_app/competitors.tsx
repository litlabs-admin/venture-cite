import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/competitors")({
  component: () => <SpineRedirect to="/monitor" tab="competitors" />,
});
