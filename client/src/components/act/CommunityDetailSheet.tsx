// Community post detail/edit, in-context. /act rework: Community rows
// in the Production list used to dead-end. They now open this sheet —
// edit, mark posted, or delete — reusing the verbatim community-
// engagement endpoints (PATCH /api/community-posts/:id, DELETE …).
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Trash2, CheckCircle2, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type CommunityRow = {
  id: string;
  title?: string | null;
  content?: string | null;
  platform?: string | null;
  groupName?: string | null;
  status?: string | null;
  postUrl?: string | null;
  postedAt?: string | null;
};

export default function CommunityDetailSheet({
  post,
  open,
  onOpenChange,
}: {
  post: CommunityRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (open && post) {
      setTitle(post.title ?? "");
      setContent(post.content ?? "");
    }
  }, [open, post]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/community-posts",
    });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!post) throw new Error("no post");
      return (
        await apiRequest("PATCH", `/api/community-posts/${post.id}`, { title, content })
      ).json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const postedMut = useMutation({
    mutationFn: async () => {
      if (!post) throw new Error("no post");
      return (
        await apiRequest("PATCH", `/api/community-posts/${post.id}`, {
          status: "posted",
          postedAt: new Date().toISOString(),
        })
      ).json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Marked as posted" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!post) throw new Error("no post");
      return (await apiRequest("DELETE", `/api/community-posts/${post.id}`)).json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Deleted" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  if (!post) return null;
  const status = post.status ?? "draft";
  const isPosted = status === "posted";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-8">{post.title || "Community post"}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {post.platform && <Badge variant="outline">{post.platform}</Badge>}
              {post.groupName && <Badge variant="outline">{post.groupName}</Badge>}
              <Badge variant={isPosted ? "default" : "secondary"}>{status}</Badge>
              {post.postedAt && (
                <span className="text-xs text-muted-foreground">
                  Posted {new Date(post.postedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label className="mb-1 block text-sm">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="community-detail-title"
            />
          </div>
          <div>
            <Label className="mb-1 block text-sm">Content</Label>
            <Textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              data-testid="community-detail-content"
            />
          </div>
          {post.postUrl && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-xs text-primary hover:underline"
            >
              Open the live post
            </a>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!content || saveMut.isPending}
              onClick={() => saveMut.mutate()}
              data-testid="community-detail-save"
            >
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            {!isPosted && (
              <Button
                variant="outline"
                disabled={postedMut.isPending}
                onClick={() => postedMut.mutate()}
                data-testid="community-detail-posted"
              >
                {postedMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Mark posted
              </Button>
            )}
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMut.isPending}
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm("Delete this post? This cannot be undone.")
              )
                return;
              deleteMut.mutate();
            }}
            data-testid="community-detail-delete"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
