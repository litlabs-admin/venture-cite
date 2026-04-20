import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  FileText,
  TrendingUp,
  Share2,
  Target,
  Zap,
  ArrowRight,
  PenTool,
  Globe,
  Building2,
  DollarSign,
  Wrench,
  Brain,
  Search,
  BookOpen,
  MessageSquare,
  Send,
  Shield,
  Sparkles,
} from "lucide-react";
import type { Brand } from "@shared/schema";
import PageHeader from "@/components/PageHeader";

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

interface PriorityFeature {
  title: string;
  tagline: string;
  description: string;
  icon: any;
  link: string;
  action: string;
  priority: "essential" | "important" | "advanced";
}

const allFeatures: PriorityFeature[] = [
  {
    title: "Set Up Your Brand",
    tagline: "Auto-build your brand profile from your website.",
    description: "Enter your website and our AI creates your complete brand profile in seconds.",
    icon: Building2,
    link: "/brands",
    action: "Create Brand",
    priority: "essential",
  },
  {
    title: "AI Visibility Checklists",
    tagline: "Get cited by ChatGPT, Claude, Perplexity, Gemini.",
    description: "Step-by-step checklists for every major AI engine.",
    icon: Shield,
    link: "/ai-visibility",
    action: "Open Checklists",
    priority: "essential",
  },
  {
    title: "Discover AI Keywords",
    tagline: "Find topics AI engines are searching to cite.",
    description: "Citation potential scores and content-type suggestions per keyword.",
    icon: Search,
    link: "/keyword-research",
    action: "Research Keywords",
    priority: "essential",
  },
  {
    title: "Generate Optimized Content",
    tagline: "Write 1,500+ word articles built to be cited.",
    description: "Three humanization passes so content reads naturally and passes detectors.",
    icon: PenTool,
    link: "/content",
    action: "Generate Content",
    priority: "essential",
  },
  {
    title: "Distribute Your Content",
    tagline: "Reformat one article for LinkedIn, Medium, Reddit, Quora.",
    description: "Platform-specific hooks, hashtags, and structure out of the box.",
    icon: Share2,
    link: "/articles",
    action: "View Articles",
    priority: "essential",
  },
  {
    title: "Track AI Citations",
    tagline: "Know when AI engines mention your brand.",
    description: "Real-time monitoring across ChatGPT, Claude, Perplexity, and more.",
    icon: Target,
    link: "/geo-rankings",
    action: "Check Rankings",
    priority: "essential",
  },
  {
    title: "Community Engagement",
    tagline: "Build natural citations on Reddit, Quora, HN.",
    description: "AI-generated, non-spammy post ideas tuned to each community.",
    icon: MessageSquare,
    link: "/community",
    action: "Find Communities",
    priority: "important",
  },
  {
    title: "Brand Fact Sheet",
    tagline: "Feed AI a structured knowledge base.",
    description: "Document verified facts, stats, and messaging for accurate citations.",
    icon: BookOpen,
    link: "/brand-fact-sheet",
    action: "Manage Facts",
    priority: "important",
  },
  {
    title: "Publication Outreach",
    tagline: "Pitch the publications AI engines trust.",
    description: "Personalized pitch emails and a full outreach pipeline.",
    icon: Send,
    link: "/outreach",
    action: "Manage Outreach",
    priority: "important",
  },
  {
    title: "Analytics Integrations",
    tagline: "Measure traffic from chat.openai.com, claude.ai, and more.",
    description: "Connect GA4 and Search Console to see AI-driven traffic.",
    icon: TrendingUp,
    link: "/analytics-integrations",
    action: "Connect Analytics",
    priority: "important",
  },
  {
    title: "AI Intelligence",
    tagline: "Share-of-Answer, Citation Quality, Hallucination Detection.",
    description: "Advanced competitor comparison and accuracy analytics.",
    icon: Brain,
    link: "/ai-intelligence",
    action: "View Intelligence",
    priority: "advanced",
  },
  {
    title: "Revenue Analytics",
    tagline: "Attribute revenue to AI-driven interactions.",
    description: "Track ChatGPT Buy buttons and other AI commerce surfaces.",
    icon: DollarSign,
    link: "/revenue-analytics",
    action: "View Revenue",
    priority: "advanced",
  },
  {
    title: "GEO Tools Suite",
    tagline: "Listicle Tracker, Wikipedia Monitor, FAQ Optimizer.",
    description: "Specialized tools for finding and defending citation opportunities.",
    icon: Wrench,
    link: "/geo-tools",
    action: "Open Tools",
    priority: "advanced",
  },
  {
    title: "GEO AI Agent",
    tagline: "Autonomous workflows for content, outreach, and analysis.",
    description: "Set up background agents that handle repetitive GEO tasks.",
    icon: Zap,
    link: "/agent",
    action: "View Agent",
    priority: "advanced",
  },
];

