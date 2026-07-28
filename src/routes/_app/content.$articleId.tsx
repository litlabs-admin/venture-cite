import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";
import { contentSearchSchema } from "../-shared/searchSchemas";

// See content.tsx — same component, same lazy import (a second dynamic
// import() of the same specifier is deduped by Vite to the same chunk),
// and the same validateSearch schema (the seed params are unused once an
// articleId is already resolved from the path, but declaring the schema
// identically here keeps both routes' typed search in sync for the one
// shared component).
const Content = lazy(() => import("@/pages/content"));

export const Route = createFileRoute("/_app/content/$articleId")({
  validateSearch: contentSearchSchema,
  component: () => <AuthenticatedRoute component={Content} />,
});
