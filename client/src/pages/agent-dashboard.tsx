import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useSearch } from "wouter";
import PageHeader from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentTask, BrandPrompt, WorkflowRun } from "@shared/schema";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  Bot,
  Zap,
  ListTodo,
  Mail,
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Target,
  Sparkles,
  FileText,
  ExternalLink,
  Loader2,
  Activity,
  BarChart3,
  Workflow,
  History,
  Calendar,
  ArrowRight,
} from "lucide-react";

type WorkflowDef = {
  key: string;
  name: string;
  description: string;
  totalSteps: number;
  mode: "prompt" | "article" | "scheduled";
};

const WORKFLOWS: WorkflowDef[] = [
  {
    key: "win_a_prompt",
    name: "Win a Prompt",
    description:
      "Pick a tracked prompt where you rank poorly. Chains: baseline check → competitor gap analysis → article generation → listicle outreach. 6 steps · 2 approval gates.",
    totalSteps: 6,
    mode: "prompt",
  },
  {
    key: "fix_losing_article",
    name: "Fix a Losing Article",
    description:
      "Pick an underperforming article. Chains: GEO audit → chunk rewrite → article apply → citation recheck → auto-chain to Win-a-Prompt if still losing. 5 steps · 1 approval gate.",
    totalSteps: 5,
    mode: "article",
  },
  {
    key: "weekly_catchup",
    name: "Weekly Catch-up",
    description:
      "Every Monday 06:00 UTC: citation check → delta vs last week → hallucination scan on losers → auto-spawn remediation tasks → email digest. Fully autonomous.",
    totalSteps: 5,
    mode: "scheduled",
  },
];

function workflowByKey(key: string): WorkflowDef | undefined {
  return WORKFLOWS.find((w) => w.key === key);
}

