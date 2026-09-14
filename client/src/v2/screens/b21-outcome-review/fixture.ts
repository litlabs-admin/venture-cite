import type { Board21Data } from "./Screen";

export const board21Fixture: Board21Data = {
  context: { brandId: "brand-venture-pr", mode: "guided" },
  brand: { name: "VenturePR" },
  reviewDate: { kind: "measured", value: "2026-09-09" },
  completedChange: {
    title: { kind: "measured", value: "Services page update" },
    date: { kind: "measured", value: "2026-09-09" },
    summary: { kind: "measured", value: "Updated messaging and added proof points." },
  },
  observationWindow: {
    start: { kind: "measured", value: "2026-09-09" },
    end: { kind: "measured", value: "2026-10-07" },
    days: { kind: "measured", value: 28 },
  },
  visibility: {
    mentions: { kind: "measured", value: 18 },
    denominator: { kind: "measured", value: 40 },
  },
  referralRows: {
    kind: "measured",
    value: [
      {
        date: "2026-09-09",
        source: "ChatGPT",
        query: "VentureCite PR tools",
        referrerUrl: "https://chat.openai.com/…",
        sessions: 14,
      },
      {
        date: "2026-09-09",
        source: "Perplexity",
        query: "B2B PR measurement",
        referrerUrl: "https://www.perplexity.ai/…",
        sessions: 9,
      },
    ],
  },
  verifiedReferralSourceCount: { kind: "measured", value: 2 },
  qualifiedInquiries: { kind: "measured", value: 1 },
  demoRequests: { kind: "measured", value: 0 },
  attributedReferralUrls: {
    kind: "measured",
    value: [
      "https://venturecite.com/?utm_source=chatgpt",
      "https://venturecite.com/?utm_source=perplexity",
    ],
  },
  crmOpportunityIds: "",
  outcomeNotes: "One inbound inquiry from a startup founder via the contact form. Not yet a demo.",
  crmConnections: { hubspot: "not-connected", salesforce: "not-connected" },
  evidenceStrength: { kind: "measured", value: "Moderate" },
  unconfirmedInquiries: { kind: "measured", value: 1 },
  confirmedDemoRequests: { kind: "measured", value: 0 },
  crmOpportunityCount: { kind: "not-connected" },
  progress: {
    level: { kind: "measured", value: 3 },
    name: { kind: "measured", value: "Improve" },
    points: { kind: "measured", value: 160 },
    target: { kind: "measured", value: 320 },
    rate: { kind: "measured", value: 50 },
    next: { kind: "measured", value: { level: 4, name: "Learn", points: 320 } },
  },
  awardPoints: { kind: "measured", value: 10 },
};
