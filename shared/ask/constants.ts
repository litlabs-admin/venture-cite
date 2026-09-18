// Constants shared between server/ask and client/src/components/ask.
//
// Independence note (see docs/ask-feature/07-integration-and-hardening.md §0):
// this file belongs to neither the Ask product nor the AI Tutor - it is a
// pure-data module with no imports - so it is not subject to the
// no-restricted-imports isolation rule in eslint.config.js.

// Trakkr's six work-kind categories, copied verbatim per the
// "replicate Trakkr" instruction. Stored on agent_tasks.work_kind but left
// NULL by every Ask-created row in this release: 01-trakkr-teardown.md R10
// found their own "Right now" automation panel renders the identical seven
// rows under every category (confirmed against both "Create" and
// "Site fixes"), while the collapsed dropdown value differs per category -
// proof the panel isn't actually wired to the category it sits under. We are
// not copying a defect, so nothing maps into this taxonomy yet.
export const WORK_KINDS = [
  "Create",
  "Joining discussions",
  "Earning mentions",
  "Site fixes",
  "Optimize",
  "Refresh",
] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

// Trakkr's five approval-ladder rung names (01-trakkr-teardown.md R7),
// stored verbatim so the ladder can land later without a rename. Only index
// 1 ("suggest what to do") is reachable in this release - see
// server/ask/actions/kinds.ts.
export const APPROVAL_LEVELS = [
  "tell me",
  "suggest what to do",
  "prepare the work",
  "prepare the change for approval", // capability-gated (needs a reversible integration)
  "handle it", // trust-gated (needs a track record - policy not defined, out of scope)
] as const;
export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];

export const ASK_APPROVAL_LEVEL_INDEX = 1; // "suggest what to do" - the only reachable rung

// Run-loop limits (04-implementation-plan.md §3.2). Observed real Trakkr
// runs were 1m5s-1m13s (01-trakkr-teardown.md R3), so 90s was too tight;
// 180s gives headroom while still bounding worst-case cost.
export const ASK_MAX_ITERATIONS = 8;
export const ASK_MAX_TOOL_CALLS = 12;
export const ASK_MAX_WALL_CLOCK_MS = 180_000;

// Tool output caps (04 §3.3) - bound what a single tool result can push into
// the model's context so cost stays predictable across iterations.
export const ASK_TOOL_MAX_ROWS = 40;
export const ASK_TOOL_MAX_JSON_BYTES = 4_000;

// read_page caps (04 §3.3, 07 §4.3).
export const ASK_READ_PAGE_MAX_PAGES_PER_RUN = 4;
export const ASK_READ_PAGE_CONCURRENCY = 2;
export const ASK_READ_PAGE_TIMEOUT_MS = 8_000;
export const ASK_READ_PAGE_MAX_BYTES = 200_000;
export const ASK_READ_PAGE_MAX_REDIRECTS = 3;

export const ASK_MAX_FOLLOWUPS = 3;
