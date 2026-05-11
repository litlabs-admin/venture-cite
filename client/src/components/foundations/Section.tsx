import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  metaRow,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  metaRow?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const hasHeader = Boolean(title || description || metaRow || action);
  return (
    <section className={cn("space-y-4", className)}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
            {description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</p>
            )}
            {metaRow && <div className="mt-2 flex items-center gap-2 flex-wrap">{metaRow}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children && <div className={contentClassName}>{children}</div>}
    </section>
  );
}
