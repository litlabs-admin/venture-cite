import { PanelLabel } from "./primitives";

// ─── Panel shell ─────────────────────────────────────────────────────────
// The dashboard's container grammar, extracted so the rest of the app can
// adopt it without copying className strings.
//
// The dashboard has always drawn these inline - VisibilityChart, RankingsPanel,
// PromptsRow, BottomRow and GapsRow each hand-write the same padding and
// hairlines. That was fine for six panels in one directory; it is not fine as
// the grammar spreads across ~35 pages, because the string is what drifts.
//
// THE GRAMMAR, in one place:
//   • full-bleed cells, never cards - no rounded corners, no shadows, no gaps
//   • separation is a 1px hairline drawn by the ROW, not by the panel
//   • px-8 py-6 for a third-or-wider panel, px-6 py-6 for a narrow column
//   • eyebrow is PanelLabel: 10px / 600 / uppercase / tracking-wider
//   • every figure carries tabular-nums (see primitives)
//
// Colours come from the vc-* utilities, which are theme-derived, so anything
// built on these renders correctly in both light and dark.

type Width = "wide" | "narrow";

/**
 * One cell in a panel row.
 *
 * `border` says which hairlines THIS cell draws. In a horizontal row every
 * cell except the last draws `right`; when the row stacks on mobile they draw
 * `bottom` instead, which is why the default emits both with the lg: reset.
 */
export function Panel({
  label,
  action,
  width = "wide",
  span,
  border = "row",
  minHeight,
  className = "",
  children,
}: {
  label?: React.ReactNode;
  action?: React.ReactNode;
  width?: Width;
  /** lg column span inside a PanelRow's 3-col grid. */
  span?: 2 | 3;
  /** "row" = right hairline on lg, bottom on mobile. "last" = none. */
  border?: "row" | "last";
  /** Tailwind min-height class, e.g. "min-h-[340px]", when a row must align. */
  minHeight?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pad = width === "narrow" ? "px-6 py-6" : "px-8 py-6";
  const hairlines = border === "row" ? "border-b border-vc-default lg:border-b-0 lg:border-r" : "";
  const spanCls = span === 2 ? "lg:col-span-2" : span === 3 ? "lg:col-span-3" : "";
  return (
    <div
      className={`overflow-hidden ${pad} ${hairlines} ${spanCls} ${minHeight ?? ""} ${className}`}
    >
      {label && (
        <div className="mb-4 flex h-5 items-center justify-between gap-4">
          <PanelLabel>{label}</PanelLabel>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * A horizontal band of panels. Draws the bottom hairline that separates it
 * from the next row - panels never draw their own bottom edge on desktop.
 *
 * `cols` is the lg column count; the grid is always 1-col on mobile and has
 * NO gap, because separation is hairlines rather than whitespace.
 */
export function PanelRow({
  cols = 3,
  last = false,
  className = "",
  children,
}: {
  cols?: 1 | 2 | 3;
  /** The final row on a page omits its bottom hairline. */
  last?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const grid =
    cols === 1
      ? ""
      : cols === 2
        ? "grid grid-cols-1 lg:grid-cols-2"
        : "grid grid-cols-1 lg:grid-cols-3";
  return (
    <div className={`${grid} ${last ? "" : "border-b border-vc-default"} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Page canvas. Full-bleed and theme-aware.
 *
 * AppShell gives these pages an UNPADDED canvas - a page that wraps itself in
 * a padded container stops every row's hairline short of the viewport edge,
 * which is the single most common way this grammar gets broken.
 */
export function PanelPage({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`min-h-screen bg-vc-page ${className}`}>{children}</div>;
}
