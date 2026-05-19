// client/src/tours/global-welcome.tour.ts
//
// One-time orientation for new users, auto-fired on the Command Center
// (/, /dashboard). Walks the workflow spine in narrative order — Setup
// → Monitor → Diagnose → Act → Report — independent of the sidebar's
// alphabetical render order. Each spine-stage step targets its literal
// nav.<stage> wrapper (see client/src/components/Sidebar.tsx).
//
// Version bump = tour re-fires for users who completed v1 once. Keep
// bumps deliberate.
import type { TourConfig } from "./types";

export const globalWelcomeTour: TourConfig = {
  id: "global-welcome",
  version: 2,
  scope: "global",
  trigger: { kind: "route", routes: ["/", "/dashboard"] },
  steps: [
    {
      id: "intro",
      title: "Welcome to VentureCite",
      content:
        "VentureCite measures and improves how AI engines (ChatGPT, Claude, Perplexity, Gemini) cite your brand. A quick 60-second tour of the five-stage workflow?",
    },
    {
      id: "sidebar-setup",
      target: "nav.setup",
      attachTo: "right-start",
      title: "1. Set up — the kernel",
      content:
        "Start here. Add your brand and build a Fact Sheet — the canonical record of what's verifiably true. Every measurement and generated artifact is grounded in it.",
    },
    {
      id: "sidebar-monitor",
      target: "nav.monitor",
      attachTo: "right-start",
      title: "2. Monitor — where you stand",
      content:
        "Track how AI engines cite you: citation runs across every platform, competitor share-of-voice, and brand mentions, all in one canvas.",
    },
    {
      id: "sidebar-diagnose",
      target: "nav.diagnose",
      attachTo: "right-start",
      title: "3. Diagnose — what's wrong",
      content:
        "When something looks off, Diagnose shows you why — hallucinations (claims that contradict your facts), technical signals, and AI crawler permissions.",
    },
    {
      id: "sidebar-act",
      target: "nav.act",
      attachTo: "right-start",
      title: "4. Act — fix the gaps",
      content:
        "Close the gaps. Generate citation-ready articles, FAQs, GEO assets, and community outreach — every artifact grounded in your fact sheet.",
    },
    {
      id: "sidebar-report",
      target: "nav.report",
      attachTo: "right-start",
      title: "5. Report — prove the impact",
      content:
        "A board-ready summary of where you stand, the gaps you've closed, and how the trend is moving. Measured signals only — no fabricated numbers.",
    },
    {
      id: "brand-selector",
      target: "sidebar.brandSelector",
      attachTo: "bottom",
      title: "Multiple brands?",
      content: "Switch the active brand any time from this selector in the context bar.",
    },
    {
      id: "chatbot",
      target: "sidebar.chatbot",
      attachTo: "left",
      title: "Stuck? Ask the AI Tutor",
      content: "The in-app AI Tutor walks you through any part of the product. Open it any time.",
    },
  ],
};
