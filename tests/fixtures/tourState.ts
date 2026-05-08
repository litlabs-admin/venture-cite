// tests/fixtures/tourState.ts
import type { TourState } from "../../client/src/tours/types";

export const emptyTourState: TourState = {};

export const completedGlobalTourState: TourState = {
  global: { v: 1, completedAt: "2026-01-01T00:00:00.000Z" },
};

export const suppressedMentionsTourState: TourState = {
  perUserSuppressed: ["first-scan-complete"],
};

export const wildcardSuppressedTourState: TourState = {
  perUserSuppressed: ["*"],
};

export const multiBrandTourState: TourState = {
  perBrand: {
    "brand-a": {
      "first-scan-complete": { v: 1, completedAt: "2026-01-01T00:00:00.000Z" },
    },
  },
};
