import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/home";
import { FirstRunGate } from "../-shared/routeGates";
import { dashboardSearchSchema } from "../-shared/searchSchemas";

// Eager import, matching client/src/App.tsx's eager-import list.
// FirstRunGate: brand-less authenticated users get redirected to /welcome
// before the dashboard renders.
export const Route = createFileRoute("/_app/dashboard")({
  validateSearch: dashboardSearchSchema,
  component: () => <FirstRunGate component={Home} />,
});
