// client/src/components/fact-sheet/DeltaIndicator.tsx
import { cn } from "@/lib/utils";

type DeltaType = "new" | "changed" | "removed";

const LABELS: Record<DeltaType, { emoji: string; text: string; classes: string }> = {
  new: {
    emoji: "🆕",
    text: "New since last run",
    classes: "text-chart-4 bg-chart-4/10 border-chart-4/30",
  },
  changed: {
    emoji: "📝",
    text: "Changed since last run",
    classes: "text-chart-3 bg-chart-3/10 border-chart-3/30",
  },
  removed: {
    emoji: "❌",
    text: "Removed in this run",
    classes: "text-destructive bg-destructive/10 border-destructive/30",
  },
};

export function DeltaIndicator({ type, className }: { type: DeltaType; className?: string }) {
  const meta = LABELS[type];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
        meta.classes,
        className,
      )}
      title={meta.text}
      aria-label={meta.text}
      data-testid={`delta-indicator-${type}`}
    >
      <span aria-hidden>{meta.emoji}</span>
      <span className="sr-only md:not-sr-only md:inline">{meta.text}</span>
    </span>
  );
}
