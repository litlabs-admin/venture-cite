import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v2-preview")({
  component: Outlet,
});
