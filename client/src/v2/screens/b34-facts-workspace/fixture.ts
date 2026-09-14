import type { Board34Data, Board34Fact } from "./Screen";

const available = <T>(value: T) => ({ kind: "available" as const, value });

function fact(
  overrides: Partial<Board34Fact> & Pick<Board34Fact, "id" | "label" | "value">,
): Board34Fact {
  return {
    evidenceUrl: "https://venturepr.example",
    evidenceLabel: "venturepr.example",
    verificationType: "Website",
    owner: "You",
    lastCheckedAt: "2026-09-12T00:00:00.000Z",
    status: "approved",
    excerpt: null,
    userOverridden: false,
    ...overrides,
  };
}

export const board34Fixture: Board34Data = {
  brand: { id: "fixture-brand", name: "VenturePR" },
  navigation: { brandId: "fixture-brand", mode: "guided" },
  categories: [
    {
      id: "identity",
      label: "Identity",
      facts: [
        fact({
          id: "fact-company-name",
          label: "Company name",
          value: "VenturePR",
          excerpt: "VenturePR helps startup teams build trusted visibility.",
        }),
        fact({
          id: "fact-tagline",
          label: "Tagline",
          value: "PR for what's next",
        }),
        fact({
          id: "fact-founded",
          label: "Founded",
          value: "2020",
          verificationType: "Cross-source",
          status: "stale",
          evidenceUrl: "https://linkedin.com/company/venturepr",
          evidenceLabel: "linkedin.com/company/venturepr",
          lastCheckedAt: "2026-08-05T00:00:00.000Z",
        }),
      ],
    },
    {
      id: "offerings",
      label: "Offerings",
      facts: [
        fact({
          id: "fact-primary-service",
          label: "Primary service",
          value: "Media relations",
        }),
        fact({
          id: "fact-service-region",
          label: "Service region",
          value: "India and global",
          status: "needs_confirmation",
          owner: null,
        }),
      ],
    },
    {
      id: "growth",
      label: "Growth",
      facts: [
        fact({
          id: "fact-key-competitor",
          label: "Key competitor",
          value: "Weber Shandwick",
          status: "needs_confirmation",
          owner: null,
          evidenceUrl: "https://www.webershandwick.com",
          evidenceLabel: "webershandwick.com",
          verificationType: "Cross-source",
        }),
      ],
    },
  ],
  factSummary: { approvedCount: 3, confirmationCount: 2, staleCount: 1, totalCount: 6 },
  sourcesInspected: available(5),
  nextReviewAt: available("2026-09-19T00:00:00.000Z"),
  firstConfirmationFactId: "fact-service-region",
  domainOptions: [
    { id: "identity", label: "Identity" },
    { id: "offerings", label: "Offerings" },
    { id: "positioning", label: "Positioning" },
    { id: "team", label: "Team" },
    { id: "operations", label: "Operations" },
    { id: "credentials", label: "Credentials & funding" },
    { id: "growth", label: "Growth" },
    { id: "contact", label: "Contact" },
  ],
  actions: {
    acceptFact: async () => undefined,
    dismissFact: async () => undefined,
    amendFact: async () => undefined,
    addFact: async () => undefined,
    recheckFact: async () => undefined,
  },
};
