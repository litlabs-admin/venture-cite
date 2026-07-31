import { createFileRoute } from "@tanstack/react-router";
import Pricing from "@/pages/pricing";

// Server-rendered public pricing page. Same top-level shape as privacy.tsx
// and index.tsx - NOT nested under `_app` (which is ssr:false and reserved
// for auth-gated pages). Title/description are route-level `head()`, same
// pattern as every other public route: the component itself renders no
// <title>/<meta> of its own.
export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing - VentureCite" },
      {
        name: "description",
        content:
          "Compare VentureCite plans and pricing. Track citations, benchmark competitors, and optimize your brand for AI search engines.",
      },
    ],
  }),
  component: Pricing,
});
