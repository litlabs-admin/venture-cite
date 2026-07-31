import { PanelLabel, PanelLink, DEST } from "./primitives";
import type { GapCell, GapMatrixRow } from "./useDashboardData";

// ─── Competitor Gaps ────────────────────────────────────────────────────
// Row 6 of the dashboard: the gap matrix, full width. It carries one column
// per query category and one row per core competitor, so it is the widest
// thing on the page - sharing the row left the table cramped and scrolling.
//
// The gap matrix moved here when the Monitor "Overview" tab was retired. It
// was <Card>-based there - rounded, shadowed, gap-separated, semantic tokens
// (text-muted-foreground / border-border / bg-primary). None of that exists
// on this page, so it is rebuilt on the dashboard's own grammar rather than
// relocated: full-bleed cells, hairline separation, vc-* stone ramp,
// PanelLabel eyebrows, tabular-nums on every figure.
//
// PROMPT COVERAGE lives in the gap panel's header, not in a panel of its
// own. It is derived from this same matrix - the brand row's yes/partial
// cell count - so as a separate panel it was a third rendering of one
// dataset. As a header figure it costs no extra row.

// Cell tint: the accent at continuous opacity, the mechanism the matrix
// carried over from the reference. Text flips at the α≈0.4 contrast
// boundary. Values below are the reference's own verified samples.
const YES_ALPHA = 0.1 + 0.0065 * 84.2; // 0.647
const PARTIAL_ALPHA = 0.1 + 0.0065 * 37.3; // 0.342

function cellStyle(alpha: number) {
  return {
    // CSS Color 4 slash syntax. Comma-form rgba() silently drops the whole
    // declaration when fed a single space-separated var().
    backgroundColor: `rgb(var(--brand-accent-rgb) / ${alpha})`,
    // --brand-accent-fg, not a literal white. The chip is the accent at alpha
    // over the page canvas, so in DARK it resolves LIGHT (dark's accent is the
    // pale periwinkle #7f9bff) and white-on-light would be unreadable. That
    // token is the designed label colour for exactly this surface: white in
    // light, near-black in dark - see index.css's note that dark "inverts the
    // label to near-black" because the accent cannot carry white at AA.
    color: alpha >= 0.4 ? "var(--brand-accent-fg)" : "var(--foreground)",
  };
}

function Cell({ state }: { state: GapCell }) {
  const base = "flex h-6 w-full items-center justify-center text-label tabular-nums";
  if (state === "yes")
    return (
      <span className={base} style={cellStyle(YES_ALPHA)} title="You appear, they don't">
        ✓
      </span>
    );
  if (state === "partial")
    return (
      <span className={base} style={cellStyle(PARTIAL_ALPHA)} title="Partial">
        ~
      </span>
    );
  if (state === "no")
    // Binary - no scalar behind "they appear, you don't" - so a flat tint
    // rather than a point on the continuous scale.
    return (
      <span className={`${base} bg-destructive/15 text-destructive`} title="They appear, you don't">
        ✕
      </span>
    );
  return (
    <span className={`${base} text-vc-hover`} title="Neither">
      –
    </span>
  );
}

function Legend() {
  const items: [string, React.CSSProperties | string, string][] = [
    ["You appear", cellStyle(YES_ALPHA), ""],
    ["Partial", cellStyle(PARTIAL_ALPHA), ""],
    ["They do, you don't", "", "bg-destructive/15"],
    ["Neither", "", "bg-vc-muted"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map(([label, style, cls]) => (
        <span key={label} className="inline-flex items-center gap-1 text-label text-vc-tertiary">
          <span
            className={`h-2 w-2 flex-shrink-0 ${cls}`}
            style={typeof style === "string" ? undefined : style}
            aria-hidden
          />
          {label}
        </span>
      ))}
    </div>
  );
}

function CompetitorGapsPanel({
  categories,
  rows,
  loading,
}: {
  categories: string[];
  rows: GapMatrixRow[];
  loading: boolean;
}) {
  const brandRow = rows.find((r) => r.entityType === "brand");
  const covered = brandRow
    ? categories.filter((c) => brandRow.cells[c] === "yes" || brandRow.cells[c] === "partial")
        .length
    : null;

  return (
    <div className="overflow-hidden px-8 py-6">
      <div className="mb-4 flex h-5 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <PanelLabel>Competitor Gaps</PanelLabel>
          {/* Prompt coverage - same matrix, read down the brand's own row. */}
          {covered !== null && categories.length > 0 && (
            <>
              <span className="h-3 w-px flex-shrink-0 bg-vc-subtle" aria-hidden />
              <span className="whitespace-nowrap text-label text-vc-tertiary">
                you appear in{" "}
                <span className="tabular-nums text-vc-primary">
                  {covered} of {categories.length}
                </span>{" "}
                query types
              </span>
            </>
          )}
        </div>
        <PanelLink dest={DEST.competitors}>View all</PanelLink>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 rounded-sm bg-vc-muted" />
          ))}
        </div>
      ) : categories.length === 0 || rows.length === 0 ? (
        <p className="text-data text-vc-tertiary">
          Gap analysis appears after your first citation run finishes.
        </p>
      ) : (
        <>
          <div className="-mx-8 overflow-x-auto px-8">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-vc-default">
                  <th className="py-2 pr-3 text-left text-label font-semibold uppercase tracking-wider text-vc-label">
                    Competitor
                  </th>
                  {categories.map((cat) => (
                    <th
                      key={cat}
                      className="px-1 py-2 text-center text-label font-semibold uppercase tracking-wider text-vc-label"
                    >
                      {cat}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right text-label font-semibold uppercase tracking-wider text-vc-label">
                    Gaps
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isBrand = row.entityType === "brand";
                  return (
                    <tr
                      key={row.entityId}
                      data-testid={`gap-row-${row.name}`}
                      className={`border-b border-vc-default last:border-b-0 transition-colors ${
                        isBrand ? "bg-vc-accent-subtle/55" : "hover:bg-vc-muted/40"
                      }`}
                    >
                      <td className="max-w-[180px] py-2 pr-3">
                        <div
                          className={`truncate text-caption ${
                            isBrand ? "font-medium text-vc-primary" : "text-vc-secondary"
                          }`}
                        >
                          {row.name}
                          {isBrand && <span className="text-vc-tertiary"> (you)</span>}
                        </div>
                        <div className="text-label tabular-nums text-vc-tertiary">
                          {row.totalMentions} mention{row.totalMentions === 1 ? "" : "s"}
                        </div>
                      </td>
                      {categories.map((cat) => (
                        <td key={cat} className="px-1 py-2">
                          <Cell state={row.cells[cat] ?? "unknown"} />
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right text-caption tabular-nums">
                        {isBrand ? (
                          <span className="text-vc-tertiary">you</span>
                        ) : row.gapCount > 0 ? (
                          <span className="font-medium text-destructive">+{row.gapCount}</span>
                        ) : (
                          <span className="text-vc-tertiary">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Legend />
          </div>
        </>
      )}
    </div>
  );
}

export function GapsRow({
  categories,
  rows,
  gapLoading,
}: {
  categories: string[];
  rows: GapMatrixRow[];
  gapLoading: boolean;
}) {
  return (
    <div className="border-b border-vc-default">
      <CompetitorGapsPanel categories={categories} rows={rows} loading={gapLoading} />
    </div>
  );
}
