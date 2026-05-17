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
      target: "nav.setup",
      attachTo: "right",
      title: "1. Set up",
      content:
        "Start in Setup: add your brand, generate prompts, and build a fact sheet so AI answers can be checked accurately.",
    },
    {
      id: "sidebar-act",
      target: "nav.act",
      attachTo: "right",
      title: "2. Act",
      content:
        "Act is where you create citation-ready articles, FAQs, GEO assets, and community outreach.",
    },
    {
      id: "sidebar-monitor",
      target: "nav.monitor",
      attachTo: "right",
      title: "3. Monitor",
      content:
        "Monitor tracks how AI engines cite you — citations, competitors, share-of-answer, and mentions in one place.",
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
