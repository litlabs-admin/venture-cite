// Plan-route guards: HTTPS normalization + cooldown / concurrent / cost-cap /
// paused checks. Pure functions over inputs the route handler resolves
// from the DB. Keeps the route handler small.

const COOLDOWN_MS = 10 * 60_000;

/**
 * Normalize a URL string to HTTPS.
 * Returns null if the input is not a valid http(s) URL.
 */
export function normalizeHttps(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") return u.toString();
    if (u.protocol === "http:") {
      u.protocol = "https:";
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export interface PlanGuardInput {
  brand: { id: string; factScrapeEnabled: boolean };
  inFlightRun: { id: string } | null;
  lastCompletedRunAt: Date | null;
  costCap: { factScrapeCents: number; monthlyCapCents: number } | null;
}

export type PlanGuardVerdict =
  | { ok: true }
  | { ok: false; status: 409; code: "paused"; message: string }
  | { ok: false; status: 409; code: "already_running"; runId: string; message: string }
  | { ok: false; status: 409; code: "cooldown"; unlockAtMs: number; message: string }
  | { ok: false; status: 402; code: "cost_cap_reached"; message: string };

/**
 * Evaluate all plan-level guards in priority order.
 * Returns { ok: true } when the scrape may proceed, or a typed rejection
 * containing the HTTP status and machine-readable code.
 */
export function evaluatePlanGuards(input: PlanGuardInput): PlanGuardVerdict {
  if (!input.brand.factScrapeEnabled) {
    return {
      ok: false,
      status: 409,
      code: "paused",
      message: "Fact scraping is paused for this brand.",
    };
  }

  if (input.inFlightRun) {
    return {
      ok: false,
      status: 409,
      code: "already_running",
      runId: input.inFlightRun.id,
      message: "A scrape is already in progress for this brand.",
    };
  }

  if (input.lastCompletedRunAt) {
    const age = Date.now() - input.lastCompletedRunAt.getTime();
    if (age < COOLDOWN_MS) {
      return {
        ok: false,
        status: 409,
        code: "cooldown",
        unlockAtMs: input.lastCompletedRunAt.getTime() + COOLDOWN_MS,
        message: "Re-scrape allowed once every 10 minutes.",
      };
    }
  }

  if (input.costCap && input.costCap.factScrapeCents >= input.costCap.monthlyCapCents) {
    return {
      ok: false,
      status: 402,
      code: "cost_cap_reached",
      message: "Monthly fact-scrape budget reached. Resets on day 1 of next month.",
    };
  }

  return { ok: true };
}
