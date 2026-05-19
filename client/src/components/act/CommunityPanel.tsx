// Community post creation, in-context. /act rework: the orphaned
// community-engagement page is retired; its real flow — discover
// relevant communities → generate a post → save as a draft — folds
// into this compact panel on the Production create dialog. Endpoints
// verbatim: POST /api/community-discover, /api/community-generate,
// /api/community-posts.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBrandSelection } from "@/hooks/use-brand-selection";

type DiscoveredGroup = {
  platform: string;
  name: string;
  url: string;
  members: string;
  relevance: string;
  description: string;
};
type GeneratedContent = {
  title: string;
  content: string;
  hashtags: string[];
  tips: string[];
  bestTimeToPost: string;
};

const POST_TYPES = ["post", "answer", "comment"];
const TONES = [
  "helpful and authentic",
  "expert and authoritative",
  "casual and friendly",
  "data-driven and analytical",
];

export default function CommunityPanel({
  brandId,
  onCreated,
}: {
  brandId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { selectedBrand } = useBrandSelection();
  const brandName = selectedBrand?.name ?? "";
  const industry = selectedBrand?.industry || "technology";
  const brandDescription = (selectedBrand as { description?: string } | null)?.description;

  const [platform, setPlatform] = useState("reddit");
  const [groupName, setGroupName] = useState("");
  const [topic, setTopic] = useState("");
  const [postType, setPostType] = useState("post");
  const [tone, setTone] = useState(TONES[0]);
  const [groupUrl, setGroupUrl] = useState<string | undefined>();
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [showDiscover, setShowDiscover] = useState(false);

  const discoverMut = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/community-discover", {
          brandName,
          industry,
          keywords: [],
        })
      ).json(),
    onError: () => toast({ title: "Discovery failed", variant: "destructive" }),
  });
  const groups: DiscoveredGroup[] = discoverMut.data?.data ?? [];

  const genMut = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/community-generate", {
          brandName,
          brandDescription,
          platform,
          groupName,
          topic,
          postType,
          tone,
        })
      ).json(),
    onSuccess: (r: { data?: GeneratedContent }) => {
      if (r?.data) setGenerated(r.data);
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const saveMut = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/community-posts", {
          brandId,
          platform,
          groupName,
          groupUrl,
          title: generated?.title ?? topic,
          content: generated?.content ?? "",
          status: "draft",
          postType,
          generatedByAi: 1,
        })
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (qq) => Array.isArray(qq.queryKey) && qq.queryKey[0] === "/api/community-posts",
      });
      toast({ title: "Draft saved", description: "It's in your Production list." });
      onCreated();
    },
    onError: () => toast({ title: "Couldn't save draft", variant: "destructive" }),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>New community post</DialogTitle>
        <DialogDescription>
          Find a relevant community, generate an authentic post, and save it as a draft — all here.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={discoverMut.isPending || !brandName}
          onClick={() => {
            setShowDiscover(true);
            discoverMut.mutate();
          }}
          data-testid="community-discover"
        >
          {discoverMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Compass className="mr-2 h-4 w-4" />
          )}
          Discover communities
        </Button>

        {showDiscover && groups.length > 0 && (
          <div className="max-h-40 space-y-1.5 overflow-auto rounded-md border border-border p-2">
            {groups.map((g) => (
              <button
                key={`${g.platform}:${g.name}`}
                type="button"
                onClick={() => {
                  setPlatform(g.platform);
                  setGroupName(g.name);
                  setGroupUrl(g.url);
                }}
                data-testid={`community-group-${g.name}`}
                className={[
                  "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  groupName === g.name ? "bg-primary/10 text-foreground" : "hover:bg-muted/60",
                ].join(" ")}
              >
                <span className="font-medium">{g.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {g.platform} · {g.members}
                  {g.relevance === "high" ? " · high relevance" : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 block text-sm">Platform</Label>
            <Input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              data-testid="community-platform"
            />
          </div>
          <div>
            <Label className="mb-1 block text-sm">Community / group</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="r/SaaS"
              data-testid="community-group-name"
            />
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-sm">Topic</Label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should the post be about?"
            data-testid="community-topic"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 block text-sm">Type</Label>
            <Select value={postType} onValueChange={setPostType}>
              <SelectTrigger data-testid="community-posttype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-sm">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger data-testid="community-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={!groupName || !topic || genMut.isPending || !brandName}
          onClick={() => genMut.mutate()}
          data-testid="community-generate"
        >
          {genMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {generated ? "Regenerate" : "Generate post"}
        </Button>

        {generated && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium text-foreground">{generated.title}</p>
            <p className="max-h-40 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
              {generated.content}
            </p>
            {generated.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {generated.hashtags.map((h) => (
                  <Badge key={h} variant="secondary" className="text-xs">
                    {h}
                  </Badge>
                ))}
              </div>
            )}
            {generated.bestTimeToPost && (
              <p className="text-xs text-muted-foreground">
                Best time to post: {generated.bestTimeToPost}
              </p>
            )}
            <Button
              className="w-full"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              data-testid="community-save"
            >
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save as draft
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
