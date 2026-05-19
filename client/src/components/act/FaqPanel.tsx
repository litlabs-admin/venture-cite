// FAQ creation, in-context. /act rework: the orphaned faq-manager page
// is retired; its three real capabilities — manual add, AI-generate a
// batch, and Schema.org FAQPage markup — fold into this compact panel
// on the Production create dialog. Endpoints are the faq-manager ones
// verbatim (POST /api/faqs, POST /api/faqs/generate/:brandId, and the
// pure client schema fn). The faqSeed* URL params are still read so the
// hallucination-correction "Open in FAQ" deep-link (4b) keeps prefilling.
import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Sparkles, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

const FAQ_CATEGORIES = [
  "general",
  "pricing",
  "features",
  "support",
  "getting-started",
  "comparison",
  "technical",
];

type Mode = "add" | "generate" | "schema";

export default function FaqPanel({
  brandId,
  onCreated,
}: {
  brandId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const search = useSearch();

  // Hallucination-correction deep-link (4b): /act?...&faqSeedQuestion=…
  // &faqSeedAnswer=…&faqSeedCategory=… must still arrive prefilled now
  // that faq-manager (which used to read these) is retired.
  const seed = useMemo(() => {
    const p = new URLSearchParams(search);
    return {
      q: p.get("faqSeedQuestion") ?? "",
      a: p.get("faqSeedAnswer") ?? "",
      c: p.get("faqSeedCategory") ?? "general",
    };
  }, [search]);
  const seeded = !!(seed.q || seed.a);

  const [mode, setMode] = useState<Mode>("add");
  const [q, setQ] = useState(seed.q);
  const [a, setA] = useState(seed.a);
  const [cat, setCat] = useState(seed.c);
  const [genTopic, setGenTopic] = useState("");
  const [genCount, setGenCount] = useState("5");

  const faqsQ = useQuery<{ data: { question: string; answer: string }[] }>({
    queryKey: [`/api/faqs?brandId=${brandId}`],
    enabled: !!brandId,
  });
  // Stable ref so it doesn't churn the schemaJson useMemo each render.
  const faqs = useMemo(() => faqsQ.data?.data ?? [], [faqsQ.data]);

  const schemaJson = useMemo(() => {
    if (!faqs.length) return "";
    return JSON.stringify(
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
      null,
      2,
    );
  }, [faqs]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/faqs?brandId=${brandId}`] });

  const addMut = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/faqs", {
          brandId,
          question: q,
          answer: a,
          category: cat,
        })
      ).json(),
    onSuccess: () => {
      invalidate();
      toast({ title: "FAQ added" });
      onCreated();
    },
    onError: () => toast({ title: "Couldn't add FAQ", variant: "destructive" }),
  });

  const genMut = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", `/api/faqs/generate/${brandId}`, {
          topic: genTopic,
          count: parseInt(genCount, 10) || 5,
        })
      ).json(),
    onSuccess: () => {
      invalidate();
      toast({
        title: "FAQs generated",
        description: "They're in your Production list — open one to edit or optimize.",
      });
      onCreated();
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const SEGMENTS: { id: Mode; label: string }[] = [
    { id: "add", label: "Add one" },
    { id: "generate", label: "AI generate" },
    { id: "schema", label: "Schema" },
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle>New FAQ</DialogTitle>
        <DialogDescription>
          Add one by hand, generate a batch with AI, or copy the Schema.org markup for the FAQs you
          already have.
        </DialogDescription>
      </DialogHeader>

      {!seeded && (
        <div className="mb-1 flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {SEGMENTS.map((s) => {
            const on = s.id === mode;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setMode(s.id)}
                data-testid={`faq-mode-${s.id}`}
                className={[
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {mode === "add" || seeded ? (
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-sm">Question</Label>
            <Textarea
              rows={2}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="faq-q"
            />
          </div>
          <div>
            <Label className="mb-1 block text-sm">Answer</Label>
            <Textarea
              rows={4}
              value={a}
              onChange={(e) => setA(e.target.value)}
              data-testid="faq-a"
            />
          </div>
          <div>
            <Label className="mb-1 block text-sm">Category</Label>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger data-testid="faq-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAQ_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={!q || !a || addMut.isPending}
            onClick={() => addMut.mutate()}
            data-testid="faq-add-submit"
          >
            {addMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add FAQ
          </Button>
        </div>
      ) : mode === "generate" ? (
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-sm">Topic (optional)</Label>
            <Input
              value={genTopic}
              onChange={(e) => setGenTopic(e.target.value)}
              placeholder="e.g. pricing & plans — leave blank for a general set"
              data-testid="faq-gen-topic"
            />
          </div>
          <div>
            <Label className="mb-1 block text-sm">How many</Label>
            <Select value={genCount} onValueChange={setGenCount}>
              <SelectTrigger data-testid="faq-gen-count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["3", "5", "10", "15"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            disabled={genMut.isPending}
            onClick={() => genMut.mutate()}
            data-testid="faq-gen-submit"
          >
            {genMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate FAQs
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            JSON-LD <code>FAQPage</code> markup for your {faqs.length} FAQ
            {faqs.length === 1 ? "" : "s"}. Paste it into the page&apos;s <code>&lt;head&gt;</code>{" "}
            so AI engines can extract structured Q&amp;A.
          </p>
          {faqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No FAQs yet — add or generate some first.
            </p>
          ) : (
            <>
              <pre className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                {schemaJson}
              </pre>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(
                      `<script type="application/ld+json">\n${schemaJson}\n</script>`,
                    );
                    toast({ title: "Schema copied" });
                  }
                }}
                data-testid="faq-schema-copy"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy with &lt;script&gt; tag
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
