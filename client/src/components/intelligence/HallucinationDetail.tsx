import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import type { BrandHallucination } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

// Inspector body. The inline card already shows the claim/fact/badges; what
// it does NOT show anywhere is the exact PROMPT that produced the
// hallucination and when it was detected — the context you need to judge
// and reproduce it. That gap is what this panel closes. DB facts only.
type DraftedCorrection = {
  remediationSteps: string[];
  publicSnippet: { question: string; answer: string };
  factsUsed: string[];
};

const FAQ_CATEGORIES = [
  "general",
  "pricing",
  "features",
  "support",
  "getting-started",
  "comparison",
  "technical",
];

export default function HallucinationDetail({ hal }: { hal: BrandHallucination }) {
  const { toast } = useToast();
  const prompt = hal.prompt || null;
  const detectedAt = hal.detectedAt ? new Date(hal.detectedAt) : null;
  const category = (hal as { category?: string | null }).category ?? null;
  const citingUrl = (hal as { citingOutletUrl?: string | null }).citingOutletUrl ?? null;

  // Show a previously-drafted correction if this row already has one
  // (persisted to remediation_steps + metadata.correction by the endpoint).
  const meta = (hal as { metadata?: unknown }).metadata;
  const persisted =
    meta && typeof meta === "object" && (meta as Record<string, unknown>).correction
      ? ((meta as Record<string, unknown>).correction as {
          publicSnippet?: { question: string; answer: string };
          factsUsed?: string[];
        })
      : null;
  const seedResult: DraftedCorrection | null = persisted?.publicSnippet
    ? {
        remediationSteps: Array.isArray(hal.remediationSteps) ? hal.remediationSteps : [],
        publicSnippet: persisted.publicSnippet,
        factsUsed: persisted.factsUsed ?? [],
      }
    : null;
  const [result, setResult] = useState<DraftedCorrection | null>(seedResult);

  const draft = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/hallucinations/${hal.id}/draft-correction`);
      return (await res.json()) as { success: boolean; data: DraftedCorrection };
    },
    onSuccess: (r) => {
      setResult(r.data);
      queryClient.invalidateQueries({
        queryKey: [`/api/hallucinations?brandId=${hal.brandId}`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/hallucinations/stats/${hal.brandId}`],
      });
      toast({ title: "Correction drafted", description: "Review it, then publish via FAQ." });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      toast({
        title: "Couldn't draft a correction",
        description: msg || "Try again, or add more verified brand facts first.",
        variant: "destructive",
      });
    },
  });

  const faqCat = category && FAQ_CATEGORIES.includes(category) ? category : "general";
  const faqHref = result
    ? `/act?tab=faq&brandId=${encodeURIComponent(hal.brandId)}` +
      `&faqSeedQuestion=${encodeURIComponent(result.publicSnippet.question)}` +
      `&faqSeedAnswer=${encodeURIComponent(result.publicSnippet.answer)}` +
      `&faqSeedCategory=${encodeURIComponent(faqCat)}`
    : "#";
  // Reuses content.tsx's existing seed (`?keyword=…&brandId=…` at bare
  // /content creates a fresh pre-populated draft) — route the user to
  // draft an article that sets the record straight on the false claim.
  const contentHref = result
    ? `/content?keyword=${encodeURIComponent(result.publicSnippet.question)}` +
      `&brandId=${encodeURIComponent(hal.brandId)}`
    : "#";

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{hal.severity}</Badge>
        <Badge variant="outline">{hal.hallucinationType}</Badge>
        <Badge variant="outline">{hal.aiPlatform}</Badge>
        {category && <Badge variant="outline">{category}</Badge>}
      </div>
      {prompt && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Prompt that triggered this
          </p>
          <p className="mt-1 rounded-md border border-border bg-muted/40 p-2 text-foreground">
            {prompt}
          </p>
        </div>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          AI claimed
        </p>
        <p className="mt-1 text-foreground">"{hal.claimedStatement}"</p>
      </div>
      {hal.actualFact && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Actual fact (from your fact sheet)
          </p>
          <p className="mt-1 text-foreground">"{hal.actualFact}"</p>
        </div>
      )}

      <div className="border-t border-border pt-3">
        {!result ? (
          <>
            <Button
              size="sm"
              onClick={() => draft.mutate()}
              disabled={draft.isPending}
              data-testid={`button-draft-correction-${hal.id}`}
            >
              <Sparkles className="mr-1 h-4 w-4" />
              {draft.isPending ? "Drafting…" : "Draft a correction"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Generates a fix grounded only in your fact sheet — a proposal you review, nothing is
              published.
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Remediation plan
              </p>
              <ul className="mt-1 list-disc pl-4 text-foreground">
                {result.remediationSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Publish-ready answer
              </p>
              <p className="mt-1 font-medium text-foreground">{result.publicSnippet.question}</p>
              <p className="mt-0.5 text-foreground">{result.publicSnippet.answer}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(
                        `${result.publicSnippet.question}\n\n${result.publicSnippet.answer}`,
                      )
                      .then(() => toast({ title: "Copied" }))
                      .catch(() => {});
                  }}
                >
                  Copy
                </Button>
                <Link href={faqHref}>
                  <Button size="sm" data-testid={`button-open-faq-${hal.id}`}>
                    Open in FAQ →
                  </Button>
                </Link>
                <Link href={contentHref}>
                  <Button size="sm" variant="outline" data-testid={`button-open-content-${hal.id}`}>
                    Draft article →
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => draft.mutate()}
                  disabled={draft.isPending}
                >
                  {draft.isPending ? "Regenerating…" : "Regenerate"}
                </Button>
              </div>
            </div>
            {result.factsUsed.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Grounded in: {result.factsUsed.join(", ")}. Review before publishing — nothing was
                published automatically.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3 text-xs text-muted-foreground">
        {detectedAt && <p>Detected {new Date(detectedAt).toLocaleString()}</p>}
        {citingUrl && (
          <p className="mt-1 break-all">
            Cited at: <span className="text-foreground">{citingUrl}</span>
          </p>
        )}
        <p className="mt-2">Every field here is recorded from the scan — no estimates.</p>
      </div>
    </div>
  );
}
