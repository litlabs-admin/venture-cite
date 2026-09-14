import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/v2/onboarding")({
  component: Outlet,
  staticData: { v2Shell: "guided" },
});
