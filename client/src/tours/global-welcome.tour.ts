// client/src/tours/global-welcome.tour.ts
import type { TourConfig } from "./types";

export const globalWelcomeTour: TourConfig = {
  id: "global-welcome",
  version: 1,
  scope: "global",
  trigger: { kind: "route", routes: ["/", "/dashboard"] },
  steps: [
    {
      id: "intro",
      title: "Welcome to VentureCite",
      content:
        "VentureCite helps you measure and improve how AI engines like ChatGPT and Claude cite your brand. Take a 60-second tour?",
    },
    {
      id: "sidebar-setup",
      target: "sidebar.group.setup",
      attachTo: "right",
      title: "Start here",
      content: "Set up your brand and connect AI engines from the Setup section.",
    },
    {
      id: "sidebar-create",
      target: "sidebar.group.create",
      attachTo: "right",
      title: "Create content",
      content:
        "Generate citation-ready articles, FAQs, and keyword research from the Create section.",
    },
    {
      id: "sidebar-measure",
      target: "sidebar.group.measure",
      attachTo: "right",
      title: "Measure impact",
      content:
        "Track citations, share-of-answer, and AI intelligence trends from the Measure section.",
    },
    {
      id: "brand-selector",
      target: "sidebar.brandSelector",
      attachTo: "right",
      title: "Switch brands anytime",
      content: "VentureCite supports multiple brands per account. Switch from this menu.",
    },
    {
      id: "chatbot",
      target: "sidebar.chatbot",
      attachTo: "right",
      title: "Ask the AI tutor",
      content: "Stuck on anything? Click here to chat with the in-app AI tutor.",
    },
  ],
};
