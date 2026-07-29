import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type KPITileDeltaTone = "up" | "down" | "neutral";

export function KPITile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  sublabel,
  className,
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: KPITileDeltaTone;
  sublabel?: string;
  className?: string;
}) {
  const formattedValue = typeof value === "number" ? value.toLocaleString() : value;
  // "up" is a neutral text colour, not green/chart-4 — the ArrowUp icon
  // below is what signals direction, not colour. Green is reserved for
  // actions, not for marking a delta as a good outcome.
  const deltaColor =
    deltaTone === "up"
      ? "text-foreground"
      : deltaTone === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className={cn("rounded-md border border-border bg-card p-4", className)}>
      <div className="text-caption uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div className="mt-2 font-mono tabular-nums text-stat text-foreground">{formattedValue}</div>
      {(delta || sublabel) && (
        <div className="mt-2 flex items-center gap-2 text-caption">
          {delta && (
            <span className={cn("inline-flex items-center gap-1 font-medium", deltaColor)}>
              {deltaTone === "up" && <ArrowUp className="h-3 w-3" />}
              {deltaTone === "down" && <ArrowDown className="h-3 w-3" />}
              {delta}
            </span>
          )}
          {sublabel && <span className="text-muted-foreground">{sublabel}</span>}
        </div>
      )}
    </div>
  );
}
