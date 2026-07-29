import type { CSSProperties } from "react";
import { Check, X, Minus } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

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

// Continuous-opacity heatmap, matching the north-star's matrix mechanism
// (roadmap §1: "every cell is rgba(var(--brand-accent-rgb), α) ... with α scaled
// continuously by the cell's value", α ≈ 0.1 + 0.0065·value, text flips
// white/dark at the α≈0.4 contrast boundary). This is NOT a fixed set of
// tinted swatches — bg-positive-subtle/bg-warning-subtle bands were replaced
// with the real formula below.
//
// This matrix's own data is tri-state (yes/no/partial/unknown), not a 0-100
// score, so there's no per-cell numeric value to scale against — the "you
// appear" / "partial" states are mapped onto representative points on that
// same 0-100 scale (the two values below are lifted directly from the
// roadmap's own verified live samples: 84.2 -> α0.63, 37.3 -> α0.325) so the
// mechanism itself — rgba(brand-accent, continuous α) with the white/dark
// text flip — is the real one, not an approximation of it.
const ALPHA_FLOOR = 0.1;
const ALPHA_SLOPE = 0.0065;
const alphaForValue = (value: number) => ALPHA_FLOOR + ALPHA_SLOPE * value;
const YES_VALUE = 84.2; // -> α 0.63, white text
const PARTIAL_VALUE = 37.3; // -> α 0.325, dark text

function heatmapCellStyle(value: number): CSSProperties {
  const alpha = alphaForValue(value);
  return {
    // rgb(var(...) / alpha) — the CSS Color 4 slash syntax — not
    // rgba(var(...), alpha): comma-syntax rgba() can't take a single
    // space-separated var() as if it expanded into three separate
    // arguments, so that form silently drops the whole declaration
    // (confirmed live: getComputedStyle reported backgroundColor as fully
    // transparent until this was fixed).
    backgroundColor: `rgb(var(--brand-accent-rgb) / ${alpha})`,
    color: alpha >= 0.4 ? "white" : "var(--foreground)",
  };
}

function renderCell(state: CellState) {
  if (state === "yes")
    return (
      <span
        className="inline-flex items-center justify-center w-14 h-8 rounded text-caption font-mono tabular-nums"
        style={heatmapCellStyle(YES_VALUE)}
      >
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  if (state === "partial")
    return (
      <span
        className="inline-flex items-center justify-center w-14 h-8 rounded text-caption font-mono tabular-nums"
        style={heatmapCellStyle(PARTIAL_VALUE)}
      >
        ~
      </span>
    );
  if (state === "no")
    // Rule (a) of the Surface-Area Rule (no scalar value behind "they
    // appear, you don't" — it's binary), so this stays a fixed light tint
    // rather than forcing it onto the continuous-opacity scale.
    return (
      <span className="inline-flex items-center justify-center w-14 h-8 rounded bg-destructive/15 text-destructive">
        <X className="w-3.5 h-3.5" />
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-14 h-8 rounded text-muted-foreground">
      <Minus className="w-3.5 h-3.5" />
    </span>
  );
}

export default function CompetitorGapMatrix({ categories, rows }: Props) {
  if (categories.length === 0 || rows.length === 0) {
    return (
      <p className="text-ui text-muted-foreground">
        Gap analysis appears after your first citation run finishes.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-3 mb-3 text-data flex-wrap text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-destructive/15" /> They appear, you don&apos;t
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={heatmapCellStyle(YES_VALUE)} /> You appear,
          they don&apos;t
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={heatmapCellStyle(PARTIAL_VALUE)} /> Partial
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-muted/40" /> Neither
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-auto py-2 pr-4 text-caption font-medium">Competitor</TableHead>
            {categories.map((cat) => (
              <TableHead
                key={cat}
                className="h-auto py-2 px-2 text-caption font-medium text-center"
              >
                {cat}
              </TableHead>
            ))}
            <TableHead className="h-auto py-2 pl-2 text-caption font-medium text-center">
              Gaps
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isBrand = row.entityType === "brand";
            return (
              <TableRow
                key={row.entityId}
                className={isBrand ? "bg-primary/5 font-medium" : ""}
                data-testid={`gap-row-${row.name}`}
              >
                <TableCell className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    {isBrand && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    <div className="min-w-0">
                      <div className="text-ui text-foreground truncate">
                        {row.name} {isBrand && <span className="text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-data text-muted-foreground">
                        {row.totalMentions} mention{row.totalMentions === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                </TableCell>
                {categories.map((cat) => (
                  <TableCell key={cat} className="py-2.5 px-2 text-center">
                    {renderCell(row.cells[cat] ?? "unknown")}
                  </TableCell>
                ))}
                <TableCell className="py-2.5 pl-2 text-center text-ui">
                  {isBrand ? (
                    <span className="text-primary">You</span>
                  ) : row.gapCount > 0 ? (
                    <span className="text-destructive font-medium">+{row.gapCount}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
