import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type ChecklistItemProps = {
  status: "todo" | "done";
  label: ReactNode;
  detail?: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function ChecklistItem({ status, label, detail, onClick, className }: ChecklistItemProps) {
  const content = (
    <>
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
          status === "done"
            ? "border-[var(--v2-brand)] bg-[var(--v2-brand)] text-[color:var(--v2-paper)]"
            : "border-[var(--v2-line2)] text-transparent",
        )}
      >
        {status === "done" ? <V2Icon name="check" size={12} strokeWidth={2.5} /> : ""}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[color:var(--v2-ink)]">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-[12px] text-[color:var(--v2-ink3)]">{detail}</span>
        ) : null}
      </span>
    </>
  );

  return onClick ? (
    <button
      className={cn("flex w-full items-start gap-2.5 text-left", v2FocusRing, className)}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  ) : (
    <div className={cn("flex items-start gap-2.5", className)}>{content}</div>
  );
}
