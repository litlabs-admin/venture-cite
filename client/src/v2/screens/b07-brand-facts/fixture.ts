import type { Board07Data, Board07Fact, Board07Page, Board07Value } from "./Screen";

const available = <T>(value: T): Board07Value<T> => ({ kind: "available", value });

function fact(
  id: string,
  name: string,
  value: string,
  source: string,
  sourceClass: "first-party" | "user-supplied",
  review: Board07Fact["review"],
  excerpt: string,
): Board07Fact {
  return {
    id,
    name,
    value: available(value),
    source: available(source),
    sourceClass: available(sourceClass),
    scope: available("Brand profile"),
    effectiveDate: available("2026-09-08"),
    expiry: available("Not set"),
    reviewer: available("Founder"),
    conflict: available("No conflict"),
    lastCheck: available("2026-09-08"),
    excerpt: available(excerpt),
    extractedAt: available("2026-09-08"),
    review,
  };
}

const pages: readonly Board07Page[] = [
  {
    path: "/services",
    factCount: available(3),
    scannedAt: available("2026-09-08"),
    sourceKind: "document",
  },
  {
    path: "/about",
    factCount: available(1),
    scannedAt: available("2026-09-08"),
    sourceKind: "document",
  },
  {
    path: "/pricing",
    factCount: available(0),
    scannedAt: available("2026-09-08"),
    sourceKind: "site",
  },
];

export const board07Fixture: Board07Data = {
  brand: {
    id: "fixture-brand-venture-pr",
    name: available("VenturePR"),
    displayName: available("VentureCite"),
  },
  navigation: {
    brandId: "fixture-brand-venture-pr",
    mode: "guided",
  },
  facts: [
    fact(
      "fact-brand-name",
      "Brand name",
      "VenturePR",
      "/about",
      "first-party",
      { kind: "confirmed" },
      "VenturePR helps startup teams build trusted visibility.",
    ),
    fact(
      "fact-service-region",
      "Service region",
      "India",
      "/services",
      "first-party",
      { kind: "needs-review" },
      "We support startup teams across India.",
    ),
    fact(
      "fact-main-service",
      "Main service",
      "Startup public relations",
      "/services",
      "first-party",
      { kind: "confirmed" },
      "We provide startup public relations support.",
    ),
    fact(
      "fact-target-buyer",
      "Target buyer",
      "Early-stage founders",
      "User supplied",
      "user-supplied",
      { kind: "needs-review" },
      "Early-stage founders are the primary buyers.",
    ),
  ],
  pages: available(pages),
  progress: {
    level: available(1),
    levelName: available("Start"),
    workPoints: available(0),
    target: available("Reach Level 2 · Ready"),
    stepPoints: available(20),
    completedSteps: available(0),
    requiredSteps: available(3),
  },
  selectedFactId: "fact-service-region",
  actions: {
    approveFact: async () => undefined,
    amendFact: async () => undefined,
  },
};
