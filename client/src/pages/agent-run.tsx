import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WorkflowRun, WorkflowApproval } from "@shared/schema";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Workflow as WorkflowIcon,
  ExternalLink,
} from "lucide-react";

type WorkflowDef = {
  key: string;
  name: string;
  totalSteps: number;
  stepLabels: string[];
};

const WORKFLOW_DEFS: Record<string, WorkflowDef> = {
  win_a_prompt: {
    key: "win_a_prompt",
    name: "Win a Prompt",
    totalSteps: 6,
    stepLabels: [
      "Baseline citation check",
      "Competitor gap analysis",
      "Content brief (approval)",
      "Article generation",
      "Listicle outreach discovery (approval)",
      "Outreach send",
    ],
  },
  fix_losing_article: {
    key: "fix_losing_article",
    name: "Fix a Losing Article",
    totalSteps: 5,
    stepLabels: [
      "GEO audit",
      "Chunk rewrite (approval)",
      "Article apply",
      "Citation recheck",
      "Auto-chain Win-a-Prompt if still losing",
    ],
  },
  weekly_catchup: {
    key: "weekly_catchup",
    name: "Weekly Catch-up",
    totalSteps: 5,
    stepLabels: [
      "Citation check",
      "Delta vs last week",
      "Hallucination scan on losers",
      "Auto-spawn remediation tasks",
      "Email digest",
    ],
  },
};

type StepState = {
  status?: string;
  taskIds?: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  output?: unknown;
  error?: string | null;
};

type PendingApproval = Pick<WorkflowApproval, "id" | "stepIndex" | "summary"> & {
  summary?: Record<string, unknown> | null;
};

type RunDetail = {
  run: WorkflowRun;
  pendingApproval?: PendingApproval | null;
};

