import { createFileRoute } from "@tanstack/react-router";
import { Board36Route } from "@/v2/screens/b36-question-detail/Route";

export const Route = createFileRoute("/_app/v2/diagnostics/questions/$questionId")({
  component: Board36Route,
  staticData: { v2Shell: "guided", v2Board: "b36" },
});
