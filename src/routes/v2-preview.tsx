import { Outlet, createFileRoute } from "@tanstack/react-router";
// The preview renders screens without V2Shell, which is where the scoped theme is otherwise
// imported, so the layout must load it itself or every capture shows the unstyled screen.
import "@/v2/theme/v2-mono.css";

export const Route = createFileRoute("/v2-preview")({
  component: Outlet,
});
