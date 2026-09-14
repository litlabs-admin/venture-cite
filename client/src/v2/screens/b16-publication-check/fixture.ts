import type { Board16Data, Board16Value } from "./Screen";

const measured = <T>(value: T): Board16Value<T> => ({ kind: "measured", value });

export const board16Fixture: Board16Data = {
  publication: {
    url: measured("https://venturepr.com/services"),
    expectedCanonicalUrl: measured("https://venturepr.com/services/"),
    fetchedAt: measured("2026-09-09T10:24:00-07:00"),
    fetchState: measured("Page fetched successfully"),
    nextObservationAt: measured("2026-10-09"),
    rewardPoints: measured(40),
  },
  revision: {
    approvedAt: measured("2026-09-09"),
    heading: measured("Our services"),
    content: measured(
      "VenturePR helps early-stage startups build credibility through strategic media relations, thought leadership, and product storytelling.",
    ),
  },
  livePage: {
    heading: measured("Our services"),
    content: measured(
      "VenturePR helps early-stage startups build credibility through strategic media relations, thought leadership, and startup storytelling.",
    ),
  },
  checks: {
    urlStatusCode: measured(200),
    urlReachable: measured("Verified"),
    changedText: measured("Verified"),
    approvedFacts: measured("Verified"),
    canonical: measured("Mismatch"),
    indexability: measured("Verified"),
  },
  task: {
    buyerNeed: measured("Compare PR services before contacting a provider."),
    evidence: measured("Approved buyer question set"),
  },
};

export type { Board16Value } from "./Screen";
