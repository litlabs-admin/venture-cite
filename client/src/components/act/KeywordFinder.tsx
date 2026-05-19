// Keyword research, re-surfaced as the PRECURSOR to creation. /act
// rework: the orphaned keyword-research page is retired; "where did
// keyword generation go?" is answered by making it the front of the
// funnel — research a keyword here, then "Use" it to seed a new
// article. Endpoints verbatim: POST /api/keyword-research/discover
// {brandId}, GET /api/keyword-research/:brandId; the seed link is the
// proven /content?keyword=…&type=…&industry=…&brandId=… mechanism.
//
// Tour engine targets (literal data-tour-id strings for the verifier):
//   data-tour-id="keywords.firstRow"
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBrandSelection } from "@/hooks/use-brand-selection";

type Kw = {
  id: string;
  keyword: string;
  intent?: string | null;
  category?: string | null;
  opportunityScore?: number | null;
  aiCitationPotential?: number | null;
  searchVolume?: number | null;
  suggestedContentType?: string | null;
};

export default function KeywordFinder({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { selectedBrandId, selectedBrand } = useBrandSelection();

  const listQ = useQuery<{ success: boolean; data: Kw[] }>({
    queryKey: [`/api/keyword-research/${selectedBrandId}`],
    enabled: !!selectedBrandId && open,
  });
  const keywords = listQ.data?.data ?? [];

  const discoverMut = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/keyword-research/discover", {
          brandId: selectedBrandId,
        })
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/keyword-research/${selectedBrandId}`],
      });
      toast({ title: "Keywords refreshed" });
    },
    onError: () => toast({ title: "Discovery failed", variant: "destructive" }),
  });

  const seedFromKeyword = (kw: Kw) => {
    const params = new URLSearchParams();
    params.set("keyword", kw.keyword);
    params.set("type", kw.suggestedContentType || "article");
    if (selectedBrand?.industry) params.set("industry", selectedBrand.industry);
    if (selectedBrandId) params.set("brandId", selectedBrandId);
    onOpenChange(false);
    setLocation(`/content?${params.toString()}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Find keywords</SheetTitle>
          <SheetDescription>
            Research the queries worth ranking for, then turn one into a seeded draft. This is the
            front of the create funnel.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <Button
            className="w-full"
            variant="outline"
            disabled={discoverMut.isPending || !selectedBrandId}
            onClick={() => discoverMut.mutate()}
            data-testid="keyword-discover"
          >
            {discoverMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {keywords.length ? "Refresh keywords" : "Discover keywords"}
          </Button>

          {listQ.isLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : keywords.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No keywords yet — discover a set to get started.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border">
              {keywords.map((kw, i) => (
                <li
                  key={kw.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                  data-tour-id={i === 0 ? "keywords.firstRow" : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{kw.keyword}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {kw.intent && (
                        <Badge variant="secondary" className="text-xs">
                          {kw.intent}
                        </Badge>
                      )}
                      {typeof kw.opportunityScore === "number" && (
                        <span className="text-xs text-muted-foreground">
                          opportunity {kw.opportunityScore}
                        </span>
                      )}
                      {typeof kw.aiCitationPotential === "number" && (
                        <span className="text-xs text-muted-foreground">
                          · AI-cite {kw.aiCitationPotential}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => seedFromKeyword(kw)}
                    data-testid={`keyword-use-${kw.id}`}
                  >
                    Use
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
