import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, CheckCircle, FileText, Building2, DollarSign, Users, BarChart3, Settings, ExternalLink, ArrowLeft, Shield, Globe, Loader2 } from "lucide-react";
import { Link } from "wouter";

interface Brand {
  id: string;
  name: string;
  companyName: string;
}

interface BrandFact {
  id: string;
  brandId: string;
  factCategory: string;
  factKey: string;
  factValue: string;
  sourceUrl: string | null;
  lastVerified: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

const FACT_CATEGORIES = [
  { value: "company_info", label: "Company Info", icon: Building2, description: "Basic company details" },
  { value: "pricing", label: "Pricing", icon: DollarSign, description: "Product and service pricing" },
  { value: "team", label: "Team", icon: Users, description: "Leadership and team info" },
  { value: "statistics", label: "Statistics", icon: BarChart3, description: "Key metrics and numbers" },
  { value: "features", label: "Features", icon: Settings, description: "Product capabilities" },
];

const SUGGESTED_FACTS: Record<string, { key: string; label: string }[]> = {
  company_info: [
    { key: "founding_year", label: "Year Founded" },
    { key: "headquarters", label: "Headquarters Location" },
    { key: "company_size", label: "Company Size" },
    { key: "industry", label: "Industry" },
    { key: "tagline", label: "Company Tagline" },
  ],
  pricing: [
    { key: "pricing_starter", label: "Starter Plan Price" },
    { key: "pricing_pro", label: "Pro Plan Price" },
    { key: "pricing_enterprise", label: "Enterprise Plan Price" },
    { key: "free_trial", label: "Free Trial Details" },
  ],
  team: [
    { key: "ceo_name", label: "CEO Name" },
    { key: "founder_names", label: "Founder Names" },
    { key: "employee_count", label: "Employee Count" },
  ],
  statistics: [
    { key: "customers_count", label: "Number of Customers" },
    { key: "revenue", label: "Annual Revenue" },
    { key: "growth_rate", label: "Growth Rate" },
    { key: "funding_raised", label: "Total Funding Raised" },
  ],
  features: [
    { key: "core_features", label: "Core Features" },
    { key: "integrations", label: "Key Integrations" },
    { key: "platforms", label: "Supported Platforms" },
  ],
};

export default function BrandFactSheet() {
  const { toast } = useToast();
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<BrandFact | null>(null);
  const [autofillUrl, setAutofillUrl] = useState("");
  const [newFact, setNewFact] = useState({
    factCategory: "",
    factKey: "",
    factValue: "",
    sourceUrl: "",
  });

  const { data: brandsData } = useQuery<{ data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsData?.data || [];
  const selectedBrand = brands.find(b => b.id === selectedBrandId);

  const { data: factsData, isLoading: factsLoading } = useQuery<{ data: BrandFact[] }>({
    queryKey: ["/api/brand-facts", selectedBrandId],
    enabled: !!selectedBrandId,
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

  const autofillMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/brands/autofill", { url });
      return res.json();
    },
    onSuccess: async (result: any) => {
      if (!result.success || !result.data || !selectedBrandId) return;
      const data = result.data;
      const factsToCreate: { factCategory: string; factKey: string; factValue: string; sourceUrl: string }[] = [];
      if (data.name) factsToCreate.push({ factCategory: "company_info", factKey: "tagline", factValue: data.name, sourceUrl: autofillUrl });
      if (data.industry) factsToCreate.push({ factCategory: "company_info", factKey: "industry", factValue: data.industry, sourceUrl: autofillUrl });
      if (data.description) factsToCreate.push({ factCategory: "company_info", factKey: "company_description", factValue: data.description, sourceUrl: autofillUrl });
      if (data.targetAudience) factsToCreate.push({ factCategory: "company_info", factKey: "target_audience", factValue: data.targetAudience, sourceUrl: autofillUrl });
      if (data.products) factsToCreate.push({ factCategory: "features", factKey: "core_features", factValue: data.products, sourceUrl: autofillUrl });
      if (data.keyValues) factsToCreate.push({ factCategory: "company_info", factKey: "brand_values", factValue: data.keyValues, sourceUrl: autofillUrl });
      if (data.uniqueSellingPoints) factsToCreate.push({ factCategory: "features", factKey: "unique_selling_points", factValue: data.uniqueSellingPoints, sourceUrl: autofillUrl });

      for (const fact of factsToCreate) {
        try {
          await apiRequest("POST", "/api/brand-facts", { ...fact, brandId: selectedBrandId });
        } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ["/api/brand-facts", selectedBrandId] });
      setAutofillUrl("");
      toast({ title: "Facts auto-filled", description: `${factsToCreate.length} facts were extracted from the website and saved.` });
    },
    onError: () => {
      toast({ title: "Auto-fill failed", description: "Could not analyze the website. Please try again.", variant: "destructive" });
    },
  });

