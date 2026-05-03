// Distribute dialog — extracted from articles.tsx (Wave 7).
//
// Three views: Generate (pick platforms), Results (current run output),
// History (past distributions). selectedPlatforms now persists across
// tab switches within a session — closing the dialog still resets.
// Buffer profile match only auto-fires on unambiguous matches.

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import { Loader2, FileText, Share2, Clock, Pencil, Link2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import BufferConnectDialog from "./BufferConnectDialog";
import PlatformPostButton from "./PlatformPostButton";

const DISTRIBUTION_PLATFORMS = [
  "LinkedIn",
  "Twitter",
  "Facebook",
  "Instagram",
  "Medium",
  "Reddit",
  "Quora",
];

const BUFFER_SUPPORTED_PLATFORMS = new Set(["LinkedIn", "Twitter", "Facebook", "Instagram"]);

type DistributeView = "generate" | "results" | "history";

interface DistributeDialogProps {
  articleId: string;
}

type GeneratedRow = {
  platform: string;
  status: string;
  content?: string;
  distributionId?: string;
  platformPostId?: string | null;
};

export default function DistributeDialog({ articleId }: DistributeDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DistributeView>("generate");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [generatedContent, setGeneratedContent] = useState<GeneratedRow[]>([]);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [bufferConnectOpen, setBufferConnectOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { data: historyData, refetch: refetchHistory } = useQuery<{
    success: boolean;
    data: any[];
  }>({
    queryKey: [`/api/distributions/${articleId}`],
    enabled: open,
  });
  const history = (historyData?.data || []).filter(
    (d: any) => (d.status === "success" || d.status === "scheduled") && d.metadata?.content?.trim(),
  );

  const { data: bufferData } = useQuery<{
    success: boolean;
    connected: boolean;
    data: Array<{ id: string; service: string; formattedService: string; username: string }>;
  }>({
    queryKey: ["/api/buffer/profiles"],
    enabled: open,
  });
  const bufferConnected = bufferData?.connected ?? false;
  const bufferProfiles = bufferData?.data ?? [];

  // Per-distribution-row Buffer post mutation. Server stamps the row's
  // platform_post_id on success; we mirror that locally for instant UI
  // feedback, then invalidate /distributions/:articleId so any future
  // dialog reopen reads the persisted value.
  const postDistributionMutation = useMutation({
    mutationFn: async ({
      distributionId,
      channelId,
    }: {
      distributionId: string;
      channelId: string;
    }) => {
      const r = await apiRequest("POST", `/api/distributions/${distributionId}/buffer-post`, {
        channelId,
      });
      const json = await r.json();
      return { status: r.status, body: json };
    },
    onSuccess: ({ status, body }, vars) => {
      if (status === 200 && body?.success) {
        setGeneratedContent((prev) =>
          prev.map((c) =>
            c.distributionId === vars.distributionId
              ? { ...c, platformPostId: body.data.platformPostId }
              : c,
          ),
        );
        setCardErrors((prev) => {
          const next = { ...prev };
          delete next[vars.distributionId];
          return next;
        });
        queryClient.invalidateQueries({ queryKey: [`/api/distributions/${articleId}`] });
        toast({
          title: "Queued in Buffer",
          description: "Will publish at the next slot in your Buffer schedule for this channel.",
        });
        return;
      }
      if (status === 403 && body?.error === "not_connected") {
        queryClient.invalidateQueries({ queryKey: ["/api/buffer/profiles"] });
        toast({
          title: "Buffer is disconnected",
          description: "Reconnect to post.",
          variant: "destructive",
        });
        return;
      }
      setCardErrors((prev) => ({
        ...prev,
        [vars.distributionId]: body?.error ?? "Buffer post failed",
      }));
    },
    onError: (_err, vars) => {
      setCardErrors((prev) => ({
        ...prev,
        [vars.distributionId]: "Network error — try again",
      }));
    },
  });

  // Returns every Buffer channel matching this platform. Caller decides
  // what to do with 0 / 1 / >1 — see PlatformPostButton.
  const matchBufferChannels = (platform: string) => {
    const p = platform.toLowerCase();
    return bufferProfiles.filter(
      (bp) =>
        bp.service?.toLowerCase().includes(p) || bp.formattedService?.toLowerCase().includes(p),
    );
  };

  const distributeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/distribute/${articleId}`, {
        platforms: selectedPlatforms,
      });
      return await response.json();
    },
    onSuccess: async (data) => {
      const successCount = data.data.filter((r: any) => r.status === "success").length;
      // Merge new platform results into existing cards rather than
      // replacing — a partial regeneration (e.g. just Twitter) must not
      // erase a previously-posted LinkedIn card.
      setGeneratedContent((prev) => {
        const incoming = new Map<string, GeneratedRow>();
        for (const row of data.data as GeneratedRow[]) incoming.set(row.platform, row);
        const merged: GeneratedRow[] = prev.map((row) => incoming.get(row.platform) ?? row);
        for (const row of data.data as GeneratedRow[]) {
          if (!prev.some((p) => p.platform === row.platform)) merged.push(row);
        }
        return merged;
      });
      setView("results");
      await refetchHistory();
      toast({
        title: "Content Generated",
        description: `Platform-ready content created for ${successCount} platform(s). Copy and post!`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate platform content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveEditMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const response = await apiRequest("PATCH", `/api/distribute/entry/${id}`, { content });
      return await response.json();
    },
    onSuccess: () => {
      setEditingId(null);
      refetchHistory();
      toast({ title: "Saved", description: "Your edits have been saved." });
    },
    onError: () =>
      toast({ title: "Error", description: "Could not save edits.", variant: "destructive" }),
  });

  // Hydrate generatedContent from /distributions/:articleId on open so
  // posted-state survives across dialog close/reopen. Picks the most
  // recent row per platform that has content saved.
  useEffect(() => {
    if (!open) return;
    if (!historyData?.data || generatedContent.length > 0) return;
    const latestByPlatform = new Map<string, any>();
    for (const d of historyData.data) {
      if (d.status !== "success" && d.status !== "scheduled") continue;
      if (!d.metadata?.content) continue;
      const existing = latestByPlatform.get(d.platform);
      if (!existing || new Date(d.createdAt) > new Date(existing.createdAt)) {
        latestByPlatform.set(d.platform, d);
      }
    }
    if (latestByPlatform.size === 0) return;
    setGeneratedContent(
      Array.from(latestByPlatform.values()).map(
        (d): GeneratedRow => ({
          platform: d.platform,
          status: "success",
          content: d.metadata.content,
          distributionId: d.id,
          platformPostId: d.platformPostId ?? null,
        }),
      ),
    );
    setView("results");
  }, [open, historyData, generatedContent.length]);

  const distributeLoadingMessage = useLoadingMessages(distributeMutation.isPending, [
    "Reading your article...",
    "Adapting for each platform...",
    "Writing LinkedIn version...",
    "Crafting Reddit post...",
    "Formatting for Medium...",
    "Adding platform hashtags...",
  ]);

  const copyToClipboard = (text: string, platform: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${platform} content copied to clipboard.` });
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setView("generate");
      setGeneratedContent([]);
      setSelectedPlatforms([]);
      setEditingId(null);
    }
  };

  const platformCard = (
    id: string | null,
    platform: string,
    content: string,
    timestamp?: string,
    platformPostId?: string | null,
  ) => (
    <div
      key={id ?? platform}
      className="border rounded-lg p-4"
      data-testid={`distribution-result-${platform.toLowerCase()}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge>{platform}</Badge>
          {timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingId(id);
                setEditText(content);
              }}
              className="gap-1"
            >
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(content, platform)}
            data-testid={`button-copy-${platform.toLowerCase()}`}
          >
            Copy
          </Button>
          {BUFFER_SUPPORTED_PLATFORMS.has(platform) && (
            <PlatformPostButton
              platform={platform}
              distributionId={id ?? undefined}
              platformPostId={platformPostId}
              bufferConnected={bufferConnected}
              matches={matchBufferChannels(platform)}
              isPosting={
                postDistributionMutation.isPending &&
                postDistributionMutation.variables?.distributionId === id
              }
              error={id ? cardErrors[id] : undefined}
              onPost={(channelId) => {
                if (!id) return;
                postDistributionMutation.mutate({ distributionId: id, channelId });
              }}
              onConnectClick={() => setBufferConnectOpen(true)}
            />
          )}
        </div>
      </div>
      {id && editingId === id ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[160px] text-sm font-mono"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveEditMutation.mutate({ id: id!, content: editText })}
              disabled={saveEditMutation.isPending}
            >
              {saveEditMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md max-h-60 overflow-y-auto font-sans">
          {content}
        </pre>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-distribute-${articleId}`}>
          <Share2 className="w-4 h-4 mr-2" />
          Generate Platform Copy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Platform-Optimized Content</DialogTitle>
          <DialogDescription>
            AI rewrites your article for each platform — copy and post manually.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-2 mb-2">
          <Button
            variant={view === "generate" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("generate")}
          >
            <Share2 className="w-3 h-3 mr-1" /> Generate New
          </Button>
          {generatedContent.length > 0 && (
            <Button
              variant={view === "results" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("results")}
              data-testid="button-view-results"
            >
              <FileText className="w-3 h-3 mr-1" /> Results (
              {generatedContent.filter((c) => c.content).length})
            </Button>
          )}
          <Button
            variant={view === "history" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("history")}
            data-testid="button-view-history"
          >
            <Clock className="w-3 h-3 mr-1" /> History {history.length > 0 && `(${history.length})`}
          </Button>
        </div>

        {!bufferConnected ? (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="w-4 h-4 text-blue-600" />
              <span className="text-foreground">Connect Buffer to post directly</span>
            </div>
            <BufferConnectDialog
              connected={false}
              open={bufferConnectOpen}
              onOpenChange={setBufferConnectOpen}
            />
          </div>
        ) : (
          <div
            className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3 mb-3 flex items-center justify-between gap-3"
            data-testid="banner-buffer-connected"
          >
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="w-4 h-4 text-green-600" />
              <span className="text-foreground">
                Buffer connected ·{" "}
                {bufferProfiles.length === 0
                  ? "no channels found"
                  : `${bufferProfiles.length} channel${bufferProfiles.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <BufferConnectDialog connected={true} />
          </div>
        )}

        {view === "generate" && (
          <div className="space-y-4">
            <div
              className="bg-muted border border-border rounded-lg p-3"
              data-testid="banner-distribution-info"
            >
              <div className="flex items-start gap-2">
                <Share2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground" data-testid="text-distribution-info">
                    Smart Distribution
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    AI reformats your article for each platform with optimized hooks, hashtags, and
                    formatting.
                  </p>
                </div>
              </div>
            </div>
            {DISTRIBUTION_PLATFORMS.map((platform) => (
              <div key={platform} className="flex items-center space-x-2">
                <Checkbox
                  id={`platform-${platform}`}
                  checked={selectedPlatforms.includes(platform)}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedPlatforms([...selectedPlatforms, platform]);
                    else setSelectedPlatforms(selectedPlatforms.filter((p) => p !== platform));
                  }}
                  data-testid={`checkbox-platform-${platform.toLowerCase()}`}
                />
                <label htmlFor={`platform-${platform}`} className="text-sm font-medium">
                  {platform}
                </label>
              </div>
            ))}
            <Button
              onClick={() => distributeMutation.mutate()}
              disabled={selectedPlatforms.length === 0 || distributeMutation.isPending}
              className="w-full"
              data-testid="button-generate-distribution"
            >
              {distributeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {distributeLoadingMessage}
                </>
              ) : (
                `Generate content for ${selectedPlatforms.length} platform(s)`
              )}
            </Button>
          </div>
        )}

        {view === "results" && (
          <div className="space-y-4">
            {generatedContent.map((item) =>
              item.content ? (
                platformCard(
                  item.distributionId ?? null,
                  item.platform,
                  item.content,
                  undefined,
                  item.platformPostId ?? null,
                )
              ) : (
                <div key={item.platform} className="border rounded-lg p-4">
                  <Badge variant="destructive">{item.platform}</Badge>
                  <p className="text-sm text-destructive mt-2">
                    Failed to generate content for this platform.
                  </p>
                </div>
              ),
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setView("generate");
                // Wave 7: keep selectedPlatforms — user often regenerates
                // for the same set after editing the article.
              }}
              data-testid="button-distribute-more"
            >
              Generate for more platforms
            </Button>
          </div>
        )}

        {view === "history" && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No past distributions yet. Generate content and it will appear here.
              </div>
            ) : (
              history.map((d: any) =>
                platformCard(
                  d.id,
                  d.platform,
                  d.metadata.content,
                  d.distributedAt,
                  d.platformPostId ?? null,
                ),
              )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
