import { createFileRoute } from "@tanstack/react-router";
import { Board38Route } from "@/v2/screens/b38-competitor-gap/Route";

export const Route = createFileRoute("/_app/v2/diagnostics/competitor-gap")({
  component: Board38Route,
  staticData: { v2Shell: "expert", v2Board: "b38" },
});
