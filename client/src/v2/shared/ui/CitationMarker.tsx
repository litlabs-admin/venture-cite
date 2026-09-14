import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type CitationMarkerProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  index: number;
};

export function CitationMarker({ index, className, ...props }: CitationMarkerProps) {
  return (
    <a
      className={cn(
        "font-mono text-[12px] font-medium text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]",
        v2FocusRing,
        className,
      )}
      {...props}
    >
      [{index}]
    </a>
  );
}
