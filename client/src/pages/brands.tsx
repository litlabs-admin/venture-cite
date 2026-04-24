import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest, isApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLoadingMessages } from "@/hooks/use-loading-messages";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Brand } from "@shared/schema";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Globe,
  Target,
  Megaphone,
  Briefcase,
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Shield,
} from "lucide-react";
import { Link } from "wouter";
import { normalizeWebsite, safeExternalHref } from "@/lib/urlSafety";
import BrandFormFields from "@/components/BrandFormFields";
import DeleteBrandDialog from "@/components/DeleteBrandDialog";

const formSchema = z.object({
  name: z.string().min(1, "Brand name is required"),
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().min(1, "Industry is required"),
  description: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  website: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || normalizeWebsite(v) !== null, "Enter a valid http(s) URL"),
  tone: z
    .enum(["professional", "casual", "friendly", "formal", "conversational", "authoritative"])
    .default("professional"),
  targetAudience: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  products: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  keyValues: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  uniqueSellingPoints: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  brandVoice: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  sampleContent: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  nameVariations: z
    .string()
    .optional()
    .transform((v) => v || undefined),
});

type FormValues = z.infer<typeof formSchema>;

export default function Brands() {
  const { toast } = useToast();
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");

  const { data: brandsResponse, isLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });

  const brands = brandsResponse?.data;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // Wave 6.2: validate on blur so users see errors after they leave a
    // field instead of only on submit. Matches HIG expectation on web forms.
    mode: "onBlur",
    defaultValues: {
      name: "",
      companyName: "",
      industry: "",
      description: "",
      website: "",
      tone: "professional" as const,
      targetAudience: "",
      products: "",
      keyValues: "",
      uniqueSellingPoints: "",
      brandVoice: "",
      sampleContent: "",
      nameVariations: "",
    },
  });

  const createFromWebsiteMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/brands/create-from-website", { url });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
        setWebsiteUrl("");
        if (data.analysisQuality === "partial") {
          toast({
            title: "Brand created — analysis incomplete",
            description: `We created "${data.data.name}" but couldn't fully analyze the website. Please edit the brand details to fill in the gaps.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Brand created!",
            description: `We analyzed your website and created a profile for "${data.data.name}". You can edit the details anytime.`,
          });
        }
      }
    },
    onError: (error: Error) => {
      let title = "Couldn't create brand";
      let description = "Something went wrong. You can try again or add your brand manually below.";
      if (isApiError(error)) {
        const body = error.body as { error?: string; limitReached?: boolean } | null;
        if (body?.limitReached) {
          title = "Brand limit reached";
          if (body.error) description = body.error;
        } else if (body?.error) {
          description = body.error;
        }
        if (error.status === 401) description = "Please log in again and try.";
      }
      toast({ title, description, variant: "destructive" });
    },
  });

  const brandLoadingMessage = useLoadingMessages(createFromWebsiteMutation.isPending, [
    "Fetching your website...",
    "Reading your content...",
    "Identifying your brand voice...",
    "Extracting products and services...",
    "Building your brand profile...",
  ]);

  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const brandData = {
        ...data,
        products: data.products ? data.products.split(",").map((p) => p.trim()) : [],
        keyValues: data.keyValues ? data.keyValues.split(",").map((v) => v.trim()) : [],
        uniqueSellingPoints: data.uniqueSellingPoints
          ? data.uniqueSellingPoints.split(",").map((u) => u.trim())
          : [],
        nameVariations: data.nameVariations
          ? data.nameVariations.split(",").map((n) => n.trim())
          : [],
      };
      return apiRequest("POST", "/api/brands", brandData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setShowManualForm(false);
      form.reset();
      toast({
        title: "Brand created",
        description: "Your brand profile has been created successfully.",
      });
    },
    onError: (error: Error) => {
      let title = "Error";
      let description = "Failed to create brand. Please try again.";
      if (isApiError(error)) {
        const body = error.body as { error?: string; limitReached?: boolean } | null;
        if (body?.limitReached) {
          title = "Brand limit reached";
          if (body.error) description = body.error;
        } else if (body?.error) {
          description = body.error;
        }
      }
      toast({ title, description, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormValues & { id: string }) => {
      const { id, ...brandData } = data;
      const payload = {
        ...brandData,
        products: brandData.products ? brandData.products.split(",").map((p) => p.trim()) : [],
        keyValues: brandData.keyValues ? brandData.keyValues.split(",").map((v) => v.trim()) : [],
        uniqueSellingPoints: brandData.uniqueSellingPoints
          ? brandData.uniqueSellingPoints.split(",").map((u) => u.trim())
          : [],
        nameVariations: brandData.nameVariations
          ? brandData.nameVariations.split(",").map((n) => n.trim())
          : [],
      };
      return apiRequest("PUT", `/api/brands/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setEditingBrand(null);
      form.reset();
      toast({
        title: "Brand updated",
        description: "Your brand profile has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update brand. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/brands/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({
        title: "Brand deleted",
        description: "Your brand profile has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete brand. Please try again.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(data: FormValues) {
    if (editingBrand) {
      updateMutation.mutate({ ...data, id: editingBrand.id });
    } else {
      createMutation.mutate(data);
    }
  }

  function handleEdit(brand: Brand) {
    setEditingBrand(brand);
    form.reset({
      name: brand.name,
      companyName: brand.companyName,
      industry: brand.industry,
      description: brand.description ?? "",
      website: brand.website ?? "",
      tone: (brand.tone ?? "professional") as
        | "professional"
        | "casual"
        | "friendly"
        | "formal"
        | "conversational"
        | "authoritative",
      targetAudience: brand.targetAudience ?? "",
      products: Array.isArray(brand.products) ? brand.products.join(", ") : "",
      keyValues: Array.isArray(brand.keyValues) ? brand.keyValues.join(", ") : "",
      uniqueSellingPoints: Array.isArray(brand.uniqueSellingPoints)
        ? brand.uniqueSellingPoints.join(", ")
        : "",
      brandVoice: brand.brandVoice ?? "",
      sampleContent: brand.sampleContent ?? "",
      nameVariations: Array.isArray(brand.nameVariations) ? brand.nameVariations.join(", ") : "",
    });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  function handleCreateFromWebsite() {
    if (!websiteUrl.trim()) {
      toast({
        title: "Enter your website",
        description: "Type your website address to get started.",
        variant: "destructive",
      });
      return;
    }
    const url = normalizeWebsite(websiteUrl);
    if (!url) {
      toast({
        title: "Invalid website",
        description: "Enter a valid URL like https://yourcompany.com.",
        variant: "destructive",
      });
      return;
    }
    createFromWebsiteMutation.mutate(url);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Brand Management"
        description="Your brand profiles power everything in VentureCite - content generation, AI tracking, and visibility optimization"
      />

      <Card className="mb-8 border border-border bg-card" data-testid="card-add-brand">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-foreground" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-1" data-testid="text-add-brand-heading">
                  Add Your Brand
                </h2>
                <p className="text-muted-foreground">
                  Just enter your website and our AI will analyze it to create your brand profile
                  automatically. It takes about 5 seconds.
                </p>
              </div>
              <div className="flex gap-3 max-w-xl">
                <Input
                  placeholder="yourcompany.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateFromWebsite();
                    }
                  }}
                  className="bg-white dark:bg-slate-900 text-base h-11"
                  disabled={createFromWebsiteMutation.isPending}
                  data-testid="input-website-url"
                />
                <Button
                  onClick={handleCreateFromWebsite}
                  disabled={createFromWebsiteMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-6 flex-shrink-0"
                  data-testid="button-analyze-website"
                >
                  {createFromWebsiteMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {brandLoadingMessage}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Create Brand
                    </>
                  )}
                </Button>
              </div>
              {createFromWebsiteMutation.isPending && (
                <div
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                  data-testid="status-analyzing"
                >
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                  Visiting your website, reading your content, and building your brand profile...
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowManualForm(true);
                  form.reset();
                }}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                data-testid="link-manual-entry"
              >
                Or add your brand details manually
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : brands && brands.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold mb-4" data-testid="text-brands-heading">
            Your Brands ({brands.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <Card
                key={brand.id}
                className="hover:shadow-lg transition-shadow"
                data-testid={`card-brand-${brand.id}`}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {brand.name}
                      </CardTitle>
                      <CardDescription>{brand.companyName}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(brand)}
                        data-testid={`button-edit-${brand.id}`}
                        aria-label={`Edit brand ${brand.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteBrandDialog
                        brandId={brand.id}
                        brandName={brand.name}
                        isPending={deleteMutation.isPending}
                        onConfirm={handleDelete}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    <span>{brand.industry}</span>
                  </div>
                  {brand.website && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      <a
                        href={safeExternalHref(brand.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline truncate"
                      >
                        {brand.website}
                      </a>
                    </div>
                  )}
                  {brand.targetAudience && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="h-4 w-4" />
                      <span className="truncate">{brand.targetAudience}</span>
                    </div>
                  )}
                  {brand.tone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Megaphone className="h-4 w-4" />
                      <span className="capitalize">{brand.tone} tone</span>
                    </div>
                  )}
                  {brand.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 pt-2 border-t">
                      {brand.description}
                    </p>
                  )}
                  {brand.products && brand.products.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-semibold mb-1">Products/Services:</p>
                      <div className="flex flex-wrap gap-1">
                        {brand.products.slice(0, 3).map((product, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs"
                          >
                            {product}
                          </span>
                        ))}
                        {brand.products.length > 3 && (
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs">
                            +{brand.products.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-6 border border-border bg-card" data-testid="card-next-step">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">
                    Next Step: Get Your Brand Cited by AI Engines
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Now that your brand is set up, follow the step-by-step checklists to ensure
                    ChatGPT, Claude, Perplexity, Gemini, Grok, and Manus AI can find and cite your
                    brand.
                  </p>
                </div>
                <Link href="/ai-visibility">
                  <Button
                    className="bg-primary hover:bg-primary/90 text-white gap-2 flex-shrink-0"
                    data-testid="button-ai-visibility"
                  >
                    Open Checklists
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card data-testid="card-empty-state">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No brands yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Enter your website above and we'll create your brand profile automatically. This
              powers all the AI optimization features in VentureCite.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showManualForm} onOpenChange={setShowManualForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Brand Manually</DialogTitle>
            <DialogDescription>
              Fill in your brand details below. Required fields are marked with *.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <BrandFormFields form={form} />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowManualForm(false);
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-save-brand"
                >
                  Create Brand
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingBrand} onOpenChange={(open) => !open && setEditingBrand(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
            <DialogDescription>Update your brand profile information</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <BrandFormFields form={form} idSuffix="-edit" />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingBrand(null);
                    form.reset();
                  }}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  data-testid="button-save-brand"
                >
                  Update Brand
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
