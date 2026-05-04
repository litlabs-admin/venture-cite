import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import VisibilityGauge from "@/components/dashboard/VisibilityGauge";
import {
  STEPS,
  type OnboardingData,
  completedStepCount,
  isOnboardingComplete,
} from "@/lib/onboardingSteps";

const DISMISS_KEY_PREFIX = "venturecite-onboarding-ring-dismissed:";

export default function OnboardingProgressRing() {
  const { user } = useAuth();

  const dismissKey = user?.id ? `${DISMISS_KEY_PREFIX}${user.id}` : null;

  const {
    data: statusResp,
    isLoading: statusLoading,
    isError: statusError,
  } = useQuery<{
    success: boolean;
    data: OnboardingData;
  }>({
    queryKey: ["/api/onboarding-status"],
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const {
    data: brandsResp,
    isLoading: brandsLoading,
    isError: brandsError,
  } = useQuery<{
    success: boolean;
    data: unknown[];
  }>({ queryKey: ["/api/brands"] });
  const {
    data: articlesResp,
    isLoading: articlesLoading,
    isError: articlesError,
  } = useQuery<{
    success: boolean;
    data: unknown[];
  }>({ queryKey: ["/api/articles"] });

  const anyLoading = statusLoading || brandsLoading || articlesLoading;
  const anyError = statusError || brandsError || articlesError;

  // Read dismissal state from localStorage scoped by user.id. Re-read on
  // user change so cross-account browser sharing doesn't leak state.
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (!dismissKey) return false;
    try {
      return localStorage.getItem(dismissKey) === "true";
    } catch {
      return false;
    }
  });

  // If user.id changes (login as different account), re-read dismissal.
  useEffect(() => {
    if (!dismissKey) {
      setIsDismissed(false);
      return;
    }
    try {
      setIsDismissed(localStorage.getItem(dismissKey) === "true");
    } catch {
      setIsDismissed(false);
    }
  }, [dismissKey]);

  // Compute the merged data + completion state. Done unconditionally
  // (BEFORE any early returns) so the auto-dismiss useEffect below can
  // depend on `complete` without violating rules of hooks.
  const articlesData = (articlesResp?.data as unknown[] | undefined) ?? undefined;
  const data: OnboardingData = {
    ...(statusResp?.data || {}),
    brands: (brandsResp?.data as unknown[] | undefined) ?? statusResp?.data?.brands ?? [],
    articles: articlesData ?? statusResp?.data?.articles ?? [],
    hasArticles: (articlesData?.length || 0) > 0 || Boolean(statusResp?.data?.hasArticles),
  };

  const completed = completedStepCount(data);
  const total = STEPS.length;
  const complete = isOnboardingComplete(data);
  const progress = (completed / total) * 100;

  // Auto-dismiss on completion (write localStorage so the ring stays
  // hidden on subsequent loads). MUST stay above any early returns to
  // honor rules of hooks. Guarded so it only writes when we actually
  // have loaded data + a user.
  useEffect(() => {
    if (anyLoading || anyError) return;
    if (complete && dismissKey && !isDismissed) {
      try {
        localStorage.setItem(dismissKey, "true");
      } catch {
        // ignore
      }
    }
  }, [anyLoading, anyError, complete, dismissKey, isDismissed]);

  // Loading: render skeleton matching final layout to avoid layout shift.
  if (anyLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <Skeleton
            data-testid="onboarding-ring-skeleton"
            className="h-[160px] w-[160px] rounded-full"
          />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error in any of the three queries: don't render.
  if (anyError) return null;

  // Don't render if user is not loaded yet (defensive).
  if (!user?.id) return null;

  // If the user previously dismissed AND we are not currently in the
  // first-time celebration moment, hide the ring entirely.
  if (isDismissed && !complete) return null;

  // Completed for the first time → render celebratory state.
  if (complete) {
    return (
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <div className="relative inline-flex items-center justify-center h-[160px] w-[160px]">
            <VisibilityGauge
              score={100}
              size={160}
              fillColor="hsl(var(--chart-2, 142 71% 45%))"
              hideLabel
            />
            <CheckCircle2 className="absolute h-12 w-12 text-green-500" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">You're set 🎉</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Onboarding complete. Run weekly citation checks to see how AI engines mention you.
            </p>
            <Link
              href="/citations"
              className="inline-block mt-3 text-sm font-medium text-primary hover:underline"
            >
              Go to citations →
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // In-progress state: ring + step list.
  const nextIncomplete = STEPS.find((s) => !s.checkFn(data));

  return (
    <Card>
      <CardContent className="flex flex-col md:flex-row items-center gap-6 p-6">
        <div className="relative inline-flex items-center justify-center">
          <VisibilityGauge score={progress} size={160} hideLabel />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-3xl font-bold leading-none">
              {completed}/{total}
            </div>
            <div className="text-xs text-muted-foreground mt-1">steps done</div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold mb-2">Get started</h2>
          <ul className="space-y-2">
            {STEPS.map((step) => {
              const done = step.checkFn(data);
              const Icon = step.icon;
              return (
                <li key={step.id} className="flex items-center gap-2 text-sm">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className={done ? "line-through text-muted-foreground" : ""}>
                    {step.title}
                  </span>
                </li>
              );
            })}
          </ul>
          {nextIncomplete && (
            <Link
              href={nextIncomplete.link}
              className="inline-block mt-3 text-sm font-medium text-primary hover:underline"
            >
              Continue: {nextIncomplete.linkText} →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
