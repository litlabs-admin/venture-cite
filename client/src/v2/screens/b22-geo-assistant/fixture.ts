import type { Board22Data } from "./Screen";

export const board22Fixture: Board22Data = {
  context: { brandId: "brand-preview", mode: "guided" },
  brand: {
    name: "VenturePR",
    domain: { kind: "measured", value: "venturepr.com" },
  },
  dataAvailable: {
    trackedQuestions: { kind: "measured", value: 40 },
    visibilityWindow: { kind: "measured", value: "Aug 26, 2026 - Sep 8, 2026" },
    citedSources: { kind: "measured", value: 1248 },
    competitors: { kind: "measured", value: 8 },
  },
  conversation: {
    messages: [
      {
        role: "user",
        content: "Why is VenturePR missing from startup PR answers?",
        timestamp: "10:14 AM",
      },
      {
        role: "assistant",
        content: `Based on your verified data from Aug 26 – Sep 8, 2026, VenturePR is appearing less often than expected in startup PR answers. Here's what your data shows:

**Observations**
- VenturePR is cited in 18% of startup PR test answers (7 of 40), below your overall visibility of 45%.
- Competitors like Nike (83%) and Adidas (82%) appear more often in similar queries.
- Most missing citations occur in queries with commercial intent (e.g., "best PR for startups", "startup PR firms").

**Hypotheses**
- Content may be less aligned with the specific language used in startup PR queries.
- Competitors have more recent third-party coverage in sources frequently cited by AI answers.
- Your brand is strong in brand and product queries, but underrepresented in comparative and recommendation queries.`,
        timestamp: "10:15 AM",
      },
    ],
  },
  savedConversations: [
    { id: "conv-1", title: "Improve startup PR visibility", updatedAt: "2026-09-08" },
    { id: "conv-2", title: "Nike vs VenturePR comparison", updatedAt: "2026-09-06" },
    { id: "conv-3", title: "PR query opportunities", updatedAt: "2026-09-03" },
  ],
};
