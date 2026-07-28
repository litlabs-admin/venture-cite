import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedBareRoute } from "../-shared/routeGates";

// Lazy, matching client/src/App.tsx. Deliberately AuthenticatedBareRoute
// (no AppShell) — welcome-brand.spec.ts asserts main#main-content has count
// 0 here.
const Welcome = lazy(() => import("@/pages/welcome"));

export const Route = createFileRoute("/_app/welcome")({
  component: () => <AuthenticatedBareRoute component={Welcome} />,
});
