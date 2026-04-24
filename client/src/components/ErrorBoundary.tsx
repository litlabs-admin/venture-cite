import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { Sentry } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    Sentry.captureException(error, {
      tags: { source: "ErrorBoundary" },
      contexts: { react: { componentStack: info.componentStack ?? "" } },
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-muted flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error.message || "An unexpected error occurred while rendering this view."}
          </p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" variant="outline" onClick={this.reset}>
              Try again
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
