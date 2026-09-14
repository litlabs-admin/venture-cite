import { createFileRoute } from "@tanstack/react-router";
import { Board36Route } from "@/v2/screens/b36-question-detail/Route";

export const Route = createFileRoute("/_app/v2/visibility/questions/$questionId")({
  component: Board36Route,
  staticData: { v2Shell: "expert", v2Board: "b36" },
});
