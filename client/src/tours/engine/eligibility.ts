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

  // Version-gated completion check.
  const record = readCompletion(tour, state, ctx);
  if (record && record.v >= tour.version && record.completedAt) return false;

  return true;
}

function readCompletion(
  tour: TourConfig,
  state: TourState,
  ctx: TourContext,
): { v: number; completedAt?: string } | undefined {
  if (tour.scope === "global") return state.global;
  if (tour.scope === "perBrand" && ctx.brandId) {
    return state.perBrand?.[ctx.brandId]?.[tour.id];
  }
  if (tour.scope === "perUser") {
    return state.perUser?.[tour.id];
  }
  return undefined;
}
