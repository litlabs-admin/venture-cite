// server/lib/tourRegistry.ts
//
// Single source of truth for valid tour IDs and event types accepted by the
// tour engine API. Server validates inbound writes against these. Mirrors the
// client registry at client/src/tours/registry.ts — keep both in sync.

export const KNOWN_TOUR_IDS = [
  // Global
  "global-welcome",
  // Page tours
  "dashboard",
  "brands",
  "ai-visibility",
  "citations",
  "geo-tools",
  "ai-intelligence",
  // Nudges
  "first-scan-complete",
  "first-citation-found",
  "first-article-generated",
  "first-prompt-added",
  "first-brand-created",
  "first-mention-clicked",
  "first-listicle-found",
  "first-faq-generated",
  "first-keyword-research",
  "empty-citations",
] as const;

export type KnownTourId = (typeof KNOWN_TOUR_IDS)[number];

export const KNOWN_EVENT_TYPES = [
  "tour_auto_fired",
  "tour_manual_replayed",
  "tour_step_viewed",
  "tour_step_advanced",
  "tour_step_back",
  "tour_completed",
  "tour_skipped",
  "tour_suppressed",
  "tour_abandoned",
  "tour_step_target_missing",
  "tour_step_target_lost",
] as const;

export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number];

export const TOUR_STATE_OPS = ["markCompleted", "markSkipped", "suppress", "clearBrand"] as const;
export type TourStateOp = (typeof TOUR_STATE_OPS)[number];

export function isKnownTourId(value: unknown): value is KnownTourId {
  return typeof value === "string" && (KNOWN_TOUR_IDS as readonly string[]).includes(value);
}

export function isKnownEventType(value: unknown): value is KnownEventType {
  return typeof value === "string" && (KNOWN_EVENT_TYPES as readonly string[]).includes(value);
}
