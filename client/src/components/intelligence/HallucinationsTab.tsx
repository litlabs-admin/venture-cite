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
        return "bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] border-[var(--brand-accent)]/20";
      case "resolved":
      case "verified":
        return "bg-[var(--positive)]/10 text-[var(--positive)] border-[var(--positive)]/20";
      case "dismissed":
        return "bg-muted text-muted-foreground border-transparent";
      default:
        return "bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20"; // pending / null
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
        return "bg-[var(--negative)]/10 text-[var(--negative)] border border-[var(--negative)]/20";
      case "high":
        return "bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20";
      case "medium":
        return "bg-[var(--warning)]/8 text-[var(--warning)] border border-[var(--warning)]/15";
      case "low":
        return "bg-muted text-muted-foreground border border-border";
      default:
        return "bg-muted text-muted-foreground border border-border";
    }
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="tnum text-3xl font-semibold leading-none text-foreground"
              data-testid="stat-total-hallucinations"
            >
              {halStats.total}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">inaccuracies found</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="tnum text-3xl font-semibold leading-none text-[var(--positive)]"
              data-testid="stat-resolved"
            >
              {halStats.resolved}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {halStats.total > 0
                ? `${((halStats.resolved / halStats.total) * 100).toFixed(0)}% resolution rate`
                : "no issues yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="tnum text-3xl font-semibold leading-none text-[var(--negative)]"
              data-testid="stat-critical"
            >
              {halStats.bySeverity?.critical || 0}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">need immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Brand Facts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="tnum text-3xl font-semibold leading-none text-foreground"
              data-testid="stat-facts"
            >
              {facts.length}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">verified facts stored</p>
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
                className="mb-4 flex items-start gap-2 rounded-md border border-[var(--warning)]/20 bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]"
                data-testid="warning-facts-too-small"
              >
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <strong>Hallucination detection is inactive.</strong> Your fact sheet has{" "}
                  {activeFactCount} active {activeFactCount === 1 ? "entry" : "entries"}; we need at
                  least 3 to run the detector.{" "}
                  <Link href="/brand-fact-sheet" className="underline">
                    Add more facts →
                  </Link>
                </div>
              </div>
            )}
            {hallucinations.length === 0 ? (
              <div className="py-8 text-center">
                <Shield className="mx-auto mb-4 h-12 w-12 text-[var(--positive)]" />
                <p className="text-sm font-medium text-foreground">
                  {severityFilter === "all"
                    ? "No hallucinations detected"
                    : `No ${severityFilter}-severity hallucinations`}
                </p>
                {severityFilter === "all" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your brand information appears accurate across AI platforms.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {hallucinations.map((hal) => {
                  const citingUrl = (hal as any).citingOutletUrl as string | null | undefined;
                  const remStatus = (hal as any).remediationStatus as string | null | undefined;
                  const seenCount = (hal as any).seenCount as number | undefined;
                  const actionable =
                    !remStatus || remStatus === "pending" || remStatus === "in_progress";
                  return (
                    <div
                      key={hal.id}
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-[var(--border-strong)]"
                    >
                      {/* Header: severity + type + platform + (resolve action) */}
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={`${getSeverityColor(hal.severity)} font-medium`}>
                            {hal.severity}
                          </Badge>
                          <Badge variant="outline" className="font-normal">
                            {hal.hallucinationType}
                          </Badge>
                          <Badge variant="outline" className="font-normal">
                            {hal.aiPlatform}
                          </Badge>
                          {remStatus && (
                            <Badge
                              className={`${getRemediationPillClass(remStatus)} font-medium`}
                              data-testid={`badge-remediation-${hal.id}`}
                            >
                              {remStatus.replace(/_/g, " ")}
                            </Badge>
                          )}
                          {seenCount && seenCount > 1 && (
                            <span className="tnum text-[11px] text-muted-foreground">
                              · seen {seenCount}×
                            </span>
                          )}
                        </div>
                        {hal.isResolved === 1 ? (
                          <Badge className="bg-[var(--positive)]/10 text-[var(--positive)] border border-[var(--positive)]/20 font-medium shrink-0">
                            Resolved
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveHallucinationMutation.mutate(hal.id)}
                            disabled={!actionable || resolveHallucinationMutation.isPending}
                            data-testid={`button-resolve-${hal.id}`}
                            className="shrink-0"
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Mark Resolved
                          </Button>
                        )}
                      </div>

                      {/* Claim vs. fact: quote-style with semantic accents.
                          No heavy block fills — DESIGN.md asks colour to
                          encode importance, not category. The left rule does
                          the work; the text reads cleanly on a neutral card. */}
                      <div className="space-y-3">
                        <div className="border-l-2 border-[var(--negative)] pl-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            AI claimed
                          </p>
                          <p className="mt-0.5 text-sm leading-snug text-foreground">
                            {hal.claimedStatement}
                          </p>
                        </div>
                        {hal.actualFact && (
                          <div className="border-l-2 border-[var(--positive)] pl-3">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              Actual fact
                            </p>
                            <p className="mt-0.5 text-sm leading-snug text-foreground">
                              {hal.actualFact}
                            </p>
                          </div>
                        )}
                        {citingUrl &&
                          (() => {
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
                              <a
                                href={citingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                data-testid={`link-source-${hal.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                                Source: {hostname}
                              </a>
                            );
                          })()}
                        {hal.remediationSteps && hal.remediationSteps.length > 0 && (
                          <div className="pt-1">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              Remediation
                            </p>
                            <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                              {hal.remediationSteps.map((step, i) => (
                                <li key={i} className="flex gap-2">
                                  <span aria-hidden>·</span>
                                  <span>{step}</span>
                                </li>
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
                      {/* TODO(spec-2 Plan 2.4): `subcategory` replaces `factCategory`. */}
                      <Badge variant="outline">{fact.subcategory}</Badge>
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
