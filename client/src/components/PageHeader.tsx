import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  leading?: ReactNode;
}

export default function PageHeader({ title, description, actions, leading }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex items-start gap-2">
        {leading && <div className="shrink-0 mt-0.5">{leading}</div>}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight truncate">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
