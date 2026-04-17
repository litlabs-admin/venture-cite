import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Rocket,
  CheckCircle2,
  Building2,
  PenLine,
  ScanEye,
  Target,
  ArrowRight,
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  link: string;
  linkText: string;
  icon: any;
  checkFn: (data: any) => boolean;
}

const STEPS: OnboardingStep[] = [
  {
    id: "brand",
    title: "Create your first brand",
    description: "Set up a brand profile so content can be personalized with your tone, values, and unique selling points.",
    link: "/brands",
    linkText: "Create brand",
    icon: Building2,
    checkFn: (d) => (d?.brands?.length || 0) > 0,
  },
  {
    id: "content",
    title: "Generate AI-optimized content",
    description: "Use the AI content generator to create articles designed to be cited by AI search engines.",
    link: "/content",
    linkText: "Create content",
    icon: PenLine,
    checkFn: (d) => Boolean(d?.hasArticles) || (d?.articles?.length || 0) > 0,
  },
  {
    id: "visibility",
    title: "View the AI Visibility Guide",
    description: "Step-by-step recommendations to optimize your presence across ChatGPT, Claude, and other AI engines.",
    link: "/ai-visibility",
    linkText: "View guide",
    icon: ScanEye,
    // Server-only — localStorage would leak across user accounts on the
    // same browser (e.g. logout + new signup would see the step pre-done).
    checkFn: (d) => Boolean(d?.visibilityVisited),
  },
  {
    id: "citation",
    title: "Run your first citation check",
    description: "Kick off an AI citation run so we can start tracking how often platforms mention your brand.",
    link: "/citations",
    linkText: "Run check",
    icon: Target,
    // Done the moment the user triggers their first run — no need to wait
    // for an actual cited result.
    checkFn: (d) => (d?.citationRunsCount || 0) > 0 ||
      (d?.citations?.length || 0) > 0 ||
      (d?.citedRankingsCount || 0) > 0,
  },
];

const SEEN_KEY_PREFIX = "venturecite-onboarding-seen:";

export default function SidebarOnboarding({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [autoOpenReady, setAutoOpenReady] = useState(false);

  useEffect(() => {
    setAutoOpenReady(true);
  }, []);

  const { data: statusResp } = useQuery<{ success: boolean; data: any }>({
    queryKey: ["/api/onboarding-status"],
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  // Read brands + articles from their existing caches so creating either
  // flips the relevant step instantly — those queries already invalidate
  // on create/delete throughout the app.
  const { data: brandsResp } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ["/api/brands"],
  });
  const { data: articlesResp } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ["/api/articles"],
  });
  const data = {
    ...(statusResp?.data || {}),
    brands: brandsResp?.data || statusResp?.data?.brands || [],
    articles: articlesResp?.data || statusResp?.data?.articles || [],
    hasArticles: (articlesResp?.data?.length || 0) > 0 || Boolean(statusResp?.data?.hasArticles),
  };

  const completed = STEPS.filter((s) => s.checkFn(data)).length;
  const total = STEPS.length;
  const progress = (completed / total) * 100;
  const isComplete = completed === total;
  const nextStepIndex = STEPS.findIndex((s) => !s.checkFn(data));

  // First-login auto-open: fires once per user per browser, keyed by user.id.
  // Skips if already complete — no point greeting them with a finished list.
  useEffect(() => {
    if (!autoOpenReady || !user?.id || !statusResp || isComplete) return;
    const seenKey = `${SEEN_KEY_PREFIX}${user.id}`;
    if (localStorage.getItem(seenKey)) return;
    localStorage.setItem(seenKey, new Date().toISOString());
    setOpen(true);
  }, [autoOpenReady, user?.id, statusResp, isComplete]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full text-left rounded-lg border border-border bg-card hover:border-foreground/20 hover:shadow-sm p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="sidebar-onboarding-trigger"
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
            {isComplete ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-foreground" />
            ) : (
              <Rocket className="w-3.5 h-3.5 text-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground leading-tight tracking-tight">
              {isComplete ? "You're all set" : "Getting started"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isComplete ? `${total} of ${total} complete` : `${completed} of ${total} complete`}
            </p>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <DialogHeader className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5 text-foreground" />
                  ) : (
                    <Rocket className="w-5 h-5 text-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl font-semibold tracking-tight">
                    {isComplete ? "You're all set" : "Getting started with VentureCite"}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground mt-1">
                    {isComplete
                      ? "You've completed every onboarding step. Revisit any time to refresh the essentials."
                      : "Four steps to start getting cited by AI search engines."}
                  </DialogDescription>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{completed} of {total} complete</span>
                  <span className="font-medium text-foreground">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {STEPS.map((step, idx) => {
              const done = step.checkFn(data);
              const isNext = !done && idx === nextStepIndex;
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                    done
                      ? "border-border bg-muted/30"
                      : isNext
                        ? "border-foreground/20 bg-card"
                        : "border-border bg-card"
                  }`}
                  data-testid={`onboarding-step-${step.id}`}
                >
                  <div className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-muted">
                    {done ? (
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    ) : (
                      <Icon className="w-4 h-4 text-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground tracking-wide">
                        STEP {idx + 1}
                      </span>
                      {isNext && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground border border-border bg-muted px-1.5 py-0.5 rounded">
                          Next
                        </span>
                      )}
                      {done && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Done
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-semibold mt-0.5 ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                    {!done && (
                      <Link href={step.link}>
                        <Button
                          size="sm"
                          variant={isNext ? "default" : "outline"}
                          className="mt-3"
                          onClick={() => {
                            setOpen(false);
                            onNavigate?.();
                          }}
                          data-testid={`button-step-${step.id}`}
                        >
                          {step.linkText}
                          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      </Link>
                    )}
                    {done && (
                      <Link href={step.link}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => {
                            setOpen(false);
                            onNavigate?.();
                          }}
                        >
                          Revisit
                          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-3 border-t border-border bg-muted/30 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Reopen this anytime from the sidebar.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
