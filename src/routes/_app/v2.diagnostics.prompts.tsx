import { createFileRoute } from "@tanstack/react-router";
import { Board11Route } from "@/v2/screens/b11-prompt-diagnosis/Route";

export const Route = createFileRoute("/_app/v2/diagnostics/prompts")({
  component: Board11Route,
  staticData: { v2Shell: "expert", v2Board: "b11" },
});
