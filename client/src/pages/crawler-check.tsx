import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import {
  Bot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Globe,
  FileText,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { Brand } from "@shared/schema";

interface CrawlerResult {
  name: string;
  agent: string;
  platform: string;
  category: string;
  description: string;
  status: "allowed" | "blocked" | "unknown";
  reason: string;
  recommendation: string | null;
}

interface CrawlerCheckResponse {
  success: boolean;
  data: {
    url: string;
    robotsTxtExists: boolean;
    robotsTxtUrl: string;
    fetchError: string | null;
    summary: {
      total: number;
      allowed: number;
      blocked: number;
      unknown: number;
      geoScore: number;
    };
    crawlers: CrawlerResult[];
    recommendations: string[];
    rawRobotsTxt: string | null;
  };
}

export default function CrawlerCheck() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [checkResult, setCheckResult] = useState<CrawlerCheckResponse["data"] | null>(null);

  const { data: brandsResponse } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsResponse?.data || [];

  const checkMutation = useMutation({
    mutationFn: async (checkUrl: string) => {
      const res = await apiRequest("POST", "/api/check-crawler-permissions", { url: checkUrl });
      return res.json() as unknown as CrawlerCheckResponse;
    },
    onSuccess: (response) => {
      if (response.success) {
        setCheckResult(response.data);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check crawler permissions. Please try again.",
        variant: "destructive",
      });
    },
  });

  function handleCheck() {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a website URL to check.",
        variant: "destructive",
      });
      return;
    }
    checkMutation.mutate(url.trim());
  }

  function handleQuickCheck(website: string) {
    setUrl(website);
    checkMutation.mutate(website);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "allowed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "blocked":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "allowed":
        return (
          <Badge
            variant="outline"
            className="border-green-500/30 text-green-600 dark:text-green-400"
          >
            Allowed
          </Badge>
        );
      case "blocked":
        return (
          <Badge variant="outline" className="border-red-500/30 text-red-600 dark:text-red-400">
            Blocked
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="border-yellow-500/30 text-yellow-600 dark:text-yellow-400"
          >
            Unknown
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-8">
      <Helmet>
        <title>Crawler Check - VentureCite</title>
      </Helmet>
      <PageHeader
        title="Crawler Check"
        description="Verify if AI platforms can crawl your website for GEO visibility"
      />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Check Website
          </CardTitle>
          <CardDescription>
            Enter a website URL to check if AI crawlers have permission to access it
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Enter website URL (e.g., venturepr.com)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCheck()}
              data-testid="input-url"
            />
            <Button
              onClick={handleCheck}
              disabled={checkMutation.isPending}
              data-testid="button-check"
            >
              {checkMutation.isPending ? "Checking..." : "Check Permissions"}
            </Button>
          </div>

          {brands.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Quick check your brands:</p>
              <div className="flex flex-wrap gap-2">
                {brands
                  .filter((b) => b.website)
                  .map((brand) => (
                    <Button
                      key={brand.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickCheck(brand.website!)}
                      disabled={checkMutation.isPending}
                      data-testid={`button-quick-check-${brand.id}`}
                    >
                      <Globe className="h-4 w-4 mr-1" />
                      {brand.name}
                    </Button>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {checkMutation.isPending && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {checkResult && !checkMutation.isPending && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Results for {checkResult.url}
                </span>
                <a
                  href={checkResult.robotsTxtUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:underline flex items-center gap-1"
                >
                  View robots.txt <ExternalLink className="h-3 w-3" />
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="bg-muted/50">
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-bold text-primary" data-testid="geo-score">
                      {checkResult.summary.geoScore}%
                    </div>
                    <p className="text-sm text-muted-foreground">GEO Access Score</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-green-950">
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-bold text-green-600" data-testid="allowed-count">
                      {checkResult.summary.allowed}
                    </div>
                    <p className="text-sm text-muted-foreground">Allowed</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-950">
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-bold text-red-600" data-testid="blocked-count">
                      {checkResult.summary.blocked}
                    </div>
                    <p className="text-sm text-muted-foreground">Blocked</p>
                  </CardContent>
                </Card>
                <Card className="bg-yellow-50 dark:bg-yellow-950">
                  <CardContent className="pt-4 text-center">
                    <div className="text-3xl font-bold text-yellow-600" data-testid="unknown-count">
                      {checkResult.summary.unknown}
                    </div>
                    <p className="text-sm text-muted-foreground">Unknown</p>
                  </CardContent>
                </Card>
              </div>

              <Progress value={checkResult.summary.geoScore} className="h-3 mb-4" />

              {!checkResult.robotsTxtExists && !checkResult.fetchError && (
                <Alert className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>No robots.txt Found</AlertTitle>
                  <AlertDescription>
                    This website doesn't have a robots.txt file. All crawlers are allowed by
                    default, but we recommend adding one for better control over AI crawler access.
                  </AlertDescription>
                </Alert>
              )}

              {checkResult.fetchError && (
                <Alert variant="destructive" className="mb-4">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Could Not Fetch robots.txt</AlertTitle>
                  <AlertDescription>
                    Error: {checkResult.fetchError}. Make sure the website is accessible.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {checkResult.recommendations.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-5 w-5" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {checkResult.recommendations.map((rec, index) => (
                    <div key={index} className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <pre className="whitespace-pre-wrap text-sm font-mono">{rec}</pre>
                      {rec.includes("User-agent:") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => copyToClipboard(rec)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI Crawler Details
              </CardTitle>
              <CardDescription>
                Detailed status for each AI platform crawler, grouped by vendor
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Group crawlers by vendor category for a cleaner UI than
                // a flat 15-row accordion. Category order matches the
                // backend's AI_CRAWLERS array so "OpenAI" / "Anthropic" /
                // "Perplexity" appear at the top.
                const grouped: Record<string, CrawlerResult[]> = {};
                for (const c of checkResult.crawlers) {
                  const key = c.category || "Other";
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(c);
                }
                const categoryOrder = [
                  "OpenAI",
                  "Anthropic",
                  "Perplexity",
                  "Google",
                  "Microsoft",
                  "Meta",
                  "ByteDance",
                  "Apple",
                  "Common Crawl",
                ];
                const entries = Object.entries(grouped).sort((a, b) => {
                  const ai = categoryOrder.indexOf(a[0]);
                  const bi = categoryOrder.indexOf(b[0]);
                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                });
                return (
                  <div className="space-y-6">
                    {entries.map(([category, crawlers]) => {
                      const blocked = crawlers.filter((c) => c.status === "blocked").length;
                      return (
                        <div key={category}>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold">
                              {category}{" "}
                              <span className="text-muted-foreground font-normal">
                                ({crawlers.length} bot{crawlers.length === 1 ? "" : "s"})
                              </span>
                            </h3>
                            {blocked > 0 && (
                              <Badge
                                variant="outline"
                                className="border-red-500/30 text-red-600 dark:text-red-400"
                              >
                                {blocked} blocked
                              </Badge>
                            )}
                          </div>
                          <Accordion type="multiple" className="w-full">
                            {crawlers.map((crawler, index) => (
                              <AccordionItem
                                key={`${category}-${index}`}
                                value={`${category}-${index}`}
                              >
                                <AccordionTrigger className="hover:no-underline">
                                  <div className="flex items-center gap-3 w-full">
                                    {getStatusIcon(crawler.status)}
                                    <span className="font-medium">{crawler.platform}</span>
                                    <span className="text-muted-foreground text-sm">
                                      ({crawler.agent})
                                    </span>
                                    <div className="ml-auto mr-4">
                                      {getStatusBadge(crawler.status)}
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="pl-8 space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                      {crawler.description}
                                    </p>
                                    <div className="p-3 bg-muted rounded-lg">
                                      <p className="text-sm">
                                        <strong>Status:</strong> {crawler.reason}
                                      </p>
                                    </div>
                                    {crawler.recommendation && (
                                      <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                                        <p className="text-sm font-medium mb-2">Recommendation:</p>
                                        <pre className="text-sm font-mono whitespace-pre-wrap">
                                          {crawler.recommendation}
                                        </pre>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="mt-2"
                                          onClick={() => copyToClipboard(crawler.recommendation!)}
                                        >
                                          <Copy className="h-4 w-4 mr-1" />
                                          Copy robots.txt Rule
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {checkResult.rawRobotsTxt && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Raw robots.txt Content
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm font-mono overflow-x-auto max-h-96 overflow-y-auto">
                    {checkResult.rawRobotsTxt}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(checkResult.rawRobotsTxt!)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
