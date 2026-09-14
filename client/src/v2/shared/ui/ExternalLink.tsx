import type { AnchorHTMLAttributes, ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
};

export function ExternalLink({ children, className, ...props }: ExternalLinkProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]",
        v2FocusRing,
        className,
      )}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children}
      <V2Icon name="link" size={14} />
    </a>
  );
}
