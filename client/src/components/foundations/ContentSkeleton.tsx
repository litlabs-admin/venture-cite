import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A generic, shape-matched loading placeholder for a content region whose
 * surrounding layout (sidebar, header, tab strip) is already rendered but
 * whose body is unknown at this call site — e.g. a Suspense boundary inside
 * SpineShell's tab content, or inside AppShell's main region. Not meant for
 * whole-page transitions where no layout has rendered yet (those should keep
 * RouteSpinner instead — see routeGates.tsx). Roughly approximates a title +
 * a row of stat cards + a body block, which fits most dashboard-shaped pages
 * without pretending to know their exact contents.
 */
export function ContentSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("w-full space-y-4", className)} role="status" aria-label="Loading">
      <Skeleton className="h-7 w-1/3" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
