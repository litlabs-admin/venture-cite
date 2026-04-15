import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { 
  HelpCircle, 
  CheckCircle2, 
  Circle,
  Building2,
  Search,
  FileText,
  BarChart3,
  Brain,
  Send,
  TrendingUp,
  Target,
  ChevronRight,
  Sparkles,
  BookOpen
} from "lucide-react";

interface GuideStep {
  id: string;
  number: number;
  title: string;
  description: string;
  details: string;
  path: string;
  icon: any;
  category: "setup" | "create" | "optimize" | "analyze";
}

const guideSteps: GuideStep[] = [
  {
    id: "brands",
    number: 1,
    title: "Set Up Your Brand",
    description: "Create your brand profile with key information",
    details: "Add your company name, website, industry, and unique selling points. This helps the AI understand your brand voice and generate personalized content.",
    path: "/brands",
    icon: Building2,
    category: "setup"
  },
  {
    id: "brand-fact-sheet",
    number: 2,
    title: "Complete Brand Fact Sheet",
    description: "Document your brand's key facts and messaging",
    details: "Add detailed information about your products, services, competitors, and target audience. This creates a knowledge base for AI-optimized content.",
    path: "/brand-fact-sheet",
    icon: BookOpen,
    category: "setup"
  },
  {
    id: "keyword-research",
    number: 3,
    title: "Discover AI Keywords",
    description: "Find keywords AI engines are likely to cite",
    details: "Use AI-powered keyword research to discover terms and topics where AI search engines actively seek authoritative sources. Get citation potential scores and content suggestions.",
    path: "/keyword-research",
    icon: Search,
    category: "create"
  },
  {
    id: "content",
    number: 4,
    title: "Generate Optimized Content",
    description: "Create AI-citation-ready articles",
    details: "Generate 1500+ word articles optimized for AI discovery. Content is automatically humanized to pass AI detection while maintaining expertise signals that AI engines trust.",
    path: "/content",
    icon: FileText,
    category: "create"
  },
  {
    id: "articles",
    number: 5,
    title: "Manage & Publish Articles",
    description: "Review, edit, and distribute your content",
    details: "Access all generated articles, edit them if needed, and publish to your website or distribute to LinkedIn, Medium, and other platforms to increase visibility.",
    path: "/articles",
    icon: Send,
    category: "create"
  },
  {
    id: "geo-rankings",
    number: 6,
    title: "Track AI Citations",
    description: "Monitor when AI engines cite your content",
    details: "See when ChatGPT, Claude, Perplexity, Gemini, and other AI search engines mention your brand or content. Track citation trends over time.",
    path: "/geo-rankings",
    icon: Target,
    category: "analyze"
  },
  {
    id: "ai-intelligence",
    number: 7,
    title: "AI Intelligence Dashboard",
    description: "Deep analytics on AI search performance",
    details: "Analyze Share-of-Answer metrics, citation quality scores, competitor comparisons, and identify hallucination risks. Get actionable insights to improve AI visibility.",
    path: "/ai-intelligence",
    icon: Brain,
    category: "analyze"
  },
  {
    id: "publications",
    number: 8,
    title: "Publication Intelligence",
    description: "Find high-authority sites for backlinks",
    details: "Discover publications and websites that AI engines trust as authoritative sources. Prioritize outreach to sites that will boost your AI citation potential.",
    path: "/publications",
    icon: TrendingUp,
    category: "optimize"
  },
  {
    id: "outreach",
    number: 9,
    title: "Outreach Management",
    description: "Manage publication outreach campaigns",
    details: "Track your outreach efforts to publishers and journalists. Manage contacts, follow-ups, and measure success rates for getting published on high-authority sites.",
    path: "/outreach",
    icon: Send,
    category: "optimize"
  },
  {
    id: "dashboard",
    number: 10,
    title: "Monitor Your Dashboard",
    description: "Overview of your GEO performance",
    details: "See all key metrics at a glance: total citations, content generated, top-performing keywords, and recent activity. Track your progress toward AI search visibility goals.",
    path: "/",
    icon: BarChart3,
    category: "analyze"
  }
];

