import type { AnchorHTMLAttributes, ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type LinkWithArrowProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
};

export function LinkWithArrow({ children, className, ...props }: LinkWithArrowProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]",
        v2FocusRing,
        className,
      )}
      {...props}
    >
      {children}
      <V2Icon name="arrow" size={14} />
    </a>
  );
}
