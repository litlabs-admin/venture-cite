import type { Board24Data } from "./Screen";

export const board24Fixture: Board24Data = {
  brandId: "470b15fe-606b-4d96-ab62-69a01e08b237",
  mode: "guided",
  brand: {
    name: "VenturePR",
    companyName: "VenturePR Inc.",
    industry: "Public relations software",
    website: "https://venturepr.com",
    description: "AI visibility monitoring for PR and marketing teams.",
    targetAudience: "B2B marketing teams in North America and the UK",
  },
  cadence: "weekly",
  engines: ["ChatGPT", "Claude", "Perplexity", "Gemini", "DeepSeek", "Grok"],
  competitors: [
    { id: "c1", name: "Adidas", domain: "adidas.com", tier: "core" },
    { id: "c2", name: "New Balance", domain: "newbalance.com", tier: "core" },
    { id: "c3", name: "Brooks", domain: "brooksrunning.com", tier: "discovered" },
  ],
  account: {
    email: "founder@venturepr.com",
    firstName: "Jamie",
    lastName: "Rivera",
    timezone: "America/New_York",
  },
  auditHistory: {
    kind: "available",
    value: [
      {
        id: "a1",
        action: "integration.slack.connected",
        entityType: "integration",
        createdAt: "2026-09-09T14:14:00Z",
      },
      {
        id: "a2",
        action: "user.password.changed",
        entityType: "user",
        createdAt: "2026-09-08T10:03:00Z",
      },
    ],
  },
  actions: {
    saveBrandProfile: async () => undefined,
    saveCadence: async () => undefined,
    addCompetitor: async () => undefined,
    removeCompetitor: async () => undefined,
    saveAccountProfile: async () => undefined,
  },
};
