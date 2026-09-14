import { createFileRoute } from "@tanstack/react-router";
import DiagnosticsPage from "@/v2/diagnostics/DiagnosticsPage";

export const Route = createFileRoute("/_app/v2/diagnostics/")({
  component: DiagnosticsPage,
  staticData: { v2Shell: "guided", v2Board: "b11" },
});
