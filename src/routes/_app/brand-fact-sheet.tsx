import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";
import { brandFactSheetSearchSchema } from "../-shared/searchSchemas";

export const Route = createFileRoute("/_app/brand-fact-sheet")({
  validateSearch: brandFactSheetSearchSchema,
  component: () => <SpineRedirect to="/setup" tab="fact-sheet" />,
});
