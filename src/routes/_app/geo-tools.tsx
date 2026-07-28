import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";
import { geoToolsSearchSchema } from "../-shared/searchSchemas";

export const Route = createFileRoute("/_app/geo-tools")({
  validateSearch: geoToolsSearchSchema,
  component: () => <SpineRedirect to="/act" tab="geo-assets" />,
});
