import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sparkles, Play, TrendingUp, CheckCircle2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PlatformResultCard, type PlatformResult } from "./PlatformResultCard";

type PromptRow = {
  promptId: string;
  prompt: string;
  rationale: string | null;
  platforms: PlatformResult[];
};

type PlatformStat = {
  platform: string;
  cited: number;
  checks: number;
  citationRate: number;
  lastRun: string | null;
};

type ResultsData = {
  byPlatform: PlatformStat[];
  byPrompt: PromptRow[];
  totalChecks: number;
  totalCited: number;
  citationRate: number;
};

type ResultsTabProps = {
  selectedBrandId: string;
  hasPrompts: boolean;
  runMutation: { mutate: () => void; isPending: boolean };
  runLoadingMessage: string;
};

export default function ResultsTab({
  selectedBrandId,
  hasPrompts,
  runMutation,
  runLoadingMessage,
}: ResultsTabProps) {
  const { data: resultsData, isLoading: resultsLoading } = useQuery<{
    success: boolean;
    data: ResultsData;
  }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}/results`],
    enabled: !!selectedBrandId,
  });
  const results = resultsData?.data;

  const bestPlatform = useMemo(() => {
    if (!results?.byPlatform?.length) return null;
    return [...results.byPlatform].sort((a, b) => b.citationRate - a.citationRate)[0];
  }, [results?.byPlatform]);
  const bestPrompt = useMemo(() => {
    if (!results?.byPrompt?.length) return null;
    return [...results.byPrompt]
      .map((p) => ({ ...p, citedCount: p.platforms.filter((pl) => pl.isCited).length }))
      .sort((a, b) => b.citedCount - a.citedCount)[0];
  }, [results?.byPrompt]);

  return resultsLoading ? (
    <Skeleton className="h-48 w-full" />
  ) : results && results.totalChecks > 0 ? (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Overall Citation Rate</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold text-foreground" data-testid="stat-citation-rate">
              {results.citationRate}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {results.totalCited} of {results.totalChecks} checks cited your brand
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Best Platform</p>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-foreground" data-testid="stat-best-platform">
              {bestPlatform?.platform || "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {bestPlatform ? `${bestPlatform.citationRate}% citation rate` : "No data yet"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Top Prompt</p>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <p
              className="text-base font-semibold text-foreground line-clamp-2"
              data-testid="stat-top-prompt"
            >
              {bestPrompt ? `"${bestPrompt.prompt}"` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {bestPrompt ? `Cited on ${bestPrompt.citedCount} platforms` : "No data yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance by Platform */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance by Platform</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Platform</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Cited</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Checks</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Rate</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Last Run</th>
                </tr>
              </thead>
              <tbody>
                {results.byPlatform.map((p) => (
                  <tr
                    key={p.platform}
                    className="border-b border-border"
                    data-testid={`platform-row-${p.platform}`}
                  >
                    <td className="py-3 font-medium">{p.platform}</td>
                    <td className="text-right py-3">{p.cited}</td>
                    <td className="text-right py-3">{p.checks}</td>
                    <td className="text-right py-3">
                      <Badge variant={p.citationRate >= 50 ? "default" : "outline"}>
                        {p.citationRate}%
                      </Badge>
                    </td>
                    <td className="text-right py-3 text-xs text-muted-foreground">
                      {p.lastRun
                        ? formatDistanceToNow(new Date(p.lastRun), { addSuffix: true })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Results by Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results by Prompt</CardTitle>
          <CardDescription>
            Click a prompt to see each AI's full answer and whether your brand was cited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {results.byPrompt.map((row, i) => {
              const citedCount = row.platforms.filter((p) => p.isCited).length;
              return (
                <AccordionItem
                  key={row.promptId}
                  value={row.promptId}
                  data-testid={`prompt-result-${i}`}
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <Badge variant="outline" className="shrink-0">
                        {i + 1}
                      </Badge>
                      <span className="flex-1 truncate">{row.prompt}</span>
                      <Badge variant={citedCount > 0 ? "default" : "outline"} className="shrink-0">
                        {citedCount}/{row.platforms.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {row.rationale && (
                      <p className="text-xs text-muted-foreground italic mb-3 px-1">
                        Why this prompt: {row.rationale}
                      </p>
                    )}
                    {row.platforms.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No results yet — run a citation check.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {row.platforms.map((plat, j) => (
                          <PlatformResultCard key={`${plat.platform}-${j}`} result={plat} />
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </>
  ) : (
    <Card>
      <CardContent className="py-12 text-center">
        <Play className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground mb-4">
          No results yet. Run a citation check to see how AI engines mention your brand.
        </p>
        {hasPrompts && (
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {runMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {runLoadingMessage}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Check
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
