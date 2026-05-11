import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  cta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6 rounded-md border border-border bg-card",
        className,
      )}
    >
      {Icon && <Icon className="h-8 w-8 text-muted-foreground mb-3" aria-hidden />}
      <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
      {body && (
        <div className="text-sm text-muted-foreground max-w-md mb-4 line-clamp-3">{body}</div>
      )}
      {cta}
    </div>
  );
}
