import type { V2Mode } from "@/v2/contracts/shell";
import type { BoardId } from "@/v2/contracts/screen";
import { VISIBILITY_TABS } from "../dispatch/visibilityTabs";

// The Visibility area's tab strip, shared by every screen this area builds
// (boards 08, 09, 10, 21) so the eight tabs and their hrefs are spelled once.
// Boards built by other agents (20, 35, 37, 38) may import this too, since
// `visibilityTabs.ts` is the one list LIVE-RULES asks every Visibility screen
// to render from.
//
// Every tab carries `brandId` and `mode` in `search`, matching the rest of
// this area's links - a bare href here would drop the selected brand the
// moment a reader clicked to another tab.
export function visibilityTabHref(
  path: string,
  context: { brandId: string; mode: V2Mode },
): string {
  const params = new URLSearchParams({ brandId: context.brandId, mode: context.mode });
  return `${path}?${params.toString()}`;
}

export function VisibilityTabStrip({
  active,
  context,
  className = "",
}: {
  /** The current screen's board id. No entry is active when the caller's
   *  board is not one of the eight tabs - never guessed from the route. */
  active: BoardId;
  context: { brandId: string; mode: V2Mode };
  className?: string;
}) {
  return (
    <nav
      aria-label="Visibility sections"
      className={`border-b border-[var(--v2-line)] ${className}`}
    >
      <div className="flex flex-wrap gap-6">
        {VISIBILITY_TABS.map((tab) => {
          const isActive = tab.board === active;
          return (
            <a
              key={tab.label}
              aria-current={isActive ? "page" : undefined}
              className={`pb-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)] ${
                isActive
                  ? "border-b-2 border-[var(--v2-brand)] text-[color:var(--v2-brand)]"
                  : "border-b-2 border-transparent text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"
              }`}
              href={visibilityTabHref(tab.route, context)}
            >
              {tab.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

// Re-exported so a screen that still needs the raw label/route list (rather
// than the rendered strip) has one place to read it from.
export { VISIBILITY_TABS };
