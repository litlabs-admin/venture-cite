import { ChevronRight, FileText } from "lucide-react";
import { PanelLabel, CCLink, DEST } from "./primitives";
import type { Recommendation } from "./useCommandCenterData";

// ─── Actions strip ───────────────────────────────────────────────────────────
// One full-width band between the chart row and the prompts row. Measured:
// px-8 pt-2.5 pb-3, header line then the single highest-priority action.
//
// The reference shows a "0/2" completion bar. Recommendations here have no
// completed state to count, so that segment is omitted rather than rendered
// permanently at zero — an always-empty progress bar reads as broken.

const IMPACT: Record<Recommendation["priority"], string> = {
  P0: "High Impact",
  P1: "Medium Impact",
  P2: "Low Impact",
};

export function ActionsStrip({
  recommendations,
  loading,
}: {
  recommendations: Recommendation[];
  loading: boolean;
}) {
  const top = recommendations[0];

  return (
    <div className="border-b border-vc-default">
      <div className="px-8 pb-3 pt-2.5">
        <div className="mb-2 flex items-center gap-3">
          <PanelLabel>Actions</PanelLabel>
          <span className="h-3 w-px flex-shrink-0 bg-vc-subtle" aria-hidden />
          <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-vc-secondary">
            {loading ? "–" : recommendations.length}
          </span>
          <span className="flex-shrink-0 text-[10px] text-vc-text-muted">open</span>
          <div className="flex-1" />
          <CCLink
            dest={DEST.actions}
            className="group flex flex-shrink-0 items-center gap-0.5 text-[10px] text-vc-text-muted transition-colors hover:text-vc-accent"
          >
            View all
            <ChevronRight className="h-2.5 w-2.5" aria-hidden />
          </CCLink>
        </div>

        <div className="h-[22px]">
          {loading ? (
            <div className="h-4 w-64 rounded-sm bg-vc-muted" aria-hidden />
          ) : !top ? (
            <p className="text-[12px] text-vc-tertiary">
              Nothing outstanding. New actions appear after each citation run.
            </p>
          ) : (
            <CCLink
              dest={DEST.actions}
              className="-mx-2 flex min-w-0 items-center gap-2.5 rounded px-2 py-0.5 pl-0.5 transition-colors hover:bg-vc-muted/50"
            >
              <div className="group/title flex min-w-0 items-center gap-2.5">
                <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-vc-hover" aria-hidden />
                <FileText className="h-3 w-3 flex-shrink-0 text-vc-hover" aria-hidden />
                <span className="truncate text-[12px] font-medium text-vc-tertiary transition-colors duration-200 group-hover/title:text-vc-accent">
                  {top.title}
                </span>
              </div>
              <div className="ml-auto flex flex-shrink-0 items-center gap-2.5">
                <span className="flex-shrink-0 rounded bg-vc-accent-subtle px-1.5 py-px text-[10px] font-medium text-vc-accent">
                  {IMPACT[top.priority]}
                </span>
              </div>
            </CCLink>
          )}
        </div>
      </div>
    </div>
  );
}
