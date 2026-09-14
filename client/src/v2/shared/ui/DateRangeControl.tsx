import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type DateRangeControlProps = {
  start: ReactNode;
  end?: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function DateRangeControl({ start, end, onClick, className }: DateRangeControlProps) {
  return (
    <Button
      aria-label="Choose date range"
      className={cn(
        "h-9 gap-2 border-[var(--v2-line)] bg-[var(--v2-paper)] px-3 text-[12.5px] font-medium text-[color:var(--v2-ink2)] hover:bg-[var(--v2-inset)] hover:text-[color:var(--v2-ink)]",
        v2FocusRing,
        className,
      )}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      <V2Icon name="cal" size={15} />
      <span>{start}</span>
      {end ? (
        <>
          <span aria-hidden="true" className="text-[color:var(--v2-ink4)]">
            –
          </span>
          <span>{end}</span>
        </>
      ) : null}
      <V2Icon name="cdown" size={13} className="ml-auto text-[color:var(--v2-ink3)]" />
    </Button>
  );
}
