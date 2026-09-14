import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { v2Type } from "@/v2/theme/typography";

export type SectionHeadingProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  children: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function SectionHeading({
  children,
  description,
  action,
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)} {...props}>
      <div className="min-w-0">
        <h2 className={v2Type.sectionTitle}>{children}</h2>
        {description ? <p className={cn(v2Type.meta, "mt-1")}>{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
