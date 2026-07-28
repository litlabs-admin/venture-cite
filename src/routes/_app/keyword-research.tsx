import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";

// Lazy, matching client/src/App.tsx.
const KeywordResearch = lazy(() => import("@/pages/keyword-research"));

export const Route = createFileRoute("/_app/keyword-research")({
  head: () => ({
    meta: [
      { title: "AI Keyword Research | VentureCite" },
      {
        name: "description",
        content:
          "Discover high-opportunity keywords for AI search optimization with intelligent research powered by GPT-4.",
      },
    ],
  }),
  component: () => <AuthenticatedRoute component={KeywordResearch} />,
});
