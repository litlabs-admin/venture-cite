import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, ArrowLeft, X, Sparkles, Building2, FileText, Target, TrendingUp, Share2, Search, Eye } from "lucide-react";
import { useLocation } from "wouter";

interface OnboardingStep {
  id: string;
  number: number;
  title: string;
  description: string;
  tip: string;
  icon: any;
  action?: {
    label: string;
    path: string;
  };
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: "welcome",
    number: 0,
    title: "Welcome to VentureCite!",
    description: "You're about to start getting your brand cited by AI search engines like ChatGPT, Claude, Perplexity, and more. Let's walk through the key steps to get you up and running.",
    tip: "This quick tour takes about 1 minute. You can always reopen it from your dashboard.",
    icon: Sparkles,
  },
  {
    id: "brand",
    number: 1,
    title: "Step 1: Set Up Your Brand",
    description: "First, create your brand profile. Tell us about your company, industry, products, and what makes you unique. This powers all of your AI-optimized content.",
    tip: "You can auto-fill your brand info from your website URL — our AI will pull in your details automatically!",
    icon: Building2,
    action: {
      label: "Create Your Brand",
      path: "/brands"
    }
  },
  {
    id: "keywords",
    number: 2,
    title: "Step 2: Research AI Keywords",
    description: "Discover which keywords and topics AI search engines are actively looking for experts on. Find the best opportunities for your brand to get cited.",
    tip: "Keywords with high 'AI Citation Potential' scores are the ones most likely to get you mentioned by AI engines.",
    icon: Search,
    action: {
      label: "Find Keywords",
      path: "/keyword-research"
    }
  },
  {
    id: "content",
    number: 3,
    title: "Step 3: Generate Optimized Content",
    description: "Create 1,500+ word articles designed to be cited by AI platforms. Our system automatically humanizes the content so it passes AI detection while keeping the expertise signals AI engines trust.",
    tip: "Select your brand when generating content — this personalizes the article with your company's voice, products, and values.",
    icon: FileText,
    action: {
      label: "Generate Content",
      path: "/content"
    }
  },
  {
    id: "distribute",
    number: 4,
    title: "Step 4: Distribute Your Content",
    description: "Share your articles across LinkedIn, Medium, Reddit, and Quora with platform-optimized formatting. More visibility means more chances for AI engines to discover and cite your content.",
    tip: "Each platform gets custom formatting — LinkedIn posts get professional hooks, Reddit gets discussion-style intros, etc.",
    icon: Share2,
    action: {
      label: "View Articles",
      path: "/articles"
    }
  },
  {
    id: "track",
    number: 5,
    title: "Step 5: Track Your Citations",
    description: "Monitor when AI platforms mention your brand or content. Check rankings across ChatGPT, Claude, Perplexity, Google AI, Gemini, and more to see your growth over time.",
    tip: "Run ranking checks regularly — AI engines update their knowledge frequently, so new citations can appear at any time.",
    icon: Target,
    action: {
      label: "View Rankings",
      path: "/geo-rankings"
    }
  },
  {
    id: "visibility",
    number: 6,
    title: "Bonus: AI Visibility Guide",
    description: "Follow our step-by-step checklists for each AI search engine. Learn exactly what to do to get indexed by ChatGPT, Claude, Perplexity, and every other major AI platform.",
    tip: "Each AI engine has different requirements — our guide breaks down exactly what you need for each one.",
    icon: Eye,
    action: {
      label: "View Guide",
      path: "/ai-visibility"
    }
  }
];

export default function GuidedOnboarding() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [, setLocation] = useLocation();
  const hasCheckedStorage = useRef(false);

  useEffect(() => {
    if (hasCheckedStorage.current) return;
    hasCheckedStorage.current = true;
    
    if (typeof window !== "undefined" && window.localStorage) {
      const hasSeenOnboarding = localStorage.getItem("hasSeenOnboarding");
      if (!hasSeenOnboarding) {
        setIsOpen(true);
      }
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("hasSeenOnboarding", "true");
    setIsOpen(false);
  };

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAction = (path: string) => {
    handleClose();
    setLocation(path);
  };

  const handleSkip = () => {
    handleClose();
  };

  const progress = ((currentStep + 1) / onboardingSteps.length) * 100;
  const step = onboardingSteps[currentStep];
  const StepIcon = step.icon;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[620px]" data-testid="dialog-onboarding">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <div className={`p-2 rounded-lg ${step.id === "welcome" ? "bg-red-100" : "bg-red-100"}`}>
                <StepIcon className="w-5 h-5 text-red-600" />
              </div>
              {step.title}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              className="h-8 w-8"
              data-testid="button-skip-onboarding"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="py-2">
          <Progress value={progress} className="h-2" data-testid="progress-onboarding" />
          <div className="flex justify-between items-center mt-2">
            <p className="text-sm text-muted-foreground" data-testid="text-step-counter">
              {currentStep + 1} of {onboardingSteps.length}
            </p>
            <div className="flex gap-1">
              {onboardingSteps.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i <= currentStep ? "bg-red-600" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-base text-foreground leading-relaxed">
            {step.description}
          </p>

          <Card className="border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Tip:</span> {step.tip}
              </p>
            </CardContent>
          </Card>

          {step.id === "welcome" && (
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {["ChatGPT", "Claude", "Perplexity", "Gemini", "Grok", "Google AI"].map((platform) => (
                <Badge
                  key={platform}
                  variant="secondary"
                  className="px-3 py-1"
                >
                  {platform}
                </Badge>
              ))}
            </div>
          )}

          {step.action && (
            <Button
              onClick={() => handleAction(step.action!.path)}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              size="lg"
              data-testid={`button-action-${step.id}`}
            >
              {step.action.label}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <div className="flex justify-between w-full">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              data-testid="button-previous-step"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            
            <div className="flex gap-2">
              {currentStep < onboardingSteps.length - 1 && (
                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  className="text-muted-foreground"
                  data-testid="button-skip"
                >
                  Skip Tour
                </Button>
              )}
              
              <Button
                onClick={handleNext}
                variant={currentStep === onboardingSteps.length - 1 ? "default" : "outline"}
                data-testid="button-next-step"
              >
                {currentStep === onboardingSteps.length - 1 ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Let's Go!
                  </>
                ) : (
                  <>
                    Next Step
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StartOnboardingButton() {
  const handleStart = () => {
    localStorage.removeItem("hasSeenOnboarding");
    window.location.reload();
  };

  return (
    <Button
      onClick={handleStart}
      size="lg"
      variant="secondary"
      className="bg-white text-red-600 hover:bg-red-50"
      data-testid="button-get-started"
    >
      Replay Getting Started Guide
      <ArrowRight className="w-5 h-5 ml-2" />
    </Button>
  );
}