const categoryLabels: Record<string, { label: string; color: string }> = {
  setup: { label: "Setup", color: "bg-blue-100 text-blue-700" },
  create: { label: "Create", color: "bg-green-100 text-green-700" },
  optimize: { label: "Optimize", color: "bg-purple-100 text-purple-700" },
  analyze: { label: "Analyze", color: "bg-orange-100 text-orange-700" }
};

export default function PlatformGuide() {
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("completedGuideSteps");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const toggleStep = (stepId: string) => {
    const newCompleted = completedSteps.includes(stepId)
      ? completedSteps.filter(id => id !== stepId)
      : [...completedSteps, stepId];
    setCompletedSteps(newCompleted);
    localStorage.setItem("completedGuideSteps", JSON.stringify(newCompleted));
  };

  const navigateToStep = (path: string) => {
    setLocation(path);
  };

  const progress = Math.round((completedSteps.length / guideSteps.length) * 100);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-gray-300 hover:text-white hover:bg-slate-800 gap-2"
          data-testid="button-platform-guide"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden lg:inline">Guide</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[450px] p-0" data-testid="sheet-platform-guide">
        <SheetHeader className="p-6 pb-4 border-b bg-gradient-to-r from-red-50 to-orange-50">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-red-600" />
            Platform Guide
          </SheetTitle>
          <p className="text-sm text-slate-600">
            Follow these steps in order to get the most out of VentureCite
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-600">Your Progress</span>
              <span className="font-medium text-red-600">{progress}% Complete</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="p-4 space-y-2">
            {guideSteps.map((step) => {
              const StepIcon = step.icon;
              const isCompleted = completedSteps.includes(step.id);
              const isCurrentPage = location === step.path;
              const category = categoryLabels[step.category];
              
              return (
                <div
                  key={step.id}
                  className={`group rounded-lg border transition-all ${
                    isCurrentPage 
                      ? "border-red-300 bg-red-50" 
                      : isCompleted 
                        ? "border-green-200 bg-green-50/50" 
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  data-testid={`guide-step-${step.id}`}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleStep(step.id)}
                        className="mt-0.5 flex-shrink-0"
                        data-testid={`checkbox-step-${step.id}`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-400">Step {step.number}</span>
                          <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${category.color}`}>
                            {category.label}
                          </Badge>
                        </div>
                        
                        <h4 className={`font-medium ${isCompleted ? "text-slate-500 line-through" : "text-slate-900"}`}>
                          {step.title}
                        </h4>
                        
                        <p className="text-sm text-slate-600 mt-1">
                          {step.description}
                        </p>
                        
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                          {step.details}
                        </p>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateToStep(step.path)}
                          className="mt-3 h-8 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 -ml-3"
                          data-testid={`button-go-to-${step.id}`}
                        >
                          <StepIcon className="h-4 w-4 mr-1.5" />
                          Go to {step.title.split(" ").slice(-1)[0]}
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export const featureTooltips: Record<string, string> = {
  "Dashboard": "Overview of your GEO performance metrics and recent activity",
  "Brands": "Manage your brand profiles and company information",
  "Articles": "View, edit, and distribute your AI-optimized content",
  "Rankings": "Track AI search engine citations and visibility",
  "AI Intelligence": "Deep analytics on AI search performance and insights",
  "Keyword Research": "Discover keywords with high AI citation potential",
  "Content Generator": "Create AI-optimized articles for your brand",
  "Publications": "Find high-authority sites for backlinks and mentions",
  "GEO Tools": "Suite of tools for GEO optimization",
  "Brand Fact Sheet": "Document your brand's key facts and messaging",
  "AI Agent": "Autonomous AI assistant for content and outreach tasks",
  "Outreach": "Manage publication outreach campaigns",
  "Analytics Integrations": "Connect your analytics platforms",
  "AI Traffic": "Track traffic from AI search engines"
};
