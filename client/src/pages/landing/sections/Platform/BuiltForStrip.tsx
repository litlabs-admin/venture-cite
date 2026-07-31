// "Built for" footer strip — verbatim from index.html 2408-2419.
//
// STRUCTURAL CORRECTION vs. the task brief: a fresh re-read (confirmed by
// programmatically balancing every <div>/</div> in the 2026-2425 range)
// shows this strip is NOT nested inside the bordered panel
// ("border border-default overflow-hidden bg-white", opened index.html:2033)
// alongside the 3 rows. That panel div's own closing tag is at index.html
// line 2407 — one line BEFORE this strip's wrapper opens at line 2408. The
// strip is a SIBLING of the panel, sharing only the outer
// mx-auto/max-width:1120px wrapper. It also has its own independent
// entrance transition (opacity-0, transition-all duration-500, delay
// 400ms — no translate-y) rather than the panel's opacity-0 translate-y-8
// duration-700. See Platform.tsx and the closing report for how this is
// reflected in the JSX nesting.
//
// The 4 items are separated by a small rounded div "dot" (w-1 h-1
// rounded-full bg-default), not a literal bullet/pipe character — the last
// item (Enterprise) has no trailing separator.
//
// None of these are links any more. Three of the four pointed at other
// sections of this same page, which made "Marketing agencies" behave like a
// destination for agencies rather than what it is — a statement about who the
// product is for.
const items = ["Brand teams", "Marketing agencies", "Startups", "Enterprise"];

export function BuiltForStrip({ isVisible }: { isVisible: boolean }) {
  return (
    <div
      className="border-b border-vc-default bg-vc-surface px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 transition-all duration-500"
      style={{ opacity: isVisible ? 1 : 0, transitionDelay: "400ms" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 sm:gap-6">
        <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted whitespace-nowrap">
          Built for
        </span>
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          {items.map((label, i) => (
            <span key={label} className="flex items-center gap-3 sm:gap-5">
              <span className="text-[12px] sm:text-[13px] font-medium text-vc-secondary">
                {label}
              </span>
              {i < items.length - 1 && <span className="w-1 h-1 rounded-full bg-vc-default" />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
