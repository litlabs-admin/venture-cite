import { cn } from "@/lib/utils";
import { clampPercent } from "./shared";

export type MeterProps = {
  value: number;
  max?: number;
  label?: string;
  tone?: "brand" | "ok" | "warn" | "bad" | "neutral";
  className?: string;
};

const toneClasses: Record<NonNullable<MeterProps["tone"]>, string> = {
  brand: "bg-[var(--v2-brand)]",
  ok: "bg-[var(--v2-ok)]",
  warn: "bg-[var(--v2-warn)]",
  bad: "bg-[var(--v2-bad)]",
  neutral: "bg-[var(--v2-ink3)]",
};

export function Meter({ value, max = 100, label, tone = "brand", className }: MeterProps) {
  const percent = clampPercent(value, max);
  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      className={cn("h-[7px] w-full overflow-hidden rounded-full bg-[var(--v2-line)]", className)}
      role="meter"
    >
      <div
        className={cn("h-full rounded-full", toneClasses[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