const SECTIONS: { key: PriorityFeature["priority"]; title: string; description: string }[] = [
  { key: "essential", title: "Start here", description: "Work through these six steps to get your first AI citations." },
  { key: "important", title: "Recommended", description: "Amplify and harden your citation surface." },
  { key: "advanced", title: "Power tools", description: "Advanced analytics and automation for mature workflows." },
];

function FeatureCard({ feature }: { feature: PriorityFeature }) {
  return (
    <Link href={feature.link}>
      <Card className="h-full border border-border hover:border-foreground/20 hover:shadow-md transition-all cursor-pointer group" data-testid={`feature-card-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-lg bg-muted shrink-0">
              <feature.icon className="w-5 h-5 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm text-foreground leading-snug">{feature.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{feature.tagline}</p>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between pt-3">
            <span className="text-xs font-medium text-muted-foreground">{feature.action}</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface KpiProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}

function KpiCard({ label, value, hint, icon: Icon, href }: KpiProps) {
  const inner = (
    <Card className="border border-border hover:border-foreground/20 transition-colors h-full">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-3xl font-semibold text-foreground tracking-tight" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function Home() {
  const { user } = useAuth();
  const [selectedBrandId, setSelectedBrandId] = usePersistedState<string>("vc_home_brandId", "");

  const { data: brandsData, error: brandsError } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ['/api/brands'],
  });
  const brands = brandsData?.data || [];
  const hasBrands = brands.length > 0;

  // Auto-select the first brand if none is persisted yet, or if the stored
  // brandId no longer belongs to this user (e.g. after a brand deletion).
  useEffect(() => {
    if (!hasBrands) return;
    if (!selectedBrandId || !brands.find((b) => b.id === selectedBrandId)) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, hasBrands, selectedBrandId, setSelectedBrandId]);

  const activeBrand = useMemo(
    () => brands.find((b) => b.id === selectedBrandId) || null,
    [brands, selectedBrandId],
  );

  // Dashboard metrics are scoped to the currently selected brand. The query
  // key includes brandId so switching brands refetches rather than showing
  // stale totals from the previous brand.
  const dashboardQueryKey = selectedBrandId
    ? ['/api/dashboard', selectedBrandId]
    : ['/api/dashboard'];
  const { data: analytics, error: analyticsError } = useQuery<{ success: boolean; data: any }>({
    queryKey: dashboardQueryKey,
    queryFn: async () => {
      const url = selectedBrandId
        ? `/api/dashboard?brandId=${encodeURIComponent(selectedBrandId)}`
        : '/api/dashboard';
      const res = await apiRequest('GET', url);
      return res.json();
    },
    enabled: !hasBrands || !!selectedBrandId,
  });

  const { data: articlesData, error: articlesError } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ['/api/articles'],
  });

  // Only surface the banner when the user actually has brands to show but
  // we couldn't load them. First-render 401 races and brand-new accounts
  // shouldn't be framed as errors — empty KPIs communicate that state.
  const loadError = hasBrands && (analyticsError || articlesError || brandsError);

  const scopedArticles = useMemo(() => {
    const all = articlesData?.data || [];
    return selectedBrandId ? all.filter((a: any) => a.brandId === selectedBrandId) : all;
  }, [articlesData, selectedBrandId]);
  const totalArticles = scopedArticles.length;
  const totalCitations = analytics?.data?.totalCitations || 0;
  const totalChecks = analytics?.data?.totalChecks || 0;
  const citationRate = analytics?.data?.citationRate || 0;

  const welcomeName = user?.firstName?.trim() || null;

  const primaryAction = !hasBrands ? (
    <Link href="/brands">
      <Button size="sm" className="bg-primary hover:bg-primary/90" data-testid="button-create-brand-header">
        <Building2 className="w-4 h-4 mr-2" />
        Create Your Brand
      </Button>
    </Link>
  ) : (
    <div className="flex items-center gap-2">
      {brands.length > 1 && (
        <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
          <SelectTrigger className="w-[200px]" data-testid="select-home-brand">
            <SelectValue placeholder="Select brand" />
          </SelectTrigger>
          <SelectContent>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Link href="/content">
        <Button variant="default" size="sm" className="bg-primary hover:bg-primary/90" data-testid="button-create-content">
          <PenTool className="w-4 h-4 mr-2" />
          Create Content
        </Button>
      </Link>
    </div>
  );

  const welcomeTitle = welcomeName
    ? `Welcome back, ${welcomeName}`
    : (hasBrands ? "Welcome back" : "VentureCite");
  const welcomeDescription = activeBrand
    ? `Showing metrics for ${activeBrand.name}. Get your brand cited by AI search engines.`
    : "Get your brand cited by AI search engines.";

  return (
    <div className="space-y-8">
      <PageHeader
        title={welcomeTitle}
        description={welcomeDescription}
        actions={primaryAction}
      />

      {loadError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          data-testid="home-load-error"
        >
          Some dashboard data failed to load. Try refreshing — if the problem continues, sign out and back in.
        </div>
      )}

      {/* KPI strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-strip">
        <KpiCard
          label="Brands"
          value={brands.length}
          hint={hasBrands ? "Active profiles" : "Add your first brand"}
          icon={Building2}
          href="/brands"
        />
        <KpiCard
          label="Articles"
          value={totalArticles}
          hint={totalArticles === 1 ? "1 article" : `${totalArticles} articles`}
          icon={FileText}
          href="/articles"
        />
        <KpiCard
          label="Citations"
          value={formatNumber(totalCitations)}
          hint={totalChecks > 0 ? `across ${totalChecks} AI checks` : "Run a citation check"}
          icon={Target}
          href="/citations"
        />
        <KpiCard
          label="Citation Rate"
          value={totalChecks > 0 ? `${citationRate}%` : "—"}
          hint={totalChecks > 0 ? `${totalCitations}/${totalChecks} cited` : "No checks yet"}
          icon={Sparkles}
          href="/citations"
        />
      </section>

      {/* Feature roadmap grouped by priority */}
      <section data-testid="feature-roadmap">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Your GEO roadmap</h2>
          <p className="text-sm text-muted-foreground mt-1">Every tool, organized by priority.</p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((section) => {
            const items = allFeatures.filter((f) => f.priority === section.key);
            return (
              <div key={section.key} data-testid={`section-${section.key}`}>
                <div className="flex items-baseline justify-between mb-3 border-b border-border pb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{section.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{items.length} tools</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((feature) => (
                    <FeatureCard key={feature.title} feature={feature} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Platforms we track */}
      <Card data-testid="ai-platforms-section" className="border border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            AI platforms we track
          </CardTitle>
          <CardDescription>Your content citations are monitored across every major AI search engine.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {['ChatGPT', 'Claude', 'Grok', 'Perplexity', 'Google AI', 'Gemini', 'Copilot', 'Meta AI', 'DeepSeek', 'Manus AI'].map((platform) => (
              <Badge key={platform} variant="secondary" className="text-xs py-1 px-2.5 font-medium" data-testid={`badge-platform-${platform.toLowerCase().replace(/\s+/g, '-')}`}>
                {platform}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
