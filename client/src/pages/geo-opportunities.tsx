import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import { pageExplainers } from "@/lib/pageExplainers";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { ErrorState } from "@/components/ui/error-state";
import {
  MessageSquare,
  Youtube,
  Linkedin,
  BookOpen,
  Rocket,
  ExternalLink,
  TrendingUp,
  Target,
  Lightbulb,
  Users,
  BarChart3,
} from "lucide-react";
import { SiReddit, SiWikipedia, SiYcombinator, SiProducthunt } from "react-icons/si";

interface Platform {
  name: string;
  citationShare: number;
  description: string;
  strategy: string;
  tips: string[];
}

interface Subreddit {
  subreddit: string;
  description: string;
  members: string;
}

interface ContentIdea {
  type: string;
  title: string;
  platform: string;
  description: string;
}

interface OpportunitiesData {
  brand?: {
    id: string;
    name: string;
    industry: string;
  };
  platforms: Platform[];
  subreddits: Subreddit[];
  contentIdeas?: ContentIdea[];
  industries?: string[];
  keyStats: {
    thirdPartyCitationShare: number;
    redditCitationShare: number;
    brandWebsiteCitationShare: number;
  };
  totalCitedRankings?: number;
  strategyTips: string[];
}

const platformIcons: Record<string, JSX.Element> = {
  Reddit: <SiReddit className="h-5 w-5 text-orange-500" />,
  YouTube: <Youtube className="h-5 w-5 text-red-500" />,
  LinkedIn: <Linkedin className="h-5 w-5 text-blue-600" />,
  Medium: <BookOpen className="h-5 w-5 text-foreground" />,
  "Hacker News": <SiYcombinator className="h-5 w-5 text-orange-500" />,
  "Product Hunt": <SiProducthunt className="h-5 w-5 text-orange-600" />,
  Wikipedia: <SiWikipedia className="h-5 w-5 text-muted-foreground" />,
};

