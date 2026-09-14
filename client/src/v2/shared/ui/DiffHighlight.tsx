import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DiffHighlightProps = {
  children: ReactNode;
  kind?: "inserted" | "confirmed";
  className?: string;
};

export function DiffHighlight({ children, kind = "inserted", className }: DiffHighlightProps) {
  return (
    <mark
      className={cn(
        "rounded px-1 py-px text-[color:var(--v2-ink)]",
        kind === "inserted" ? "bg-[var(--v2-highlight)]" : "bg-[var(--v2-highlight-confirmed)]",
        className,
      )}
    >
      {children}
    </mark>
  );
}
