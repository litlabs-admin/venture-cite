// client/src/tours/pages/geo-tools.tour.ts
import type { TourConfig } from "../types";

export const geoToolsTour: TourConfig = {
  id: "geo-tools",
  version: 1,
  scope: "perBrand",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "GEO Tools",
      content:
        "Discover citation opportunities across listicles, Wikipedia, BOFU pages, FAQs, and brand mentions.",
    },
    {
      id: "tabs",
      target: "geoTools.tabs",
      attachTo: "bottom",
      title: "Five surfaces",
      content: "Each tab is a different way to find places where your brand should be mentioned.",
    },
    {
      id: "mentions-tab",
      target: "geoTools.tab.mentions",
      attachTo: "bottom",
      title: "Mentions",
      content:
        "Mentions monitors Reddit and HackerNews for unprompted brand discussion. Run a scan to start.",
    },
  ],
};
