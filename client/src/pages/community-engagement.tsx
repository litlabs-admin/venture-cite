import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import type { CommunityPost } from "@shared/schema";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  Search,
  Plus,
  Send,
  Copy,
  ExternalLink,
  Sparkles,
  MessageSquare,
  Globe,
  Users,
  Target,
  TrendingUp,
  CheckCircle2,
  Clock,
  FileText,
  Trash2,
  RefreshCw,
  AlertCircle,
  Compass
} from "lucide-react";
import { SiReddit, SiQuora } from "react-icons/si";

interface DiscoveredGroup {
  platform: string;
  name: string;
  url: string;
  members: string;
  relevance: string;
  description: string;
  suggestedApproach: string;
  topicIdeas: string[];
}

interface GeneratedContent {
  title: string;
  content: string;
  hashtags: string[];
  tips: string[];
  bestTimeToPost: string;
}

const platformIcons: Record<string, JSX.Element> = {
  reddit: <SiReddit className="w-4 h-4" />,
  quora: <SiQuora className="w-4 h-4" />,
  hackernews: <Globe className="w-4 h-4 text-orange-500" />,
  forum: <MessageSquare className="w-4 h-4" />,
  discord: <MessageSquare className="w-4 h-4 text-indigo-500" />,
  slack: <MessageSquare className="w-4 h-4 text-green-500" />,
};

const platformColors: Record<string, string> = {
  reddit: "bg-orange-100 text-orange-800",
  quora: "bg-red-100 text-red-800",
  hackernews: "bg-orange-100 text-orange-700",
  forum: "bg-blue-100 text-blue-800",
  discord: "bg-indigo-100 text-indigo-800",
  slack: "bg-green-100 text-green-800",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  ready: "bg-blue-100 text-blue-800",
  posted: "bg-green-100 text-green-800",
  archived: "bg-yellow-100 text-yellow-800",
};

