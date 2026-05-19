// client/src/tours/engine/eligibility.ts
import type { TourConfig, TourContext, TourState } from "../types";

export function shouldAutoFire(
  tour: TourConfig,
  state: TourState,
  ctx: TourContext,
  currentRoute: string,
): boolean {
  // Suppression overrides everything.
  const suppressed = state.perUserSuppressed ?? [];
  if (suppressed.includes("*") || suppressed.includes(tour.id)) return false;

  // Manual tours never auto-fire.
  if (tour.trigger.kind === "manual") return false;

  // Route-based trigger.
  if (tour.trigger.kind === "route") {
    if (!tour.trigger.routes.includes(currentRoute)) return false;
  }

  // Predicate-based trigger (nudges).
  if (tour.trigger.kind === "predicate") {
    // Route gate first: a nudge whose anchor only exists on specific
    // pages must not fire elsewhere (it would miss its target and be
    // consumed). Anchorless nudges omit `routes` and skip this.
    const routes = tour.trigger.routes;
    if (routes && routes.length > 0 && !routes.includes(currentRoute)) return false;
    let predicateOk = false;
    try {
      predicateOk = tour.trigger.evaluate(ctx);
    } catch {
      return false;
    }
    if (!predicateOk) return false;
  }

  // Brand-scoped tours require a brand id.
  if (tour.scope === "perBrand" && !ctx.brandId) return false;

  // Version-gated dismissal check. Either explicit completion OR a skip
  // counts as "user has seen this version; don't auto-fire it again."
  // The version bump on the tour config is the only way to re-show it.
  // (A separate "Don't show again" path adds the tour to perUserSuppressed
  // and is honored above; that one suppresses across version bumps too.)
  const record = readCompletion(tour, state, ctx);
  if (record && record.v >= tour.version && (record.completedAt || record.skippedAt)) return false;

  return true;
}

function readCompletion(
  tour: TourConfig,
  state: TourState,
  ctx: TourContext,
): { v: number; completedAt?: string; skippedAt?: string } | undefined {
  if (tour.scope === "global") return state.global;
  if (tour.scope === "perBrand" && ctx.brandId) {
    return state.perBrand?.[ctx.brandId]?.[tour.id];
  }
  if (tour.scope === "perUser") {
    return state.perUser?.[tour.id];
  }
  return undefined;
}
