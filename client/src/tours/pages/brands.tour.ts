// client/src/tours/pages/brands.tour.ts
import type { TourConfig } from "../types";

export const brandsTour: TourConfig = {
  id: "brands",
  version: 1,
  scope: "perUser",
  trigger: { kind: "manual" },
  steps: [
    {
      id: "intro",
      title: "Manage your brands",
      content: "Each brand has its own AI visibility, content, and analytics. Add a brand here.",
    },
    {
      id: "add-brand",
      target: "brands.addButton",
      attachTo: "bottom",
      title: "Add a new brand",
      content:
        "Click here to add a brand. You'll be asked for the website and a one-line description.",
    },
    {
      id: "name-variations",
      target: "brands.nameVariations",
      attachTo: "top",
      title: "Name variations matter",
      content:
        "Add every way users might refer to your brand (e.g. abbreviations, the legal name). Variations drive citation matching across the app.",
    },
  ],
};
