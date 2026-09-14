import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: "doc" | "facts" | "work" | "q";
  className?: string;
};

export function EmptyState({
  title,
  description,
  action,
  icon = "doc",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-40 flex-col items-center justify-center rounded-[var(--v2-radius-panel)] border border-dashed border-[var(--v2-line2)] bg-[var(--v2-paper)] px-6 py-8 text-center",
        className,
      )}
    >
      <span className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]">
        <V2Icon name={icon} size={17} />
      </span>
      <h3 className="text-[15px] font-semibold text-[color:var(--v2-ink)]">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-[1.45] text-[color:var(--v2-ink3)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
