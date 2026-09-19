// Small shared parser for "positive integer environment variable, falling
// back to a default when unset or invalid" - the pattern used by the
// per-run brand caps in server/scheduler.ts (AUTO_CITATION_MAX_BRANDS_PER_RUN)
// and server/lib/brandActivation.ts (BRAND_ACTIVATION_MAX_BRANDS_PER_RUN).
// Pulled out on its own so it can be unit tested without importing either
// module's (large) dependency graph.
export function positiveIntEnv(rawValue: string | undefined, defaultValue: number): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
