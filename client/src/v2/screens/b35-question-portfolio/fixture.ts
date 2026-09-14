import type { Board35Data } from "./Screen";

// The exact data shown on the approved render (fragment-38-question-portfolio.html
// and docs/design/venturecite-calm-analytics-missing-desktop/10-buyer-question-portfolio.png).
// Used only by the preview route for parity checking - the live route never reads this.
export const board35Fixture: Board35Data = {
  navigation: { brandId: "fixture-venturepr", mode: "expert" },
  setHealth: { kind: "measured", value: { score: 78, verdict: "Good" } },
  allowance: { used: 8, limit: 10 },
  questions: [
    {
      id: "Q-1042",
      text: "What PR services support early-stage founders in India?",
      journeyStage: "Awareness",
      audienceNames: ["Startup founders"],
      category: "Compare",
      region: "IN",
      activeEngineCount: 4,
      latestVisibilityCount: 3,
      latestVisibilityDenominator: 4,
      citationRate: 75,
      change30d: 25,
      status: "tracked",
      paused: false,
    },
    {
      id: "Q-1043",
      text: "How does VenturePR differ from traditional PR agencies?",
      journeyStage: "Consideration",
      audienceNames: ["Startup founders"],
      category: "Compare",
      region: "IN",
      activeEngineCount: 4,
      latestVisibilityCount: 3,
      latestVisibilityDenominator: 4,
      citationRate: 50,
      change30d: 12,
      status: "tracked",
      paused: false,
    },
    {
      id: "Q-1044",
      text: "Is VenturePR a good choice for Series A startups?",
      journeyStage: "Decision",
      audienceNames: ["Investors"],
      category: "Validate",
      region: "IN",
      activeEngineCount: 1,
      latestVisibilityCount: 1,
      latestVisibilityDenominator: 4,
      citationRate: 10,
      change30d: -30,
      status: "tracked",
      paused: false,
    },
  ],
};
