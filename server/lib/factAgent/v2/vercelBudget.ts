// Vercel-tier-aware budgets.
//
// All slice budgets, LLM timeouts, fetch timeouts, and SSE windows
// derive from VERCEL_FUNCTION_BUDGET_MS so a single env flip migrates
// the deployment between Hobby (10 s) and Pro (60 s) without touching
// code.
//
// Defaults assume Pro (60 s). For Hobby:
//   VERCEL_FUNCTION_BUDGET_MS=10000
//
// All derived budgets leave a 1 s safety margin so the function
// actually returns before Vercel's hard kill.

const DEFAULT_FUNCTION_BUDGET_MS = 60_000;

function getFunctionBudget(): number {
  const raw = process.env.VERCEL_FUNCTION_BUDGET_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 1000 && n <= 900_000) return n;
  return DEFAULT_FUNCTION_BUDGET_MS;
}

const FUNCTION_BUDGET_MS = getFunctionBudget();

/** Safety margin before the function's hard kill. */
const SAFETY_MARGIN_MS = 1_000;

/** Effective budget the function can spend before it must return. */
export const EFFECTIVE_BUDGET_MS = Math.max(2_000, FUNCTION_BUDGET_MS - SAFETY_MARGIN_MS);

/** How long a single LLM call may take. On Hobby (9s effective) we
 *  give the LLM 70% of the budget so there's room for the rest of the
 *  request. On Pro we cap at 25 s — long calls beyond that signal a
 *  stuck request. */
export const LLM_CALL_TIMEOUT_MS = Math.min(25_000, Math.floor(EFFECTIVE_BUDGET_MS * 0.7));

/** Jina Reader call. Same envelope as the LLM call since it includes
 *  server-side page rendering and can be similarly slow. */
export const JINA_TIMEOUT_MS = Math.min(15_000, Math.floor(EFFECTIVE_BUDGET_MS * 0.7));

/** Wikidata SPARQL + entity fetch. We get away with less budget
 *  because the API is fast — 5 s is enough for 95% of requests. */
export const WIKIDATA_TIMEOUT_MS = Math.min(8_000, Math.floor(EFFECTIVE_BUDGET_MS * 0.55));

/** Static page fetch budget. Includes SSRF DNS lookup + HTTP. */
export const PAGE_FETCH_TIMEOUT_MS = Math.min(10_000, Math.floor(EFFECTIVE_BUDGET_MS * 0.6));

/** SSE slice budget — one connection's lifetime before slice_pending
 *  forces a reconnect. On Hobby this becomes 8 s; clients reconnect
 *  every 8 s. */
export const SSE_SLICE_BUDGET_MS = Math.max(5_000, EFFECTIVE_BUDGET_MS - 1_000);

/** Cron-orchestrator total budget. Stays under the function limit so
 *  the orchestrator returns cleanly. */
export const CRON_TOTAL_BUDGET_MS = EFFECTIVE_BUDGET_MS - 2_000;

/** Per-cron-step budget. Caller picks a multiplier from this. */
export function cronStepBudget(weight = 1.0): number {
  return Math.max(1_000, Math.floor(CRON_TOTAL_BUDGET_MS * weight));
}

/** Tier-detection diagnostics for logging / inspector. */
export function describeBudget(): {
  functionBudgetMs: number;
  effectiveBudgetMs: number;
  llmTimeoutMs: number;
  jinaTimeoutMs: number;
  wikidataTimeoutMs: number;
  pageFetchTimeoutMs: number;
  sseSliceBudgetMs: number;
  tier: "hobby" | "pro" | "unknown";
} {
  const tier: "hobby" | "pro" | "unknown" =
    FUNCTION_BUDGET_MS <= 15_000 ? "hobby" : FUNCTION_BUDGET_MS >= 50_000 ? "pro" : "unknown";
  return {
    functionBudgetMs: FUNCTION_BUDGET_MS,
    effectiveBudgetMs: EFFECTIVE_BUDGET_MS,
    llmTimeoutMs: LLM_CALL_TIMEOUT_MS,
    jinaTimeoutMs: JINA_TIMEOUT_MS,
    wikidataTimeoutMs: WIKIDATA_TIMEOUT_MS,
    pageFetchTimeoutMs: PAGE_FETCH_TIMEOUT_MS,
    sseSliceBudgetMs: SSE_SLICE_BUDGET_MS,
    tier,
  };
}