export default function GeoOpportunities() {
  const { selectedBrandId, brands, isLoading: brandsLoading } = useBrandSelection();

  const {
    data: opportunitiesResponse,
    isLoading: oppsLoading,
    isError: oppsIsError,
    isRefetching: oppsIsRefetching,
    refetch: refetchOpps,
  } = useQuery<{
    success: boolean;
    data: OpportunitiesData;
  }>({
    queryKey: selectedBrandId
      ? ["/api/geo-opportunities", selectedBrandId]
      : ["/api/geo-opportunities"],
    enabled: true,
  });

  const opportunities = opportunitiesResponse?.data;
  const isLoading = brandsLoading || oppsLoading;

  return (
    <div className="space-y-8">
      <Helmet>
        <title>GEO Opportunities - VentureCite</title>
      </Helmet>
      <PageHeader
        title="GEO Opportunities"
        description="Discover where to post content for maximum AI visibility"
        actions={brands.length > 0 ? <BrandSelector showIndustry /> : null}
        explainer={pageExplainers.geoOpportunities}
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : oppsIsError ? (
        <ErrorState
          title="Couldn't load opportunities"
          onRetry={() => refetchOpps()}
          isRetrying={oppsIsRefetching}
        />
      ) : opportunities ? (
        <div className="space-y-6">
          {!opportunities.brand && (
            <Card className="border-border bg-muted">
              <CardContent className="p-4 flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-chart-3 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Industry benchmarks — select a brand to see your data
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The figures below are category-wide AI citation benchmarks, not your brand's
                    results. Pick a brand above to replace them with your actual per-platform
                    citation share.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {opportunities.brand && (opportunities.totalCitedRankings ?? 0) === 0 && (
            <Card>
              <CardContent className="p-4 flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">No citation data yet</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-3">
                    Run a citation check from the Citations page to populate this breakdown with
                    real per-platform data for {opportunities.brand.name}. Until then, the numbers
                    below are zeros, not industry averages.
                  </p>
                  <Link href="/citations">
                    <Button size="sm" data-testid="button-run-citation-check">
                      Run Citation Check
                      <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Third-Party Citations
                  </span>
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                </div>
                <p
                  className="text-3xl font-semibold text-foreground tracking-tight"
                  data-testid="stat-third-party"
                >
                  {opportunities.keyStats.thirdPartyCitationShare}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Reddit Citations
                  </span>
                  <SiReddit className="w-4 h-4 text-muted-foreground" />
                </div>
                <p
                  className="text-3xl font-semibold text-foreground tracking-tight"
                  data-testid="stat-reddit"
                >
                  {opportunities.keyStats.redditCitationShare}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Brand Site Citations
                  </span>
                  <Target className="w-4 h-4 text-muted-foreground" />
                </div>
                <p
                  className="text-3xl font-semibold text-foreground tracking-tight"
                  data-testid="stat-brand"
                >
                  {opportunities.keyStats.brandWebsiteCitationShare}%
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-muted">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-chart-3" />
                Key Insight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg">
                <strong>
                  {opportunities.keyStats.thirdPartyCitationShare}% of AI citations come from
                  third-party sources
                </strong>{" "}
                like Reddit.
                {opportunities.brand ? " Your" : " Brand"} website{opportunities.brand ? "" : "s"}{" "}
                account{opportunities.brand ? "s" : ""} for{" "}
                {opportunities.keyStats.brandWebsiteCitationShare}% of citations.
                <span className="text-chart-3 font-medium">
                  {" "}
                  Focus your content strategy on community platforms!
                </span>
              </p>
            </CardContent>
          </Card>

          <Tabs defaultValue="platforms" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="platforms">Platforms</TabsTrigger>
              <TabsTrigger value="reddit">Reddit</TabsTrigger>
              <TabsTrigger value="ideas">Content Ideas</TabsTrigger>
            </TabsList>

            <TabsContent value="platforms" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Platform Rankings by AI Citation Share
                  </CardTitle>
                  <CardDescription>
                    Platforms sorted by how often AI systems cite them
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {opportunities.platforms.map((platform, index) => (
                      <div key={platform.name} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-muted-foreground">
                              #{index + 1}
                            </span>
                            {platformIcons[platform.name] || <Rocket className="h-5 w-5" />}
                            <div>
                              <h3 className="font-semibold">{platform.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {platform.description}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-lg px-3 py-1">
                            {platform.citationShare}%
                          </Badge>
                        </div>
                        <Progress value={platform.citationShare} max={25} className="h-2 mb-3" />
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-sm font-medium mb-2">Strategy: {platform.strategy}</p>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {platform.tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-primary">•</span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reddit" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SiReddit className="h-5 w-5 text-orange-500" />
                    Recommended Subreddits
                    {opportunities.brand && (
                      <Badge variant="outline">for {opportunities.brand.industry}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Join these communities to build presence and authority
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {opportunities.subreddits.map((sub) => (
                      <a
                        key={sub.subreddit}
                        href={`https://reddit.com/${sub.subreddit}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                        data-testid={`link-subreddit-${sub.subreddit}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-semibold text-foreground">
                            {sub.subreddit}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              <Users className="h-3 w-3 mr-1" />
                              {sub.members}
                            </Badge>
                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{sub.description}</p>
                      </a>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Reddit Success Tips
                    </h4>
                    <ul className="text-sm space-y-2">
                      <li>
                        • <strong>Build karma first:</strong> Comment genuinely for 2-4 weeks before
                        posting links
                      </li>
                      <li>
                        • <strong>Be helpful:</strong> Answer questions with real experience,
                        include pros AND cons
                      </li>
                      <li>
                        • <strong>Avoid marketing speak:</strong> Reddit users can spot promotion
                        instantly
                      </li>
                      <li>
                        • <strong>Link strategically:</strong> Only add links when they genuinely
                        help the discussion
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ideas" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Content Ideas
                    {opportunities.brand && (
                      <Badge variant="outline">for {opportunities.brand.name}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Content formats that AI systems love to cite</CardDescription>
                </CardHeader>
                <CardContent>
                  {opportunities.contentIdeas && opportunities.contentIdeas.length > 0 ? (
                    <div className="space-y-4">
                      {opportunities.contentIdeas.map((idea, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <Badge>{idea.type}</Badge>
                            <Badge variant="outline">{idea.platform}</Badge>
                          </div>
                          <h3 className="font-semibold text-lg mb-2">{idea.title}</h3>
                          <p className="text-sm text-muted-foreground">{idea.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">
                        Select a brand above to get personalized content ideas
                      </p>
                      <div className="space-y-3 text-left max-w-md mx-auto">
                        <div className="p-3 bg-muted rounded-lg">
                          <strong>How-to Guides:</strong> Answer specific problems your audience
                          faces
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <strong>Industry Trends:</strong> Share predictions and analysis
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <strong>Case Studies:</strong> Real examples with data get cited most
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <strong>FAQ Responses:</strong> Answer common questions in your niche
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Strategy Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {opportunities.strategyTips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </span>
                    <p className="text-sm">{tip}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <ErrorState
          title="Couldn't load opportunities"
          onRetry={() => refetchOpps()}
          isRetrying={oppsIsRefetching}
        />
      )}
    </div>
  );
}
