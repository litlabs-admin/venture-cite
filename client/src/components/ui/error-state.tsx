import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  onRetry: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  className?: string;
}

// Shares the panel-grammar empty-state treatment (see
// dashboard-panels/primitives.tsx PanelEmptyState): no card shell, the
// destructive tone comes from the icon/text colour, not a bordered box.
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. The issue has been logged - please try again.",
  onRetry,
  retryLabel = "Retry",
  isRetrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn("flex flex-1 flex-col items-center justify-center py-8 text-center", className)}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded bg-destructive/10 text-destructive">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="text-ui font-semibold text-vc-primary">{title}</h2>
      <div className="text-caption text-vc-tertiary mt-2 max-w-md">{description}</div>
      <Button size="sm" variant="outline" className="mt-5" onClick={onRetry} disabled={isRetrying}>
        <RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} aria-hidden="true" />
        {retryLabel}
      </Button>
    </div>
  );
}

export default ErrorState;
