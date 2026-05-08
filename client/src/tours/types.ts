// client/src/tours/types.ts

export type TourMode = "auto" | "manual" | "preview";

export interface TourContext {
  userId: string;
  brandId: string | null;
  brandName?: string;
  isAdmin: boolean;
  // Counts injected by the orchestrator from TanStack Query state.
  counts: {
    brands: number;
    mentions: number;
    citations: number;
    articles: number;
    prompts: number;
  };
}

export type TourCopy = string | ((ctx: TourContext) => string);

export interface TourStep {
  id: string; // stable ID, e.g. "intro" — survives reorders
  target?: string; // data-tour-id selector value
  title?: TourCopy;
  content: TourCopy;
  waitForTarget?: boolean; // default true
  waitTimeoutMs?: number; // default 3000
  attachTo?: "top" | "bottom" | "left" | "right" | "auto";
  showSkip?: boolean; // default true
  showSkipForever?: boolean; // default true (the "don't show again" button)
}

export type TourTrigger =
  | { kind: "manual" } // "?" replay only
  | { kind: "route"; routes: string[] } // auto-fire on route entry
  | { kind: "predicate"; evaluate: (ctx: TourContext) => boolean };

export interface TourConfig {
  id: string; // must match KNOWN_TOUR_IDS
  version: number; // bump when content materially changes
  scope: "global" | "perBrand" | "perUser";
  trigger: TourTrigger;
  steps: TourStep[];
}

export interface TourState {
  global?: { v: number; completedAt?: string; skippedAt?: string };
  perUserSuppressed?: string[];
  perUser?: Record<string, { v: number; completedAt?: string; skippedAt?: string }>;
  perBrand?: Record<
    string,
    Record<string, { v: number; completedAt?: string; skippedAt?: string }>
  >;
}