function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function isTerminal(status: string) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function runStatusBadge(status: string) {
  switch (status) {
    case "awaiting_approval":
      return <Badge className="bg-amber-500 hover:bg-amber-500">Needs review</Badge>;
    case "running":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline" className="bg-slate-50 text-slate-700">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
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

export default function AgentDashboard() {
  const { toast } = useToast();
  const { selectedBrandId, brands, selectedBrand } = useBrandSelection();
  const [activeTab, setActiveTab] = useState("workflows");
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const deepLinkTaskId = new URLSearchParams(search).get("taskId");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [startWorkflow, setStartWorkflow] = useState<WorkflowDef | null>(null);
  const [startPromptId, setStartPromptId] = useState<string>("");
  const [startArticleId, setStartArticleId] = useState<string>("");

  const { data: activeRunsData } = useQuery<{ data: WorkflowRun[] }>({
    queryKey: ["/api/workflow-runs", { brandId: selectedBrandId, status: "active" }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/workflow-runs?brandId=${selectedBrandId}&status=active`,
      );
      return res.json();
    },
    enabled: !!selectedBrandId,
    refetchInterval: (query) => {
      const list = (query.state.data as { data?: WorkflowRun[] } | undefined)?.data;
      const hasActive = list?.some((r) => !isTerminal(r.status));
      return hasActive ? 5000 : 10000;
    },
  });
  const activeRuns = activeRunsData?.data || [];

  const { data: allRunsData, isLoading: allRunsLoading } = useQuery<{ data: WorkflowRun[] }>({
    queryKey: ["/api/workflow-runs", { brandId: selectedBrandId, limit: 50 }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/workflow-runs?brandId=${selectedBrandId}&limit=50`);
      return res.json();
    },
    enabled: !!selectedBrandId && activeTab === "history",
  });
  const allRuns = allRunsData?.data || [];

  const { data: trackedPromptsData } = useQuery<{ data: BrandPrompt[] }>({
    queryKey: [`/api/brand-prompts/${selectedBrandId}`],
    enabled: !!selectedBrandId && startWorkflow?.mode === "prompt",
  });
  const trackedPrompts = trackedPromptsData?.data || [];

  const { data: articlesList } = useQuery<{ data: Array<{ id: string; title: string }> }>({
    queryKey: ["/api/articles", { brandId: selectedBrandId, forWorkflow: 1 }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/articles?brandId=${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId && startWorkflow?.mode === "article",
  });
  const workflowArticles = articlesList?.data || [];

  // Scope cache invalidations to the currently selected brand. Prevents
  // thrashing queries for other brands we still have in the cache.
  const invalidateBrandScoped = (prefix: string) => {
    queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey;
        if (!Array.isArray(k) || k[0] !== prefix) return false;
        const meta = k[1] as unknown;
        if (meta == null) return true;
        if (typeof meta === "string") return meta === selectedBrandId;
        if (typeof meta === "object" && meta !== null && "brandId" in meta) {
          return (meta as { brandId?: string }).brandId === selectedBrandId;
        }
        return true;
      },
    });
  };

  const startWorkflowMutation = useMutation({
    mutationFn: async (args: { key: string; input: Record<string, unknown> }) => {
      const res = await apiRequest("POST", `/api/workflows/${args.key}/start`, {
        brandId: selectedBrandId,
        input: args.input,
      });
      return res.json();
    },
    onSuccess: (data: { runId?: string; data?: { runId?: string } }) => {
      const runId = data.runId || data.data?.runId;
      if (runId) {
        // Scoped to the current brand — TanStack matches by queryKey prefix, and
        // every workflow-runs query on this page starts with ["/api/workflow-runs", { brandId }].
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey;
            if (!Array.isArray(k) || k[0] !== "/api/workflow-runs") return false;
            const meta = k[1] as { brandId?: string } | undefined;
            return !meta || meta.brandId === selectedBrandId;
          },
        });
        setStartWorkflow(null);
        setStartPromptId("");
        setStartArticleId("");
        setLocation(`/agent/runs/${runId}`);
      } else {
        toast({ title: "Workflow started, but no runId returned", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to start workflow",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleStartSubmit = () => {
    if (!startWorkflow) return;
    if (startWorkflow.mode === "prompt") {
      if (!startPromptId) {
        toast({ title: "Select a prompt first", variant: "destructive" });
        return;
      }
      startWorkflowMutation.mutate({ key: startWorkflow.key, input: { promptId: startPromptId } });
    } else if (startWorkflow.mode === "article") {
      if (!startArticleId) {
        toast({ title: "Select an article first", variant: "destructive" });
        return;
      }
      startWorkflowMutation.mutate({
        key: startWorkflow.key,
        input: { articleId: startArticleId },
      });
    } else {
      startWorkflowMutation.mutate({ key: startWorkflow.key, input: {} });
    }
  };

  const durationLabel = (run: WorkflowRun): string => {
    if (!run.completedAt || !run.createdAt) return "—";
    const ms = new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime();
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  const { data: tasksData, isLoading: tasksLoading } = useQuery<{ data: AgentTask[] }>({
    queryKey: [
      "/api/agent-tasks",
      { brandId: selectedBrandId, status: taskFilter !== "all" ? taskFilter : undefined },
    ],
    // Poll while any task is still running so the UI shows the transition
    // to completed/failed without requiring a manual refresh. 5s cadence
    // is enough for citation runs (30s–2min) and content jobs (2–5min).
    refetchInterval: (query) => {
      const list = (query.state.data as { data?: AgentTask[] } | undefined)?.data;
      const hasActive = list?.some((t) => t.status === "in_progress" || t.status === "queued");
      return hasActive ? 5000 : false;
    },
  });

  const { data: taskStatsData } = useQuery<{
    data: {
      queued: number;
      inProgress: number;
      completed: number;
      failed: number;
      totalTokensUsed: number;
    };
  }>({
    queryKey: ["/api/agent-tasks/stats", { brandId: selectedBrandId }],
    enabled: !!selectedBrandId,
  });

  const tasks = tasksData?.data || [];
  const taskStats = taskStatsData?.data;

  // Deep-link: /agent?taskId=<id>. Switch to Task Queue tab and open the
  // detail dialog for that task. Works whether the task is already in the
  // current filtered list or has to be fetched separately.
  useEffect(() => {
    if (!deepLinkTaskId) return;
    setActiveTab("tasks");
    setOpenTaskId(deepLinkTaskId);
  }, [deepLinkTaskId]);

  const { data: deepLinkTaskData } = useQuery<{ data: AgentTask }>({
    queryKey: [`/api/agent-tasks/${openTaskId}`],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/agent-tasks/${openTaskId}`);
      return r.json();
    },
    enabled: !!openTaskId,
  });
  const openTask: AgentTask | undefined =
    tasks.find((t) => t.id === openTaskId) || deepLinkTaskData?.data;

  const executeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setExecutingTaskId(taskId);
      const response = await apiRequest("POST", `/api/agent-tasks/${taskId}/execute`);
      return response.json();
    },
    onSuccess: (data: any) => {
      setExecutingTaskId(null);
      if (data.success) {
        toast({ title: "Task completed successfully!" });
      } else {
        toast({
          title: "Task failed",
          description: data.error || "An error occurred",
          variant: "destructive",
        });
      }
      invalidateBrandScoped("/api/agent-tasks");
      invalidateBrandScoped("/api/agent-tasks/stats");
    },
    onError: (err: Error) => {
      setExecutingTaskId(null);
      // Map 409 ("already claimed / running") to a friendlier message. The
      // server's claim path returns status 409 with code "not_claimable" when
      // a concurrent click already grabbed the task.
      const msg = err?.message || "";
      const is409 =
        /(^|[^0-9])409([^0-9]|$)/.test(msg) ||
        /not_claimable/i.test(msg) ||
        /already.*running/i.test(msg) ||
        /already.*claimed/i.test(msg);
      if (is409) {
        toast({
          title: "Task is already running",
          description:
            "This task was claimed by another execution. It will update when it finishes.",
        });
      } else {
        toast({
          title: "Failed to execute task",
          description: msg || undefined,
          variant: "destructive",
        });
      }
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: {
      taskType: string;
      taskTitle: string;
      taskDescription?: string;
      priority?: string;
      inputData?: Record<string, unknown>;
    }) => {
      const response = await apiRequest("POST", "/api/agent-tasks", {
        brandId: selectedBrandId,
        triggeredBy: "manual",
        ...data,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Task created - running now..." });
      invalidateBrandScoped("/api/agent-tasks");
      setShowCreateTask(false);
      if (data?.data?.id) {
        executeTaskMutation.mutate(data.data.id);
      }
    },
    onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/agent-tasks/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task updated!" });
      invalidateBrandScoped("/api/agent-tasks");
    },
    onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/agent-tasks/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Task deleted!" });
      invalidateBrandScoped("/api/agent-tasks");
    },
    onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "queued":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700"
            data-testid="badge-status-queued"
          >
            <Clock className="w-3 h-3 mr-1" />
            Queued
          </Badge>
        );
      case "in_progress":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700"
            data-testid="badge-status-progress"
          >
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            In Progress
          </Badge>
        );
      case "completed":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700"
            data-testid="badge-status-completed"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700"
            data-testid="badge-status-failed"
          >
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge className="bg-red-500">Urgent</Badge>;
      case "high":
        return <Badge className="bg-orange-500">High</Badge>;
      case "medium":
        return <Badge className="bg-blue-500">Medium</Badge>;
      case "low":
        return <Badge className="bg-gray-500">Low</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  // Maps an agent_task.{artifactType, artifactId} to a user-facing link.
  // Tasks created after Wave 2 carry these columns; older rows fall back
  // to outputData inspection. Returns null if there's nothing to link to.
  const getArtifactLink = (task: AgentTask): { href: string; label: string } | null => {
    const artifactType = (task as any).artifactType as string | undefined;
    const artifactId = (task as any).artifactId as string | undefined;
    const out = (task as any).outputData as Record<string, any> | undefined;
    const type = artifactType || inferArtifactTypeFromOutput(out);
    const id =
      artifactId || out?.jobId || out?.runId || out?.emailId || out?.hallucinationId || null;
    if (!type) return null;
    switch (type) {
      case "content_job":
        return id
          ? { href: `/content?jobId=${id}`, label: "View article job" }
          : { href: `/content`, label: "Open Content Generation" };
      case "citation_run":
        return { href: `/geo-rankings`, label: "View citation run" };
      case "outreach_email":
        return id ? { href: `/outreach?emailId=${id}`, label: "View drafted email" } : null;
      case "hallucination":
        return { href: `/ai-intelligence?tab=hallucinations`, label: "View hallucination" };
      case "source_analysis":
        return { href: `/ai-intelligence?tab=sources`, label: "View sources" };
      default:
        return null;
    }
  };

  const inferArtifactTypeFromOutput = (out: Record<string, any> | undefined): string | null => {
    if (!out) return null;
    if (out.jobId) return "content_job";
    if (out.runId) return "citation_run";
    if (out.emailId) return "outreach_email";
    if (out.hallucinationId) return "hallucination";
    if (out.action === "source_analysis_computed") return "source_analysis";
    return null;
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case "content_generation":
        return <FileText className="w-4 h-4" />;
      case "outreach":
        return <Mail className="w-4 h-4" />;
      case "prompt_test":
        return <Target className="w-4 h-4" />;
      case "source_analysis":
        return <BarChart3 className="w-4 h-4" />;
      case "hallucination_remediation":
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  const taskTypeInfo: Record<
    string,
    { title: string; description: string; whatItDoes: string; timeEstimate: string }
  > = {
    content_generation: {
      title: "Generate AI-Optimized Article",
      description: "Creates a 1500+ word article optimized for AI search engines",
      whatItDoes:
        "The agent will analyze your brand profile, identify a high-value keyword, and generate a comprehensive article designed to be cited by ChatGPT, Claude, and other AI platforms.",
      timeEstimate: "2-3 minutes",
    },
    outreach: {
      title: "Draft Outreach Email",
      description: "Creates a personalized pitch email for a publication",
      whatItDoes:
        "The agent will review your brand and select a relevant publication, then draft a professional guest post or PR pitch email tailored to that publication's audience.",
      timeEstimate: "1-2 minutes",
    },
    prompt_test: {
      title: "Test AI Citation",
      description: "Checks if AI engines currently cite your brand",
      whatItDoes:
        "The agent will query ChatGPT, Claude, and Perplexity with industry-relevant questions to see if they mention your brand. Results show where you're being cited and where you're missing.",
      timeEstimate: "1-2 minutes",
    },
    source_analysis: {
      title: "Analyze Competitor Sources",
      description: "Finds what sources AI engines cite for your keywords",
      whatItDoes:
        "The agent will research which websites and publications AI search engines trust for your industry topics, helping you identify high-priority outreach targets.",
      timeEstimate: "2-3 minutes",
    },
    hallucination_remediation: {
      title: "Plan Hallucination Remediation",
      description: "Generate a step-by-step remediation plan for a detected hallucination",
      whatItDoes:
        "The agent reads a specific detected hallucination against your brand fact sheet and outputs 3–6 concrete remediation steps (publish a clarifying post, update Wikipedia, email the vendor's feedback form, etc.). No correction content is drafted here — this is a planning task.",
      timeEstimate: "1-2 minutes",
    },
    seo_update: {
      title: "Update Existing Content",
      description: "Refreshes an article with new GEO signals",
      whatItDoes:
        "The agent will analyze one of your existing articles and add fresh citations, statistics, and structured data to improve its chances of being cited by AI engines.",
      timeEstimate: "2-3 minutes",
    },
  };

  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);

  // Per-type form state for Create Task. Scoped by taskType — switching
  // task type resets relevant fields via setSelectedTaskType handlers.
  const [cgKeywords, setCgKeywords] = useState("");
  const [cgIndustry, setCgIndustry] = useState("");
  const [cgContentType, setCgContentType] = useState("article");
  const [cgTargetCustomers, setCgTargetCustomers] = useState("");
  const [cgGeography, setCgGeography] = useState("");
  const [cgContentStyle, setCgContentStyle] = useState("professional");

  const [orTargetDomain, setOrTargetDomain] = useState("");
  const [orRecipientEmail, setOrRecipientEmail] = useState("");
  const [orPitchAngle, setOrPitchAngle] = useState("");
  const [orEmailType, setOrEmailType] = useState<string>("initial");

  const [ptPromptIds, setPtPromptIds] = useState<string[]>([]);

  const [saLimit, setSaLimit] = useState<number>(25);

  const [hrHallucinationId, setHrHallucinationId] = useState("");

  const [seoArticleId, setSeoArticleId] = useState("");

  // Supporting queries for the sub-forms. All are brand-scoped and
  // disabled until a brand is selected.
  const { data: brandPromptsData } = useQuery<{ data: Array<{ id: string; prompt: string }> }>({
    queryKey: ["/api/brand-prompts", selectedBrandId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${selectedBrandId}`);
      return r.json();
    },
    enabled: !!selectedBrandId && selectedTaskType === "prompt_test",
  });
  const brandPrompts = brandPromptsData?.data || [];

  const { data: hallucinationsData } = useQuery<{
    data: Array<{ id: string; claimedStatement: string; severity: string }>;
  }>({
    queryKey: ["/api/hallucinations", { brandId: selectedBrandId }],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/hallucinations?brandId=${selectedBrandId}`);
      return r.json();
    },
    enabled: !!selectedBrandId && selectedTaskType === "hallucination_remediation",
  });
  const hallucinations = hallucinationsData?.data || [];

  const { data: articlesData } = useQuery<{
    data: Array<{ id: string; title: string }>;
  }>({
    queryKey: ["/api/articles", { brandId: selectedBrandId }],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/articles?brandId=${selectedBrandId}`);
      return r.json();
    },
    enabled: !!selectedBrandId && selectedTaskType === "seo_update",
  });
  const articleList = articlesData?.data || [];

  const resetTaskForm = () => {
    setCgKeywords("");
    setCgIndustry("");
    setCgContentType("article");
    setCgTargetCustomers("");
    setCgGeography("");
    setCgContentStyle("professional");
    setOrTargetDomain("");
    setOrRecipientEmail("");
    setOrPitchAngle("");
    setOrEmailType("initial");
    setPtPromptIds([]);
    setSaLimit(25);
    setHrHallucinationId("");
    setSeoArticleId("");
  };

  const buildInputData = (taskType: string): Record<string, unknown> => {
    switch (taskType) {
      case "content_generation":
        return {
          keywords: cgKeywords
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          industry: cgIndustry || selectedBrand?.industry || "general",
          contentType: cgContentType,
          targetCustomers: cgTargetCustomers || undefined,
          geography: cgGeography || undefined,
          contentStyle: cgContentStyle,
        };
      case "outreach":
        return {
          targetDomain: orTargetDomain || undefined,
          recipientEmail: orRecipientEmail,
          pitchAngle: orPitchAngle || undefined,
          emailType: orEmailType,
        };
      case "prompt_test":
        return ptPromptIds.length > 0 ? { promptIds: ptPromptIds } : {};
      case "source_analysis":
        return { limit: saLimit };
      case "hallucination_remediation":
        return { hallucinationId: hrHallucinationId };
      case "seo_update":
        return { articleId: seoArticleId };
      default:
        return {};
    }
  };

  const isFormValid = (taskType: string): boolean => {
    switch (taskType) {
      case "outreach":
        return /.+@.+\..+/.test(orRecipientEmail.trim());
      case "hallucination_remediation":
        return hrHallucinationId.length > 0;
      case "seo_update":
        return seoArticleId.length > 0;
      default:
        return true;
    }
  };

  return (
    <>
      <Helmet>
        <title>GEO AI Agent - Automation Dashboard | GEO Platform</title>
        <meta
          name="description"
          content="Manage automated GEO optimization tasks, outreach campaigns, and AI-powered workflows."
        />
      </Helmet>

      <div className="space-y-8">
        <PageHeader
          title="AI Agent"
          description="Autonomous GEO optimization with intelligent automation"
          actions={brands.length > 0 ? <BrandSelector /> : null}
        />

        {!selectedBrandId ? (
          <Card className="text-center py-12">
            <CardContent>
              <Bot className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Select a Brand to Start</h3>
              <p className="text-muted-foreground">
                Choose a brand above to view and manage AI agent tasks
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Queued Tasks
                    </span>
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p
                    className="text-3xl font-semibold text-foreground tracking-tight"
                    data-testid="stat-queued"
                  >
                    {taskStats?.queued || 0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      In Progress
                    </span>
                    <Activity className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p
                    className="text-3xl font-semibold text-foreground tracking-tight"
                    data-testid="stat-in-progress"
                  >
                    {taskStats?.inProgress || 0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Completed
                    </span>
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p
                    className="text-3xl font-semibold text-foreground tracking-tight"
                    data-testid="stat-completed"
                  >
                    {taskStats?.completed || 0}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Tokens Used
                    </span>
                    <Sparkles className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p
                    className="text-3xl font-semibold text-foreground tracking-tight"
                    data-testid="stat-tokens"
                  >
                    {(taskStats?.totalTokensUsed || 0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6" data-testid="tabs-navigation">
                <TabsTrigger
                  value="workflows"
                  className="flex items-center gap-2"
                  data-testid="tab-workflows"
                >
                  <Workflow className="w-4 h-4" /> Workflows
                </TabsTrigger>
                <TabsTrigger
                  value="tasks"
                  className="flex items-center gap-2"
                  data-testid="tab-tasks"
                >
                  <ListTodo className="w-4 h-4" /> Task Queue
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="flex items-center gap-2"
                  data-testid="tab-history"
                >
                  <History className="w-4 h-4" /> Runs History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="workflows" className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {WORKFLOWS.map((wf) => (
                    <Card key={wf.key} className="flex flex-col">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          {wf.mode === "scheduled" ? (
                            <Calendar className="w-5 h-5 text-primary" />
                          ) : (
                            <Sparkles className="w-5 h-5 text-primary" />
                          )}
                          {wf.name}
                        </CardTitle>
                        <CardDescription className="text-sm leading-relaxed">
                          {wf.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto space-y-2">
                        {wf.mode === "scheduled" && (
                          <p className="text-xs text-muted-foreground">
                            Next scheduled run: Monday 06:00 UTC
                          </p>
                        )}
                        <Button
                          className="w-full"
                          variant={wf.mode === "scheduled" ? "outline" : "default"}
                          onClick={() => {
                            setStartWorkflow(wf);
                            setStartPromptId("");
                            setStartArticleId("");
                          }}
                          data-testid={`button-workflow-${wf.key}`}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          {wf.mode === "scheduled" ? "Run now" : "Start"}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Active runs</h3>
                  {activeRuns.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-sm text-muted-foreground">
                        No active workflows. Kick one off above.
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {activeRuns.map((run) => {
                        const def = workflowByKey(run.workflowKey);
                        const needsReview = run.status === "awaiting_approval";
                        return (
                          <Card key={run.id}>
                            <CardContent className="p-4 flex items-center justify-between gap-4">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                  <Workflow className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">
                                    {def?.name || run.workflowKey}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Started {relativeTime(run.createdAt)} · Step{" "}
                                    {(run.currentStepIndex ?? 0) + 1}/{def?.totalSteps ?? "?"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {runStatusBadge(run.status)}
                                <Link href={`/agent/runs/${run.id}`}>
                                  <Button variant={needsReview ? "default" : "outline"} size="sm">
                                    {needsReview ? "Review" : "View"}
                                    <ArrowRight className="w-3 h-3 ml-1" />
                                  </Button>
                                </Link>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="tasks">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Task Queue</CardTitle>
                        <CardDescription>
                          AI agent tasks for automated GEO optimization
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Select value={taskFilter} onValueChange={setTaskFilter}>
                          <SelectTrigger className="w-40" data-testid="select-task-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Tasks</SelectItem>
                            <SelectItem value="queued">Queued</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() => setShowCreateTask(true)}
                          data-testid="button-create-task"
                        >
                          <Plus className="w-4 h-4 mr-2" /> Create Task
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {showCreateTask && (
                      <Card className="mb-6 border-2 border-primary/20 bg-primary/5">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-primary" />
                              Choose a Task for the AI Agent
                            </CardTitle>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowCreateTask(false);
                                setSelectedTaskType(null);
                                resetTaskForm();
                              }}
                              data-testid="button-cancel-task"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Select what you want the AI to do for{" "}
                            {selectedBrand?.name || "your brand"}
                          </p>
                        </CardHeader>
                        <CardContent>
                          {!selectedTaskType ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {Object.entries(taskTypeInfo).map(([key, info]) => (
                                <button
                                  key={key}
                                  onClick={() => setSelectedTaskType(key)}
                                  className="text-left p-4 rounded-lg border-2 border-transparent bg-card hover:border-primary/50 hover:bg-primary/5 transition-all"
                                  data-testid={`task-option-${key}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                      {getTaskTypeIcon(key)}
                                    </div>
                                    <div>
                                      <h4 className="font-medium text-foreground">{info.title}</h4>
                                      <p className="text-sm text-muted-foreground mt-0.5">
                                        {info.description}
                                      </p>
                                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> ~{info.timeEstimate}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="p-4 bg-card rounded-lg border">
                                <div className="flex items-start gap-3">
                                  <div className="p-3 rounded-lg bg-primary/10 text-primary">
                                    {getTaskTypeIcon(selectedTaskType)}
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-lg">
                                      {taskTypeInfo[selectedTaskType].title}
                                    </h4>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {taskTypeInfo[selectedTaskType].whatItDoes}
                                    </p>
                                    <div className="flex items-center gap-4 mt-3 text-sm">
                                      <span className="flex items-center gap-1 text-primary">
                                        <Clock className="w-4 h-4" /> Estimated time:{" "}
                                        {taskTypeInfo[selectedTaskType].timeEstimate}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Per-type sub-forms. inputData is collected
                              here and passed verbatim to POST /api/agent-tasks.
                              Validation is client-side only — the Zod schema
                              on the server is the source of truth. */}
                              <div className="p-4 bg-card rounded-lg border space-y-4">
                                {selectedTaskType === "content_generation" && (
                                  <>
                                    <div>
                                      <Label htmlFor="cg-keywords">
                                        Keywords (comma-separated)
                                      </Label>
                                      <Input
                                        id="cg-keywords"
                                        value={cgKeywords}
                                        onChange={(e) => setCgKeywords(e.target.value)}
                                        placeholder="ai citation platform, geo tool, brand visibility"
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor="cg-industry">Industry</Label>
                                        <Input
                                          id="cg-industry"
                                          value={cgIndustry}
                                          onChange={(e) => setCgIndustry(e.target.value)}
                                          placeholder={selectedBrand?.industry || "general"}
                                        />
                                      </div>
                                      <div>
                                        <Label>Content type</Label>
                                        <Select
                                          value={cgContentType}
                                          onValueChange={setCgContentType}
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="article">Article</SelectItem>
                                            <SelectItem value="guide">Guide</SelectItem>
                                            <SelectItem value="comparison">Comparison</SelectItem>
                                            <SelectItem value="faq">FAQ</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor="cg-customers">Target customers</Label>
                                        <Input
                                          id="cg-customers"
                                          value={cgTargetCustomers}
                                          onChange={(e) => setCgTargetCustomers(e.target.value)}
                                          placeholder="B2B SaaS founders"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="cg-geo">Geography</Label>
                                        <Input
                                          id="cg-geo"
                                          value={cgGeography}
                                          onChange={(e) => setCgGeography(e.target.value)}
                                          placeholder="US, global"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <Label>Content style</Label>
                                      <Select
                                        value={cgContentStyle}
                                        onValueChange={setCgContentStyle}
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="professional">Professional</SelectItem>
                                          <SelectItem value="conversational">
                                            Conversational
                                          </SelectItem>
                                          <SelectItem value="technical">Technical</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </>
                                )}

                                {selectedTaskType === "outreach" && (
                                  <>
                                    <div>
                                      <Label htmlFor="or-domain">Target domain</Label>
                                      <Input
                                        id="or-domain"
                                        value={orTargetDomain}
                                        onChange={(e) => setOrTargetDomain(e.target.value)}
                                        placeholder="techcrunch.com"
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="or-email">
                                        Recipient email <span className="text-destructive">*</span>
                                      </Label>
                                      <Input
                                        id="or-email"
                                        type="email"
                                        value={orRecipientEmail}
                                        onChange={(e) => setOrRecipientEmail(e.target.value)}
                                        placeholder="editor@example.com"
                                      />
                                      {orRecipientEmail && !/.+@.+\..+/.test(orRecipientEmail) && (
                                        <p className="text-xs text-destructive mt-1">
                                          Must be a valid email address
                                        </p>
                                      )}
                                    </div>
                                    <div>
                                      <Label htmlFor="or-pitch">Pitch angle</Label>
                                      <Textarea
                                        id="or-pitch"
                                        value={orPitchAngle}
                                        onChange={(e) => setOrPitchAngle(e.target.value)}
                                        placeholder="Why this publication's audience should hear from us"
                                        rows={3}
                                      />
                                    </div>
                                    <div>
                                      <Label>Email type</Label>
                                      <Select value={orEmailType} onValueChange={setOrEmailType}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="initial">Guest post</SelectItem>
                                          <SelectItem value="follow_up">Press release</SelectItem>
                                          <SelectItem value="reply">Partnership</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </>
                                )}

                                {selectedTaskType === "prompt_test" && (
                                  <div>
                                    <Label>
                                      Prompts to test (leave empty to run all tracked prompts)
                                    </Label>
                                    <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2 mt-1">
                                      {brandPrompts.length === 0 ? (
                                        <p className="text-sm text-muted-foreground p-2">
                                          No tracked prompts for this brand yet.
                                        </p>
                                      ) : (
                                        brandPrompts.map((p) => (
                                          <label
                                            key={p.id}
                                            className="flex items-start gap-2 text-sm p-1 hover:bg-muted/50 rounded cursor-pointer"
                                          >
                                            <Checkbox
                                              checked={ptPromptIds.includes(p.id)}
                                              onCheckedChange={(checked) =>
                                                setPtPromptIds((prev) =>
                                                  checked
                                                    ? [...prev, p.id]
                                                    : prev.filter((x) => x !== p.id),
                                                )
                                              }
                                            />
                                            <span className="flex-1">{p.prompt}</span>
                                          </label>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )}

                                {selectedTaskType === "source_analysis" && (
                                  <div>
                                    <Label>Max sources to return: {saLimit}</Label>
                                    <Slider
                                      min={10}
                                      max={100}
                                      step={5}
                                      value={[saLimit]}
                                      onValueChange={(v) => setSaLimit(v[0] ?? 25)}
                                      className="mt-2"
                                    />
                                  </div>
                                )}

                                {selectedTaskType === "hallucination_remediation" && (
                                  <div>
                                    <Label>
                                      Select hallucination{" "}
                                      <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                      value={hrHallucinationId}
                                      onValueChange={setHrHallucinationId}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Choose a detected hallucination" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {hallucinations.length === 0 ? (
                                          <SelectItem value="__none" disabled>
                                            No detected hallucinations
                                          </SelectItem>
                                        ) : (
                                          hallucinations.map((h) => (
                                            <SelectItem key={h.id} value={h.id}>
                                              [{h.severity}] {h.claimedStatement.slice(0, 80)}
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}

                                {selectedTaskType === "seo_update" && (
                                  <div>
                                    <Label>
                                      Article to refresh <span className="text-destructive">*</span>
                                    </Label>
                                    <Select value={seoArticleId} onValueChange={setSeoArticleId}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Choose an article" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {articleList.length === 0 ? (
                                          <SelectItem value="__none" disabled>
                                            No articles yet
                                          </SelectItem>
                                        ) : (
                                          articleList.map((a) => (
                                            <SelectItem key={a.id} value={a.id}>
                                              {a.title}
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-3">
                                <Button
                                  variant="outline"
                                  onClick={() => setSelectedTaskType(null)}
                                  className="flex-1"
                                >
                                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                                </Button>
                                <Button
                                  onClick={() => {
                                    const t = selectedTaskType;
                                    createTaskMutation.mutate({
                                      taskType: t,
                                      taskTitle: taskTypeInfo[t].title,
                                      taskDescription: taskTypeInfo[t].description,
                                      priority: "medium",
                                      inputData: buildInputData(t),
                                    });
                                    setSelectedTaskType(null);
                                    resetTaskForm();
                                  }}
                                  disabled={
                                    createTaskMutation.isPending ||
                                    !!executingTaskId ||
                                    !isFormValid(selectedTaskType)
                                  }
                                  className="flex-1 bg-primary hover:bg-primary/90"
                                  data-testid="button-confirm-task"
                                >
                                  {createTaskMutation.isPending || !!executingTaskId ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running
                                      Task...
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4 mr-2" /> Start This Task
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {tasksLoading ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                      </div>
                    ) : tasks.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Bot className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <h3 className="text-lg font-medium text-foreground mb-2">No Tasks Yet</h3>
                        <p className="text-sm mb-4">
                          Click "Create Task" above to assign work to the AI agent
                        </p>
                        <Button
                          onClick={() => setShowCreateTask(true)}
                          variant="outline"
                          data-testid="button-create-task-empty"
                        >
                          <Plus className="w-4 h-4 mr-2" /> Create Your First Task
                        </Button>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                          {tasks.map((task) => {
                            const info = taskTypeInfo[task.taskType];
                            return (
                              <div
                                key={task.id}
                                className={`p-4 border rounded-lg transition-colors ${
                                  task.status === "in_progress"
                                    ? "border-yellow-300 bg-yellow-50"
                                    : task.status === "completed"
                                      ? "border-green-200 bg-green-50/50"
                                      : task.status === "failed"
                                        ? "border-red-200 bg-red-50/50"
                                        : "hover:bg-muted/50"
                                }`}
                                data-testid={`task-item-${task.id}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-4">
                                    <div
                                      className={`p-2 rounded-lg ${
                                        task.status === "in_progress"
                                          ? "bg-yellow-100 text-yellow-700"
                                          : task.status === "completed"
                                            ? "bg-green-100 text-green-700"
                                            : task.status === "failed"
                                              ? "bg-red-100 text-red-700"
                                              : "bg-primary/10 text-primary"
                                      }`}
                                    >
                                      {task.status === "in_progress" ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                      ) : (
                                        getTaskTypeIcon(task.taskType)
                                      )}
                                    </div>
                                    <div>
                                      <p className="font-medium text-foreground">
                                        {task.taskTitle}
                                      </p>
                                      <p className="text-sm text-muted-foreground mt-0.5">
                                        {task.taskDescription || info?.description || task.taskType}
                                      </p>
                                      {task.status === "in_progress" && (
                                        <div className="mt-2 flex items-center gap-2 text-sm text-yellow-700">
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          <span>
                                            AI is working on this task... This may take a few
                                            minutes.
                                          </span>
                                        </div>
                                      )}
                                      {task.status === "queued" && (
                                        <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                                          <Clock className="w-3 h-3" />
                                          <span>
                                            Waiting to start • Est.{" "}
                                            {info?.timeEstimate || "2-3 min"}
                                          </span>
                                        </div>
                                      )}
                                      {task.status === "completed" && (
                                        <div className="mt-2 space-y-2">
                                          <div className="p-2 bg-green-100 rounded text-sm text-green-800 flex items-center flex-wrap gap-x-3 gap-y-1">
                                            <span>
                                              <CheckCircle className="w-4 h-4 inline mr-1" />
                                              Task completed
                                              {(task as any).tokensUsed > 0 && (
                                                <span className="ml-2 text-green-600">
                                                  ({(task as any).tokensUsed?.toLocaleString()}{" "}
                                                  tokens)
                                                </span>
                                              )}
                                            </span>
                                            {(() => {
                                              const link = getArtifactLink(task);
                                              if (!link) return null;
                                              return (
                                                <Link
                                                  href={link.href}
                                                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                                                  data-testid={`link-artifact-${task.id}`}
                                                >
                                                  <ExternalLink className="w-3 h-3" />
                                                  {link.label}
                                                </Link>
                                              );
                                            })()}
                                          </div>
                                          {(task as any).outputData?.output && (
                                            <div className="p-3 bg-card border rounded-lg text-sm text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                                              {(task as any).outputData.output}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {task.status === "failed" && task.error && (
                                        <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-800">
                                          <strong>Error:</strong> {task.error}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {getStatusBadge(task.status)}
                                    <div className="flex gap-1">
                                      {task.status === "queued" && (
                                        <Button
                                          size="sm"
                                          onClick={() => executeTaskMutation.mutate(task.id)}
                                          disabled={executingTaskId === task.id}
                                          className="bg-primary hover:bg-primary/90"
                                          data-testid={`button-start-${task.id}`}
                                        >
                                          {executingTaskId === task.id ? (
                                            <>
                                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />{" "}
                                              Running...
                                            </>
                                          ) : (
                                            <>
                                              <Play className="w-3 h-3 mr-1" /> Run Now
                                            </>
                                          )}
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-muted-foreground hover:text-red-600"
                                        onClick={() => deleteTaskMutation.mutate(task.id)}
                                        data-testid={`button-delete-${task.id}`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <Card>
                  <CardHeader>
                    <CardTitle>Runs History</CardTitle>
                    <CardDescription>
                      All workflow runs for this brand, newest first.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {allRunsLoading ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                      </div>
                    ) : allRuns.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <History className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p>No runs yet. Start one from the Workflows tab.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {allRuns.map((run) => {
                          const def = workflowByKey(run.workflowKey);
                          return (
                            <div
                              key={run.id}
                              className="p-4 border rounded-lg flex items-center justify-between gap-4"
                              data-testid={`history-run-${run.id}`}
                            >
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {def?.name || run.workflowKey}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Started {relativeTime(run.createdAt)}
                                  {run.completedAt ? ` · Duration ${durationLabel(run)}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                {runStatusBadge(run.status)}
                                <Link href={`/agent/runs/${run.id}`}>
                                  <Button variant="outline" size="sm">
                                    View <ArrowRight className="w-3 h-3 ml-1" />
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Dialog
        open={!!startWorkflow}
        onOpenChange={(open) => {
          if (!open) setStartWorkflow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start: {startWorkflow?.name}</DialogTitle>
            <DialogDescription>{startWorkflow?.description}</DialogDescription>
          </DialogHeader>

          {startWorkflow?.mode === "prompt" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Tracked prompt</label>
              <Select value={startPromptId} onValueChange={setStartPromptId}>
                <SelectTrigger data-testid="select-workflow-prompt">
                  <SelectValue placeholder="Choose a prompt to target" />
                </SelectTrigger>
                <SelectContent>
                  {trackedPrompts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.prompt.length > 80 ? `${p.prompt.slice(0, 80)}…` : p.prompt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {trackedPrompts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No tracked prompts yet.{" "}
                  <Link href="/citations" className="text-primary hover:underline">
                    Add some first
                  </Link>
                </p>
              )}
            </div>
          )}

          {startWorkflow?.mode === "article" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Article</label>
              <Select value={startArticleId} onValueChange={setStartArticleId}>
                <SelectTrigger data-testid="select-workflow-article">
                  <SelectValue placeholder="Choose an article to fix" />
                </SelectTrigger>
                <SelectContent>
                  {workflowArticles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {workflowArticles.length === 0 && (
                <p className="text-xs text-muted-foreground">No articles found for this brand.</p>
              )}
            </div>
          )}

          {startWorkflow?.mode === "scheduled" && (
            <p className="text-sm text-muted-foreground">
              This workflow runs automatically every Monday at 06:00 UTC. Click below to trigger it
              now.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStartWorkflow(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleStartSubmit}
              disabled={startWorkflowMutation.isPending}
              data-testid="button-workflow-start-confirm"
            >
              {startWorkflowMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" /> Start
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!openTaskId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenTaskId(null);
            // Clear the ?taskId=… query param so reloading doesn't immediately re-open.
            if (deepLinkTaskId) setLocation("/agent", { replace: true });
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openTask?.taskTitle || "Task"}</DialogTitle>
            <DialogDescription>{openTask?.taskDescription || openTask?.taskType}</DialogDescription>
          </DialogHeader>
          {openTask ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {getStatusBadge(openTask.status)}
                {(openTask as any).priority && getPriorityBadge((openTask as any).priority)}
                {(openTask as any).tokensUsed > 0 && (
                  <Badge variant="outline">
                    {(openTask as any).tokensUsed?.toLocaleString()} tokens
                  </Badge>
                )}
              </div>
              {openTask.status === "failed" && (openTask as any).error && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-red-800">
                  <strong>Error:</strong> {String((openTask as any).error)}
                </div>
              )}
              {(() => {
                const link = getArtifactLink(openTask);
                if (!link) return null;
                return (
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="w-3 h-3" /> {link.label}
                  </Link>
                );
              })()}
              {(() => {
                const out = (openTask as any).outputData as Record<string, unknown> | undefined;
                if (!out) return null;
                // Render only known-safe scalar fields as text. The JSON dump is
                // stringified so any LLM-supplied HTML stays inert (no
                // dangerouslySetInnerHTML anywhere in this panel).
                const safeFields: Array<[string, unknown]> = [];
                for (const key of [
                  "jobId",
                  "runId",
                  "articleId",
                  "emailId",
                  "hallucinationId",
                  "action",
                ]) {
                  const v = out[key];
                  if (typeof v === "string" || typeof v === "number") safeFields.push([key, v]);
                }
                return (
                  <div className="space-y-2">
                    {safeFields.length > 0 && (
                      <div className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        {safeFields.map(([k, v]) => (
                          <div key={String(k)} className="contents">
                            <span className="text-muted-foreground">{String(k)}</span>
                            <span className="font-mono break-all">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {typeof out.output === "string" && (
                      <pre className="p-2 bg-muted rounded text-xs whitespace-pre-wrap max-h-64 overflow-auto">
                        {out.output}
                      </pre>
                    )}
                  </div>
                );
              })()}
              {(openTask as any).workflowRunId && (
                <Link
                  href={`/agent/runs/${(openTask as any).workflowRunId}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Workflow className="w-3 h-3" /> View parent workflow run
                </Link>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading task…
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTaskId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
