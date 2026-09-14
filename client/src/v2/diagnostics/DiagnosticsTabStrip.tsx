import type { BoardId } from "@/v2/contracts/screen";
import { DIAGNOSTICS_TABS } from "@/v2/dispatch/diagnosticsTabs";

// The one tab strip every Diagnostics board renders. Each board (b11, b12,
// b13, b18) used to carry its own hand-written copy of this list - one of
// them missing "Competitor gap" entirely, one rendering static (non-
// navigating) tabs, and none of them marking the active tab from anything
// but a hardcoded index. Reading `DIAGNOSTICS_TABS` here means every board
// shows the same five tabs in the same order, and adding a board later is a
// one-file change instead of a four-file one.
//
// Plain anchors, not a router `Link`: these Screen components are rendered
// standalone in Screen-only tests (`Board11Screen`, etc. take only `data`
// and `staleAsOf`), so they cannot assume a router context is mounted.
// `brandId` and `mode` are the only two search params the diagnostics tree
// carries, per the make-it-live routing rule.
export function diagnosticsTabHref(route: string, brandId: string | undefined, mode: string) {
  const params = new URLSearchParams();
  if (brandId) params.set("brandId", brandId);
  params.set("mode", mode);
  return `${route}?${params.toString()}`;
}

export function DiagnosticsTabStrip({
  active,
  brandId,
  mode,
}: {
  active: BoardId;
  brandId: string | undefined;
  mode: string;
}) {
  return (
    <nav
      aria-label="Diagnostics sections"
      className="flex flex-wrap gap-x-6 gap-y-1 border-b border-[var(--v2-line)]"
      role="tablist"
    >
      {DIAGNOSTICS_TABS.map((tab) => {
        const isActive = tab.board === active;
        return (
          <a
            aria-selected={isActive}
            className={`-mb-px border-b-2 pb-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)] ${
              isActive
                ? "border-[var(--v2-brand)] text-[color:var(--v2-brand)]"
                : "border-transparent text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"
            }`}
            data-v2-tab={tab.label}
            href={diagnosticsTabHref(tab.route, brandId, mode)}
            key={tab.board}
            role="tab"
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
