// Wave 9.4: full-content view + publish lifecycle for BOFU pieces.
// Replaces the previous geo-tools card body which only rendered a
// 500-char preview in a 160px scroll area — generated content was in
// the DB but invisible to the user. This sheet exposes the whole
// piece, the publish lifecycle, schema-markup helpers, and a delete.

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Copy, Download, ExternalLink, CheckCircle2 } from "lucide-react";
import SafeMarkdown from "@/components/SafeMarkdown";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BofuContent } from "@shared/schema";

interface Props {
  content: BofuContent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Generate a JSON-LD schema block tailored to the content type. The
// browser-side equivalent of what users would otherwise have to assemble
// by hand. Best-effort: comparison content gets a Product/ComparisonTable
// approximation; everything gets a basic Article schema as fallback.
function buildJsonLd(c: BofuContent): string {
  const base = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: c.title,
    datePublished: c.publishedAt
      ? new Date(c.publishedAt as any).toISOString()
      : new Date(c.createdAt as any).toISOString(),
    keywords: c.primaryKeyword || c.contentType,
  };
  if (c.contentType === "comparison" || c.contentType === "alternatives") {
    const competitors = Array.isArray(c.comparedWith) ? c.comparedWith : [];
    return JSON.stringify(
      {
        ...base,
        about: competitors.map((name) => ({ "@type": "Thing", name })),
      },
      null,
      2,
    );
  }
  return JSON.stringify(base, null, 2);
}

function copyToClipboard(text: string, onSuccess: () => void, onError: () => void): void {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess, onError);
  } else {
    onError();
  }
}

function downloadAsFile(filename: string, body: string, mime = "text/markdown"): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BofuContentSheet({ content, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [publishedUrl, setPublishedUrl] = useState("");
  const [markPublished, setMarkPublished] = useState(false);

  // Sync local state whenever the sheet opens with a fresh row.
  useEffect(() => {
    if (open && content) {
      setPublishedUrl(content.publishedUrl ?? "");
      setMarkPublished(!!content.publishedAt);
    }
  }, [open, content]);

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!content) throw new Error("no content selected");
      const r = await apiRequest("PATCH", `/api/bofu-content/${content.id}`, patch);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/bofu-content",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
      toast({ title: "Saved" });
    },
    onError: (err: any) =>
      toast({
        title: "Save failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!content) throw new Error("no content selected");
      const r = await apiRequest("DELETE", `/api/bofu-content/${content.id}`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/bofu-content",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
      onOpenChange(false);
      toast({ title: "Deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  if (!content) return null;

  const handleSavePublish = () => {
    const trimmed = publishedUrl.trim();
    const patch: Record<string, unknown> = {
      publishedUrl: trimmed.length > 0 ? trimmed : null,
    };
    if (markPublished && trimmed.length > 0) {
      patch.publishedAt = new Date().toISOString();
    } else if (!markPublished) {
      patch.publishedAt = null;
    }
    updateMutation.mutate(patch);
  };

  const jsonLd = buildJsonLd(content);
  const lastCitedAt = content.lastCitedAt
    ? new Date(content.lastCitedAt as any).toLocaleDateString()
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{content.title}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="outline">{content.contentType}</Badge>
            <Badge>{content.status ?? "draft"}</Badge>
            {content.publishedAt && (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Published</Badge>
            )}
            {lastCitedAt && (
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                Cited recently · {lastCitedAt}
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="content" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="publish">Publish</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  copyToClipboard(
                    content.content,
                    () => toast({ title: "Content copied" }),
                    () =>
                      toast({
                        title: "Copy failed",
                        variant: "destructive",
                      }),
                  )
                }
                data-testid="button-copy-bofu"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadAsFile(
                    `${content.title.replace(/\W+/g, "-").toLowerCase().slice(0, 80)}.md`,
                    content.content,
                  )
                }
                data-testid="button-download-bofu"
              >
                <Download className="h-3 w-3 mr-1" />
                Download .md
              </Button>
            </div>
            <ScrollArea className="h-[55vh] border rounded-md p-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <SafeMarkdown>{content.content}</SafeMarkdown>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="metadata" className="space-y-3 text-sm">
            <Row label="Type">{content.contentType}</Row>
            <Row label="Primary keyword">{content.primaryKeyword || "—"}</Row>
            <Row label="Compared with">
              {Array.isArray(content.comparedWith) && content.comparedWith.length > 0
                ? content.comparedWith.join(", ")
                : "—"}
            </Row>
            <Row label="Target intent">{content.targetIntent || "—"}</Row>
            <Row label="AI score">{content.aiScore ?? "Not scored"}</Row>
            <Row label="Created">{new Date(content.createdAt as any).toLocaleString()}</Row>
            <Row label="Last updated">{new Date(content.updatedAt as any).toLocaleString()}</Row>
            <Row label="Last cited">{lastCitedAt ?? "Never"}</Row>
          </TabsContent>

          <TabsContent value="publish" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bofu-published-url">Published URL</Label>
              <Input
                id="bofu-published-url"
                placeholder="https://yoursite.com/comparison-page"
                value={publishedUrl}
                onChange={(e) => setPublishedUrl(e.target.value)}
                data-testid="input-bofu-published-url"
              />
              <p className="text-xs text-muted-foreground">
                Once set, the citation checker tracks AI engines citing this URL and stamps "Cited
                recently" when matches are detected.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Mark as published</Label>
                <p className="text-xs text-muted-foreground">
                  Sets the publishedAt timestamp to now.
                </p>
              </div>
              <Switch
                checked={markPublished}
                onCheckedChange={setMarkPublished}
                disabled={!publishedUrl.trim()}
                data-testid="switch-bofu-mark-published"
              />
            </div>
            <Button
              onClick={handleSavePublish}
              disabled={updateMutation.isPending}
              className="w-full"
              data-testid="button-bofu-save-publish"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
            {publishedUrl && (
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Open published URL
              </a>
            )}
          </TabsContent>

          <TabsContent value="schema" className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Drop this JSON-LD into the <code>&lt;head&gt;</code> of the page so AI engines can
              extract structured data.
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  copyToClipboard(
                    `<script type="application/ld+json">\n${jsonLd}\n</script>`,
                    () => toast({ title: "Schema copied" }),
                    () => toast({ title: "Copy failed", variant: "destructive" }),
                  )
                }
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy with &lt;script&gt; tag
              </Button>
            </div>
            <ScrollArea className="h-[40vh] border rounded-md p-3">
              <pre className="text-xs whitespace-pre-wrap break-words">{jsonLd}</pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <SheetFooter className="mt-6">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                !window.confirm("Delete this BOFU piece? This cannot be undone.")
              ) {
                return;
              }
              deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            data-testid="button-bofu-delete"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </SheetFooter>

        {content.publishedAt && (
          <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            Published {new Date(content.publishedAt as any).toLocaleDateString()}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-1.5 border-b last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2 break-words">{children}</span>
    </div>
  );
}
