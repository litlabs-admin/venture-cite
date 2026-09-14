import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { v2Type } from "@/v2/theme/typography";

export type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  caption?: ReactNode;
  tone?: "brand" | "neutral" | "ok" | "warn" | "bad";
  className?: string;
};

const valueToneClasses: Record<NonNullable<StatTileProps["tone"]>, string> = {
  brand: "text-[color:var(--v2-brand)]",
  neutral: "text-[color:var(--v2-ink)]",
  ok: "text-[color:var(--v2-ok)]",
  warn: "text-[color:var(--v2-warn)]",
  bad: "text-[color:var(--v2-bad)]",
};

export function StatTile({
  label,
  value,
  unit,
  caption,
  tone = "brand",
  className,
}: StatTileProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn(v2Type.caps, "mb-2")}>{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn(v2Type.statBig, valueToneClasses[tone])}>{value}</span>
        {unit ? <span className={v2Type.statUnit}>{unit}</span> : null}
      </div>
      {caption ? <div className={cn(v2Type.meta, "mt-2")}>{caption}</div> : null}
    </div>
  );
}
