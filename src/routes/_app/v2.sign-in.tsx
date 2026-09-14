import { createFileRoute } from "@tanstack/react-router";
import { Board26Route } from "@/v2/screens/b26-sign-in/Route";

export const Route = createFileRoute("/_app/v2/sign-in")({
  component: Board26Route,
  staticData: { v2Shell: "bare", v2Board: "b26" },
});
