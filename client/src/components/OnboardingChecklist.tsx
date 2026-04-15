import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CheckCircle2,
  Circle,
  Building2,
  FileText,
  Target,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Rocket,
  X
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  link: string;
  linkText: string;
  checkFn: (data: any) => boolean;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "brand",
    title: "Create your first brand",
    description: "Set up a brand profile so your content can be personalized with your tone, values, and unique selling points.",
    link: "/brands",
    linkText: "Create Brand",
    checkFn: (data) => (data?.brands?.length || 0) > 0,
  },
  {
    id: "content",
    title: "Generate AI-optimized content",
    description: "Use the AI content generator to create articles designed to be cited by AI search engines.",
    link: "/content",
    linkText: "Create Content",
    checkFn: (data) => (data?.articles?.length || 0) > 0,
  },
  {
    id: "visibility",
    title: "View the AI Visibility Guide",
    description: "Explore step-by-step recommendations to optimize your presence across ChatGPT, Claude, and other AI engines.",
    link: "/ai-visibility",
    linkText: "View Guide",
    checkFn: () => {
      const stored = localStorage.getItem("venturecite-visibility-visited");
      return stored === "true";
    },
  },
  {
    id: "citation",
    title: "Track your first citation",
    description: "Add citations when you discover AI platforms mentioning your content to monitor your progress.",
    link: "/citations",
    linkText: "Add Citation",
    checkFn: (data) => (data?.citations?.length || 0) > 0,
  },
];

const STORAGE_KEY = "venturecite-onboarding";

export default function OnboardingChecklist() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      setIsDismissed(parsed.dismissed || false);
      setIsExpanded(parsed.expanded !== false);
    }
  }, []);

  const { data: onboardingData } = useQuery<{ success: boolean; data: any }>({
    queryKey: ["/api/onboarding-status"],
    staleTime: 60000,
  });

  const data = onboardingData?.data || {};

  const completedSteps = ONBOARDING_STEPS.filter(step => step.checkFn(data)).length;
  const progress = (completedSteps / ONBOARDING_STEPS.length) * 100;
  const isComplete = completedSteps === ONBOARDING_STEPS.length;

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissed: true, expanded: isExpanded }));
  };

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissed: isDismissed, expanded: newExpanded }));
  };

  if (isDismissed || isComplete) {
    return null;
  }

  return (
    <Card className="mb-6 border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50" data-testid="onboarding-checklist">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Getting Started
                <Badge variant="secondary" className="text-xs">
                  {completedSteps}/{ONBOARDING_STEPS.length} complete
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Complete these steps to start getting cited by AI engines
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleToggle}
              data-testid="button-toggle-onboarding"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-dismiss-onboarding"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <Progress value={progress} className="h-2 mt-3" />
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-2">
          <div className="space-y-3">
            {ONBOARDING_STEPS.map((step, index) => {
              const isCompleted = step.checkFn(data);
              const Icon = isCompleted ? CheckCircle2 : Circle;
              
              return (
                <div 
                  key={step.id}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isCompleted 
                      ? "bg-green-50 dark:bg-green-950/30" 
                      : "bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                  data-testid={`onboarding-step-${step.id}`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                    isCompleted ? "text-green-600" : "text-muted-foreground"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isCompleted ? "text-green-700 dark:text-green-400 line-through" : "text-foreground"}`}>
                        {step.title}
                      </span>
                      {!isCompleted && index === completedSteps && (
                        <Badge className="bg-blue-600 text-xs">Next</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                  {!isCompleted && (
                    <Link href={step.link}>
                      <Button size="sm" variant="outline" data-testid={`button-${step.id}`}>
                        {step.linkText}
                      </Button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
