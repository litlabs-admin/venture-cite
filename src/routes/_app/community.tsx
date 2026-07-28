import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/community")({
  component: () => <SpineRedirect to="/act" tab="community" />,
});