export default function CommunityEngagement() {
  const { toast } = useToast();
  const { selectedBrandId, brands, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const [discoveredGroups, setDiscoveredGroups] = useState<DiscoveredGroup[]>([]);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    platform: "",
    groupName: "",
    topic: "",
    postType: "post",
    tone: "helpful and authentic",
  });

  const postsQueryKey = selectedBrandId ? `/api/community-posts?brandId=${selectedBrandId}` : "/api/community-posts";
  const { data: postsResponse, isLoading: postsLoading } = useQuery<{ success: boolean; data: CommunityPost[] }>({
    queryKey: ["/api/community-posts", selectedBrandId],
    queryFn: () => apiRequest("GET", postsQueryKey).then(r => r.json()),
  });
  const posts = postsResponse?.data || [];

  const discoverMutation = useMutation({
    mutationFn: async (data: { brandName: string; industry: string; keywords?: string[]; platform?: string }) => {
      const res = await apiRequest("POST", "/api/community-discover", data);
      return res.json();
    },
    onSuccess: (data) => {
      setDiscoveredGroups(data.data || []);
      toast({ title: "Communities discovered", description: `Found ${(data.data || []).length} relevant groups` });
    },
    onError: () => {
      toast({ title: "Discovery failed", description: "Could not discover communities. Please try again.", variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: Record<string, string | undefined>) => {
      const res = await apiRequest("POST", "/api/community-generate", data);
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.data || null);
      toast({ title: "Content generated", description: "Your community post is ready to review" });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Could not generate content. Please try again.", variant: "destructive" });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/community-posts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community-posts"] });
      toast({ title: "Post saved", description: "Community post saved to your tracker" });
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const res = await apiRequest("PATCH", `/api/community-posts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community-posts"] });
      toast({ title: "Post updated" });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/community-posts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community-posts"] });
      toast({ title: "Post deleted" });
    },
  });

  const handleDiscover = () => {
    if (!selectedBrand) {
      toast({ title: "Select a brand first", variant: "destructive" });
      return;
    }
    discoverMutation.mutate({
      brandName: selectedBrand.name,
      industry: selectedBrand.industry || "technology",
      keywords: [],
    });
  };

  const handleGenerate = () => {
    if (!selectedBrand) return;
    generateMutation.mutate({
      brandName: selectedBrand.name,
      brandDescription: selectedBrand.description || undefined,
      platform: generateForm.platform,
      groupName: generateForm.groupName,
      topic: generateForm.topic,
      postType: generateForm.postType,
      tone: generateForm.tone,
    });
  };

  const handleSaveGenerated = () => {
    if (!generatedContent) return;
    createPostMutation.mutate({
      brandId: selectedBrandId || null,
      platform: generateForm.platform,
      groupName: generateForm.groupName,
      title: generatedContent.title,
      content: generatedContent.content,
      status: "draft",
      postType: generateForm.postType,
      generatedByAi: 1,
    });
    setGenerateDialogOpen(false);
    setGeneratedContent(null);
  };

  const handleSaveDiscoveredGroup = (group: DiscoveredGroup) => {
    createPostMutation.mutate({
      brandId: selectedBrandId || null,
      platform: group.platform,
      groupName: group.name,
      groupUrl: group.url,
      title: group.topicIdeas?.[0] || "",
      content: group.suggestedApproach,
      status: "draft",
      postType: "post",
      keywords: group.topicIdeas || [],
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const draftPosts = posts.filter(p => p.status === "draft" || p.status === "ready");
  const postedPosts = posts.filter(p => p.status === "posted");

  return (
    <div className="space-y-8">
      <Helmet><title>Community Engagement - VentureCite</title></Helmet>
      <PageHeader
        title="Community Engagement"
        description="Find and engage with Reddit, Quora, and forum communities to build brand citations"
        actions={brands.length > 0 ? <BrandSelector className="w-64" /> : null}
      />

        <div className="flex flex-wrap items-center gap-4 mb-6">

          <Button
            onClick={handleDiscover}
            disabled={!selectedBrandId || discoverMutation.isPending}
            data-testid="button-discover"
          >
            {discoverMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Compass className="w-4 h-4 mr-2" />
            )}
            Discover Communities
          </Button>

          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!selectedBrandId} data-testid="button-generate-post">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Generate Community Post</DialogTitle>
                <DialogDescription>
                  AI will create a helpful, non-spammy post tailored to the platform and community
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Platform</label>
                    <Select value={generateForm.platform} onValueChange={(v) => setGenerateForm(f => ({ ...f, platform: v }))}>
                      <SelectTrigger data-testid="select-gen-platform">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reddit">Reddit</SelectItem>
                        <SelectItem value="quora">Quora</SelectItem>
                        <SelectItem value="hackernews">Hacker News</SelectItem>
                        <SelectItem value="forum">Industry Forum</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                        <SelectItem value="slack">Slack Community</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Post Type</label>
                    <Select value={generateForm.postType} onValueChange={(v) => setGenerateForm(f => ({ ...f, postType: v }))}>
                      <SelectTrigger data-testid="select-gen-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="post">New Post</SelectItem>
                        <SelectItem value="answer">Answer/Reply</SelectItem>
                        <SelectItem value="comment">Comment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Community/Group Name</label>
                  <Input
                    placeholder="e.g., r/marketing, Quora Marketing Space"
                    value={generateForm.groupName}
                    onChange={(e) => setGenerateForm(f => ({ ...f, groupName: e.target.value }))}
                    data-testid="input-gen-group"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Topic / Question to Address</label>
                  <Input
                    placeholder="e.g., Best practices for AI-optimized content"
                    value={generateForm.topic}
                    onChange={(e) => setGenerateForm(f => ({ ...f, topic: e.target.value }))}
                    data-testid="input-gen-topic"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Tone</label>
                  <Select value={generateForm.tone} onValueChange={(v) => setGenerateForm(f => ({ ...f, tone: v }))}>
                    <SelectTrigger data-testid="select-gen-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="helpful and authentic">Helpful & Authentic</SelectItem>
                      <SelectItem value="expert and authoritative">Expert & Authoritative</SelectItem>
                      <SelectItem value="casual and friendly">Casual & Friendly</SelectItem>
                      <SelectItem value="data-driven and analytical">Data-Driven & Analytical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={!generateForm.platform || !generateForm.groupName || !generateForm.topic || generateMutation.isPending}
                  className="w-full"
                  data-testid="button-run-generate"
                >
                  {generateMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Generate Content
                </Button>

                {generatedContent && (
                  <div className="border rounded-lg p-4 space-y-3 bg-stone-50 dark:bg-gray-800" data-testid="generated-content">
                    {generatedContent.title && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Title</label>
                        <p className="font-medium">{generatedContent.title}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Content</label>
                      <div className="mt-1 p-3 bg-white dark:bg-gray-900 rounded border text-sm whitespace-pre-wrap">
                        {generatedContent.content}
                      </div>
                    </div>
                    {generatedContent.tips?.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Posting Tips</label>
                        <ul className="mt-1 text-sm space-y-1">
                          {generatedContent.tips.map((tip, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle2 className="w-3 h-3 mt-1 text-green-500 shrink-0" />
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {generatedContent.bestTimeToPost && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Best time: {generatedContent.bestTimeToPost}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => copyToClipboard(generatedContent.content)} data-testid="button-copy-content">
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleSaveGenerated} data-testid="button-save-draft">
                        <FileText className="w-3 h-3 mr-1" /> Save as Draft
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {!selectedBrandId && (
          <Card className="mb-6" data-testid="empty-state-no-brand">
            <CardContent className="py-12 text-center">
              <Target className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="font-medium text-muted-foreground">Select a brand to get started</p>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a brand above to discover relevant communities and generate engagement content
              </p>
            </CardContent>
          </Card>
        )}

        {selectedBrandId && (
          <Tabs defaultValue="discover" className="space-y-6">
            <TabsList data-testid="tabs-community">
              <TabsTrigger value="discover" data-testid="tab-discover">
                <Compass className="w-4 h-4 mr-2" />
                Discover
              </TabsTrigger>
              <TabsTrigger value="drafts" data-testid="tab-drafts">
                <FileText className="w-4 h-4 mr-2" />
                Drafts ({draftPosts.length})
              </TabsTrigger>
              <TabsTrigger value="posted" data-testid="tab-posted">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Posted ({postedPosts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="discover" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <Card>
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-bold text-red-600" data-testid="stat-total-groups">
                      {discoveredGroups.length}
                    </div>
                    <p className="text-xs text-muted-foreground">Groups Found</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-bold text-blue-600" data-testid="stat-total-drafts">
                      {draftPosts.length}
                    </div>
                    <p className="text-xs text-muted-foreground">Draft Posts</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-bold text-green-600" data-testid="stat-total-posted">
                      {postedPosts.length}
                    </div>
                    <p className="text-xs text-muted-foreground">Posted</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 text-center">
                    <div className="text-2xl font-bold text-purple-600" data-testid="stat-platforms">
                      {new Set(posts.map(p => p.platform)).size}
                    </div>
                    <p className="text-xs text-muted-foreground">Platforms Active</p>
                  </CardContent>
                </Card>
              </div>

              {discoverMutation.isPending && (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {discoveredGroups.length === 0 && !discoverMutation.isPending && (
                <Card data-testid="empty-state-discover">
                  <CardContent className="py-12 text-center">
                    <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground">No communities discovered yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click "Discover Communities" to find relevant Reddit, Quora, and forum groups for your brand
                    </p>
                    <Button onClick={handleDiscover} className="mt-4" size="sm" data-testid="button-discover-empty">
                      <Compass className="w-4 h-4 mr-2" />
                      Discover Communities
                    </Button>
                  </CardContent>
                </Card>
              )}

              {discoveredGroups.length > 0 && (
                <div className="space-y-3">
                  {discoveredGroups.map((group, idx) => (
                    <Card key={idx} className="hover:shadow-md transition-shadow" data-testid={`card-group-${idx}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {platformIcons[group.platform] || <Globe className="w-4 h-4" />}
                              <Badge className={platformColors[group.platform] || "bg-gray-100"}>
                                {group.platform}
                              </Badge>
                              <span className="font-semibold">{group.name}</span>
                              {group.members && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Users className="w-3 h-3" /> {group.members}
                                </span>
                              )}
                              <Badge variant={group.relevance === "high" ? "default" : "secondary"} className="text-xs">
                                {group.relevance} relevance
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{group.description}</p>
                            <div className="text-sm">
                              <span className="font-medium text-xs">Approach: </span>
                              <span className="text-xs text-muted-foreground">{group.suggestedApproach}</span>
                            </div>
                            {group.topicIdeas?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {group.topicIdeas.map((topic, ti) => (
                                  <Badge key={ti} variant="outline" className="text-xs">
                                    {topic}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            {group.url && (
                              <Button size="sm" variant="outline" asChild data-testid={`button-visit-${idx}`}>
                                <a href={group.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-3 h-3 mr-1" /> Visit
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setGenerateForm(f => ({
                                  ...f,
                                  platform: group.platform,
                                  groupName: group.name,
                                  topic: group.topicIdeas?.[0] || "",
                                }));
                                setGenerateDialogOpen(true);
                              }}
                              data-testid={`button-write-${idx}`}
                            >
                              <Sparkles className="w-3 h-3 mr-1" /> Write Post
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSaveDiscoveredGroup(group)}
                              data-testid={`button-save-group-${idx}`}
                            >
                              <Plus className="w-3 h-3 mr-1" /> Save
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="drafts" className="space-y-3">
              {postsLoading && (
                <div className="space-y-3">
                  {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
                </div>
              )}

              {draftPosts.length === 0 && !postsLoading && (
                <Card data-testid="empty-state-drafts">
                  <CardContent className="py-12 text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground">No draft posts yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Discover communities and generate posts to get started
                    </p>
                  </CardContent>
                </Card>
              )}

              {draftPosts.map(post => (
                <Card key={post.id} data-testid={`card-draft-${post.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {platformIcons[post.platform] || <Globe className="w-4 h-4" />}
                          <Badge className={platformColors[post.platform] || "bg-gray-100"}>
                            {post.platform}
                          </Badge>
                          <span className="font-medium text-sm">{post.groupName}</span>
                          <Badge className={statusColors[post.status]}>{post.status}</Badge>
                          {post.generatedByAi ? (
                            <Badge variant="outline" className="text-xs">
                              <Sparkles className="w-3 h-3 mr-1" /> AI
                            </Badge>
                          ) : null}
                        </div>
                        {post.title && <p className="font-medium text-sm mt-1">{post.title}</p>}
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.content}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(post.content)}
                          data-testid={`button-copy-draft-${post.id}`}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updatePostMutation.mutate({ id: post.id, status: "posted", postedAt: new Date().toISOString() })}
                          data-testid={`button-mark-posted-${post.id}`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deletePostMutation.mutate(post.id)}
                          data-testid={`button-delete-draft-${post.id}`}
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="posted" className="space-y-3">
              {postedPosts.length === 0 && (
                <Card data-testid="empty-state-posted">
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground">No posted content yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mark draft posts as posted after sharing them on the platforms
                    </p>
                  </CardContent>
                </Card>
              )}

              {postedPosts.map(post => (
                <Card key={post.id} data-testid={`card-posted-${post.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {platformIcons[post.platform] || <Globe className="w-4 h-4" />}
                          <Badge className={platformColors[post.platform] || "bg-gray-100"}>
                            {post.platform}
                          </Badge>
                          <span className="font-medium text-sm">{post.groupName}</span>
                          <Badge className="bg-green-100 text-green-800">Posted</Badge>
                        </div>
                        {post.title && <p className="font-medium text-sm mt-1">{post.title}</p>}
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.content}</p>
                        {post.postUrl && (
                          <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
                          >
                            <ExternalLink className="w-3 h-3" /> View post
                          </a>
                        )}
                        {post.postedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Posted: {new Date(post.postedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}

        <Card className="mt-6" data-testid="card-best-practices">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Community Engagement Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <SiReddit className="w-4 h-4 text-orange-500" /> Reddit
                </h4>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li>Read the subreddit rules before posting</li>
                  <li>Build karma by commenting helpfully first</li>
                  <li>Never be overtly promotional</li>
                  <li>Share genuine expertise and data</li>
                  <li>Engage in comments on your posts</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <SiQuora className="w-4 h-4 text-red-600" /> Quora
                </h4>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li>Answer questions with detailed, expert responses</li>
                  <li>Include data, stats, and real examples</li>
                  <li>Mention brand naturally as a relevant example</li>
                  <li>Follow relevant Spaces for your industry</li>
                  <li>Build a complete profile with credentials</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Globe className="w-4 h-4 text-orange-500" /> Hacker News & Forums
                </h4>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li>Focus on technical depth and original insights</li>
                  <li>Avoid any marketing language</li>
                  <li>Share data and research, not opinions</li>
                  <li>Engage thoughtfully in threads</li>
                  <li>Be consistent and build reputation over time</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
