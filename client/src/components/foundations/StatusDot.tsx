import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusDotTone = "success" | "warn" | "fail" | "neutral" | "pending";

// "success" has no entry here - it renders as a neutral check glyph instead
// of a colour, not a coloured dot. See the branch below. Green (and the
// chart-4 violet that used to stand in for it) is reserved for actions,
// never for signalling a status outcome.
const toneClass: Record<Exclude<StatusDotTone, "success">, string> = {
  warn: "bg-warning",
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
  if (tone === "success") {
    // Neutral text colour + a check glyph - never a coloured dot - so
    // "success" isn't encoded by colour alone.
    return (
      <Check
        role="status"
        aria-label={ariaLabel ?? `Status: ${tone}`}
        strokeWidth={3}
        className={cn("h-2.5 w-2.5 shrink-0 text-foreground", className)}
      />
    );
  }

  return (
    <span
      role="status"
      aria-label={ariaLabel ?? `Status: ${tone}`}
      className={cn("inline-block h-2 w-2 rounded-full shrink-0", toneClass[tone], className)}
    />
  );
}
