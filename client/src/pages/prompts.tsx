import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { usePrompts } from "@/hooks/usePrompts";
import { PanelPage } from "@/components/dashboard-panels/Panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PromptsPageBody } from "@/components/prompts/PromptsPageBody";
import { TagsTab } from "@/components/prompts/TagsTab";
import { AudiencesTab } from "@/components/prompts/AudiencesTab";

// ─── Prompts page ────────────────────────────────────────────────────────
// New top-level /prompts route (see the plan's "Resolved design calls" -
// the removed code's own comment named this exact path as where the
// per-prompt detail page used to live). citations.tsx's embedded
// PromptsTab stays as a lighter secondary surface; this is the full,
// trakkr-parity page: real Tags/sparkline/Score/Δ/On-off columns, a
// dedicated /prompts/$promptId detail page, and (as later phases land)
// Tags/Audiences tabs and the Set Health audit.

export default function PromptsPage() {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const [tab, setTab] = useState("prompts");

  const { data: promptsData, isLoading: promptsLoading } = usePrompts(selectedBrandId);
  const prompts = promptsData?.data ?? [];
  const hasPrompts = prompts.length > 0;
  const promptsAgeLabel = hasPrompts
    ? formatDistanceToNow(new Date(prompts[0].createdAt), { addSuffix: true })
    : null;

  const loading = brandsLoading || (!!selectedBrandId && promptsLoading);

  return (
    <PanelPage>
      <div className="border-b border-vc-default px-8 py-6">
        <h1 className="text-page font-semibold text-vc-primary">Prompts</h1>
        <p className="mt-0.5 text-data text-vc-tertiary">
          The questions AI gets asked about {selectedBrand?.name ?? "your brand"}.
        </p>
      </div>

      {loading ? (
        <div className="space-y-px">
          <div className="h-24 w-full animate-pulse bg-vc-muted/40" />
          <div className="h-20 w-full animate-pulse bg-vc-muted/40" />
        </div>
      ) : !selectedBrandId ? (
        <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
          <p className="text-body text-vc-tertiary">No brand selected.</p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="border-b border-vc-default px-8 py-3">
            <TabsList>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
              <TabsTrigger value="audiences">Audiences</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="prompts" className="mt-0">
            <PromptsPageBody
              selectedBrandId={selectedBrandId}
              selectedBrand={selectedBrand}
              prompts={prompts}
              promptsLoading={promptsLoading}
              hasPrompts={hasPrompts}
              promptsAgeLabel={promptsAgeLabel}
            />
          </TabsContent>
          <TabsContent value="tags" className="mt-0">
            <TagsTab selectedBrandId={selectedBrandId} />
          </TabsContent>
          <TabsContent value="audiences" className="mt-0">
            <AudiencesTab selectedBrandId={selectedBrandId} />
          </TabsContent>
        </Tabs>
      )}
    </PanelPage>
  );
}
