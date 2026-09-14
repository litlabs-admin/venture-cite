import type { HTMLAttributes, ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2FocusRing } from "./shared";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type PanelProps = HTMLAttributes<HTMLElement> & {
  padding?: "none" | "compact" | "standard" | "spacious";
  tone?: "paper" | "inset";
  selected?: boolean;
};

export function Panel({
  className,
  padding = "standard",
  tone = "paper",
  selected,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--v2-radius-panel)] border border-[var(--v2-line)] text-[color:var(--v2-ink)]",
        tone === "paper" ? "bg-[var(--v2-paper)]" : "bg-[var(--v2-inset)]",
        padding === "none" && "p-0",
        padding === "compact" && "px-4 py-3",
        padding === "standard" && "px-5 py-[18px]",
        padding === "spacious" && "px-6 py-6",
        selected && "border-[var(--v2-brand)] bg-[var(--v2-brand-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export type PanelHeaderProps = {
  title: ReactNode;
  info?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function PanelHeader({ title, info, action, className }: PanelHeaderProps) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="text-[15px] leading-[1.3] font-semibold tracking-[-0.01em] text-[color:var(--v2-ink)]">
          {title}
        </h2>
        {info ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-label="More information"
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--v2-ink3)]",
                  v2FocusRing,
                )}
              >
                <V2Icon name="q" size={14} />
              </TooltipTrigger>
              <TooltipContent className="border-[var(--v2-line)] bg-[var(--v2-ink)] text-[color:var(--v2-paper)] shadow-none">
                {info}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
