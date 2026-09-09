import { AlertCircle, CircleCheck, CircleSlash, type LucideIcon } from "lucide-react";
import type { BrandFactView } from "../data/brandFacts";
import { factLabel, reviewStateOf, sourceLabel, type FactReviewState } from "./factRows";

// The fact table: FACT / EXTRACTED VALUE / SOURCE / REVIEW.
//
// ROW ORDER IS THE SERVER'S (`storage.getBrandFacts` sorts by subcategory).
// The screen deliberately does not float unreviewed rows to the top: the
// person reads this table by position, and a row that moves when its own
// state changes would relocate under the cursor at the exact moment they act
// on it.

type ReviewSpec = { label: string; icon: LucideIcon; tone: string; glyph: string };

// Distinct glyph AND distinct word per state, per state/StateBadge.tsx. The
// tones below are deliberately drawn from tokens that are NOT aliased to the
// accent, and none of the three states is separable by hue alone.
const REVIEW_SPECS: Readonly<Record<FactReviewState, ReviewSpec>> = {
  confirmed: {
    label: "Confirmed",
    icon: CircleCheck,
    tone: "text-positive",
    glyph: "confirmed",
  },
  needs_review: {
    label: "Needs review",
    // Emphasis comes from weight, not from `--warning` - which is the accent.
    icon: AlertCircle,
    tone: "font-medium text-vc-primary",
    glyph: "needs-review",
  },
  dismissed: {
    label: "Dismissed",
    icon: CircleSlash,
    tone: "text-vc-tertiary",
    glyph: "dismissed",
  },
};

export function ReviewChip({ state }: { state: FactReviewState }) {
  const spec = REVIEW_SPECS[state];
  const Icon = spec.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-caption ${spec.tone}`}
      data-review-state={state}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" data-glyph={spec.glyph} />
      {spec.label}
    </span>
  );
}

const GRID = "grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,9rem)_minmax(0,8.5rem)] gap-4";

export function FactTable({
  facts,
  selectedId,
  onSelect,
}: {
  facts: readonly BrandFactView[];
  selectedId: string | undefined;
  onSelect: (factId: string) => void;
}) {
  return (
    <div className="mt-4" data-testid="v2-fact-table">
      <div
        className={`${GRID} border-b border-vc-default px-2 pb-2 text-data font-medium tracking-wide text-vc-tertiary uppercase`}
      >
        <span>Fact</span>
        <span>Extracted value</span>
        <span>Source</span>
        <span>Review</span>
      </div>

      {facts.map((fact) => {
        const state = reviewStateOf(fact);
        const selected = fact.id === selectedId;
        return (
          <button
            key={fact.id}
            type="button"
            data-testid="v2-fact-row"
            data-fact-id={fact.id}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(fact.id)}
            className={`${GRID} w-full items-center border-b border-vc-default px-2 py-3 text-left transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40 ${
              selected ? "bg-vc-accent-subtle/60" : "hover:bg-vc-muted/40"
            }`}
          >
            <span className="min-w-0 truncate text-body text-vc-secondary">
              {factLabel(fact.factKey)}
            </span>
            <span className="min-w-0 truncate text-body font-medium text-vc-primary">
              {fact.factValue}
            </span>
            {/* The source is rendered as text, not as an anchor: the row is
                itself a button, and an anchor inside a button is invalid and
                would swallow the row's own click. The live link lives in the
                evidence block below, next to the excerpt it belongs to. */}
            <span
              className={`min-w-0 truncate text-body ${
                fact.sourceUrl ? "text-vc-accent" : "text-vc-secondary"
              }`}
            >
              {sourceLabel(fact.sourceUrl)}
            </span>
            <span className="min-w-0">
              <ReviewChip state={state} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
