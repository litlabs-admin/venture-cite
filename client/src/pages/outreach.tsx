import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet";
import { Link } from "wouter";
import type { Brand, OutreachCampaign, PublicationTarget, OutreachEmail } from "@shared/schema";
import {
  Mail,
  ArrowLeft,
  Plus,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  ExternalLink,
  Trash2,
  Edit,
  RefreshCw,
  Globe,
  TrendingUp,
  Target,
  Sparkles,
  Loader2,
  FileText,
  Search,
  Building2,
  UserSearch,
  MailPlus,
  Eye,
  MousePointer,
  Reply,
  AlertCircle
} from "lucide-react";

export default function Outreach() {
  const { toast } = useToast();
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<PublicationTarget | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    campaignName: "",
    campaignType: "guest_post",
    targetDomain: "",
    targetContactEmail: "",
    targetContactName: "",
    pitchAngle: "",
    proposedTopic: "",
  });
  const [newEmail, setNewEmail] = useState({
    subject: "",
    body: "",
    emailType: "initial" as string,
  });

  const { data: brandsData } = useQuery<{ data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsData?.data || [];
  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  const { data: campaignsData, isLoading } = useQuery<{ data: OutreachCampaign[] }>({
    queryKey: ["/api/outreach-campaigns", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const { data: statsData } = useQuery<{ data: { total: number; byStatus: Record<string, number>; successRate: number } }>({
    queryKey: ["/api/outreach-campaigns/stats", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const { data: publicationsData, isLoading: pubsLoading } = useQuery<{ data: PublicationTarget[] }>({
    queryKey: ["/api/publication-targets", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const { data: emailsData, isLoading: emailsLoading } = useQuery<{ data: OutreachEmail[] }>({
    queryKey: ["/api/outreach-emails", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const { data: emailStatsData } = useQuery<{ data: { sent: number; opened: number; replied: number; openRate: number; replyRate: number } }>({
    queryKey: ["/api/outreach-emails/stats", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const campaigns = campaignsData?.data || [];
  const stats = statsData?.data;
  const publications = publicationsData?.data || [];
  const emails = emailsData?.data || [];
  const emailStats = emailStatsData?.data;

  const createCampaignMutation = useMutation({
    mutationFn: async (data: typeof newCampaign) => {
      const response = await apiRequest("POST", "/api/outreach-campaigns", {
        brandId: selectedBrandId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Campaign created!" });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-campaigns"] });
      setShowCreateDialog(false);
      setNewCampaign({
        campaignName: "",
        campaignType: "guest_post",
        targetDomain: "",
        targetContactEmail: "",
        targetContactName: "",
        pitchAngle: "",
        proposedTopic: "",
      });
    },
    onError: () => toast({ title: "Failed to create campaign", variant: "destructive" }),
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/outreach-campaigns/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Campaign updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-campaigns"] });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/outreach-campaigns/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Campaign deleted!" });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-campaigns"] });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const generateDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/outreach-campaigns/${id}/generate-draft`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Draft generated with AI!" });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-campaigns"] });
    },
    onError: () => toast({ title: "Failed to generate draft", variant: "destructive" }),
  });

  const discoverPublicationsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/publication-targets/discover", {
        brandId: selectedBrandId,
        industry: selectedBrand?.industry || "technology",
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: `Discovered ${data.data?.length || 0} publications!` });
      queryClient.invalidateQueries({ queryKey: ["/api/publication-targets"] });
    },
    onError: () => toast({ title: "Failed to discover publications", variant: "destructive" }),
  });

  const findContactsMutation = useMutation({
    mutationFn: async (targetId: string) => {
      const response = await apiRequest("POST", `/api/publication-targets/${targetId}/find-contacts`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Contact information found!" });
      queryClient.invalidateQueries({ queryKey: ["/api/publication-targets"] });
    },
    onError: () => toast({ title: "Failed to find contacts", variant: "destructive" }),
  });

  const createEmailMutation = useMutation({
    mutationFn: async (data: { publicationTargetId: string; subject: string; body: string; emailType: string; recipientEmail: string; recipientName: string }) => {
      const response = await apiRequest("POST", "/api/outreach-emails", {
        brandId: selectedBrandId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Email draft created!" });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-emails"] });
      setShowEmailDialog(false);
      setSelectedTarget(null);
      setNewEmail({ subject: "", body: "", emailType: "initial" });
    },
    onError: () => toast({ title: "Failed to create email", variant: "destructive" }),
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/outreach-emails/${id}/send`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.data?.status === 'bounced') {
        toast({ title: "Email bounced", description: data.data?.error, variant: "destructive" });
      } else {
        toast({ title: "Email sent successfully!" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publication-targets"] });
    },
    onError: () => toast({ title: "Failed to send email", variant: "destructive" }),
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/outreach-emails/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Email deleted!" });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-emails"] });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const getStatusBadge = (status: string) => {
    const badges: Record<string, JSX.Element> = {
      draft: <Badge variant="outline" className="bg-gray-50"><Edit className="w-3 h-3 mr-1" />Draft</Badge>,
      scheduled: <Badge variant="outline" className="bg-blue-50 text-blue-700"><Clock className="w-3 h-3 mr-1" />Scheduled</Badge>,
      sent: <Badge variant="outline" className="bg-purple-50 text-purple-700"><Send className="w-3 h-3 mr-1" />Sent</Badge>,
      delivered: <Badge variant="outline" className="bg-green-50 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />Delivered</Badge>,
      opened: <Badge className="bg-blue-500"><Eye className="w-3 h-3 mr-1" />Opened</Badge>,
      clicked: <Badge className="bg-cyan-500"><MousePointer className="w-3 h-3 mr-1" />Clicked</Badge>,
      replied: <Badge className="bg-green-500"><Reply className="w-3 h-3 mr-1" />Replied</Badge>,
      bounced: <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Bounced</Badge>,
      follow_up: <Badge variant="outline" className="bg-yellow-50 text-yellow-700"><RefreshCw className="w-3 h-3 mr-1" />Follow Up</Badge>,
      accepted: <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Accepted</Badge>,
      rejected: <Badge variant="outline" className="bg-red-50 text-red-700"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>,
      completed: <Badge className="bg-emerald-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>,
      discovered: <Badge variant="outline"><Search className="w-3 h-3 mr-1" />Discovered</Badge>,
      researching: <Badge variant="outline" className="bg-yellow-50 text-yellow-700"><Loader2 className="w-3 h-3 mr-1" />Researching</Badge>,
      contact_found: <Badge className="bg-blue-500"><UserSearch className="w-3 h-3 mr-1" />Contact Found</Badge>,
      ready: <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>,
      contacted: <Badge className="bg-purple-500"><Mail className="w-3 h-3 mr-1" />Contacted</Badge>,
    };
    return badges[status] || <Badge variant="outline">{status}</Badge>;
  };

  const getCampaignTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      guest_post: "Guest Post",
      citation_request: "Citation Request",
      pr_pitch: "PR Pitch",
      link_building: "Link Building",
      correction_request: "Correction Request",
    };
    return types[type] || type;
  };

  const getCategoryLabel = (category: string) => {
    const cats: Record<string, string> = {
      blog: "Blog",
      news_site: "News Site",
      industry_publication: "Industry Publication",
      podcast: "Podcast",
      newsletter: "Newsletter",
    };
    return cats[category] || category;
  };

  const openEmailComposer = (target: PublicationTarget) => {
    setSelectedTarget(target);
    setNewEmail({
      subject: `Guest Post Opportunity: ${selectedBrand?.name || 'Our Company'}`,
      body: `Hi ${target.contactName || 'there'},\n\nI'm reaching out from ${selectedBrand?.companyName || selectedBrand?.name || 'our company'} regarding a potential guest post opportunity for ${target.publicationName}.\n\nWe specialize in ${selectedBrand?.industry || 'our industry'} and would love to contribute a high-quality article for your readers.\n\nWould you be open to discussing this further?\n\nBest regards`,
      emailType: "initial",
    });
    setShowEmailDialog(true);
  };

  return (
    <>
      <Helmet>
        <title>Outreach Management | GEO Platform</title>
        <meta name="description" content="Discover publications, find contacts, and manage outreach campaigns for citation building." />
      </Helmet>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Link href="/agent" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Agent Dashboard
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
                  <Mail className="w-8 h-8 text-blue-600" />
                  Outreach Management
                </h1>
                <p className="text-muted-foreground mt-1">Discover publications, find contacts, and automate outreach</p>
              </div>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger className="w-64" data-testid="select-brand">
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedBrandId ? (
            <Card className="text-center py-12">
              <CardContent>
                <Mail className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Brand</h3>
                <p className="text-muted-foreground">Choose a brand to manage outreach</p>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="discover" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="discover" className="flex items-center gap-2" data-testid="tab-discover">
                  <Search className="w-4 h-4" /> Publication Discovery
                </TabsTrigger>
                <TabsTrigger value="emails" className="flex items-center gap-2" data-testid="tab-emails">
                  <MailPlus className="w-4 h-4" /> Email Outreach
                </TabsTrigger>
                <TabsTrigger value="campaigns" className="flex items-center gap-2" data-testid="tab-campaigns">
                  <Target className="w-4 h-4" /> Campaigns
                </TabsTrigger>
              </TabsList>

              <TabsContent value="discover" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Discovered</p>
                          <p className="text-2xl font-bold" data-testid="stat-discovered">{publications.length}</p>
                        </div>
                        <Building2 className="w-8 h-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Contacts Found</p>
                          <p className="text-2xl font-bold" data-testid="stat-contacts">{publications.filter(p => p.contactEmail).length}</p>
                        </div>
                        <UserSearch className="w-8 h-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Accepts Guest Posts</p>
                          <p className="text-2xl font-bold" data-testid="stat-guest">{publications.filter(p => p.acceptsGuestPosts === 1).length}</p>
                        </div>
                        <FileText className="w-8 h-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Avg. DA Score</p>
                          <p className="text-2xl font-bold" data-testid="stat-da">
                            {publications.length > 0 
                              ? Math.round(publications.reduce((sum, p) => sum + (p.domainAuthority || 0), 0) / publications.length)
                              : 0}
                          </p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-orange-500" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4" data-testid="banner-publication-discovery">
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200" data-testid="text-publication-discovery">Publication Discovery - Coming Soon</p>
                      <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                        Automated publication discovery with real contact databases is in development. For now, use the Campaigns tab to manually track your outreach efforts.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="emails" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Emails Sent</p>
                          <p className="text-2xl font-bold" data-testid="stat-sent">{emailStats?.sent || 0}</p>
                        </div>
                        <Send className="w-8 h-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Opened</p>
                          <p className="text-2xl font-bold" data-testid="stat-opened">{emailStats?.opened || 0}</p>
                        </div>
                        <Eye className="w-8 h-8 text-cyan-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Replied</p>
                          <p className="text-2xl font-bold" data-testid="stat-replied">{emailStats?.replied || 0}</p>
                        </div>
                        <Reply className="w-8 h-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Open Rate</p>
                          <p className="text-2xl font-bold" data-testid="stat-open-rate">{(emailStats?.openRate || 0).toFixed(0)}%</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Reply Rate</p>
                          <p className="text-2xl font-bold" data-testid="stat-reply-rate">{(emailStats?.replyRate || 0).toFixed(0)}%</p>
                        </div>
                        <MessageSquare className="w-8 h-8 text-emerald-500" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Email Outreach</CardTitle>
                    <CardDescription>Track and manage your outreach emails</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {emailsLoading ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                      </div>
                    ) : emails.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <MailPlus className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">No emails yet</p>
                        <p className="text-sm">Discover publications and compose emails to start outreach</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-4">
                          {emails.map(email => (
                            <div key={email.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors" data-testid={`email-${email.id}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-semibold">{email.subject}</h4>
                                    {getStatusBadge(email.status)}
                                    <Badge variant="outline">{email.emailType}</Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Mail className="w-3 h-3" />
                                      {email.recipientEmail}
                                    </span>
                                    {email.sentAt && (
                                      <span>Sent: {new Date(email.sentAt).toLocaleDateString()}</span>
                                    )}
                                    {email.openCount > 0 && (
                                      <span className="text-blue-600">{email.openCount} opens</span>
                                    )}
                                  </div>
                                  <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{email.body}</p>
                                </div>
                                <div className="flex gap-2">
                                  {email.status === "draft" && (
                                    <Button 
                                      size="sm" 
                                      onClick={() => sendEmailMutation.mutate(email.id)}
                                      disabled={sendEmailMutation.isPending}
                                      data-testid={`btn-send-email-${email.id}`}
                                    >
                                      {sendEmailMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                                      Send
                                    </Button>
                                  )}
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="text-destructive"
                                    onClick={() => deleteEmailMutation.mutate(email.id)}
                                    data-testid={`btn-delete-email-${email.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="campaigns" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Campaigns</p>
                          <p className="text-2xl font-bold" data-testid="stat-total">{stats?.total || 0}</p>
                        </div>
                        <Mail className="w-8 h-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">In Progress</p>
                          <p className="text-2xl font-bold" data-testid="stat-progress">{(stats?.byStatus?.sent || 0) + (stats?.byStatus?.follow_up || 0)}</p>
                        </div>
                        <Send className="w-8 h-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Success Rate</p>
                          <p className="text-2xl font-bold" data-testid="stat-rate">{(stats?.successRate || 0).toFixed(0)}%</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">Accepted</p>
                          <p className="text-2xl font-bold" data-testid="stat-accepted">{stats?.byStatus?.accepted || 0}</p>
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
                        <CardDescription>Manage your publication outreach efforts</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-40" data-testid="select-status-filter">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="follow_up">Follow Up</SelectItem>
                            <SelectItem value="replied">Replied</SelectItem>
                            <SelectItem value="accepted">Accepted</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                          <DialogTrigger asChild>
                            <Button data-testid="button-create-campaign">
                              <Plus className="w-4 h-4 mr-2" /> New Campaign
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Create Outreach Campaign</DialogTitle>
                              <DialogDescription>Set up a new publication outreach campaign</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label>Campaign Name</Label>
                                <Input 
                                  value={newCampaign.campaignName}
                                  onChange={(e) => setNewCampaign({ ...newCampaign, campaignName: e.target.value })}
                                  placeholder="e.g., TechCrunch Guest Post Q1"
                                  data-testid="input-campaign-name"
                                />
                              </div>
                              <div>
                                <Label>Campaign Type</Label>
                                <Select value={newCampaign.campaignType} onValueChange={(v) => setNewCampaign({ ...newCampaign, campaignType: v })}>
                                  <SelectTrigger data-testid="select-campaign-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="guest_post">Guest Post</SelectItem>
                                    <SelectItem value="citation_request">Citation Request</SelectItem>
                                    <SelectItem value="pr_pitch">PR Pitch</SelectItem>
                                    <SelectItem value="link_building">Link Building</SelectItem>
                                    <SelectItem value="correction_request">Correction Request</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Target Domain</Label>
                                <Input 
                                  value={newCampaign.targetDomain}
                                  onChange={(e) => setNewCampaign({ ...newCampaign, targetDomain: e.target.value })}
                                  placeholder="e.g., techcrunch.com"
                                  data-testid="input-target-domain"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Contact Name</Label>
                                  <Input 
                                    value={newCampaign.targetContactName}
                                    onChange={(e) => setNewCampaign({ ...newCampaign, targetContactName: e.target.value })}
                                    placeholder="Editor name"
                                    data-testid="input-contact-name"
                                  />
                                </div>
                                <div>
                                  <Label>Contact Email</Label>
                                  <Input 
                                    value={newCampaign.targetContactEmail}
                                    onChange={(e) => setNewCampaign({ ...newCampaign, targetContactEmail: e.target.value })}
                                    placeholder="editor@domain.com"
                                    data-testid="input-contact-email"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label>Proposed Topic</Label>
                                <Input 
                                  value={newCampaign.proposedTopic}
                                  onChange={(e) => setNewCampaign({ ...newCampaign, proposedTopic: e.target.value })}
                                  placeholder="Article topic"
                                  data-testid="input-topic"
                                />
                              </div>
                              <div>
                                <Label>Pitch Angle</Label>
                                <Textarea 
                                  value={newCampaign.pitchAngle}
                                  onChange={(e) => setNewCampaign({ ...newCampaign, pitchAngle: e.target.value })}
                                  placeholder="Why this publication should work with you..."
                                  data-testid="input-pitch"
                                />
                              </div>
                              <Button 
                                className="w-full" 
                                onClick={() => createCampaignMutation.mutate(newCampaign)}
                                disabled={!newCampaign.campaignName || !newCampaign.targetDomain || createCampaignMutation.isPending}
                                data-testid="button-submit-campaign"
                              >
                                {createCampaignMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                Create Campaign
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                      </div>
                    ) : campaigns.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Send className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">No outreach campaigns yet</p>
                        <p className="text-sm">Create your first campaign to start building citations</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-4">
                          {campaigns.filter(c => statusFilter === "all" || c.status === statusFilter).map(campaign => (
                            <div key={campaign.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors" data-testid={`campaign-${campaign.id}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-semibold">{campaign.campaignName}</h4>
                                    {getStatusBadge(campaign.status)}
                                    <Badge variant="outline">{getCampaignTypeLabel(campaign.campaignType)}</Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Globe className="w-3 h-3" />
                                      {campaign.targetDomain}
                                    </span>
                                    {campaign.targetContactEmail && (
                                      <span className="flex items-center gap-1">
                                        <Mail className="w-3 h-3" />
                                        {campaign.targetContactEmail}
                                      </span>
                                    )}
                                    {campaign.followUpCount > 0 && (
                                      <span className="flex items-center gap-1">
                                        <RefreshCw className="w-3 h-3" />
                                        {campaign.followUpCount} follow-ups
                                      </span>
                                    )}
                                  </div>
                                  {campaign.proposedTopic && (
                                    <p className="text-sm mt-2"><strong>Topic:</strong> {campaign.proposedTopic}</p>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {campaign.status === "draft" && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => generateDraftMutation.mutate(campaign.id)} data-testid={`btn-generate-${campaign.id}`}>
                                        <Sparkles className="w-3 h-3 mr-1" /> AI Draft
                                      </Button>
                                      <Button size="sm" onClick={() => updateCampaignMutation.mutate({ id: campaign.id, status: "sent" })} data-testid={`btn-send-${campaign.id}`}>
                                        <Send className="w-3 h-3 mr-1" /> Mark Sent
                                      </Button>
                                    </>
                                  )}
                                  {campaign.status === "sent" && (
                                    <Button size="sm" variant="outline" onClick={() => updateCampaignMutation.mutate({ id: campaign.id, status: "follow_up" })} data-testid={`btn-followup-${campaign.id}`}>
                                      <RefreshCw className="w-3 h-3 mr-1" /> Follow Up
                                    </Button>
                                  )}
                                  {(campaign.status === "sent" || campaign.status === "follow_up") && (
                                    <>
                                      <Button size="sm" variant="outline" className="text-green-600" onClick={() => updateCampaignMutation.mutate({ id: campaign.id, status: "accepted" })} data-testid={`btn-accept-${campaign.id}`}>
                                        <CheckCircle className="w-3 h-3" />
                                      </Button>
                                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => updateCampaignMutation.mutate({ id: campaign.id, status: "rejected" })} data-testid={`btn-reject-${campaign.id}`}>
                                        <XCircle className="w-3 h-3" />
                                      </Button>
                                    </>
                                  )}
                                  {campaign.resultUrl && (
                                    <a href={campaign.resultUrl} target="_blank" rel="noopener noreferrer">
                                      <Button size="sm" variant="outline" data-testid={`btn-result-${campaign.id}`}>
                                        <ExternalLink className="w-3 h-3" />
                                      </Button>
                                    </a>
                                  )}
                                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteCampaignMutation.mutate(campaign.id)} data-testid={`btn-delete-${campaign.id}`}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Compose Outreach Email</DialogTitle>
                <DialogDescription>
                  {selectedTarget && `Sending to ${selectedTarget.contactName} at ${selectedTarget.publicationName}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>To</Label>
                  <Input value={selectedTarget?.contactEmail || ""} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input 
                    value={newEmail.subject}
                    onChange={(e) => setNewEmail({ ...newEmail, subject: e.target.value })}
                    placeholder="Email subject..."
                    data-testid="input-email-subject"
                  />
                </div>
                <div>
                  <Label>Email Type</Label>
                  <Select value={newEmail.emailType} onValueChange={(v) => setNewEmail({ ...newEmail, emailType: v })}>
                    <SelectTrigger data-testid="select-email-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial">Initial Outreach</SelectItem>
                      <SelectItem value="follow_up_1">Follow Up 1</SelectItem>
                      <SelectItem value="follow_up_2">Follow Up 2</SelectItem>
                      <SelectItem value="follow_up_3">Follow Up 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea 
                    value={newEmail.body}
                    onChange={(e) => setNewEmail({ ...newEmail, body: e.target.value })}
                    placeholder="Your email message..."
                    className="min-h-[200px]"
                    data-testid="input-email-body"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    className="flex-1" 
                    variant="outline"
                    onClick={() => {
                      if (selectedTarget) {
                        createEmailMutation.mutate({
                          publicationTargetId: selectedTarget.id,
                          recipientEmail: selectedTarget.contactEmail || "",
                          recipientName: selectedTarget.contactName || "",
                          ...newEmail,
                        });
                      }
                    }}
                    disabled={!newEmail.subject || !newEmail.body || createEmailMutation.isPending}
                    data-testid="button-save-draft"
                  >
                    {createEmailMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit className="w-4 h-4 mr-2" />}
                    Save as Draft
                  </Button>
                  <Button 
                    className="flex-1" 
                    onClick={async () => {
                      if (selectedTarget) {
                        const result = await createEmailMutation.mutateAsync({
                          publicationTargetId: selectedTarget.id,
                          recipientEmail: selectedTarget.contactEmail || "",
                          recipientName: selectedTarget.contactName || "",
                          ...newEmail,
                        });
                        if (result.data?.id) {
                          sendEmailMutation.mutate(result.data.id);
                        }
                      }
                    }}
                    disabled={!newEmail.subject || !newEmail.body || createEmailMutation.isPending || sendEmailMutation.isPending}
                    data-testid="button-send-email"
                  >
                    {(createEmailMutation.isPending || sendEmailMutation.isPending) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Send Now
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </>
  );
}
