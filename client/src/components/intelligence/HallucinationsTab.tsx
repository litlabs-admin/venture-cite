import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle,
  Shield,
  FileText,
  Plus,
  ExternalLink,
  Info,
} from "lucide-react";
import type { BrandHallucination, BrandFactSheet } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function HallucinationsTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { toast } = useToast();
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data: hallucinationStats } = useQuery<{ success: boolean; data: any }>({
    queryKey: [`/api/hallucinations/stats/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: hallucinationsData } = useQuery<{ success: boolean; data: BrandHallucination[] }>({
    queryKey: [`/api/hallucinations?brandId=${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { data: factsData } = useQuery<{ success: boolean; data: BrandFactSheet[] }>({
    queryKey: [`/api/brand-facts/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const allHallucinations = hallucinationsData?.data || [];
  const facts = factsData?.data || [];
  const halStats = hallucinationStats?.data || {
    total: 0,
    resolved: 0,
    bySeverity: {},
    byType: {},
  };

  // Filter + sort: critical first, then by detectedAt DESC. Without this
  // a brand with 50 hallucinations sees them in random order and can't
  // prioritise.
  const hallucinations = [...allHallucinations]
    .filter((h) => severityFilter === "all" || h.severity === severityFilter)
    .sort((a, b) => {
      const rankDiff = (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    });

  const activeFactCount = facts.filter((f: any) => f.isActive !== 0).length;
  const factSheetTooSmall = activeFactCount < 3;

  const getRemediationPillClass = (status: string | null | undefined) => {
    switch (status) {
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "verified":
        return "bg-emerald-100 text-emerald-800";
      case "dismissed":
        return "bg-gray-200 text-gray-700";
      default:
        return "bg-amber-100 text-amber-800"; // pending / null
    }
  };

  const resolveHallucinationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/hallucinations/${id}/resolve`);
    },
    onSuccess: () => {
      // Wave E: the list query is keyed by the FULL URL with query string
      // (line 44 above). TanStack Query does exact matching on
      // single-element string arrays, so invalidating the bare path
      // `["/api/hallucinations"]` never fires a refetch — the DB updated
      // but the UI showed stale state until a page reload. Match the
      // list's key exactly here.
      queryClient.invalidateQueries({
        queryKey: [`/api/hallucinations?brandId=${selectedBrandId}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/hallucinations/stats/${selectedBrandId}`],
      });
      toast({ title: "Hallucination marked as resolved" });
    },
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500 text-white";
      case "high":
        return "bg-orange-500 text-white";
      case "medium":
        return "bg-yellow-500 text-white";
      case "low":
        return "bg-blue-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  return (
    <>
      <div className="grid gap-6 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-total-hallucinations">
              {halStats.total}
            </div>
            <p className="text-sm text-muted-foreground">inaccuracies found</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600" data-testid="stat-resolved">
              {halStats.resolved}
            </div>
            <p className="text-sm text-muted-foreground">
              {halStats.total > 0
                ? `${((halStats.resolved / halStats.total) * 100).toFixed(0)}% resolution rate`
                : "no issues yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600" data-testid="stat-critical">
              {halStats.bySeverity?.critical || 0}
            </div>
            <p className="text-sm text-muted-foreground">need immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Brand Facts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-facts">
              {facts.length}
            </div>
            <p className="text-sm text-muted-foreground">verified facts stored</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Detected Hallucinations
                </CardTitle>
                <CardDescription>AI claims that don't match your brand facts</CardDescription>
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-40" data-testid="select-severity-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="critical">Critical only</SelectItem>
                  <SelectItem value="high">High only</SelectItem>
                  <SelectItem value="medium">Medium only</SelectItem>
                  <SelectItem value="low">Low only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {factSheetTooSmall && (
              <div
                className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2"
                data-testid="warning-facts-too-small"
              >
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Hallucination detection is inactive.</strong> Your fact sheet has{" "}
                  {activeFactCount} active {activeFactCount === 1 ? "entry" : "entries"}; we need at
                  least 3 to run the detector.{" "}
                  <Link href="/brand-fact-sheet" className="underline hover:text-amber-900">
                    Add more facts →
                  </Link>
                </div>
              </div>
            )}
            {hallucinations.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <p className="text-muted-foreground">
                  {severityFilter === "all"
                    ? "No hallucinations detected"
                    : `No ${severityFilter}-severity hallucinations`}
                </p>
                {severityFilter === "all" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Your brand information appears accurate across AI platforms
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {hallucinations.map((hal) => {
                  const citingUrl = (hal as any).citingOutletUrl as string | null | undefined;
                  const remStatus = (hal as any).remediationStatus as string | null | undefined;
                  const seenCount = (hal as any).seenCount as number | undefined;
                  return (
                    <div key={hal.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge className={getSeverityColor(hal.severity)}>{hal.severity}</Badge>
                          <Badge variant="outline">{hal.hallucinationType}</Badge>
                          <Badge variant="outline">{hal.aiPlatform}</Badge>
                          {remStatus && (
                            <Badge
                              className={getRemediationPillClass(remStatus)}
                              data-testid={`badge-remediation-${hal.id}`}
                            >
                              {remStatus.replace(/_/g, " ")}
                            </Badge>
                          )}
                          {seenCount && seenCount > 1 && (
                            <Badge variant="outline" className="text-[10px]">
                              seen {seenCount}×
                            </Badge>
                          )}
                        </div>
                        {hal.isResolved === 1 ? (
                          <Badge className="bg-green-100 text-green-800">Resolved</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveHallucinationMutation.mutate(hal.id)}
                            data-testid={`button-resolve-${hal.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Mark Resolved
                          </Button>
                        )}
                      </div>

                      <div className="mt-3 space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground">AI Claimed:</p>
                          <p className="text-sm bg-red-50 p-2 rounded text-red-800">
                            "{hal.claimedStatement}"
                          </p>
                        </div>
                        {hal.actualFact && (
                          <div>
                            <p className="text-xs text-muted-foreground">Actual Fact:</p>
                            <p className="text-sm bg-green-50 p-2 rounded text-green-800">
                              "{hal.actualFact}"
                            </p>
                          </div>
                        )}
                        {citingUrl &&
                          (() => {
                            // Bare domains (hubspot.com/...) and synthetic ai://
                            // URLs from the analyzer fallback both fail
                            // new URL(). Normalise + guard so the whole tab
                            // doesn't error out on one bad row.
                            let hostname = "";
                            try {
                              const normalised = /^[a-z][a-z0-9+.-]*:/i.test(citingUrl)
                                ? citingUrl
                                : `https://${citingUrl}`;
                              hostname = new URL(normalised).hostname || citingUrl;
                            } catch {
                              hostname = citingUrl;
                            }
                            if (!hostname || hostname.startsWith("ai://")) return null;
                            return (
                              <div className="text-xs">
                                <a
                                  href={citingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                  data-testid={`link-source-${hal.id}`}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Source: {hostname}
                                </a>
                              </div>
                            );
                          })()}
                        {hal.remediationSteps && hal.remediationSteps.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">Remediation Steps:</p>
                            <ul className="text-sm list-disc list-inside text-muted-foreground">
                              {hal.remediationSteps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Brand Fact Sheet
            </CardTitle>
            <CardDescription>Your source of truth for AI verification</CardDescription>
          </CardHeader>
          <CardContent>
            {facts.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">No facts added yet</p>
                <p className="text-sm text-muted-foreground">
                  Add verified facts about your brand to enable hallucination detection
                </p>
                <Button className="mt-4" data-testid="button-add-fact">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Brand Fact
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {facts.map((fact) => (
                  <div key={fact.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{fact.factCategory}</Badge>
                      <span className="text-xs text-muted-foreground">Verified</span>
                    </div>
                    <p className="font-medium mt-2">{fact.factKey}</p>
                    <p className="text-sm text-muted-foreground">{fact.factValue}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
