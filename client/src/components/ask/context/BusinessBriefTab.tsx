// Business brief tab (business-context.md). One always-editable form - see
// shared/ask/brief.ts's header for why this deliberately has no separate
// "Use this brief / Edit first / Dismiss" review card. A website-sourced
// draft (when one exists and nothing has been saved yet) pre-fills Products
// and services / Markets and audiences, with its sources shown in a
// disclosure below - "stays separate until you choose Save brief" is
// enforced server-side (briefStorage.ts never touches `brands` until Save
// brief runs), not by hiding a button here.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage, apiErrorCode } from "@/lib/queryClient";
import { useAskBrief } from "@/hooks/useAskBrief";
import { cn } from "@/lib/utils";
import type { AskBriefView } from "@shared/ask/brief";

type FormState = {
  goals: string;
  productsServices: string;
  marketsAudiences: string;
  currentPriorities: string;
  peopleCapacity: string;
  constraints: string;
};

function toForm(brief: AskBriefView): FormState {
  return {
    goals: brief.goals,
    productsServices: brief.productsServices,
    marketsAudiences: brief.marketsAudiences,
    currentPriorities: brief.currentPriorities,
    peopleCapacity: brief.peopleCapacity,
    constraints: brief.constraints,
  };
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-caption text-vc-secondary">{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="resize-y"
      />
      <p className="text-data text-vc-tertiary">{hint}</p>
    </div>
  );
}

export function BusinessBriefTab({ brandId }: { brandId: string | null }) {
  const { toast } = useToast();
  const { brief, isLoading, save, generateDraft } = useAskBrief(brandId);
  const [form, setForm] = useState<FormState | null>(null);
  const [priorsOpen, setPriorsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const attemptedAutoGenerate = useRef(false);

  // Load server state into local form state once - a later refetch (e.g.
  // after Save) is applied by the save mutation's own onSuccess instead of
  // here, so an in-progress edit is never clobbered by a background
  // revalidation.
  useEffect(() => {
    if (brief && form === null) setForm(toForm(brief));
  }, [brief, form]);

  // Auto-generate the website draft once, the first time this brand has
  // never been scraped and nothing has been saved yet - the empty-state
  // equivalent of Trakkr's "A starting business brief is ready from your
  // website" inbox row, but proactive rather than waiting for a click.
  useEffect(() => {
    if (!brief || attemptedAutoGenerate.current) return;
    if (brief.scrapeStatus === "none" && brief.status === "draft" && !brief.hasAnyContent) {
      attemptedAutoGenerate.current = true;
      generateDraft.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief?.scrapeStatus, brief?.status, brief?.hasAnyContent]);

  // A draft that just finished scraping (generateDraft.mutate's onSuccess
  // invalidates the query) replaces the still-empty local form - but only
  // while the user hasn't typed anything into Products/Markets yet, so a
  // slow scrape can never overwrite something they already started editing.
  useEffect(() => {
    if (!brief || !form) return;
    if (brief.scrapeStatus !== "ready") return;
    if (form.productsServices || form.marketsAudiences) return;
    if (!brief.productsServices && !brief.marketsAudiences) return;
    setForm(toForm(brief));
  }, [brief, form]);

  const handleSave = () => {
    if (!brief || !form) return;
    save.mutate(
      { ...form, brandUpdatedAt: brief.brandUpdatedAt },
      {
        onSuccess: () => {
          toast({ description: "Brief saved." });
        },
        onError: (err) => {
          const code = apiErrorCode(err);
          toast({
            description: getApiErrorMessage(err, "Failed to save brief"),
            variant: "destructive",
            ...(code === "brief_conflict" ? { duration: 8000 } : {}),
          });
        },
      },
    );
  };

  const handleCancel = () => {
    if (brief) setForm(toForm(brief));
  };

  const isDirty = !!brief && !!form && JSON.stringify(form) !== JSON.stringify(toForm(brief));

  if (isLoading || !form) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-vc-muted" />
        ))}
      </div>
    );
  }

  const isScraping = brief?.scrapeStatus === "running" || generateDraft.isPending;

  return (
    <div className="max-w-2xl space-y-6">
      {isScraping && (
        <div className="flex items-center gap-2 rounded-md border border-vc-default bg-vc-surface px-3 py-2 text-caption text-vc-tertiary animate-fade-in motion-reduce:animate-none">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          Reading your website…
        </div>
      )}

      <Field
        label="Goals"
        hint="The outcomes the business is working towards."
        value={form.goals}
        onChange={(v) => setForm({ ...form, goals: v })}
        placeholder="Increase qualified enquiries from AI search this quarter."
      />
      <Field
        label="Products and services"
        hint="What you sell and what makes it different."
        value={form.productsServices}
        onChange={(v) => setForm({ ...form, productsServices: v })}
        placeholder="Strategic PR that's earned billions of impressions for the world's most ambitious brands."
      />
      <Field
        label="Markets and audiences"
        hint="Where you operate and who you want to reach."
        value={form.marketsAudiences}
        onChange={(v) => setForm({ ...form, marketsAudiences: v })}
        placeholder="B2B SaaS, consumer electronics, robotics, AI companies"
      />

      <Collapsible open={priorsOpen} onOpenChange={setPriorsOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-caption font-medium text-vc-secondary hover:text-vc-primary">
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", priorsOpen && "rotate-180")}
          />
          Priorities, capacity and constraints <span className="text-vc-tertiary">(optional)</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-6 overflow-hidden data-[state=closed]:animate-none data-[state=open]:animate-fade-in-up motion-reduce:data-[state=open]:animate-none">
          <Field
            label="Current priorities"
            hint="What deserves attention first."
            value={form.currentPriorities}
            onChange={(v) => setForm({ ...form, currentPriorities: v })}
            placeholder="Focus on existing product pages before creating new content."
          />
          <Field
            label="People and capacity"
            hint="Who can do the work, and how much time is available."
            value={form.peopleCapacity}
            onChange={(v) => setForm({ ...form, peopleCapacity: v })}
            placeholder="One content lead, two hours a week. Developer support once a month."
          />
          <Field
            label="Constraints"
            hint="Limits the Agent should respect."
            value={form.constraints}
            onChange={(v) => setForm({ ...form, constraints: v })}
            placeholder="No paid placements. Legal review before publication. Keep the current CMS."
          />
        </CollapsibleContent>
      </Collapsible>

      {brief && brief.sources.length > 0 && (
        <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-caption font-medium text-vc-secondary hover:text-vc-primary">
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", sourcesOpen && "rotate-180")}
            />
            Website sources
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3 data-[state=closed]:animate-none data-[state=open]:animate-fade-in-up motion-reduce:data-[state=open]:animate-none">
            {brief.sources.map((s, i) => (
              <div key={i} className="rounded-md border border-vc-default bg-vc-surface p-3">
                <p className="flex items-center gap-1.5 text-caption font-medium text-vc-accent">
                  <Globe className="h-3 w-3" />
                  {s.title}
                </p>
                <p className="mt-1 text-caption italic text-vc-secondary">
                  &ldquo;{s.quote}&rdquo;
                </p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="flex items-center gap-3 border-t border-vc-default pt-5">
        <Button onClick={handleSave} disabled={save.isPending || !isDirty}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save brief
        </Button>
        <Button variant="ghost" onClick={handleCancel} disabled={save.isPending || !isDirty}>
          Cancel
        </Button>
        <span className="text-data text-vc-tertiary">
          Used in conversations and future recommendations.
        </span>
      </div>
    </div>
  );
}
