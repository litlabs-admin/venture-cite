import type { TourContext, TourCopy } from "../types";

const FALLBACK = "(content unavailable)";

export function getCopy(
  _tourId: string,
  _stepId: string,
  copy: TourCopy | undefined,
  ctx: TourContext,
): string {
  if (copy === undefined || copy === null) return FALLBACK;
  if (typeof copy === "string") return copy;
  try {
    const out = copy(ctx);
    return typeof out === "string" && out.length > 0 ? out : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
