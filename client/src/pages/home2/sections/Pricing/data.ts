// Card layout and prices are from _reference/index.html:3296-3391 (Growth)
// and :3346-3391 (Scale). The feature bullets are NOT — the source listed a
// REST API, white-label portals and an MCP connection, none of which
// VentureCite ships. Bullets below are drawn from the capabilities on the
// main landing page (client/src/pages/landing.tsx `features` + `pillars`).
//
// TODO(launch): $100/$500 are inherited from the source layout. The main
// landing page advertises a $79/mo starting price and has a commented-out
// $0/$97/$257 ladder — reconcile before this page is public.

export interface PricingFeature {
  text: string;
  // Rendered as its own <span class="text-muted ml-1"> sibling — source
  // line 3378-3380.
  note?: string;
}

export interface PricingPlan {
  name: string;
  description: string;
  price: string;
  priceSuffix: string;
  features: PricingFeature[];
  ctaHref: string;
  ctaLabel: string;
}

export const growthPlan: PricingPlan = {
  name: "Growth",
  description: "Deep insights for brand owners",
  price: "$100",
  priceSuffix: "/mo",
  features: [
    { text: "Track 1 brand, daily" },
    { text: "Citation tracking across every major engine" },
    { text: "Share-of-answer by engine and topic" },
    { text: "Competitor benchmarks" },
    { text: "GEO signal scoring" },
    { text: "Crawler and robots.txt checks" },
    { text: "Weekly reports" },
    { text: "Setup in about ten minutes" },
  ],
  ctaHref: "/register",
  ctaLabel: "Get started",
};

export const scalePlan: PricingPlan = {
  name: "Scale",
  description: "Multi-brand tracking at scale",
  price: "$500",
  priceSuffix: "/mo",
  features: [
    { text: "Everything in Growth" },
    { text: "Multiple brands in one workspace" },
    { text: "AI content generation" },
    { text: "FAQ optimization" },
    { text: "Publish to your channels via Buffer" },
    { text: "Full citation history" },
    { text: "Priority support" },
  ],
  ctaHref: "/register",
  ctaLabel: "Get started",
};
