import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import type { V2IconName } from "@/v2/contracts/icons";
import { cn } from "@/lib/utils";
import { v2ToneClasses, type V2Tone } from "./shared";

export type ChipProps = {
  children: ReactNode;
  tone?: V2Tone;
  leadingDot?: boolean;
  icon?: V2IconName;
  className?: string;
};

export function Chip({ children, tone = "neutral", leadingDot, icon, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] leading-[1.35] font-semibold tabular-nums",
        v2ToneClasses[tone],
        className,
      )}
      data-tone={tone}
    >
      {leadingDot ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      {icon ? <V2Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}
