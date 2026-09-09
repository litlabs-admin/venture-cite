import { AlertTriangle, Check, CircleSlash, type LucideIcon } from "lucide-react";
import { NoValue } from "@/components/dashboard-panels/primitives";

// The four measurement states, told apart by GLYPH AND WORDS, never by hue.
//
// The reason is not a preference. `index.css:580` aliases `--warning` to
// `--brand-accent`, so anything painted `bg-warning`/`text-warning` renders
// identically to the accent - two states styled that way would be the same
// pixel colour. `foundations/StatusDot.tsx` already set the precedent by
// giving "success" a check glyph instead of a colour. The same rule holds
// here, and it also happens to be what a colour-blind user needs.
//
// The distinctions these four carry are the ones the product keeps confusing:
//   - "Not measured" is not "measured zero"        (nothing was ever observed)
//   - "Inactive" is not "no finding"               (the check never ran, so
//     claiming reassurance would be a lie about evidence we do not have)
//   - "Failed" is not "no finding"                 (the provider errored)
//   - "No finding" is the only one that is reassurance, and it is earned:
//     the check ran and came back clean.
export type MeasurementState = "not_measured" | "inactive" | "failed" | "no_finding";

/** The one wording for an absent measurement, so no screen invents a second. */
export const NOT_MEASURED_LABEL = "Not measured";

type StateSpec = {
  /** Distinct per state, and asserted to be distinct by the test. */
  glyph: string;
  label: string;
  /** Sentence shown on hover; never promises more than the state supports. */
  meaning: string;
  tone: string;
  icon: LucideIcon | null;
};

const SPECS: Record<MeasurementState, StateSpec> = {
  // The em-dash comes from `NoValue` rather than a second convention of our
  // own: it is already what the product renders where a metric has no
  // measurement (dashboard-panels/primitives.tsx).
  not_measured: {
    glyph: "em-dash",
    label: NOT_MEASURED_LABEL,
    meaning: "No observation exists yet. This is not a measured zero.",
    tone: "text-(--fg-tertiary)",
    icon: null,
  },
  inactive: {
    glyph: "slash",
    label: "Inactive",
    meaning: "This check cannot run yet, so nothing has been looked at.",
    tone: "text-(--fg-tertiary)",
    icon: CircleSlash,
  },
  failed: {
    glyph: "alert",
    label: "Failed",
    meaning: "The provider errored, so the result is unknown rather than clean.",
    tone: "text-(--negative)",
    icon: AlertTriangle,
  },
  no_finding: {
    glyph: "check",
    label: "No finding",
    meaning: "The check ran and found nothing.",
    tone: "text-(--positive)",
    icon: Check,
  },
};

export function StateBadge({
  state,
  className = "",
}: {
  state: MeasurementState;
  className?: string;
}) {
  const spec = SPECS[state];
  const Icon = spec.icon;

  return (
    <span
      role="status"
      title={spec.meaning}
      className={`inline-flex items-center gap-1.5 text-caption ${spec.tone} ${className}`}
    >
      <span data-glyph={spec.glyph} aria-hidden="true" className="inline-flex shrink-0">
        {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={2.5} /> : <NoValue />}
      </span>
      <span>{spec.label}</span>
    </span>
  );
}
