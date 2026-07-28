import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

export const Route = createFileRoute("/_app/faq-manager")({
  component: () => <SpineRedirect to="/act" tab="faq" />,
});
