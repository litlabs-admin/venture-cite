import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet";
import { Link } from "wouter";
import type { Brand, AgentTask, AutomationRule, OutreachCampaign, AutomationExecution } from "@shared/schema";
import {
  Bot,
  Zap,
  ListTodo,
  Mail,
  ArrowLeft,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  TrendingUp,
  Target,
  Sparkles,
  FileText,
  Send,
  ExternalLink,
  Loader2,
  Activity,
  BarChart3
} from "lucide-react";

export default function AgentDashboard() {
  const { toast } = useToast();
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("tasks");
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateRule, setShowCreateRule] = useState(false);

  const { data: brandsData } = useQuery<{ data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsData?.data || [];
  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  const { data: tasksData, isLoading: tasksLoading } = useQuery<{ data: AgentTask[] }>({
    queryKey: ["/api/agent-tasks", { brandId: selectedBrandId, status: taskFilter !== "all" ? taskFilter : undefined }],
  });

  const { data: taskStatsData } = useQuery<{ data: { queued: number; inProgress: number; completed: number; failed: number; totalTokensUsed: number } }>({
    queryKey: ["/api/agent-tasks/stats", { brandId: selectedBrandId }],
    enabled: !!selectedBrandId,
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ data: AutomationRule[] }>({
    queryKey: ["/api/automation-rules", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const { data: outreachData, isLoading: outreachLoading } = useQuery<{ data: OutreachCampaign[] }>({
    queryKey: ["/api/outreach-campaigns", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const { data: outreachStatsData } = useQuery<{ data: { total: number; byStatus: Record<string, number>; successRate: number } }>({
    queryKey: ["/api/outreach-campaigns/stats", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const tasks = tasksData?.data || [];
  const taskStats = taskStatsData?.data;
  const rules = rulesData?.data || [];
  const outreachCampaigns = outreachData?.data || [];
  const outreachStats = outreachStatsData?.data;

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
        toast({ title: "Task failed", description: data.error || "An error occurred", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tasks/stats"] });
    },
    onError: () => {
      setExecutingTaskId(null);
      toast({ title: "Failed to execute task", variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { taskType: string; taskTitle: string; taskDescription?: string; priority?: string }) => {
      const response = await apiRequest("POST", "/api/agent-tasks", {
        brandId: selectedBrandId,
        triggeredBy: "manual",
        ...data,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Task created - running now..." });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tasks"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tasks"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/agent-tasks"] });
    },
    onError: () => toast({ title: "Failed to delete task", variant: "destructive" }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: number }) => {
      const response = await apiRequest("PATCH", `/api/automation-rules/${id}`, { isEnabled });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Rule updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/automation-rules"] });
    },
    onError: () => toast({ title: "Failed to update rule", variant: "destructive" }),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "queued": return <Badge variant="outline" className="bg-blue-50 text-blue-700" data-testid="badge-status-queued"><Clock className="w-3 h-3 mr-1" />Queued</Badge>;
      case "in_progress": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700" data-testid="badge-status-progress"><Loader2 className="w-3 h-3 mr-1 animate-spin" />In Progress</Badge>;
      case "completed": return <Badge variant="outline" className="bg-green-50 text-green-700" data-testid="badge-status-completed"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case "failed": return <Badge variant="outline" className="bg-red-50 text-red-700" data-testid="badge-status-failed"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent": return <Badge className="bg-red-500">Urgent</Badge>;
      case "high": return <Badge className="bg-orange-500">High</Badge>;
      case "medium": return <Badge className="bg-blue-500">Medium</Badge>;
      case "low": return <Badge className="bg-gray-500">Low</Badge>;
      default: return <Badge>{priority}</Badge>;
    }
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case "content_generation": return <FileText className="w-4 h-4" />;
      case "outreach": return <Mail className="w-4 h-4" />;
      case "prompt_test": return <Target className="w-4 h-4" />;
      case "source_analysis": return <BarChart3 className="w-4 h-4" />;
      case "hallucination_remediation": return <AlertTriangle className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  const taskTypeInfo: Record<string, { title: string; description: string; whatItDoes: string; timeEstimate: string }> = {
    content_generation: {
      title: "Generate AI-Optimized Article",
      description: "Creates a 1500+ word article optimized for AI search engines",
      whatItDoes: "The agent will analyze your brand profile, identify a high-value keyword, and generate a comprehensive article designed to be cited by ChatGPT, Claude, and other AI platforms.",
      timeEstimate: "2-3 minutes"
    },
    outreach: {
      title: "Draft Outreach Email",
      description: "Creates a personalized pitch email for a publication",
      whatItDoes: "The agent will review your brand and select a relevant publication, then draft a professional guest post or PR pitch email tailored to that publication's audience.",
      timeEstimate: "1-2 minutes"
    },
    prompt_test: {
      title: "Test AI Citation",
      description: "Checks if AI engines currently cite your brand",
      whatItDoes: "The agent will query ChatGPT, Claude, and Perplexity with industry-relevant questions to see if they mention your brand. Results show where you're being cited and where you're missing.",
      timeEstimate: "1-2 minutes"
    },
    source_analysis: {
      title: "Analyze Competitor Sources",
      description: "Finds what sources AI engines cite for your keywords",
      whatItDoes: "The agent will research which websites and publications AI search engines trust for your industry topics, helping you identify high-priority outreach targets.",
      timeEstimate: "2-3 minutes"
    },
    hallucination_remediation: {
      title: "Fix AI Hallucinations",
      description: "Addresses incorrect information AI may have about your brand",
      whatItDoes: "The agent will identify any false or outdated claims AI engines make about your brand and create correction content to help fix the record.",
      timeEstimate: "3-5 minutes"
    },
    seo_update: {
      title: "Update Existing Content",
      description: "Refreshes an article with new GEO signals",
      whatItDoes: "The agent will analyze one of your existing articles and add fresh citations, statistics, and structured data to improve its chances of being cited by AI engines.",
      timeEstimate: "2-3 minutes"
    }
  };

  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);

  return (
    <>
      <Helmet>
        <title>GEO AI Agent - Automation Dashboard | GEO Platform</title>
        <meta name="description" content="Manage automated GEO optimization tasks, outreach campaigns, and AI-powered workflows." />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
                  <Bot className="w-8 h-8 text-purple-600" />
                  GEO AI Agent
                </h1>
                <p className="text-muted-foreground mt-1">Autonomous GEO optimization with intelligent automation</p>
              </div>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger className="w-64" data-testid="select-brand">
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id} data-testid={`select-brand-${brand.id}`}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedBrandId ? (
            <Card className="text-center py-12">
              <CardContent>
                <Bot className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Brand to Start</h3>
                <p className="text-muted-foreground">Choose a brand above to view and manage AI agent tasks</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-blue-100 text-sm">Queued Tasks</p>
                        <p className="text-3xl font-bold" data-testid="stat-queued">{taskStats?.queued || 0}</p>
                      </div>
                      <Clock className="w-8 h-8 text-blue-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-yellow-100 text-sm">In Progress</p>
                        <p className="text-3xl font-bold" data-testid="stat-in-progress">{taskStats?.inProgress || 0}</p>
                      </div>
                      <Activity className="w-8 h-8 text-yellow-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-500 to-emerald-500 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-green-100 text-sm">Completed</p>
                        <p className="text-3xl font-bold" data-testid="stat-completed">{taskStats?.completed || 0}</p>
                      </div>
                      <CheckCircle className="w-8 h-8 text-green-200" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-500 to-violet-500 text-white">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-purple-100 text-sm">Tokens Used</p>
                        <p className="text-3xl font-bold" data-testid="stat-tokens">{(taskStats?.totalTokensUsed || 0).toLocaleString()}</p>
                      </div>
                      <Sparkles className="w-8 h-8 text-purple-200" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6" data-testid="tabs-navigation">
                  <TabsTrigger value="tasks" className="flex items-center gap-2" data-testid="tab-tasks">
                    <ListTodo className="w-4 h-4" /> Task Queue
                  </TabsTrigger>
                  <TabsTrigger value="automation" className="flex items-center gap-2" data-testid="tab-automation">
                    <Zap className="w-4 h-4" /> Automation Rules
                  </TabsTrigger>
                  <TabsTrigger value="outreach" className="flex items-center gap-2" data-testid="tab-outreach">
                    <Mail className="w-4 h-4" /> Outreach
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tasks">
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle>Task Queue</CardTitle>
                          <CardDescription>AI agent tasks for automated GEO optimization</CardDescription>
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
                          <Button onClick={() => setShowCreateTask(true)} data-testid="button-create-task">
                            <Plus className="w-4 h-4 mr-2" /> Create Task
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {showCreateTask && (
                        <Card className="mb-6 border-2 border-purple-200 bg-purple-50/50">
                          <CardHeader className="pb-3">
                            <div className="flex justify-between items-center">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-600" />
                                Choose a Task for the AI Agent
                              </CardTitle>
                              <Button variant="ghost" size="sm" onClick={() => { setShowCreateTask(false); setSelectedTaskType(null); }} data-testid="button-cancel-task">
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-sm text-muted-foreground">Select what you want the AI to do for {selectedBrand?.name || "your brand"}</p>
                          </CardHeader>
                          <CardContent>
                            {!selectedTaskType ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(taskTypeInfo).map(([key, info]) => (
                                  <button
                                    key={key}
                                    onClick={() => setSelectedTaskType(key)}
                                    className="text-left p-4 rounded-lg border-2 border-transparent bg-white hover:border-purple-300 hover:bg-purple-50 transition-all"
                                    data-testid={`task-option-${key}`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                                        {getTaskTypeIcon(key)}
                                      </div>
                                      <div>
                                        <h4 className="font-medium text-slate-900">{info.title}</h4>
                                        <p className="text-sm text-slate-600 mt-0.5">{info.description}</p>
                                        <p className="text-xs text-purple-600 mt-1 flex items-center gap-1">
                                          <Clock className="w-3 h-3" /> ~{info.timeEstimate}
                                        </p>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="p-4 bg-white rounded-lg border">
                                  <div className="flex items-start gap-3">
                                    <div className="p-3 rounded-lg bg-purple-100 text-purple-600">
                                      {getTaskTypeIcon(selectedTaskType)}
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="font-semibold text-lg">{taskTypeInfo[selectedTaskType].title}</h4>
                                      <p className="text-sm text-slate-600 mt-1">{taskTypeInfo[selectedTaskType].whatItDoes}</p>
                                      <div className="flex items-center gap-4 mt-3 text-sm">
                                        <span className="flex items-center gap-1 text-purple-600">
                                          <Clock className="w-4 h-4" /> Estimated time: {taskTypeInfo[selectedTaskType].timeEstimate}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
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
                                      createTaskMutation.mutate({ 
                                        taskType: selectedTaskType, 
                                        taskTitle: taskTypeInfo[selectedTaskType].title,
                                        taskDescription: taskTypeInfo[selectedTaskType].description,
                                        priority: "medium" 
                                      });
                                      setSelectedTaskType(null);
                                    }}
                                    disabled={createTaskMutation.isPending || !!executingTaskId}
                                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                                    data-testid="button-confirm-task"
                                  >
                                    {createTaskMutation.isPending || !!executingTaskId ? (
                                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Task...</>
                                    ) : (
                                      <><Play className="w-4 h-4 mr-2" /> Start This Task</>
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
                          <h3 className="text-lg font-medium text-slate-700 mb-2">No Tasks Yet</h3>
                          <p className="text-sm mb-4">Click "Create Task" above to assign work to the AI agent</p>
                          <Button onClick={() => setShowCreateTask(true)} variant="outline" data-testid="button-create-task-empty">
                            <Plus className="w-4 h-4 mr-2" /> Create Your First Task
                          </Button>
                        </div>
                      ) : (
                        <ScrollArea className="h-[400px]">
                          <div className="space-y-3">
                            {tasks.map(task => {
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
                                      <div className={`p-2 rounded-lg ${
                                        task.status === "in_progress" ? "bg-yellow-100 text-yellow-700" :
                                        task.status === "completed" ? "bg-green-100 text-green-700" :
                                        task.status === "failed" ? "bg-red-100 text-red-700" :
                                        "bg-purple-100 text-purple-600"
                                      }`}>
                                        {task.status === "in_progress" ? (
                                          <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                          getTaskTypeIcon(task.taskType)
                                        )}
                                      </div>
                                      <div>
                                        <p className="font-medium text-slate-900">{task.taskTitle}</p>
                                        <p className="text-sm text-slate-600 mt-0.5">{task.taskDescription || info?.description || task.taskType}</p>
                                        {task.status === "in_progress" && (
                                          <div className="mt-2 flex items-center gap-2 text-sm text-yellow-700">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span>AI is working on this task... This may take a few minutes.</span>
                                          </div>
                                        )}
                                        {task.status === "queued" && (
                                          <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                                            <Clock className="w-3 h-3" />
                                            <span>Waiting to start • Est. {info?.timeEstimate || "2-3 min"}</span>
                                          </div>
                                        )}
                                        {task.status === "completed" && (
                                          <div className="mt-2 space-y-2">
                                            <div className="p-2 bg-green-100 rounded text-sm text-green-800">
                                              <CheckCircle className="w-4 h-4 inline mr-1" /> Task completed successfully
                                              {(task as any).tokensUsed > 0 && (
                                                <span className="ml-2 text-green-600">({(task as any).tokensUsed?.toLocaleString()} tokens)</span>
                                              )}
                                            </div>
                                            {(task as any).outputData?.output && (
                                              <details className="group">
                                                <summary className="cursor-pointer text-sm font-medium text-purple-700 hover:text-purple-900 flex items-center gap-1">
                                                  <FileText className="w-3 h-3" /> View Results
                                                </summary>
                                                <div className="mt-2 p-3 bg-white border rounded-lg text-sm text-slate-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                                                  {(task as any).outputData.output}
                                                </div>
                                              </details>
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
                                            className="bg-purple-600 hover:bg-purple-700"
                                            data-testid={`button-start-${task.id}`}
                                          >
                                            {executingTaskId === task.id ? (
                                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running...</>
                                            ) : (
                                              <><Play className="w-3 h-3 mr-1" /> Run Now</>
                                            )}
                                          </Button>
                                        )}
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="text-slate-400 hover:text-red-600" 
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

                <TabsContent value="automation">
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle>Automation Rules</CardTitle>
                          <CardDescription>Configure automated workflows triggered by events</CardDescription>
                        </div>
                        <Button onClick={() => setShowCreateRule(true)} data-testid="button-create-rule">
                          <Plus className="w-4 h-4 mr-2" /> Create Rule
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {rulesLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                        </div>
                      ) : rules.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>No automation rules configured yet</p>
                          <p className="text-sm">Create rules to automate GEO optimization tasks</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {rules.map(rule => (
                            <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`rule-item-${rule.id}`}>
                              <div className="flex items-center gap-4">
                                <Switch 
                                  checked={rule.isEnabled === 1}
                                  onCheckedChange={(checked) => toggleRuleMutation.mutate({ id: rule.id, isEnabled: checked ? 1 : 0 })}
                                  data-testid={`switch-rule-${rule.id}`}
                                />
                                <div>
                                  <p className="font-medium">{rule.ruleName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    When: {rule.triggerType} → Action: {rule.actionType}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{rule.executionCount} runs</Badge>
                                <Button size="sm" variant="ghost" data-testid={`button-settings-${rule.id}`}>
                                  <Settings className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="outreach">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Campaigns</p>
                            <p className="text-2xl font-bold" data-testid="stat-total-campaigns">{outreachStats?.total || 0}</p>
                          </div>
                          <Mail className="w-8 h-8 text-blue-500" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Success Rate</p>
                            <p className="text-2xl font-bold" data-testid="stat-success-rate">{((outreachStats?.successRate || 0) * 100).toFixed(0)}%</p>
                          </div>
                          <TrendingUp className="w-8 h-8 text-green-500" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Accepted</p>
                            <p className="text-2xl font-bold" data-testid="stat-accepted">{outreachStats?.byStatus?.accepted || 0}</p>
                          </div>
                          <CheckCircle className="w-8 h-8 text-emerald-500" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle>Outreach Campaigns</CardTitle>
                          <CardDescription>Track publication outreach for citation building</CardDescription>
                        </div>
                        <Link href="/outreach">
                          <Button data-testid="button-manage-outreach">
                            <ExternalLink className="w-4 h-4 mr-2" /> Manage Outreach
                          </Button>
                        </Link>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {outreachLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                        </div>
                      ) : outreachCampaigns.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Send className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p>No outreach campaigns yet</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {outreachCampaigns.slice(0, 5).map(campaign => (
                            <div key={campaign.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`campaign-item-${campaign.id}`}>
                              <div>
                                <p className="font-medium">{campaign.campaignName}</p>
                                <p className="text-sm text-muted-foreground">{campaign.targetDomain}</p>
                              </div>
                              <Badge variant={campaign.status === "accepted" ? "default" : "outline"}>
                                {campaign.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </>
  );
}
