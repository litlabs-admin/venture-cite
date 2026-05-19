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
      title: "GEO Assets",
      content:
        "Discover and track citation assets — listicles, Wikipedia pages, and BOFU comparison content AI engines cite.",
    },
    {
      id: "tabs",
      target: "geoTools.tabs",
      attachTo: "bottom",
      title: "Three asset surfaces",
      content:
        "Listicles, Wikipedia, and BOFU — each a different place to earn an AI citation. (FAQs moved to the FAQ editor; brand mentions to Community.)",
    },
  ],
};
