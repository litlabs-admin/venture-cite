import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  FileText,
  Building2,
  DollarSign,
  Users,
  BarChart3,
  Settings,
  ExternalLink,
  Shield,
  Globe,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/components/PageHeader";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";

interface BrandFact {
  id: string;
  brandId: string;
  factCategory: string;
  factKey: string;
  factValue: string;
  sourceUrl: string | null;
  source: "manual" | "scraped";
  lastVerified: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

// Canonical categories shared with the auto-scraper (see
// shared/factCategories.ts). Icons are a visual concern local to the page.
import {
  FACT_CATEGORY_ORDER,
  FACT_CATEGORY_LABELS,
  FACT_CATEGORY_DESCRIPTIONS,
  SUGGESTED_FACTS,
  isKnownFactCategory,
  type FactCategory,
} from "@shared/factCategories";

const CATEGORY_ICONS: Record<FactCategory, typeof Building2> = {
  founding: Building2,
  funding: DollarSign,
  team: Users,
  products: Settings,
  pricing: DollarSign,
  locations: Globe,
  achievements: BarChart3,
  other: FileText,
};

const FACT_CATEGORIES = FACT_CATEGORY_ORDER.map((value) => ({
  value,
  label: FACT_CATEGORY_LABELS[value],
  icon: CATEGORY_ICONS[value],
  description: FACT_CATEGORY_DESCRIPTIONS[value],
}));

export default function BrandFactSheet() {
  const { toast } = useToast();
  const { selectedBrandId, brands, selectedBrand } = useBrandSelection();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<BrandFact | null>(null);
  const [newFact, setNewFact] = useState({
    factCategory: "",
    factKey: "",
    factValue: "",
    sourceUrl: "",
  });

  // Poll for facts for the first 2 minutes after a brand is created so the
  // UI refreshes automatically once the async auto-scrape finishes.
  // Once at least one fact appears, polling stops.
  const brandCreatedAt = (selectedBrand as { createdAt?: string | Date | null } | null)?.createdAt;
  const brandAgeMs = brandCreatedAt ? Date.now() - new Date(brandCreatedAt).getTime() : Infinity;
  const shouldPollForScrape = brandAgeMs < 120_000; // 2 min

  const { data: factsData, isLoading: factsLoading } = useQuery<{ data: BrandFact[] }>({
    queryKey: ["/api/brand-facts", selectedBrandId],
    enabled: !!selectedBrandId,
    refetchInterval: (query) => {
      const rows = (query.state.data as { data?: BrandFact[] } | undefined)?.data;
      if (rows && rows.length > 0) return false;
      return shouldPollForScrape ? 3000 : false;
    },
  });

  const facts = factsData?.data || [];

  const createFactMutation = useMutation({
    mutationFn: async (data: typeof newFact & { brandId: string }) => {
      return apiRequest("POST", "/api/brand-facts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      setIsAddDialogOpen(false);
      setNewFact({ factCategory: "", factKey: "", factValue: "", sourceUrl: "" });
      toast({ title: "Fact added", description: "Brand fact has been saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add fact.", variant: "destructive" });
    },
  });

  const updateFactMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<BrandFact> & { id: string }) => {
      return apiRequest("PATCH", `/api/brand-facts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      setEditingFact(null);
      toast({ title: "Fact updated", description: "Brand fact has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update fact.", variant: "destructive" });
    },
  });

  const deleteFactMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/brand-facts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      toast({ title: "Fact deleted", description: "Brand fact has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete fact.", variant: "destructive" });
    },
  });

  const rescrapeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBrandId) throw new Error("No brand selected");
      const res = await apiRequest("POST", `/api/brand-facts/scrape/${selectedBrandId}`);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      const inserted = result?.data?.inserted ?? 0;
      toast({
        title: inserted > 0 ? "Facts updated" : "No new facts",
        description:
          inserted > 0
            ? `${inserted} new fact${inserted === 1 ? "" : "s"} scraped from your website.`
            : "Your fact sheet is already up to date with what we can scrape.",
      });
    },
    onError: () => {
      toast({
        title: "Scrape failed",
        description: "Could not scrape the website. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddFact = () => {
    if (!selectedBrandId || !newFact.factCategory || !newFact.factKey || !newFact.factValue) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    createFactMutation.mutate({ ...newFact, brandId: selectedBrandId });
  };

  const handleUpdateFact = () => {
    if (!editingFact) return;
    updateFactMutation.mutate({
      id: editingFact.id,
      factCategory: editingFact.factCategory,
      factKey: editingFact.factKey,
      factValue: editingFact.factValue,
      sourceUrl: editingFact.sourceUrl,
    });
  };

  const scrapedFacts = facts.filter((f) => f.source === "scraped");
  const manualFactsCount = facts.length - scrapedFacts.length;
  const lastScrapedAt = scrapedFacts.reduce<Date | null>((acc, f) => {
    const ts = new Date(f.lastVerified || f.createdAt);
    if (Number.isNaN(ts.getTime())) return acc;
    return !acc || ts > acc ? ts : acc;
  }, null);
  const formatRelative = (d: Date) => {
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  const brandWebsite = (selectedBrand as { website?: string | null } | null)?.website ?? "";

  // Data-driven grouping: render every category we actually have data for,
  // in canonical order first, then any unknown scraper categories last
  // under their raw label. Previously the UI hardcoded 5 categories and
  // silently dropped every scraped fact whose category wasn't in that
  // list — so auto-scrape looked broken even when it populated rows.
  const groupedFacts = (() => {
    const byCategory = new Map<string, BrandFact[]>();
    for (const f of facts) {
      const arr = byCategory.get(f.factCategory) ?? [];
      arr.push(f);
      byCategory.set(f.factCategory, arr);
    }
    const canonical = FACT_CATEGORIES.filter((c) => byCategory.has(c.value)).map((c) => ({
      ...c,
      facts: byCategory.get(c.value) ?? [],
    }));
    const unknown = Array.from(byCategory.keys())
      .filter((k) => !isKnownFactCategory(k))
      .sort()
      .map((k) => ({
        value: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        icon: FileText,
        description: "",
        facts: byCategory.get(k) ?? [],
      }));
    return [...canonical, ...unknown];
  })();

  const getCategoryIcon = (category: string) => {
    const cat = FACT_CATEGORIES.find((c) => c.value === category);
    if (cat) {
      const Icon = cat.icon;
      return <Icon className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="space-y-8">
      <Helmet>
        <title>Brand Fact Sheet - VentureCite</title>
      </Helmet>
      <PageHeader
        title="Brand Fact Sheet"
        description="Define verified facts about your brand to detect AI hallucinations and ensure accurate information."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Select Brand</CardTitle>
          <CardDescription>Choose which brand to manage facts for</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandSelector className="w-full max-w-md" />
          {brands.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              No brands found.{" "}
              <Link href="/brands" className="text-primary hover:underline">
                Create a brand first
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {selectedBrand && (
        <>
          <Card className="mb-6 border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="w-5 h-5 text-violet-600" />
                Re-scrape Facts from Website
              </CardTitle>
              <CardDescription>
                We automatically scrape your website when you create a brand and again each month.
                Use this to re-scrape on demand — duplicate facts are skipped.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">Website</div>
                  {brandWebsite ? (
                    <a
                      href={brandWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-violet-600 hover:underline break-all inline-flex items-center gap-1"
                      data-testid="text-brand-website"
                    >
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      {brandWebsite}
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Add a website to your brand first.
                    </span>
                  )}
                </div>
                <Button
                  onClick={() => rescrapeMutation.mutate()}
                  disabled={!brandWebsite || rescrapeMutation.isPending}
                  data-testid="button-rescrape"
                >
                  {rescrapeMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scraping…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Re-scrape from Website
                    </>
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-3">
                <span>
                  Last scraped:{" "}
                  <span className="text-foreground font-medium">
                    {lastScrapedAt ? formatRelative(lastScrapedAt) : "Never"}
                  </span>
                </span>
                <span>
                  {scrapedFacts.length} scraped · {manualFactsCount} manual
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold">{selectedBrand.name} Facts</h2>
              <p className="text-sm text-muted-foreground">{facts.length} verified facts</p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-fact">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Fact
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add New Fact</DialogTitle>
                  <DialogDescription>
                    Add a verified fact about {selectedBrand.name}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select
                      value={newFact.factCategory}
                      onValueChange={(v) =>
                        setNewFact({ ...newFact, factCategory: v, factKey: "" })
                      }
                    >
                      <SelectTrigger data-testid="select-fact-category">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FACT_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {newFact.factCategory && (
                    <div className="space-y-2">
                      <Label>Fact Type *</Label>
                      <Select
                        value={newFact.factKey}
                        onValueChange={(v) => setNewFact({ ...newFact, factKey: v })}
                      >
                        <SelectTrigger data-testid="select-fact-key">
                          <SelectValue placeholder="Select or type fact type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {isKnownFactCategory(newFact.factCategory) &&
                            SUGGESTED_FACTS[newFact.factCategory].map((fact) => (
                              <SelectItem key={fact.key} value={fact.key}>
                                {fact.label}
                              </SelectItem>
                            ))}
                          <SelectItem value="custom">Custom...</SelectItem>
                        </SelectContent>
                      </Select>
                      {newFact.factKey === "custom" && (
                        <Input
                          placeholder="Enter custom fact key..."
                          className="mt-2"
                          onChange={(e) => setNewFact({ ...newFact, factKey: e.target.value })}
                          data-testid="input-custom-fact-key"
                        />
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Value *</Label>
                    <Input
                      placeholder="e.g., 2015, $79/month, John Smith"
                      value={newFact.factValue}
                      onChange={(e) => setNewFact({ ...newFact, factValue: e.target.value })}
                      data-testid="input-fact-value"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Source URL (optional)</Label>
                    <Input
                      placeholder="https://yoursite.com/about"
                      value={newFact.sourceUrl}
                      onChange={(e) => setNewFact({ ...newFact, sourceUrl: e.target.value })}
                      data-testid="input-fact-source"
                    />
                    <p className="text-xs text-muted-foreground">
                      Link to where this fact can be verified
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddFact}
                    disabled={createFactMutation.isPending}
                    data-testid="button-save-fact"
                  >
                    {createFactMutation.isPending ? "Saving..." : "Save Fact"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {factsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : facts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                {shouldPollForScrape ? (
                  <>
                    <Loader2 className="w-12 h-12 mx-auto text-violet-500 mb-4 animate-spin" />
                    <h3 className="text-lg font-semibold mb-2">
                      Auto-scraping facts from your website…
                    </h3>
                    <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                      This usually takes 30–60 seconds. We'll populate this page as soon as we find
                      facts. You can add more manually at any time.
                    </p>
                  </>
                ) : (
                  <>
                    <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Facts Added Yet</h3>
                    <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                      {brandWebsite ? (
                        <>
                          We couldn't extract any facts from{" "}
                          <span className="font-medium">{brandWebsite}</span> automatically — this
                          can happen on single-page apps where content only renders in the browser.
                          Add a few manually below to activate hallucination detection.
                        </>
                      ) : (
                        <>
                          Add verified facts about {selectedBrand.name} to enable hallucination
                          detection. AI engines sometimes state incorrect information — your fact
                          sheet helps us catch these errors.
                        </>
                      )}
                    </p>
                  </>
                )}
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  data-testid="button-add-first-fact"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Fact
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {groupedFacts.map((category) => {
                if (category.facts.length === 0) return null;
                const CategoryIcon = category.icon;
                return (
                  <Card key={category.value}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <CategoryIcon className="w-5 h-5 text-violet-600" />
                        <CardTitle className="text-lg">{category.label}</CardTitle>
                        <Badge variant="secondary" className="ml-auto">
                          {category.facts.length}
                        </Badge>
                      </div>
                      <CardDescription>{category.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {category.facts.map((fact) => (
                          <div
                            key={fact.id}
                            className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                            data-testid={`fact-item-${fact.id}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">
                                  {(isKnownFactCategory(fact.factCategory)
                                    ? SUGGESTED_FACTS[fact.factCategory].find(
                                        (f) => f.key === fact.factKey,
                                      )?.label
                                    : undefined) || fact.factKey}
                                </span>
                                <CheckCircle className="w-3 h-3 text-green-600" />
                                {fact.source === "scraped" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 h-4"
                                    data-testid={`badge-scraped-${fact.id}`}
                                  >
                                    Scraped
                                  </Badge>
                                )}
                              </div>
                              <p className="text-foreground">{fact.factValue}</p>
                              {fact.sourceUrl && (
                                <a
                                  href={fact.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-violet-600 hover:underline flex items-center gap-1 mt-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Source
                                </a>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditingFact(fact)}
                                data-testid={`button-edit-fact-${fact.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => deleteFactMutation.mutate(fact.id)}
                                data-testid={`button-delete-fact-${fact.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <Separator className="my-8" />

              <Card className="bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800">
                <CardContent className="py-6">
                  <div className="flex items-start gap-4">
                    <Shield className="w-10 h-10 text-violet-600 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold mb-1">How Fact Sheets Protect Your Brand</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        When AI engines like ChatGPT or Claude mention your brand, we compare their
                        statements against your verified facts. If they say something incorrect
                        (e.g., wrong pricing, outdated leadership), we flag it as a hallucination so
                        you can take action.
                      </p>
                      <Link href="/ai-intelligence">
                        <Button variant="outline" size="sm" data-testid="link-view-hallucinations">
                          View Detected Hallucinations
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <Dialog open={!!editingFact} onOpenChange={(open) => !open && setEditingFact(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Fact</DialogTitle>
            <DialogDescription>Update this verified fact</DialogDescription>
          </DialogHeader>
          {editingFact && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editingFact.factCategory}
                  onValueChange={(v) => setEditingFact({ ...editingFact, factCategory: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fact Key</Label>
                <Input
                  value={editingFact.factKey}
                  onChange={(e) => setEditingFact({ ...editingFact, factKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  value={editingFact.factValue}
                  onChange={(e) => setEditingFact({ ...editingFact, factValue: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Source URL</Label>
                <Input
                  value={editingFact.sourceUrl || ""}
                  onChange={(e) => setEditingFact({ ...editingFact, sourceUrl: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFact(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateFact} disabled={updateFactMutation.isPending}>
              {updateFactMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
