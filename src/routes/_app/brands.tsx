import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Lazy, matching client/src/App.tsx.
const Brands = lazy(() => import("@/pages/brands"));

export const Route = createFileRoute("/_app/brands")({
  component: () => <AuthenticatedRoute component={Brands} />,
});
