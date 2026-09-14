import { createFileRoute } from "@tanstack/react-router";
import { Board35Route } from "@/v2/screens/b35-question-portfolio/Route";

export const Route = createFileRoute("/_app/v2/visibility/questions")({
  component: Board35Route,
  staticData: { v2Shell: "expert", v2Board: "b35" },
});
