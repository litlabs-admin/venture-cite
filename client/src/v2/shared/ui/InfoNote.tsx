import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";

export type InfoNoteProps = {
  children: ReactNode;
  className?: string;
};

export function InfoNote({ children, className }: InfoNoteProps) {
  return (
    <aside
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-inset)] px-3.5 py-3 text-[12.5px] leading-[1.45] text-[color:var(--v2-ink2)]",
        className,
      )}
    >
      <V2Icon name="q" size={16} className="mt-0.5 shrink-0 text-[color:var(--v2-brand)]" />
      <div className="min-w-0">{children}</div>
    </aside>
  );
}
