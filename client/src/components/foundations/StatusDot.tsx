import { cn } from "@/lib/utils";

export type StatusDotTone = "success" | "warn" | "fail" | "neutral" | "pending";

const toneClass: Record<StatusDotTone, string> = {
  success: "bg-chart-4",
  warn: "bg-chart-3",
  fail: "bg-destructive",
  neutral: "bg-muted-foreground",
  pending: "bg-muted-foreground/40 animate-pulse",
};

export function StatusDot({
  tone = "neutral",
  className,
  "aria-label": ariaLabel,
}: {
  tone?: StatusDotTone;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span
      role="status"
      aria-label={ariaLabel ?? `Status: ${tone}`}
      className={cn("inline-block h-2 w-2 rounded-full shrink-0", toneClass[tone], className)}
    />
  );
}
