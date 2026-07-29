// client/src/components/fact-sheet/DeltaIndicator.tsx
import { cn } from "@/lib/utils";

type DeltaType = "new" | "changed" | "removed";

// Chart tokens (--chart-*) belong to data visualisation. These are lifecycle
// states, not measurements, and "new" is not a good/bad outcome — so the only
// one that keeps a semantic colour is "removed", where the destructive hue is
// telling the user something actually went away.
const LABELS: Record<DeltaType, { emoji: string; text: string; classes: string }> = {
  new: {
    emoji: "🆕",
    text: "New since last run",
    classes: "text-foreground bg-muted border-border",
  },
  changed: {
    emoji: "📝",
    text: "Changed since last run",
    classes: "text-muted-foreground bg-muted border-border",
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
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-label font-medium",
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