  const handleAddFact = () => {
    if (!selectedBrandId || !newFact.factCategory || !newFact.factKey || !newFact.factValue) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
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

  const groupedFacts = FACT_CATEGORIES.map(cat => ({
    ...cat,
    facts: facts.filter(f => f.factCategory === cat.value),
  }));

  const getCategoryIcon = (category: string) => {
    const cat = FACT_CATEGORIES.find(c => c.value === category);
    if (cat) {
      const Icon = cat.icon;
      return <Icon className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <Link href="/ai-intelligence">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="link-back-ai-intelligence">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to AI Intelligence
          </Button>
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-violet-600" />
          <h1 className="text-3xl font-bold text-foreground">Brand Fact Sheet</h1>
        </div>
        <p className="text-muted-foreground">
          Define verified facts about your brand. These are used to detect AI hallucinations and ensure accurate information.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Select Brand</CardTitle>
          <CardDescription>Choose which brand to manage facts for</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
            <SelectTrigger className="w-full max-w-md" data-testid="select-brand">
              <SelectValue placeholder="Select a brand..." />
            </SelectTrigger>
            <SelectContent>
              {brands.map(brand => (
                <SelectItem key={brand.id} value={brand.id} data-testid={`select-brand-${brand.id}`}>
                  {brand.name} - {brand.companyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {brands.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              No brands found. <Link href="/brands" className="text-violet-600 hover:underline">Create a brand first</Link>.
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
                Auto-Fill Facts from Website
              </CardTitle>
              <CardDescription>Enter your company website URL and we'll use AI to extract key facts automatically</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="https://yourcompany.com"
                  value={autofillUrl}
                  onChange={(e) => setAutofillUrl(e.target.value)}
                  className="flex-1"
                  data-testid="input-autofill-url"
                />
                <Button
                  onClick={() => autofillMutation.mutate(autofillUrl)}
                  disabled={!autofillUrl.trim() || autofillMutation.isPending}
                  data-testid="button-autofill"
                >
                  {autofillMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4 mr-2" />
                      Auto-Fill from URL
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This will scan the website and create facts for company info, features, and more. You can edit or delete any auto-filled facts afterward.
              </p>
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
                  <DialogDescription>Add a verified fact about {selectedBrand.name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select value={newFact.factCategory} onValueChange={(v) => setNewFact({ ...newFact, factCategory: v, factKey: "" })}>
                      <SelectTrigger data-testid="select-fact-category">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FACT_CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {newFact.factCategory && (
                    <div className="space-y-2">
                      <Label>Fact Type *</Label>
                      <Select value={newFact.factKey} onValueChange={(v) => setNewFact({ ...newFact, factKey: v })}>
                        <SelectTrigger data-testid="select-fact-key">
                          <SelectValue placeholder="Select or type fact type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {SUGGESTED_FACTS[newFact.factCategory]?.map(fact => (
                            <SelectItem key={fact.key} value={fact.key}>{fact.label}</SelectItem>
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
                    <p className="text-xs text-muted-foreground">Link to where this fact can be verified</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddFact} disabled={createFactMutation.isPending} data-testid="button-save-fact">
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
                <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Facts Added Yet</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                  Add verified facts about {selectedBrand.name} to enable hallucination detection. 
                  AI engines sometimes state incorrect information - your fact sheet helps us catch these errors.
                </p>
                <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-fact">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Fact
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {groupedFacts.map(category => {
                if (category.facts.length === 0) return null;
                const CategoryIcon = category.icon;
                return (
                  <Card key={category.value}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <CategoryIcon className="w-5 h-5 text-violet-600" />
                        <CardTitle className="text-lg">{category.label}</CardTitle>
                        <Badge variant="secondary" className="ml-auto">{category.facts.length}</Badge>
                      </div>
                      <CardDescription>{category.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {category.facts.map(fact => (
                          <div
                            key={fact.id}
                            className="flex items-start justify-between p-3 bg-muted/50 rounded-lg"
                            data-testid={`fact-item-${fact.id}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">
                                  {SUGGESTED_FACTS[fact.factCategory]?.find(f => f.key === fact.factKey)?.label || fact.factKey}
                                </span>
                                <CheckCircle className="w-3 h-3 text-green-600" />
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
                        When AI engines like ChatGPT or Claude mention your brand, we compare their statements against your verified facts. 
                        If they say something incorrect (e.g., wrong pricing, outdated leadership), we flag it as a hallucination so you can take action.
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
                <Select value={editingFact.factCategory} onValueChange={(v) => setEditingFact({ ...editingFact, factCategory: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACT_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
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
            <Button variant="outline" onClick={() => setEditingFact(null)}>Cancel</Button>
            <Button onClick={handleUpdateFact} disabled={updateFactMutation.isPending}>
              {updateFactMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
