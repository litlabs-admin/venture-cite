import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Award } from "lucide-react";
import type { CitationQuality } from "@shared/schema";

export default function CitationQualityTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { data: citationQualityStats } = useQuery<{ success: boolean; data: any }>({
    queryKey: [`/api/citation-quality/stats/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: citationsData } = useQuery<{ success: boolean; data: CitationQuality[] }>({
    queryKey: [`/api/citation-quality?brandId=${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const citations = citationsData?.data || [];
  const cqStats = citationQualityStats?.data || {
    avgQualityScore: 0,
    primaryCitations: 0,
    secondaryCitations: 0,
    bySourceType: {},
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <>
      <div className="grid gap-6 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Quality Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${getQualityColor(cqStats.avgQualityScore)}`}
              data-testid="stat-avg-quality"
            >
              {cqStats.avgQualityScore.toFixed(0)}
            </div>
            <Progress value={cqStats.avgQualityScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Primary Citations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600" data-testid="stat-primary-citations">
              {cqStats.primaryCitations}
            </div>
            <p className="text-sm text-muted-foreground">first-position mentions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Secondary Citations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-3xl font-bold text-yellow-600"
              data-testid="stat-secondary-citations"
            >
              {cqStats.secondaryCitations}
            </div>
            <p className="text-sm text-muted-foreground">also-ran mentions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Source Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Object.keys(cqStats.bySourceType).length}</div>
            <p className="text-sm text-muted-foreground">citation sources</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5" />
            Citation Quality Breakdown
          </CardTitle>
          <CardDescription>
            Individual citation scores with authority, relevance, and position metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {citations.length === 0 ? (
            <div className="text-center py-8">
              <Award className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No citation quality data yet</p>
              <p className="text-sm text-muted-foreground">
                Citation quality scores are calculated when you check rankings
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {citations.map((citation) => (
                <div key={citation.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{citation.aiPlatform}</Badge>
                      {citation.isPrimaryCitation === 1 && (
                        <Badge className="bg-green-100 text-green-800">Primary</Badge>
                      )}
                      <Badge variant="secondary">{citation.sourceType}</Badge>
                    </div>
                    <div
                      className={`text-2xl font-bold ${getQualityColor(citation.totalQualityScore)}`}
                    >
                      {citation.totalQualityScore}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Authority</p>
                      <Progress value={citation.authorityScore} className="h-2" />
                      <p className="text-xs mt-1">{citation.authorityScore}/100</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Relevance</p>
                      <Progress value={citation.relevanceScore} className="h-2" />
                      <p className="text-xs mt-1">{citation.relevanceScore}/100</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Recency</p>
                      <Progress value={citation.recencyScore} className="h-2" />
                      <p className="text-xs mt-1">{citation.recencyScore}/100</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Position</p>
                      <Progress value={citation.positionScore} className="h-2" />
                      <p className="text-xs mt-1">{citation.positionScore}/100</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
