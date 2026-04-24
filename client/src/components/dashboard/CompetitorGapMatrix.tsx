import { Check, X, Minus } from "lucide-react";

type CellState = "yes" | "no" | "partial" | "unknown";

export interface GapMatrixRow {
  entityType: "brand" | "competitor";
  entityId: string;
  name: string;
  totalMentions: number;
  cells: Record<string, CellState>;
  gapCount: number;
}

interface Props {
  categories: string[];
  rows: GapMatrixRow[];
}

function renderCell(state: CellState) {
  if (state === "yes")
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-500/15 text-emerald-400">
        <Check className="w-3 h-3" />
      </span>
    );
  if (state === "no")
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-destructive/15 text-destructive">
        <X className="w-3 h-3" />
      </span>
    );
  if (state === "partial")
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-500/15 text-amber-400 text-xs">
        ~
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 text-muted-foreground">
      <Minus className="w-3 h-3" />
    </span>
  );
}

export default function CompetitorGapMatrix({ categories, rows }: Props) {
  if (categories.length === 0 || rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Gap analysis appears after your first citation run finishes.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-3 mb-3 text-[11px] flex-wrap text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-destructive/40" /> They appear, you don&apos;t
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500/40" /> You appear, they don&apos;t
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-amber-500/40" /> Partial
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-muted/40" /> Neither
        </span>
      </div>

      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">Competitor</th>
            {categories.map((cat) => (
              <th
                key={cat}
                className="py-2 px-2 text-xs font-medium text-muted-foreground text-center"
              >
                {cat}
              </th>
            ))}
            <th className="py-2 pl-2 text-xs font-medium text-muted-foreground text-center">
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
                className={
                  "border-b border-border/50 " + (isBrand ? "bg-primary/5 font-medium" : "")
                }
                data-testid={`gap-row-${row.name}`}
              >
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    {isBrand && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">
                        {row.name} {isBrand && <span className="text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.totalMentions} mention{row.totalMentions === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                </td>
                {categories.map((cat) => (
                  <td key={cat} className="py-2.5 px-2 text-center">
                    {renderCell(row.cells[cat] ?? "unknown")}
                  </td>
                ))}
                <td className="py-2.5 pl-2 text-center text-sm">
                  {isBrand ? (
                    <span className="text-primary">You</span>
                  ) : row.gapCount > 0 ? (
                    <span className="text-destructive font-medium">+{row.gapCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
