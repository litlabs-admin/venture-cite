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
  X,
} from "lucide-react";
import type { BrandHallucination, BrandFactSheet } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeExternalHref } from "@/lib/urlSafety";
import { useToast } from "@/hooks/use-toast";
import { Link } from "@tanstack/react-router";

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// Generic, always-actionable remediation guidance for correcting what AI
// engines say about a brand. Hoisted to a single section-level panel: the
// detector always writes remediationStatus: "pending" with no
// remediationSteps (server/lib/hallucinationDetector.ts), so per-card
// rendering of this same boilerplate repeated once per hallucination.
const GENERIC_REMEDIATION_STEPS: readonly string[] = [
  "State the correct information clearly on your own site (homepage + an About or FAQ page) so engines have an authoritative source.",
  "Add or update structured data (Organization / FAQ schema) so the correct value is machine-readable.",
  "Update your Brand Fact Sheet so detection and content generation use the correct source of truth.",
  "Where it matters, get high-authority sources (press, Wikipedia, directories) to reflect the correct information.",
];

const isActionableRemediation = (remStatus: string | null | undefined) =>
  !remStatus || remStatus === "pending" || remStatus === "in_progress";

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

  // Gates the section-level "how to fix this" panel: only show it when at
  // least one visible hallucination is still open (not resolved/dismissed).
  const hasActionableHallucinations = hallucinations.some((h) =>
    isActionableRemediation(h.remediationStatus),
  );

  const getRemediationPillClass = (status: string | null | undefined) => {
    switch (status) {
      case "in_progress":
        return "bg-(--brand-accent)/10 text-(--brand-accent) border-(--brand-accent)/20";
      case "resolved":
      case "verified":
        return "bg-(--positive)/10 text-(--positive) border-(--positive)/20";
      case "dismissed":
        return "bg-muted text-muted-foreground border-transparent";
      default:
        return "bg-(--warning)/10 text-(--warning) border-(--warning)/20"; // pending / null
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
    onError: (err: Error) =>
      toast({
        title: "Failed to resolve hallucination",
        description: err.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // "Not a hallucination" — the detector flagged a false positive (e.g. a
  // differently-worded but accurate description). PATCH remediationStatus to
  // "dismissed" (a legal transition from pending/in_progress).
  const dismissHallucinationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/hallucinations/${id}`, { remediationStatus: "dismissed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/hallucinations?brandId=${selectedBrandId}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/hallucinations/stats/${selectedBrandId}`],
      });
      toast({ title: "Marked as not a hallucination" });
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to dismiss",
        description: err.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // Severity ramp collapsed to two visually distinct treatments: critical
  // and high both need action; medium and low are informational. The old
  // 4-step ramp had high and medium differing only by 10% vs 8% background
  // alpha — not a perceptible tier. The precise severity word is still
  // shown as the badge's text, so no information is lost.
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
      case "high":
        return "bg-(--negative)/10 text-(--negative) border border-(--negative)/20";
      case "medium":
      case "low":
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
              className="tnum text-3xl font-semibold leading-none text-(--positive)"
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
              className="tnum text-3xl font-semibold leading-none text-(--negative)"
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
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Detected Hallucinations
                </CardTitle>
                <CardDescription>
                  AI claims that don&apos;t match your brand facts. The platform badge shows which
                  AI engine made the claim.
                </CardDescription>
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
                className="mb-4 flex items-start gap-2 rounded-md border border-(--warning)/20 bg-(--warning)/10 p-3 text-sm text-(--warning)"
                data-testid="warning-facts-too-small"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>Hallucination detection is inactive.</strong> Your fact sheet has{" "}
                  {activeFactCount} active {activeFactCount === 1 ? "entry" : "entries"}; we need at
                  least 3 to run the detector.{" "}
                  <Link to="/brand-fact-sheet" className="underline">
                    Add more facts →
                  </Link>
                </div>
              </div>
            )}
            {hallucinations.length === 0 ? (
              <div className="py-8 text-center">
                <Shield className="mx-auto mb-4 h-12 w-12 text-(--positive)" />
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
                {hasActionableHallucinations && (
                  <div
                    className="rounded-md border border-border bg-(--bg-surface-1) p-3"
                    data-testid="remediation-guidance-panel"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      How to fix flagged hallucinations
                    </p>
                    <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                      {GENERIC_REMEDIATION_STEPS.map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span aria-hidden>·</span>
                          <span className="min-w-0 break-words">{step}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      The specific correction to publish is quoted as "Actual fact" on each card
                      below.
                    </p>
                  </div>
                )}
                {hallucinations.map((hal) => {
                  const citingUrl = hal.citingOutletUrl;
                  const remStatus = hal.remediationStatus;
                  const seenCount = hal.seenCount;
                  const actionable = isActionableRemediation(remStatus);
                  return (
                    <div
                      key={hal.id}
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-(--border-strong)"
                    >
                      {/* Header: severity + type + platform + (resolve action) */}
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={`${getSeverityColor(hal.severity)} font-medium`}>
                            {hal.severity}
                          </Badge>
                          {/* hal.hallucinationType intentionally not rendered: the
                              detector only ever emits "fact_contradiction"
                              (server/lib/hallucinationDetector.ts), so a chip for
                              it differentiates nothing. */}
                          <Badge
                            variant="outline"
                            className="font-normal"
                            title={`Claimed by ${hal.aiPlatform}`}
                          >
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
                          <Badge className="bg-(--positive)/10 text-(--positive) border border-(--positive)/20 font-medium shrink-0">
                            Resolved
                          </Badge>
                        ) : actionable ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => dismissHallucinationMutation.mutate(hal.id)}
                              disabled={dismissHallucinationMutation.isPending}
                              data-testid={`button-dismiss-${hal.id}`}
                              title="The AI's claim is actually accurate — hide this false positive"
                            >
                              <X className="mr-1 h-4 w-4" />
                              Not a hallucination
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolveHallucinationMutation.mutate(hal.id)}
                              disabled={resolveHallucinationMutation.isPending}
                              data-testid={`button-resolve-${hal.id}`}
                            >
                              <CheckCircle className="mr-1 h-4 w-4" />
                              Mark Resolved
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {/* Claim vs. fact: quote-style with semantic accents.
                          No heavy block fills — DESIGN.md asks colour to
                          encode importance, not category. The left rule does
                          the work; the text reads cleanly on a neutral card. */}
                      <div className="min-w-0 space-y-3">
                        <div className="min-w-0 border-l-2 border-(--negative) pl-3">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            AI claimed
                          </p>
                          <p className="mt-0.5 min-w-0 break-words text-sm leading-snug text-foreground">
                            {hal.claimedStatement}
                          </p>
                        </div>
                        {hal.actualFact && (
                          <div className="min-w-0 border-l-2 border-(--positive) pl-3">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              Actual fact
                            </p>
                            <p className="mt-0.5 min-w-0 break-words text-sm leading-snug text-foreground">
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
                                href={safeExternalHref(citingUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                data-testid={`link-source-${hal.id}`}
                                title="Where this claim appeared. Correct it by fixing your own authoritative pages, not this link."
                              >
                                <ExternalLink className="h-3 w-3" />
                                Cited from {hostname}
                              </a>
                            );
                          })()}
                        {/* Generic guidance now lives once in the section-level
                            panel above the list. Only render this per-card
                            block when a detection carries genuinely specific
                            steps — the pipeline never populates
                            remediationSteps today, but the field exists on
                            the schema, so a future producer isn't silently
                            dropped. */}
                        {actionable && hal.remediationSteps && hal.remediationSteps.length > 0 && (
                          <div className="min-w-0 pt-1">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              How to fix this
                            </p>
                            <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                              {hal.remediationSteps.map((step, i) => (
                                <li key={i} className="flex gap-2">
                                  <span aria-hidden>·</span>
                                  <span className="min-w-0 break-words">{step}</span>
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

        <Card className="min-w-0">
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
                <Button asChild className="mt-4" data-testid="button-add-fact">
                  <Link to="/brand-fact-sheet">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Brand Fact
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {facts.map((fact) => (
                  <div key={fact.id} className="min-w-0 p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      {/* fact.subcategory is already the human label derived
                          from factKey (see subcategoryFor in
                          shared/factAgent/schema.ts) — e.g. factKey "tagline"
                          -> subcategory "Tagline". Rendering both said the
                          same name twice; the raw key is still available on
                          hover for debugging/provenance. */}
                      <Badge variant="outline" title={`Field: ${fact.factKey}`}>
                        {fact.subcategory}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Verified</span>
                    </div>
                    <p className="mt-2 min-w-0 break-words text-sm text-foreground">
                      {fact.factValue}
                    </p>
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
