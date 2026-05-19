// client/src/tours/pages/geo-tools.tour.ts
//
// The old "GEO Assets" 3-tab surface was dissolved in /act 2b: the
// listicle + Wikipedia gap-detection moved to /diagnose?tab=coverage and
// the authored BOFU half folded into the unified /act Production
// pipeline. This manual tour now narrates the relocated Coverage surface.
// Steps are content-only (no `target`) so no data-tour-id is referenced —
// the 3-tab strip that carried `geoTools.tabs` no longer exists.
import type { TourConfig } from "../types";

export const geoToolsTour: TourConfig = {
  id: "geo-tools",
  version: 2,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Coverage",
      content:
        'Coverage (in Diagnose) shows where your brand should appear in AI-cited sources but doesn\'t — the "best of" listicles AI engines lean on, and relevant Wikipedia pages.',
    },
    {
      id: "act",
      title: "Scan, then close the gap",
      content:
        "Discover listicle opportunities and scan Wikipedia, track outreach status per listicle, and draft an NPOV Wikipedia mention. BOFU comparison content is now produced in Act → Production.",
    },
  ],
};
