import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void; href?: string };
  secondaryAction?: { label: string; onClick: () => void; href?: string };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <Card className={className}>
      <CardContent className={cn("flex flex-col items-center text-center p-8", !Icon && "pt-12")}>
        {Icon && (
          <div className="rounded-full bg-muted p-4 mb-4">
            <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <div className="text-sm text-muted-foreground mt-2 max-w-md">{description}</div>
        )}
        {(action || secondaryAction) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {action &&
              (action.href ? (
                <Button asChild size="sm">
                  <a href={action.href}>{action.label}</a>
                </Button>
              ) : (
                <Button size="sm" onClick={action.onClick}>
                  {action.label}
                </Button>
              ))}
            {secondaryAction &&
              (secondaryAction.href ? (
                <Button asChild variant="outline" size="sm">
                  <a href={secondaryAction.href}>{secondaryAction.label}</a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={secondaryAction.onClick}>
                  {secondaryAction.label}
                </Button>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EmptyState;
