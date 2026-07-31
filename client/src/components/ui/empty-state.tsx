import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: React.ReactNode;
  onClick: () => void;
  href?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

// Shares the panel-grammar empty-state treatment (see
// dashboard-panels/primitives.tsx PanelEmptyState) rather than inventing a
// third look: no card shell, just centered content that assumes it already
// sits inside a padded panel.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-1 flex-col items-center justify-center py-8 text-center", className)}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded bg-vc-muted/70 text-vc-hover">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </div>
      )}
      <h2 className="text-ui font-semibold text-vc-primary">{title}</h2>
      {description && (
        <div className="text-caption text-vc-tertiary mt-2 max-w-md">{description}</div>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action &&
            (action.href ? (
              <Button
                asChild
                size="sm"
                disabled={action.disabled}
                data-testid={action["data-testid"]}
              >
                <a href={action.href}>{action.label}</a>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
                data-testid={action["data-testid"]}
              >
                {action.label}
              </Button>
            ))}
          {secondaryAction &&
            (secondaryAction.href ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                disabled={secondaryAction.disabled}
                data-testid={secondaryAction["data-testid"]}
              >
                <a href={secondaryAction.href}>{secondaryAction.label}</a>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled}
                data-testid={secondaryAction["data-testid"]}
              >
                {secondaryAction.label}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
