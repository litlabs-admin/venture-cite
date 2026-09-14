import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { clampPercent } from "./shared";

export type ProgressBarProps = {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  tone?: "brand" | "ok" | "warn" | "bad" | "neutral";
  className?: string;
};

const fillClasses: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  brand: "[&>div]:bg-[var(--v2-brand)]",
  ok: "[&>div]:bg-[var(--v2-ok)]",
  warn: "[&>div]:bg-[var(--v2-warn)]",
  bad: "[&>div]:bg-[var(--v2-bad)]",
  neutral: "[&>div]:bg-[var(--v2-ink3)]",
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = true,
  tone = "brand",
  className,
}: ProgressBarProps) {
  const percent = clampPercent(value, max);
  return (
    <div className={cn("w-full", className)}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[12.5px] text-[color:var(--v2-ink2)]">
          {label ? <span>{label}</span> : <span />}
          {showValue ? (
            <span className="font-mono tabular-nums text-[color:var(--v2-ink3)]">
              {Math.round(percent)}%
            </span>
          ) : null}
        </div>
      ) : null}
      <Progress
        aria-label={label}
        className={cn("h-[7px] rounded-full bg-[var(--v2-line)]", fillClasses[tone])}
        value={percent}
      />
    </div>
  );
}
