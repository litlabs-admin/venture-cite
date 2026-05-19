// FAQ detail/edit, in-context. /act rework: FAQ rows in the Production
// list used to dead-end (navigate back to the filtered list). They now
// open this sheet — edit question/answer, optimize, or delete — reusing
// the verbatim faq-manager endpoints (PATCH /api/faqs/:id {question,
// answer}, POST /api/faqs/:id/optimize, DELETE /api/faqs/:id).
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Trash2, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  category?: string | null;
  aiSurfaceScore?: number | null;
  isOptimized?: number | null;
  optimizationTips?: string[] | null;
};

export default function FaqDetailSheet({
  faq,
  brandId,
  open,
  onOpenChange,
}: {
  faq: FaqRow | null;
  brandId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (open && faq) {
      setQuestion(faq.question ?? "");
      setAnswer(faq.answer ?? "");
    }
  }, [open, faq]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/faqs?brandId=${brandId}`] });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!faq) throw new Error("no faq");
      return (await apiRequest("PATCH", `/api/faqs/${faq.id}`, { question, answer })).json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const optimizeMut = useMutation({
    mutationFn: async () => {
      if (!faq) throw new Error("no faq");
      return (await apiRequest("POST", `/api/faqs/${faq.id}/optimize`)).json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "FAQ optimized", description: "Reopen it to see the refined answer." });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Optimize failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!faq) throw new Error("no faq");
      return (await apiRequest("DELETE", `/api/faqs/${faq.id}`)).json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Deleted" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  if (!faq) return null;
  const optimized = faq.isOptimized === 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-8">FAQ</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {faq.category && <Badge variant="outline">{faq.category}</Badge>}
              <Badge variant={optimized ? "default" : "secondary"}>
                {optimized ? "Optimized" : "Not optimized"}
              </Badge>
              {typeof faq.aiSurfaceScore === "number" && (
                <Badge variant="outline">AI surface {faq.aiSurfaceScore}</Badge>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label className="mb-1 block text-sm">Question</Label>
            <Textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              data-testid="faq-detail-q"
            />
          </div>
          <div>
            <Label className="mb-1 block text-sm">Answer</Label>
            <Textarea
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              data-testid="faq-detail-a"
            />
          </div>

          {Array.isArray(faq.optimizationTips) && faq.optimizationTips.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-medium text-foreground">Optimization tips</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {faq.optimizationTips.map((t, i) => (
                  <li key={i}>• {t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!question || !answer || saveMut.isPending}
              onClick={() => saveMut.mutate()}
              data-testid="faq-detail-save"
            >
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button
              variant="outline"
              disabled={optimizeMut.isPending}
              onClick={() => optimizeMut.mutate()}
              data-testid="faq-detail-optimize"
            >
              {optimizeMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Optimize
            </Button>
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
                !window.confirm("Delete this FAQ? This cannot be undone.")
              )
                return;
              deleteMut.mutate();
            }}
            data-testid="faq-detail-delete"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
