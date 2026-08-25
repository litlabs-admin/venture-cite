// ─── Internal board types ────────────────────────────────────────────────────
// Shared by every board on /internal-page.
//
// Each board is one row in `system_state` (see server/routes/board.ts). Every
// field below must also exist in that route's `clean()` validator - a field
// added here but not there is silently dropped on the first save, so the two
// files change together or not at all.

export type Column = "backlog" | "next" | "doing" | "blocked" | "done";
export type Kind = "feature" | "upgrade" | "task";
export type Weight = "high" | "medium" | "low";

export interface Ticket {
  id: string;
  title: string;
  detail: string;
  kind: Kind;
  weight: Weight;
  area: string;
  evidence: string;
  column: Column;
  order: number;
  /** Which Venture brand the task belongs to. Empty on engineering tickets
   *  that came from the codebase audit rather than the spreadsheet. */
  brand: string;
  assignee: string;
  /** The spreadsheet's original free-text status, verbatim. `column` collapses
   *  it onto five lanes; this keeps the import lossless. */
  status: string;
  link: string;
  notes: string;
}

export const COLUMNS: { key: Column; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "next", label: "Next" },
  { key: "doing", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

export const KIND_LABEL: Record<Kind, string> = {
  feature: "New feature",
  upgrade: "Upgrade",
  task: "Task",
};

// Warm ramp only. Every colour is a token, never a literal.
export const KIND_SWATCH: Record<Kind, string> = {
  feature: "var(--brand-accent)",
  upgrade: "var(--success-accent)",
  task: "var(--fg-tertiary)",
};

export const WEIGHT_LABEL: Record<Weight, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** The three brands the spreadsheet tracks. A ticket with no brand renders no
 *  badge at all rather than being forced into one of these. */
export const BRANDS = ["VentureCite", "VenturePR", "VentureFlex"] as const;

// --chart-* is the app's categorical ramp, chosen here precisely because
// index.css states categorical series must stay separable. Blue / violet /
// amber read apart at badge size. (There is no --warning-accent token: this
// app maps --warning onto the brand blue, so an "amber accent" does not exist
// to borrow.)
export const BRAND_SWATCH: Record<string, string> = {
  VentureCite: "var(--chart-1)",
  VenturePR: "var(--chart-4)",
  VentureFlex: "var(--chart-3)",
};

/** Badge fill for a brand colour. The swatches are `var(...)` references, so a
 *  hex-alpha suffix cannot be concatenated onto them - color-mix is the only
 *  way to tint a custom property without hard-coding the colour twice. */
export function brandTint(swatch: string): string {
  return `color-mix(in oklch, ${swatch} 14%, transparent)`;
}

export type BoardId = "engineering" | "marketing" | "content" | "aeo" | "ben";

/** Empty ticket used by "New task". Kept here so every board creates the same
 *  shape and no board forgets one of the newer fields. */
export function blankTicket(kind: Kind = "task"): Ticket {
  return {
    id: `t-${Date.now()}`,
    title: "",
    detail: "",
    kind,
    weight: "medium",
    area: "",
    evidence: "",
    column: "backlog",
    order: Date.now(),
    brand: "",
    assignee: "",
    status: "",
    link: "",
    notes: "",
  };
}
