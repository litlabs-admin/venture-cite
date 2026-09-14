import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type DividerProps = HTMLAttributes<HTMLDivElement>;

export function Divider({ className, ...props }: DividerProps) {
  return (
    <div
      aria-orientation="horizontal"
      role="separator"
      className={cn("h-px bg-[var(--v2-line)]", className)}
      {...props}
    />
  );
}