function isTerminal(status: string) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function runStatusBadge(status: string) {
  switch (status) {
    case "awaiting_approval":
      return <Badge className="bg-amber-500 hover:bg-amber-500">Awaiting approval</Badge>;
    case "running":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline">
          <Clock className="w-3 h-3 mr-1" /> Pending
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700">
          <CheckCircle className="w-3 h-3 mr-1" /> Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700">
          <XCircle className="w-3 h-3 mr-1" /> Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground">
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function durationLabel(run: WorkflowRun): string | null {
  if (!run.completedAt || !run.createdAt) return null;
  const ms = new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function StepIcon({ status }: { status?: string }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
    case "completed":
      return <CheckCircle className="w-5 h-5 text-emerald-600" />;
    case "failed":
      return <XCircle className="w-5 h-5 text-destructive" />;
    case "awaiting_approval":
      return <Clock className="w-5 h-5 text-amber-500" />;
    default:
      return <div className="w-3 h-3 rounded-full bg-muted-foreground/40 mx-1" />;
  }
}

function ContentBriefPreview({ summary }: { summary: Record<string, unknown> }) {
  const brief = (summary.brief ?? summary) as {
    title?: string;
    targetQuery?: string;
    keyAngles?: string[];
    competitorPages?: Array<string | { url: string; title?: string }>;
    tone?: string;
    length?: string | number;
    firstRun?: boolean;
  };
  return (
    <div className="space-y-3">
      {brief.firstRun && (
        <div className="text-xs p-2 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          First run for this prompt — no prior citation data, so the angles below are generic
          starters. Reject if you want to run citation checks first.
        </div>
      )}
      {brief.title && <p className="font-semibold text-lg">{brief.title}</p>}
      {brief.targetQuery && (
        <p className="text-sm">
          <span className="text-muted-foreground">Target query: </span>
          {brief.targetQuery}
        </p>
      )}
      {brief.keyAngles && brief.keyAngles.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Key angles</p>
          <div className="flex flex-wrap gap-2">
            {brief.keyAngles.map((a, i) => (
              <Badge key={i} variant="outline">
                {a}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {brief.competitorPages && brief.competitorPages.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Competitor pages</p>
          <ul className="text-sm space-y-1">
            {brief.competitorPages.map((c, i) => {
              const url = typeof c === "string" ? c : c.url;
              const label = typeof c === "string" ? c : c.title || c.url;
              return (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex gap-4 text-sm text-muted-foreground">
        {brief.tone && <span>Tone: {brief.tone}</span>}
        {brief.length && <span>Length: {String(brief.length)}</span>}
      </div>
    </div>
  );
}

type Listicle = {
  id: string;
  title?: string;
  url?: string;
  publication?: string;
  notes?: string;
};

function OutreachDiscoveryPreview({
  summary,
  selectedIds,
  onToggle,
}: {
  summary: Record<string, unknown>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const listicles = (summary.listicles as Listicle[] | undefined) ?? [];
  if (listicles.length === 0) {
    return <p className="text-sm text-muted-foreground">No listicles to review in this summary.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Deselect any listicles you don't want the agent to pitch.
      </p>
      {listicles.map((l) => (
        <label
          key={l.id}
          className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/40 cursor-pointer"
        >
          <Checkbox
            checked={selectedIds.has(l.id)}
            onCheckedChange={() => onToggle(l.id)}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <p className="font-medium truncate">{l.title || l.url || l.id}</p>
            {l.publication && <p className="text-xs text-muted-foreground">{l.publication}</p>}
            {l.url && (
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                {l.url}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {l.notes && <p className="text-xs mt-1">{l.notes}</p>}
          </div>
        </label>
      ))}
    </div>
  );
}

type DiffLine = { kind: "unchanged" | "added" | "removed"; text: string };

/**
 * Hand-rolled line-level LCS diff. No new dependency. Returns an interleaved
 * sequence of removed/added/unchanged lines suitable for a unified-diff view.
 * For very large inputs we cap at the first 2000 lines on each side to keep
 * the quadratic table bounded.
 */
function computeLineDiff(original: string, optimized: string): DiffLine[] {
  const MAX = 2000;
  const a = original.split("\n").slice(0, MAX);
  const b = optimized.split("\n").slice(0, MAX);
  const n = a.length;
  const m = b.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ kind: "unchanged", text: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ kind: "removed", text: a[i - 1] });
      i--;
    } else {
      out.push({ kind: "added", text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) out.push({ kind: "removed", text: a[--i] });
  while (j > 0) out.push({ kind: "added", text: b[--j] });
  return out.reverse();
}

function ChunkOptimizePreview({ summary }: { summary: Record<string, unknown> }) {
  const originalContent =
    (summary.originalContent as string | undefined) ??
    (summary.original as { content?: string } | undefined)?.content ??
    "";
  const optimizedContent =
    (summary.optimizedContent as string | undefined) ??
    (summary.optimized as { content?: string } | undefined)?.content ??
    "";
  const diff = useMemo(
    () => computeLineDiff(originalContent, optimizedContent),
    [originalContent, optimizedContent],
  );
  return (
    <div>
      <p className="text-sm font-medium mb-1">
        Proposed changes <span className="text-muted-foreground">(line diff)</span>
      </p>
      <div className="max-h-80 overflow-auto font-mono text-xs border rounded bg-card">
        {diff.length === 0 ? (
          <p className="p-3 text-muted-foreground">No content to compare.</p>
        ) : (
          diff.map((line, idx) => {
            const cls =
              line.kind === "added"
                ? "bg-emerald-50 text-emerald-900 border-l-2 border-emerald-500"
                : line.kind === "removed"
                  ? "bg-red-50 text-red-900 border-l-2 border-red-500"
                  : "text-muted-foreground";
            const prefix = line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  ";
            return (
              <div key={idx} className={`px-2 py-0.5 whitespace-pre-wrap ${cls}`}>
                {prefix}
                {line.text || " "}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AgentRun() {
  const { toast } = useToast();
  const [, params] = useRoute("/agent/runs/:runId");
  const runId = params?.runId;

  const [selectedListicleIds, setSelectedListicleIds] = useState<Set<string> | null>(null);

  const { data: runData, isLoading } = useQuery<{ data: RunDetail }>({
    queryKey: [`/api/workflow-runs/${runId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/workflow-runs/${runId}`);
      return res.json();
    },
    enabled: !!runId,
    refetchInterval: (query) => {
      const run = (query.state.data as { data?: RunDetail } | undefined)?.data?.run;
      if (!run) return 5000;
      return isTerminal(run.status) ? false : 5000;
    },
  });

  const run = runData?.data?.run;
  const pendingApproval = runData?.data?.pendingApproval;
  const def = run ? WORKFLOW_DEFS[run.workflowKey] : undefined;
  const stepStates = (run?.stepStates ?? []) as StepState[];

  const approveMutation = useMutation({
    mutationFn: async (args: {
      stepIndex: number;
      decision: "approved" | "rejected";
      payload?: Record<string, unknown>;
    }) => {
      const res = await apiRequest("POST", `/api/workflow-runs/${runId}/approve`, args);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Decision submitted" });
      queryClient.invalidateQueries({ queryKey: [`/api/workflow-runs/${runId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-runs"] });
      setSelectedListicleIds(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to submit decision",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/workflow-runs/${runId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Run cancelled" });
      queryClient.invalidateQueries({ queryKey: [`/api/workflow-runs/${runId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-runs"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to cancel", description: err.message, variant: "destructive" });
    },
  });

  const approvalShape = useMemo(() => {
    if (!run || !pendingApproval?.summary) return null;
    const summary = pendingApproval.summary as Record<string, unknown>;
    // Primary: honest discriminator emitted by the workflow's buildApprovalSummary.
    const kind = typeof summary.kind === "string" ? summary.kind : undefined;
    switch (kind) {
      case "brief":
        return "brief" as const;
      case "listicles":
        return "listicles" as const;
      case "diff":
      case "optimize":
        return "diff" as const;
    }
    // Legacy fallback for in-flight runs created before the discriminator shipped.
    if ("brief" in summary) return "brief" as const;
    if ("listicles" in summary) return "listicles" as const;
    if ("originalContent" in summary || "optimizedContent" in summary) return "diff" as const;
    return "unknown" as const;
  }, [run, pendingApproval]);

  const listiclesInSummary = useMemo<Listicle[]>(() => {
    if (!pendingApproval?.summary) return [];
    const list = (pendingApproval.summary as { listicles?: Listicle[] }).listicles;
    return list ?? [];
  }, [pendingApproval]);

  const effectiveSelectedIds = useMemo<Set<string>>(() => {
    if (selectedListicleIds) return selectedListicleIds;
    return new Set(listiclesInSummary.map((l) => l.id));
  }, [selectedListicleIds, listiclesInSummary]);

  const toggleListicle = (id: string) => {
    const next = new Set(effectiveSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedListicleIds(next);
  };

  const handleApprove = () => {
    if (!pendingApproval) return;
    let payload: Record<string, unknown> | undefined;
    if (approvalShape === "listicles") {
      payload = { selectedListicleIds: Array.from(effectiveSelectedIds) };
    }
    approveMutation.mutate({
      stepIndex: pendingApproval.stepIndex,
      decision: "approved",
      payload,
    });
  };

  const handleReject = () => {
    if (!pendingApproval) return;
    approveMutation.mutate({
      stepIndex: pendingApproval.stepIndex,
      decision: "rejected",
    });
  };

  if (!runId) {
    return <div className="p-8">Invalid run.</div>;
  }
  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }
  if (!run) {
    return (
      <div className="p-8">
        <p className="mb-4">Run not found.</p>
        <Link href="/agent">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Agents
          </Button>
        </Link>
      </div>
    );
  }

  const totalSteps = def?.totalSteps ?? stepStates.length;
  const stepLabels = def?.stepLabels ?? [];
  const cancelDisabled = cancelMutation.isPending || isTerminal(run.status);

  return (
    <>
      <Helmet>
        <title>{def?.name || run.workflowKey} · Run | GEO Platform</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/agent">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Agents
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <WorkflowIcon className="w-5 h-5 text-primary" />
                {def?.name || run.workflowKey}
              </h1>
              <p className="text-sm text-muted-foreground">
                Started {new Date(run.createdAt).toLocaleString()}
                {run.completedAt ? ` · Duration ${durationLabel(run)}` : ""}
              </p>
            </div>
          </div>
          <div>{runStatusBadge(run.status)}</div>
        </div>

        {run.status === "awaiting_approval" && pendingApproval && (
          <Card className="border-amber-300 bg-amber-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Approval needed — Step {pendingApproval.stepIndex + 1}
                {stepLabels[pendingApproval.stepIndex]
                  ? `: ${stepLabels[pendingApproval.stepIndex]}`
                  : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {approvalShape === "brief" && pendingApproval.summary && (
                <ContentBriefPreview summary={pendingApproval.summary as Record<string, unknown>} />
              )}
              {approvalShape === "listicles" && pendingApproval.summary && (
                <OutreachDiscoveryPreview
                  summary={pendingApproval.summary as Record<string, unknown>}
                  selectedIds={effectiveSelectedIds}
                  onToggle={toggleListicle}
                />
              )}
              {approvalShape === "diff" && pendingApproval.summary && (
                <ChunkOptimizePreview
                  summary={pendingApproval.summary as Record<string, unknown>}
                />
              )}
              {approvalShape === "unknown" && pendingApproval.summary && (
                <pre className="text-xs bg-card p-3 rounded border overflow-auto max-h-72">
                  {JSON.stringify(pendingApproval.summary, null, 2)}
                </pre>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleReject}
                  disabled={approveMutation.isPending}
                  className="border-destructive text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="w-4 h-4 mr-2" /> Reject
                </Button>
                <Button onClick={handleApprove} disabled={approveMutation.isPending}>
                  {approveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Approve
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {stepStates.length === 0 && totalSteps === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting to start...
              </p>
            ) : null}
            <ol className="space-y-4">
              {Array.from({ length: Math.max(totalSteps, stepStates.length) }).map((_, i) => {
                const state = stepStates[i] ?? ({} as StepState);
                const label = stepLabels[i] || `Step ${i + 1}`;
                const taskIds = state.taskIds ?? [];
                return (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 flex items-center justify-center">
                        <StepIcon status={state.status} />
                      </div>
                      {i < Math.max(totalSteps, stepStates.length) - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">
                          <span className="text-muted-foreground mr-2">Step {i + 1}</span>
                          {label}
                        </p>
                        {state.status && runStatusBadge(state.status)}
                      </div>
                      {taskIds.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {taskIds.map((tid) => (
                            <Link
                              key={tid}
                              href={`/agent?taskId=${tid}`}
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1 block"
                            >
                              View task output <ExternalLink className="w-3 h-3" />
                            </Link>
                          ))}
                        </div>
                      )}
                      {state.status &&
                        (state.status === "completed" ||
                          state.status === "failed" ||
                          state.status === "cancelled") &&
                        state.output !== undefined &&
                        state.output !== null && (
                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-hidden max-h-24">
                            {JSON.stringify(state.output).slice(0, 200)}
                          </pre>
                        )}
                      {state.error && (
                        <p className="mt-2 text-sm text-destructive">{state.error}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {run.lastError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive">Run error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{run.lastError}</p>
            </CardContent>
          </Card>
        )}

        {!isTerminal(run.status) && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelDisabled}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Cancel run
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
