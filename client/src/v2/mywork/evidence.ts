import type { WorkEvidenceView } from "../data/workTasks";

// Evidence, in the words the screens use for it.
//
// EVERY DISTINCTION A SCREEN DRAWS FROM THIS MODULE IS CARRIED BY A WORD, and
// by a glyph where one is drawn (a confirmation gate's evidence rows), never by hue.
// `index.css:580` aliases `--warning` to `--brand-accent`, so a "pending"
// painted `text-warning` would be the same pixel colour as a link. Colour is
// additive here; strip every tone and the screens still read correctly, which
// is the test.

/** The one human-facing name for each evidence kind in `shared/work.ts`. */
const KIND_LABELS: Readonly<Record<string, string>> = {
  source: "Published source",
  artifact: "Reviewed artifact",
  measurement: "Measurement",
  fault_repair: "Repair check",
  content_change: "Published page change",
  authored_work: "Published submission",
  confirmation: "Your confirmation",
  decision: "Recorded decision",
  experiment: "Experiment record",
};

/** The only evidence kind a person supplies. Everything else is produced by a
 *  check, a scrape or a measurement - which is exactly why a machine check can
 *  never stand in for this one. */
export const HUMAN_EVIDENCE_KIND = "confirmation";

export function evidenceKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

/** The label the evidence was written with, when it has one. */
export function evidenceLabel(item: WorkEvidenceView): string {
  const finding = item.structuredFinding;
  if (finding && typeof finding === "object" && "label" in finding) {
    const label = (finding as { label?: unknown }).label;
    if (typeof label === "string" && label.trim().length > 0) return label;
  }
  return evidenceKindLabel(item.kind);
}

/**
 * The completion rule, read out of the task rather than restated.
 *
 * `completionRule.required` is the set of evidence kinds
 * `validateEvidenceForTask` will insist on. Splitting it into what software
 * checks and what a person confirms is the whole claim the gate rests on, so
 * it is derived here from the same field the server enforces.
 */
export function splitCompletionRule(required: readonly string[] | undefined): {
  checked: string[];
  confirmed: string[];
} {
  const kinds = required ?? [];
  return {
    checked: kinds.filter((kind) => kind !== HUMAN_EVIDENCE_KIND).map(evidenceKindLabel),
    confirmed: kinds.filter((kind) => kind === HUMAN_EVIDENCE_KIND).map(evidenceKindLabel),
  };
}

export function completionRuleSentences(required: readonly string[] | undefined): string[] {
  const { checked, confirmed } = splitCompletionRule(required);
  const lines: string[] = [];
  if (checked.length > 0) lines.push(`Software checks: ${checked.join(", ").toLowerCase()}.`);
  lines.push(
    confirmed.length > 0
      ? "You confirm the business facts. A page check cannot do that for you."
      : "No confirmation from you is required for this task.",
  );
  return lines;
}

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
