import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";
import { articlesSearchSchema } from "../-shared/searchSchemas";

// Lazy, matching client/src/App.tsx.
const Articles = lazy(() => import("@/pages/articles"));

export const Route = createFileRoute("/_app/articles")({
  validateSearch: articlesSearchSchema,
  component: () => <AuthenticatedRoute component={Articles} />,
});
