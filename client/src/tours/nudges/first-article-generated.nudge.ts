// client/src/tours/nudges/first-article-generated.nudge.ts
import type { TourConfig } from "../types";
export const firstArticleGeneratedNudge: TourConfig = {
  id: "first-article-generated",
  version: 1,
  scope: "perBrand",
  // Anchor `articles.firstResult` renders on /articles and /act?tab=library.
  trigger: {
    kind: "predicate",
    evaluate: (ctx) => ctx.counts.articles >= 1,
    routes: ["/articles", "/act"],
  },
  steps: [
    {
      id: "celebrate",
      target: "articles.firstResult",
      attachTo: "top",
      title: "First article generated",
      content: "Review, edit, and publish from here. Articles are citation-targeted by default.",
    },
  ],
};
