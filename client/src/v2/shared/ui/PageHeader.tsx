import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { v2Type } from "@/v2/theme/typography";

export type PageHeaderProps = {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  date?: ReactNode;
  period?: ReactNode;
  className?: string;
};

export function PageHeader({ title, sub, actions, date, period, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className={v2Type.pageTitle}>{title}</h1>
        {sub ? <p className={cn(v2Type.pageSub, "mt-1")}>{sub}</p> : null}
        {date ? <p className={cn(v2Type.meta, "mt-2")}>{date}</p> : null}
      </div>
      {actions || period ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {period}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
