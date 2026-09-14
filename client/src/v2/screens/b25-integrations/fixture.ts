import type { Board25Data } from "./Screen";

export const board25Fixture: Board25Data = {
  brandId: "470b15fe-606b-4d96-ab62-69a01e08b237",
  mode: "guided",
  noBackendProviders: [
    {
      id: "google_search_console",
      name: "Google Search Console",
      category: "Visibility evidence",
      reads: "Search queries, impressions, clicks, pages",
      verifies: "Branded mentions, placement, query lift",
    },
    {
      id: "ga4",
      name: "GA4",
      category: "Visibility evidence",
      reads: "Sessions, users, conversions, landing pages",
      verifies: "Traffic from PR, assisted conversions",
    },
    {
      id: "hubspot",
      name: "HubSpot",
      category: "Business outcomes",
      reads: "Contacts, companies, deals, revenue",
      verifies: "Pipeline from PR, deal influence, revenue impact",
    },
    {
      id: "salesforce",
      name: "Salesforce",
      category: "Business outcomes",
      reads: "Leads, opportunities, accounts, revenue",
      verifies: "Pipeline from PR, deal influence, revenue impact",
    },
  ],
  requestedProviders: ["hubspot"],
  slack: { connected: true, lastTriggered: "2026-09-09T07:01:00Z" },
  buffer: { connected: false },
  recentActivity: [
    {
      id: "act-1",
      message: "Sent a test Slack message from Settings.",
      detail: "Sent to Slack",
      at: "2026-09-09T07:01:00Z",
    },
  ],
  actions: {
    connectSlack: async () => undefined,
    disconnectSlack: async () => undefined,
    testSlack: async () => undefined,
    connectBuffer: async () => undefined,
    disconnectBuffer: async () => undefined,
    requestAccess: async () => undefined,
  },
};
