import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. The issue has been logged — please try again.",
  onRetry,
  retryLabel = "Retry",
  isRetrying = false,
  className,
}: ErrorStateProps) {
  return (
    <Card className={cn("border-destructive/30", className)}>
      <CardContent className="flex flex-col items-center text-center p-8">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-sm text-muted-foreground mt-2 max-w-md">{description}</div>
        <Button
          size="sm"
          variant="outline"
          className="mt-5"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} aria-hidden="true" />
          {retryLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export default ErrorState;
