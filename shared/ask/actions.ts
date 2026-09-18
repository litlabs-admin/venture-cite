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

export const ACTION_KINDS = ["track_prompt", "queue_article", "run_citation_check"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_STATUSES = ["pending", "done", "dismissed", "failed", "reversed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

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
