// Action-card schema (04-implementation-plan.md §4.1a), specified from
// 01-trakkr-teardown.md R11's fully-observed expanded card.
//
// `rationale` is model-authored (the one field that makes a card
// persuasive rather than bureaucratic - it references the user's actual
// question). `title`, `inputEcho` and `params` are TOOL-authored, exactly
// like block rows: they are the literal arguments the action will execute
// with, and the card must show precisely what will run. See
// server/ask/tools/propose.ts and docs/ask-feature/07 §6.1 for the
// structural-validation rule that enforces this at the boundary.

import { z } from "zod";

// "remember_fact" (business-context.md's Memory tab, decision 5: a learned
// memory is proposed as a card, never saved automatically) reuses this
// exact card lifecycle - propose_action -> pending card -> approve enqueues
// -> done - rather than a bespoke path, so Memory gets undo, the filter bar
// and "Waiting on you" for free. Its executor writes to ask_memories, not
// agent_tasks' usual artifact tables - see server/ask/actions/kinds.ts.
export const ACTION_KINDS = [
  "track_prompt",
  "queue_article",
  "run_citation_check",
  "remember_fact",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_STATUSES = ["pending", "done", "dismissed", "failed", "reversed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

// Per-kind wording for the card's resolved-state label and its undo control
// (AskActionCard.tsx). Trakkr's own wording ("Tracking" / "Untrack") is
// specific to track_prompt; generalizing it here rather than hardcoding it
// in the component is what lets remember_fact render "Remembered" / "Forget"
// through the same component with no kind-specific branching in the JSX.
export const ACTION_KIND_DONE_LABEL: Record<ActionKind, string> = {
  track_prompt: "Tracking",
  queue_article: "Queued",
  run_citation_check: "Complete",
  remember_fact: "Remembered",
};
export const ACTION_KIND_UNDO_LABEL: Record<ActionKind, string> = {
  track_prompt: "Untrack",
  queue_article: "Cancel",
  run_citation_check: "Undo",
  remember_fact: "Forget",
};
export const ACTION_KIND_APPROVE_LABEL: Record<ActionKind, string> = {
  track_prompt: "Add to queue",
  queue_article: "Add to queue",
  run_citation_check: "Add to queue",
  remember_fact: "Remember",
};

export const askActionCardSchema = z.object({
  id: z.string(),
  kind: z.enum(ACTION_KINDS),
  kindLabel: z.string(), // "Track prompt" - header, matches Trakkr wording
  status: z.enum(ACTION_STATUSES),
  title: z.string(), // Track "…" - templated, tool-authored
  inputEcho: z.string(), // the raw parameter, unquoted
  rationale: z.string(), // model-authored, second person
  params: z.record(z.string(), z.string()), // rendered italic: market 'US'
  isReversible: z.boolean(),
  undoDisabledReason: z.string().nullable(),
});
export type AskActionCard = z.infer<typeof askActionCardSchema>;

// Reversibility result from an action kind's `isReversible` check
// (07-integration-and-hardening.md §5.3). `false` always carries a reason -
// the disabled Undo control must never be silent (round-2 decision 3).
export type ReversibilityCheck = { ok: true } | { ok: false; reason: string };
