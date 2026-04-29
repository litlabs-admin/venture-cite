import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import type {
  Listicle,
  BofuContent,
  FaqItem,
  BrandMention,
  WikipediaMention,
  Competitor,
} from "@shared/schema";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useCitationLiveRefresh } from "@/hooks/useCitationLiveRefresh";
import BofuContentSheet from "@/components/geo-tools/BofuContentSheet";
import {
  List,
  BookOpen,
  FileText,
  HelpCircle,
  Bell,
  Sparkles,
  ExternalLink,
  TrendingUp,
  Target,
  CheckCircle,
  XCircle,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  MessageSquare,
  Youtube,
  Linkedin,
  Loader2,
  Check,
  X as XIcon,
} from "lucide-react";
// react-icons@5.6 removed SiLinkedin from the simple-icons set; we fall
// back to lucide-react's Linkedin for that platform.
import { SiReddit, SiQuora, SiMedium } from "react-icons/si";
const SiLinkedin = Linkedin;

// Wave 9.4: pretty-print scan reports as multi-line toast descriptions.
// Hides zero-valued lines so a clean run shows just the meaningful ones.
function formatReportLines(items: Record<string, number | undefined>): string {
  return Object.entries(items)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([k, n]) => `${k}: ${n}`)
    .join(" · ");
}

// Wave 9.4 followup: shared display map for outreach + mention status
// badges. Rendered on every row so users can see what they previously
// selected without opening the dropdown.
const LISTICLE_STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
  contacted: { label: "Contacted", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  won: { label: "Won", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  dropped: { label: "Dropped", className: "bg-gray-200 text-gray-600 hover:bg-gray-200" },
};

const MENTION_STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
  acknowledged: {
    label: "Acknowledged",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  replied: { label: "Replied", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  false_positive: {
    label: "False positive",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  ignored: { label: "Ignored", className: "bg-gray-200 text-gray-600 hover:bg-gray-200" },
};

// Wave 9.4: header roll-up card. Single-line metric + descriptive
// subtitle. Used by the GEO Tools header strip.
function SummaryCard({
  label,
  primary,
  secondary,
  testId,
}: {
  label: string;
  primary: string;
  secondary: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4 pb-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{primary}</div>
        <div className="text-xs text-muted-foreground mt-1">{secondary}</div>
      </CardContent>
    </Card>
  );
}

interface CompetitorComboboxProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function CompetitorCombobox({ options, value, onChange, placeholder }: CompetitorComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Case-insensitive presence check: the existing `value.includes(name)`
  // failed to detect "Salesforce" when the user previously added
  // "salesforce", so the BOFU payload ended up with both casings of the
  // same competitor and downstream comparison rows duplicated.
  const indexOfCi = (list: string[], name: string) =>
    list.findIndex((v) => v.toLowerCase() === name.toLowerCase());

  const toggle = (name: string) => {
    const idx = indexOfCi(value, name);
    if (idx >= 0) onChange(value.filter((_, i) => i !== idx));
    else onChange([...value, name]);
  };

  const matches = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const isFreeform =
    search.trim().length > 0 &&
    !options.some((o) => o.toLowerCase() === search.trim().toLowerCase());

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="hover:text-destructive"
                aria-label={`Remove ${v}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            data-testid="button-bofu-competitors"
          >
            <span className="text-muted-foreground">
              {value.length === 0
                ? placeholder || "Select competitors..."
                : `${value.length} selected`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or type a name..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isFreeform) {
                  e.preventDefault();
                  const name = search.trim();
                  if (indexOfCi(value, name) < 0) onChange([...value, name]);
                  setSearch("");
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {isFreeform ? `Press Enter to add "${search.trim()}"` : "No competitors found."}
              </CommandEmpty>
              {matches.length > 0 && (
                <CommandGroup heading="Tracked competitors">
                  {matches.map((name) => {
                    const checked = indexOfCi(value, name) >= 0;
                    return (
                      <CommandItem key={name} value={name} onSelect={() => toggle(name)}>
                        <Check
                          className={
                            checked ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"
                          }
                        />
                        {name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function GeoTools() {
  const { toast } = useToast();
  const { selectedBrandId, brands, selectedBrand } = useBrandSelection();
  const [activeTab, setActiveTab] = useState("listicles");
  const [bofuType, setBofuType] = useState<string>("comparison");
  const [bofuCompetitors, setBofuCompetitors] = useState<string[]>([]);
  const [bofuKeyword, setBofuKeyword] = useState("");
  const [faqTopic, setFaqTopic] = useState("");
  const [activeMention, setActiveMention] = useState<BrandMention | null>(null);
  // Wave 9.4: BOFU full-content sheet — replaces the prior 500-char preview.
  const [activeBofu, setActiveBofu] = useState<BofuContent | null>(null);
  const [bofuSheetOpen, setBofuSheetOpen] = useState(false);
  // Wave 9.4: manual-add dialogs.
  const [addListicleOpen, setAddListicleOpen] = useState(false);
  const [addWikipediaOpen, setAddWikipediaOpen] = useState(false);
  const [addMentionOpen, setAddMentionOpen] = useState(false);
  // Wave 9.4: Wikipedia draft dialog.
  const [wikiDraft, setWikiDraft] = useState<{
    mentionId: string;
    pageTitle: string;
    text: string;
    notes: string[];
  } | null>(null);
  // Wave 9.4 followup: tab-level status filters so the workflow state
  // is actually visible. "all" shows everything; the row badges still
  // display the current status regardless.
  const [listicleStatusFilter, setListicleStatusFilter] = useState<string>("all");
  const [mentionStatusFilter, setMentionStatusFilter] = useState<string>("all");

  // Listicle queries — server returns { success, data: Listicle[] }
  const { data: listiclesData, isLoading: listiclesLoading } = useQuery<{
    success: boolean;
    data: Listicle[];
  }>({
    queryKey: ["/api/listicles", { brandId: selectedBrandId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/listicles?brandId=${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
  });
  const listicles: Listicle[] = listiclesData?.data ?? [];

  const discoverListiclesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/listicles/discover/${selectedBrandId}`);
      const body = await response.json();
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Discovery failed (${response.status})`);
      }
      return body;
    },
    onSuccess: (data: any) => {
      // Wave 9.4: surface the full ScanReport — Found / Inserted /
      // Duplicates / Failed — rather than a single misleading number.
      const r = data.data?.report ?? {};
      const summary = formatReportLines({
        Found: r.found ?? 0,
        Inserted: r.inserted ?? 0,
        Duplicates: r.skippedDuplicate ?? 0,
        Filtered: r.skippedFiltered ?? 0,
        "Re-verified": r.reverified ?? 0,
        "Lost inclusion": r.lostInclusion ?? 0,
        Failed: r.failed?.length ?? 0,
      });
      toast({
        title: "Listicle scan complete",
        description: [r.warning, summary].filter(Boolean).join("\n"),
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/listicles",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to discover listicles",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // Wikipedia queries — read mentions directly from storage
  const { data: wikipediaData } = useQuery<{ success: boolean; data: WikipediaMention[] }>({
    queryKey: ["/api/wikipedia", selectedBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/wikipedia/${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
  });
  const wikipediaMentions: WikipediaMention[] = wikipediaData?.data ?? [];
  const wikiExistingRows = wikipediaMentions.filter((m) => m.mentionType === "existing");
  const wikiOpportunityRows = wikipediaMentions.filter((m) => m.mentionType === "opportunity");

  const scanWikipediaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/wikipedia/scan/${selectedBrandId}`);
      const body = await response.json();
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error || `Wikipedia scan failed (${response.status})`);
      }
      return body;
    },
    onSuccess: (data: any) => {
      const r = data.data?.report ?? {};
      const summary = formatReportLines({
        Existing: r.existing ?? data.data?.existing ?? 0,
        Opportunities: r.opportunities ?? data.data?.opportunities ?? 0,
        Inserted: r.inserted ?? data.data?.inserted ?? 0,
        Duplicates: r.skippedDuplicate ?? 0,
        Failed: r.failed?.length ?? 0,
      });
      toast({
        title: "Wikipedia scan complete",
        description: summary,
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/wikipedia",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to analyze Wikipedia",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // Wave 9: live-refresh during citation runs. Hook returns the cadence
  // we thread directly into the affected useQuery calls below. Listicles
  // + Wikipedia have their own scanners and aren't tied to citation runs,
  // so they keep default caching.
  const { refetchInterval: liveInterval } = useCitationLiveRefresh(selectedBrandId, [
    ["/api/brand-mentions", selectedBrandId],
    ["/api/competitors", selectedBrandId],
  ]);

  // Tracked competitors for BOFU combobox
  const { data: competitorsData } = useQuery<{ success: boolean; data: Competitor[] }>({
    queryKey: ["/api/competitors", selectedBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/competitors?brandId=${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
    refetchInterval: liveInterval,
  });
  const trackedCompetitors: Competitor[] = competitorsData?.data ?? [];

  // BOFU content queries
  const { data: bofuData, isLoading: bofuLoading } = useQuery({
    queryKey: ["/api/bofu-content", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const generateBofuMutation = useMutation({
    mutationFn: async (data: {
      contentType: string;
      comparedWith?: string[];
      keyword?: string;
    }) => {
      const response = await apiRequest("POST", "/api/bofu-content/generate", {
        brandId: selectedBrandId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "BOFU content saved!",
        description: "View and edit it under the BOFU Content tab — saved to this brand's library.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bofu-content"] });
    },
    onError: () => toast({ title: "Failed to generate content", variant: "destructive" }),
  });

  // FAQ queries
  const { data: faqsData, isLoading: faqsLoading } = useQuery({
    queryKey: ["/api/faqs", selectedBrandId],
    enabled: !!selectedBrandId,
  });

  const generateFaqsMutation = useMutation({
    mutationFn: async (topic: string) => {
      const response = await apiRequest("POST", `/api/faqs/generate/${selectedBrandId}`, { topic });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "FAQs generated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
    },
    onError: () => toast({ title: "Failed to generate FAQs", variant: "destructive" }),
  });

  // Brand mentions queries
  const { data: mentionsData, isLoading: mentionsLoading } = useQuery({
    queryKey: ["/api/brand-mentions", selectedBrandId],
    enabled: !!selectedBrandId,
    refetchInterval: liveInterval,
  });

  // Wave 9.4: header roll-up cards. Single endpoint returns counts
  // across all five tabs + 30-day cited counts so users can answer
  // "is GEO Tools working?" at a glance.
  const { data: summaryData } = useQuery<{
    success: boolean;
    data: {
      listicles: { total: number; included: number };
      wikipedia: { existing: number; opportunities: number };
      bofu: { drafts: number; published: number; cited30d: number };
      faqs: { drafts: number; published: number; cited30d: number };
      mentions: { total: number; unaddressed: number; negative: number };
    };
  }>({
    queryKey: ["/api/geo-tools/summary", selectedBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/geo-tools/summary/${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
    refetchInterval: liveInterval,
  });
  const summary = summaryData?.data ?? null;

  // Wave 9.4: status PATCH mutations for mentions + listicles. Each row
  // gets an inline <Select>; this mutation drives it.
  const updateMentionStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await apiRequest("PATCH", `/api/brand-mentions/${id}`, { status });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/brand-mentions",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
    },
    onError: () => toast({ title: "Failed to update mention status", variant: "destructive" }),
  });

  const updateListicleStatusMutation = useMutation({
    mutationFn: async ({ id, outreachStatus }: { id: string; outreachStatus: string }) => {
      const r = await apiRequest("PATCH", `/api/listicles/${id}`, { outreachStatus });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/listicles",
      });
    },
    onError: () => toast({ title: "Failed to update outreach status", variant: "destructive" }),
  });

  // Wave 9.4: manual-add mutations (server-side use ON CONFLICT to
  // surface 409 if the row already exists for this brand+URL).
  const addListicleMutation = useMutation({
    mutationFn: async (body: {
      brandId: string;
      title: string;
      url: string;
      sourcePublication?: string;
      isIncluded?: number;
      listPosition?: number;
    }) => {
      const r = await apiRequest("POST", "/api/listicles", body);
      const data = await r.json();
      if (!r.ok || data?.success === false) {
        throw new Error(data?.error || "Failed to add listicle");
      }
      return data;
    },
    onSuccess: () => {
      setAddListicleOpen(false);
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/listicles",
      });
      toast({ title: "Listicle added" });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to add listicle",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  const addWikipediaMutation = useMutation({
    mutationFn: async (body: {
      brandId: string;
      pageTitle: string;
      pageUrl: string;
      mentionType: "existing" | "opportunity";
    }) => {
      const r = await apiRequest("POST", "/api/wikipedia", body);
      const data = await r.json();
      if (!r.ok || data?.success === false) {
        throw new Error(data?.error || "Failed to add Wikipedia mention");
      }
      return data;
    },
    onSuccess: () => {
      setAddWikipediaOpen(false);
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/wikipedia",
      });
      toast({ title: "Wikipedia mention added" });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to add Wikipedia mention",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  const addBrandMentionMutation = useMutation({
    mutationFn: async (body: {
      brandId: string;
      platform: string;
      sourceUrl: string;
      sourceTitle?: string;
      mentionContext?: string;
      sentiment?: string;
    }) => {
      const r = await apiRequest("POST", "/api/brand-mentions", body);
      const data = await r.json();
      if (!r.ok || data?.success === false) {
        throw new Error(data?.error || "Failed to add mention");
      }
      return data;
    },
    onSuccess: () => {
      setAddMentionOpen(false);
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/brand-mentions",
      });
      toast({ title: "Mention added" });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to add mention",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // Wave 9.4: Wikipedia draft helper.
  const draftWikipediaMutation = useMutation({
    mutationFn: async (mentionId: string) => {
      const r = await apiRequest("POST", `/api/wikipedia/draft/${mentionId}`);
      const data = await r.json();
      if (!r.ok || data?.success === false) {
        throw new Error(data?.error || "Draft failed");
      }
      return data;
    },
    onError: (err: any) =>
      toast({
        title: "Failed to draft mention",
        description: err?.message || "Unknown error",
        variant: "destructive",
      }),
  });

  // Toggle an FAQ's isOptimized flag. The badge next to each FAQ used to
  // only display the status with no way to mark one optimised/unoptimised —
  // users had to hand-edit the DB or regenerate to change it.
  const toggleFaqOptimizedMutation = useMutation({
    mutationFn: async ({ id, isOptimized }: { id: string; isOptimized: 0 | 1 }) => {
      const response = await apiRequest("PATCH", `/api/faqs/${id}`, { isOptimized });
      return response.json();
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.isOptimized === 1 ? "Marked as optimized" : "Marked as not yet optimized",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/faqs"] });
    },
    onError: () => toast({ title: "Failed to update FAQ status", variant: "destructive" }),
  });

  // Trigger an organic mention scan (Reddit / HN / citation-domain mining).
  // Previously the tab only read cached mentions — if nothing had scanned
  // yet the user saw permanent "no mentions" state with no path to fix it.
  const scanMentionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-mentions/scan/${selectedBrandId}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      const r = data.data?.report ?? {};
      const summary = formatReportLines({
        Found: r.found ?? 0,
        Inserted: r.inserted ?? data?.data?.inserted ?? 0,
        Duplicates: r.skippedDuplicate ?? 0,
        Failed: r.failed?.length ?? 0,
      });
      toast({
        title: "Mentions scan complete",
        description: [r.warning, summary].filter(Boolean).join("\n"),
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/brand-mentions",
      });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/geo-tools/summary",
      });
    },
    onError: () => toast({ title: "Mentions scan failed", variant: "destructive" }),
  });

  const platformIcons: Record<string, any> = {
    reddit: SiReddit,
    youtube: Youtube,
    quora: SiQuora,
    linkedin: SiLinkedin,
    medium: SiMedium,
    forum: MessageSquare,
    other: Globe,
  };

  return (
    <>
      <Helmet>
        <title>GEO Tools - VentureCite</title>
      </Helmet>
      <div className="space-y-8">
        <PageHeader
          title="GEO Tools"
          description="Advanced tools to boost your AI visibility"
          actions={
            <div className="flex items-center gap-2">
              {brands.length > 0 ? (
                <BrandSelector showIndustry />
              ) : (
                <Link href="/brands">
                  <Button size="sm" data-testid="button-create-brand">
                    <Plus className="h-4 w-4 mr-2" /> Create Brand
                  </Button>
                </Link>
              )}
              <Link href="/geo-signals">
                <Button variant="outline" size="sm" data-testid="button-geo-signals">
                  <Sparkles className="h-4 w-4 mr-2" /> GEO Signals
                </Button>
              </Link>
            </div>
          }
        />

        {selectedBrandId ? (
          <>
            {/* Wave 9.4: header roll-up. Single endpoint, refreshes
                with the live cadence so newly published content +
                self-citation counts surface within the run. */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <SummaryCard
                  label="Listicles"
                  primary={`${summary.listicles.included}/${summary.listicles.total}`}
                  secondary="In list / tracked"
                  testId="summary-listicles"
                />
                <SummaryCard
                  label="Wikipedia"
                  primary={`${summary.wikipedia.existing}`}
                  secondary={`${summary.wikipedia.opportunities} opportunities`}
                  testId="summary-wikipedia"
                />
                <SummaryCard
                  label="BOFU"
                  primary={`${summary.bofu.published}`}
                  secondary={`${summary.bofu.cited30d} cited (30d) · ${summary.bofu.drafts} draft`}
                  testId="summary-bofu"
                />
                <SummaryCard
                  label="FAQs"
                  primary={`${summary.faqs.published}`}
                  secondary={`${summary.faqs.cited30d} cited (30d) · ${summary.faqs.drafts} draft`}
                  testId="summary-faqs"
                />
                <SummaryCard
                  label="Mentions"
                  primary={`${summary.mentions.total}`}
                  secondary={`${summary.mentions.unaddressed} unaddressed · ${summary.mentions.negative} negative`}
                  testId="summary-mentions"
                />
              </div>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5 mb-6">
                <TabsTrigger
                  value="listicles"
                  className="flex items-center gap-2"
                  data-testid="tab-listicles"
                >
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Listicles</span>
                </TabsTrigger>
                <TabsTrigger
                  value="wikipedia"
                  className="flex items-center gap-2"
                  data-testid="tab-wikipedia"
                >
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden sm:inline">Wikipedia</span>
                </TabsTrigger>
                <TabsTrigger
                  value="bofu"
                  className="flex items-center gap-2"
                  data-testid="tab-bofu"
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">BOFU</span>
                </TabsTrigger>
                <TabsTrigger
                  value="faqs"
                  className="flex items-center gap-2"
                  data-testid="tab-faqs"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">FAQs</span>
                </TabsTrigger>
                <TabsTrigger
                  value="mentions"
                  className="flex items-center gap-2"
                  data-testid="tab-mentions"
                >
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline">Mentions</span>
                </TabsTrigger>
              </TabsList>

              {/* LISTICLES TAB */}
              <TabsContent value="listicles">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <List className="h-5 w-5 text-purple-500" />
                            Listicle Tracker
                          </CardTitle>
                          <CardDescription>
                            Find "best of" articles across consumer, professional, and investor
                            audiences where your brand should be listed
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setAddListicleOpen(true)}
                            data-testid="button-add-listicle"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add manually
                          </Button>
                          <Button
                            onClick={() => discoverListiclesMutation.mutate()}
                            disabled={discoverListiclesMutation.isPending}
                            data-testid="button-discover-listicles"
                          >
                            {discoverListiclesMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-2" />
                            )}
                            Discover Opportunities
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>Why Listicles Matter:</strong> Getting included in "Best of"
                          articles is how brands rank #1 on ChatGPT. AI systems heavily cite these
                          curated lists.
                        </p>
                      </div>

                      {listiclesLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : listicles.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">
                              Tracked Listicles ({listicles.length})
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                Filter by outreach
                              </span>
                              <Select
                                value={listicleStatusFilter}
                                onValueChange={setListicleStatusFilter}
                              >
                                <SelectTrigger
                                  className="w-[160px] h-8 text-xs"
                                  data-testid="select-listicle-status-filter"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All</SelectItem>
                                  <SelectItem value="new">New</SelectItem>
                                  <SelectItem value="contacted">Contacted</SelectItem>
                                  <SelectItem value="won">Won</SelectItem>
                                  <SelectItem value="dropped">Dropped</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {listicles
                            .filter((l) => {
                              if (listicleStatusFilter === "all") return true;
                              const s = (l as any).outreachStatus ?? "new";
                              return s === listicleStatusFilter;
                            })
                            .map((l) => {
                              const competitors = Array.isArray(l.competitorsMentioned)
                                ? l.competitorsMentioned
                                : [];
                              const extra = competitors.length > 3 ? competitors.length - 3 : 0;
                              const status = ((l as any).outreachStatus ?? "new") as string;
                              const statusMeta =
                                LISTICLE_STATUS_DISPLAY[status] ?? LISTICLE_STATUS_DISPLAY.new;
                              return (
                                <Card key={l.id} className="border-l-4 border-l-purple-500">
                                  <CardContent className="pt-4">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <a
                                          href={l.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                          <span className="line-clamp-1">{l.title}</span>
                                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                        </a>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                          <Badge
                                            className={statusMeta.className}
                                            data-testid={`badge-listicle-status-${l.id}`}
                                          >
                                            {statusMeta.label}
                                          </Badge>
                                          {l.sourcePublication && (
                                            <Badge variant="outline">{l.sourcePublication}</Badge>
                                          )}
                                          {l.isIncluded === 1 ? (
                                            <Badge className="bg-emerald-600 hover:bg-emerald-700">
                                              <CheckCircle className="h-3 w-3 mr-1" />
                                              Included at #{l.listPosition ?? "?"} /{" "}
                                              {l.totalListItems ?? "?"}
                                            </Badge>
                                          ) : (
                                            <Badge variant="destructive">
                                              <XCircle className="h-3 w-3 mr-1" />
                                              Not in list
                                            </Badge>
                                          )}
                                          {l.keyword && (
                                            <Badge variant="secondary">
                                              <Search className="h-3 w-3 mr-1" />
                                              {l.keyword}
                                            </Badge>
                                          )}
                                        </div>
                                        {competitors.length > 0 && (
                                          <p className="text-xs text-muted-foreground mt-2">
                                            Competitors: {competitors.slice(0, 3).join(", ")}
                                            {extra > 0 ? ` + ${extra} more` : ""}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex-shrink-0">
                                        <Select
                                          value={(l as any).outreachStatus ?? "new"}
                                          onValueChange={(v) =>
                                            updateListicleStatusMutation.mutate({
                                              id: l.id,
                                              outreachStatus: v,
                                            })
                                          }
                                        >
                                          <SelectTrigger
                                            className="w-[150px] h-8 text-xs"
                                            data-testid={`select-listicle-status-${l.id}`}
                                          >
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="new">New</SelectItem>
                                            <SelectItem value="contacted">Contacted</SelectItem>
                                            <SelectItem value="won">Won</SelectItem>
                                            <SelectItem value="dropped">Dropped</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <List className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No listicles yet. Click Discover to scan.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* WIKIPEDIA TAB */}
              <TabsContent value="wikipedia">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-blue-500" />
                            Wikipedia Monitor
                          </CardTitle>
                          <CardDescription>
                            Track & improve your Wikipedia presence (40% of AI citations)
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setAddWikipediaOpen(true)}
                            data-testid="button-add-wikipedia"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add manually
                          </Button>
                          <Button
                            onClick={() => scanWikipediaMutation.mutate()}
                            disabled={scanWikipediaMutation.isPending}
                            data-testid="button-scan-wikipedia"
                          >
                            {scanWikipediaMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Search className="h-4 w-4 mr-2" />
                            )}
                            Scan Opportunities
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-orange-50 dark:bg-orange-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                          <strong>Wikipedia = 40% of AI Citations:</strong> It's the #2 most cited
                          source by AI systems after Reddit. Even a mention on a relevant Wikipedia
                          page can significantly boost your AI visibility.
                        </p>
                      </div>

                      {wikipediaMentions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>
                            Click "Scan Opportunities" to analyze Wikipedia presence for{" "}
                            {selectedBrand?.name}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                                You&apos;re already mentioned ({wikiExistingRows.length})
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {wikiExistingRows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No existing mentions found on Wikipedia yet.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {wikiExistingRows.map((m) => {
                                    const reason =
                                      (m.metadata as { reason?: string } | null)?.reason ?? "";
                                    return (
                                      <div
                                        key={m.id}
                                        className="border rounded-md p-3 hover:bg-muted/40"
                                      >
                                        <a
                                          href={m.pageUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                          {m.pageTitle}
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                        {m.mentionContext && (
                                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                            {m.mentionContext}
                                          </p>
                                        )}
                                        {reason && (
                                          <p className="text-xs text-muted-foreground mt-2 italic">
                                            {reason}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base flex items-center gap-2">
                                <Target className="h-4 w-4 text-blue-600" />
                                Pages you could target ({wikiOpportunityRows.length})
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {wikiOpportunityRows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No opportunity pages surfaced. Try re-scanning after adding
                                  competitors or products to the brand profile.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {wikiOpportunityRows.map((m) => {
                                    const reason =
                                      (m.metadata as { reason?: string } | null)?.reason ?? "";
                                    return (
                                      <div
                                        key={m.id}
                                        className="border rounded-md p-3 hover:bg-muted/40"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <a
                                            href={m.pageUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-medium text-blue-600 hover:underline flex items-center gap-1 min-w-0"
                                          >
                                            <span className="truncate">{m.pageTitle}</span>
                                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                          </a>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-shrink-0"
                                            onClick={async () => {
                                              const data = await draftWikipediaMutation
                                                .mutateAsync(m.id)
                                                .catch(() => null);
                                              if (data?.data) {
                                                setWikiDraft({
                                                  mentionId: m.id,
                                                  pageTitle: m.pageTitle,
                                                  text: data.data.draft || "",
                                                  notes: Array.isArray(data.data.notes)
                                                    ? data.data.notes
                                                    : [],
                                                });
                                              }
                                            }}
                                            disabled={draftWikipediaMutation.isPending}
                                            data-testid={`button-wikipedia-draft-${m.id}`}
                                          >
                                            {draftWikipediaMutation.isPending ? (
                                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            ) : (
                                              <Sparkles className="h-3 w-3 mr-1" />
                                            )}
                                            Draft mention
                                          </Button>
                                        </div>
                                        {m.mentionContext && (
                                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                            {m.mentionContext}
                                          </p>
                                        )}
                                        {reason && (
                                          <p className="text-xs text-muted-foreground mt-2 italic">
                                            {reason}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* BOFU CONTENT TAB */}
              <TabsContent value="bofu">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-green-500" />
                        BOFU Content Generator
                      </CardTitle>
                      <CardDescription>
                        Generate bottom-of-funnel content: comparisons, alternatives, and
                        transactional guides
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          <strong>80% BOFU Strategy:</strong> Comparison articles ("X vs Y") and
                          alternatives guides convert 80% better and get cited heavily by AI systems
                          for purchase decisions.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Content Type</label>
                          <Select value={bofuType} onValueChange={setBofuType}>
                            <SelectTrigger data-testid="select-bofu-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="comparison">X vs Y Comparison</SelectItem>
                              <SelectItem value="alternatives">Alternatives To</SelectItem>
                              <SelectItem value="guide">Buying Guide</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(bofuType === "comparison" || bofuType === "alternatives") && (
                          <div>
                            <label className="text-sm font-medium mb-2 block">
                              {bofuType === "comparison" ? "Compare With" : "Alternatives To"}
                            </label>
                            <CompetitorCombobox
                              options={trackedCompetitors.map((c) => c.name)}
                              value={bofuCompetitors}
                              onChange={setBofuCompetitors}
                              placeholder="Pick competitors..."
                            />
                          </div>
                        )}
                        {bofuType === "guide" && (
                          <div>
                            <label className="text-sm font-medium mb-2 block">Target Keyword</label>
                            <Input
                              placeholder="e.g., PR agency guide"
                              value={bofuKeyword}
                              onChange={(e) => setBofuKeyword(e.target.value)}
                              data-testid="input-bofu-keyword"
                            />
                          </div>
                        )}
                        <div className="flex items-end">
                          <Button
                            onClick={() =>
                              generateBofuMutation.mutate({
                                contentType: bofuType,
                                comparedWith:
                                  bofuCompetitors.length > 0 ? bofuCompetitors : undefined,
                                keyword: bofuKeyword || undefined,
                              })
                            }
                            disabled={generateBofuMutation.isPending}
                            className="w-full"
                            data-testid="button-generate-bofu"
                          >
                            {generateBofuMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-2" />
                            )}
                            Generate
                          </Button>
                        </div>
                      </div>

                      <Separator className="my-6" />

                      {bofuLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : (bofuData as any)?.data?.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">Generated Content</h3>
                            <span className="text-xs text-muted-foreground">
                              Click any piece to view, copy, or mark as published.
                            </span>
                          </div>
                          {(bofuData as any).data.map((content: BofuContent) => {
                            const lastCited = content.lastCitedAt
                              ? new Date(content.lastCitedAt as any)
                              : null;
                            const recentlyCited =
                              !!lastCited &&
                              Date.now() - lastCited.getTime() < 30 * 24 * 60 * 60 * 1000;
                            return (
                              <Card
                                key={content.id}
                                className="cursor-pointer hover:bg-muted/40 transition-colors"
                                onClick={() => {
                                  setActiveBofu(content);
                                  setBofuSheetOpen(true);
                                }}
                                data-testid={`bofu-card-${content.id}`}
                              >
                                <CardContent className="pt-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <Badge variant="outline">{content.contentType}</Badge>
                                        <Badge>{content.status ?? "draft"}</Badge>
                                        {content.publishedAt && (
                                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                            Published
                                          </Badge>
                                        )}
                                        {recentlyCited && (
                                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                                            Cited recently
                                          </Badge>
                                        )}
                                      </div>
                                      <h4 className="font-medium truncate">{content.title}</h4>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {content.publishedUrl ? (
                                          <span className="truncate inline-block max-w-full">
                                            {content.publishedUrl}
                                          </span>
                                        ) : (
                                          <span>Draft — not yet published</span>
                                        )}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveBofu(content);
                                        setBofuSheetOpen(true);
                                      }}
                                      data-testid={`button-open-bofu-${content.id}`}
                                    >
                                      Open
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No BOFU content yet. Generate your first piece above!</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* FAQs TAB */}
              <TabsContent value="faqs">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-yellow-500" />
                        FAQ Optimizer
                      </CardTitle>
                      <CardDescription>
                        Generate AI-optimized FAQs that get surfaced by AI engines
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          <strong>FAQs = More Shots on Goal:</strong> AI engines frequently surface
                          FAQ sections in responses. Keep answers 40-60 words for optimal AI
                          summarization.
                        </p>
                      </div>

                      <div className="flex gap-4 mb-6">
                        <div className="flex-1">
                          <Input
                            placeholder="Topic focus (optional, e.g., pricing, features)"
                            value={faqTopic}
                            onChange={(e) => setFaqTopic(e.target.value)}
                            data-testid="input-faq-topic"
                          />
                        </div>
                        <Button
                          onClick={() => generateFaqsMutation.mutate(faqTopic)}
                          disabled={generateFaqsMutation.isPending}
                          data-testid="button-generate-faqs"
                        >
                          {generateFaqsMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          Generate FAQs
                        </Button>
                      </div>

                      {faqsLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : (faqsData as any)?.data?.length > 0 ? (
                        <div className="space-y-4">
                          {(faqsData as any).data.map((faq: FaqItem) => (
                            <Card key={faq.id}>
                              <CardContent className="pt-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-blue-600">{faq.question}</h4>
                                    <p className="text-sm mt-2">{faq.answer}</p>
                                    <div className="flex gap-2 mt-3">
                                      <Badge variant="outline">{faq.category}</Badge>
                                      <Badge
                                        variant={
                                          faq.aiSurfaceScore && faq.aiSurfaceScore >= 70
                                            ? "default"
                                            : "secondary"
                                        }
                                      >
                                        AI Score: {faq.aiSurfaceScore || 0}
                                      </Badge>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex-shrink-0 gap-1"
                                    disabled={toggleFaqOptimizedMutation.isPending}
                                    onClick={() =>
                                      toggleFaqOptimizedMutation.mutate({
                                        id: faq.id,
                                        isOptimized: faq.isOptimized === 1 ? 0 : 1,
                                      })
                                    }
                                    title={
                                      faq.isOptimized === 1
                                        ? "Optimized — click to unmark"
                                        : "Not optimized yet — click to mark optimized"
                                    }
                                    data-testid={`button-toggle-faq-${faq.id}`}
                                  >
                                    <CheckCircle
                                      className={
                                        faq.isOptimized === 1
                                          ? "h-5 w-5 text-green-500"
                                          : "h-5 w-5 text-muted-foreground"
                                      }
                                    />
                                    <span className="text-xs">
                                      {faq.isOptimized === 1 ? "Optimized" : "Mark optimized"}
                                    </span>
                                  </Button>
                                </div>
                                {faq.optimizationTips?.length ? (
                                  <div className="mt-3 pt-3 border-t">
                                    <p className="text-xs text-muted-foreground mb-1">
                                      Optimization Tips:
                                    </p>
                                    <ul className="text-xs space-y-1">
                                      {faq.optimizationTips.map((tip, i) => (
                                        <li key={i} className="flex items-start gap-1">
                                          <Target className="h-3 w-3 mt-0.5 text-yellow-500" />
                                          {tip}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No FAQs yet. Generate AI-optimized FAQs for {selectedBrand?.name}!</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* MENTIONS TAB */}
              <TabsContent value="mentions">
                <div className="grid gap-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-red-500" />
                            Brand Mention Tracker
                          </CardTitle>
                          <CardDescription>
                            Monitor brand mentions across Reddit, Hacker News, and Quora
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAddMentionOpen(true)}
                            data-testid="button-add-mention"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add manually
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => scanMentionsMutation.mutate()}
                            disabled={!selectedBrandId || scanMentionsMutation.isPending}
                            data-testid="button-scan-mentions"
                          >
                            {scanMentionsMutation.isPending ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2" /> Scan Now
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg mb-6">
                        <p className="text-sm text-red-700 dark:text-red-300">
                          <strong>Track What AI Sees:</strong> Monitor how your brand is discussed
                          on platforms that AI systems cite most. Reddit, Hacker News, and Quora are
                          top sources AI systems cite.
                        </p>
                      </div>

                      {mentionsLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        (() => {
                          const md = mentionsData as any;
                          const stats = md?.stats || {
                            total: 0,
                            byPlatform: {},
                            bySentiment: { positive: 0, neutral: 0, negative: 0 },
                          };
                          const mentions = Array.isArray(md?.data) ? md.data : [];
                          return stats ? (
                            <div className="space-y-6">
                              {/* Stats */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Card>
                                  <CardContent className="pt-4">
                                    <div className="text-2xl font-bold">{stats.total}</div>
                                    <p className="text-sm text-muted-foreground">Total Mentions</p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-green-600">
                                      {stats.bySentiment.positive}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Positive</p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-muted-foreground">
                                      {stats.bySentiment.neutral}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Neutral</p>
                                  </CardContent>
                                </Card>
                                <Card>
                                  <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-red-600">
                                      {stats.bySentiment.negative}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Negative</p>
                                  </CardContent>
                                </Card>
                              </div>

                              {/* Platform breakdown */}
                              {Object.keys(stats.byPlatform).length > 0 && (
                                <div>
                                  <h3 className="font-semibold mb-3">By Platform</h3>
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(stats.byPlatform).map(([platform, count]) => {
                                      const Icon = platformIcons[platform] || Globe;
                                      return (
                                        <Badge
                                          key={platform}
                                          variant="outline"
                                          className="flex items-center gap-1 py-1"
                                        >
                                          <Icon className="h-3 w-3" />
                                          {platform}: {count as number}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Recent mentions */}
                              {mentions.length > 0 ? (
                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold">
                                      Recent Mentions ({mentions.length})
                                    </h3>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">
                                        Filter by status
                                      </span>
                                      <Select
                                        value={mentionStatusFilter}
                                        onValueChange={setMentionStatusFilter}
                                      >
                                        <SelectTrigger
                                          className="w-[160px] h-8 text-xs"
                                          data-testid="select-mention-status-filter"
                                        >
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="all">All</SelectItem>
                                          <SelectItem value="new">New</SelectItem>
                                          <SelectItem value="acknowledged">Acknowledged</SelectItem>
                                          <SelectItem value="replied">Replied</SelectItem>
                                          <SelectItem value="false_positive">
                                            False positive
                                          </SelectItem>
                                          <SelectItem value="ignored">Ignored</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    {mentions
                                      .filter((mention: BrandMention) => {
                                        if (mentionStatusFilter === "all") return true;
                                        const s = (mention as any).status ?? "new";
                                        return s === mentionStatusFilter;
                                      })
                                      .slice(0, 25)
                                      .map((mention: BrandMention) => {
                                        const Icon = platformIcons[mention.platform] || Globe;
                                        const preview = (mention.mentionContext || "").slice(
                                          0,
                                          140,
                                        );
                                        const status = (mention as any).status ?? "new";
                                        const statusMeta =
                                          MENTION_STATUS_DISPLAY[status] ??
                                          MENTION_STATUS_DISPLAY.new;
                                        return (
                                          <Card
                                            key={mention.id}
                                            className="hover:bg-muted/40 transition-colors cursor-pointer"
                                            onClick={() => setActiveMention(mention)}
                                            data-testid={`mention-card-${mention.id}`}
                                          >
                                            <CardContent className="pt-4">
                                              <div className="flex items-start gap-3">
                                                <Icon className="h-5 w-5 mt-1 text-muted-foreground flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-medium line-clamp-1">
                                                      {mention.sourceTitle || "Untitled"}
                                                    </span>
                                                    <Badge
                                                      variant={
                                                        mention.sentiment === "positive"
                                                          ? "default"
                                                          : mention.sentiment === "negative"
                                                            ? "destructive"
                                                            : "secondary"
                                                      }
                                                    >
                                                      {mention.sentiment}
                                                    </Badge>
                                                    <Badge
                                                      className={statusMeta.className}
                                                      data-testid={`badge-mention-status-${mention.id}`}
                                                    >
                                                      {statusMeta.label}
                                                    </Badge>
                                                  </div>
                                                  {preview && (
                                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                                                      {preview}
                                                    </p>
                                                  )}
                                                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                    <span>{mention.platform}</span>
                                                    {mention.engagementScore != null && (
                                                      <span>
                                                        Engagement: {mention.engagementScore}
                                                      </span>
                                                    )}
                                                    {mention.mentionedAt && (
                                                      <span>
                                                        {new Date(
                                                          mention.mentionedAt,
                                                        ).toLocaleDateString()}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                <div
                                                  className="flex-shrink-0"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <Select
                                                    value={status}
                                                    onValueChange={(v) =>
                                                      updateMentionStatusMutation.mutate({
                                                        id: mention.id,
                                                        status: v,
                                                      })
                                                    }
                                                  >
                                                    <SelectTrigger
                                                      className="w-[140px] h-8 text-xs"
                                                      data-testid={`select-mention-status-${mention.id}`}
                                                    >
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectItem value="new">New</SelectItem>
                                                      <SelectItem value="acknowledged">
                                                        Acknowledged
                                                      </SelectItem>
                                                      <SelectItem value="replied">
                                                        Replied
                                                      </SelectItem>
                                                      <SelectItem value="false_positive">
                                                        False positive
                                                      </SelectItem>
                                                      <SelectItem value="ignored">
                                                        Ignored
                                                      </SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                              </div>
                                            </CardContent>
                                          </Card>
                                        );
                                      })}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                  <p>No mentions tracked yet for {selectedBrand?.name}</p>
                                  <p className="text-sm mt-2">
                                    Mentions will appear here as they're discovered
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>Select a brand to view mentions</p>
                            </div>
                          );
                        })()
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2">Select a Brand to Get Started</h3>
              <p className="text-muted-foreground mb-4">
                Choose a brand above or create one to access GEO tools
              </p>
              <Link href="/brands">
                <Button data-testid="button-go-to-brands">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Brand
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      <BofuContentSheet
        content={activeBofu}
        open={bofuSheetOpen}
        onOpenChange={(o) => {
          setBofuSheetOpen(o);
          if (!o) setActiveBofu(null);
        }}
      />

      {/* Wave 9.4: Manual-add dialogs. Each follows the same shape:
          minimal-required form, server validates ownership + dedup. */}
      <ManualAddListicleDialog
        open={addListicleOpen}
        onOpenChange={setAddListicleOpen}
        onSubmit={(payload) =>
          selectedBrandId && addListicleMutation.mutate({ ...payload, brandId: selectedBrandId })
        }
        pending={addListicleMutation.isPending}
      />
      <ManualAddWikipediaDialog
        open={addWikipediaOpen}
        onOpenChange={setAddWikipediaOpen}
        onSubmit={(payload) =>
          selectedBrandId && addWikipediaMutation.mutate({ ...payload, brandId: selectedBrandId })
        }
        pending={addWikipediaMutation.isPending}
      />
      <ManualAddMentionDialog
        open={addMentionOpen}
        onOpenChange={setAddMentionOpen}
        onSubmit={(payload) =>
          selectedBrandId &&
          addBrandMentionMutation.mutate({ ...payload, brandId: selectedBrandId })
        }
        pending={addBrandMentionMutation.isPending}
      />

      {/* Wave 9.4: Wikipedia draft viewer. Read-only — copy + close. */}
      <Dialog
        open={!!wikiDraft}
        onOpenChange={(o) => {
          if (!o) setWikiDraft(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Draft mention for "{wikiDraft?.pageTitle}"</DialogTitle>
            <DialogDescription>
              NPOV-tuned 2-3 sentence draft you can paste into Wikipedia's edit form.
            </DialogDescription>
          </DialogHeader>
          {wikiDraft && (
            <div className="space-y-3">
              <div className="border rounded-md p-3 bg-muted/30 whitespace-pre-wrap text-sm">
                {wikiDraft.text}
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                {wikiDraft.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(wikiDraft.text);
                      toast({ title: "Draft copied" });
                    }
                  }}
                >
                  Copy draft
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setWikiDraft(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Sheet
        open={activeMention !== null}
        onOpenChange={(o) => {
          if (!o) setActiveMention(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {activeMention && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {(() => {
                    const key = activeMention.platform?.replace(/^ai:/, "") ?? "";
                    const Icon = platformIcons[key] || Globe;
                    return <Icon className="h-4 w-4" />;
                  })()}
                  <span className="capitalize">
                    {activeMention.platform?.startsWith("ai:")
                      ? activeMention.platform.replace(/^ai:/, "")
                      : activeMention.platform}
                  </span>
                </SheetTitle>
                <SheetDescription>
                  {activeMention.authorUsername ? `by @${activeMention.authorUsername}` : null}
                  {activeMention.authorUsername && activeMention.mentionedAt ? " · " : null}
                  {activeMention.mentionedAt
                    ? new Date(activeMention.mentionedAt).toLocaleString()
                    : null}
                </SheetDescription>
              </SheetHeader>
              {(() => {
                // Citation-check results are persisted into brand_mentions with
                // platform "ai:<engine>" and a synthetic ai:// URL that the
                // browser can't open. Detect and render those as an in-panel
                // full response with no "Open on" button.
                const isAiMention =
                  activeMention.platform?.startsWith("ai:") ||
                  activeMention.sourceUrl?.startsWith("ai://");
                const canOpenExternally =
                  !isAiMention &&
                  typeof activeMention.sourceUrl === "string" &&
                  /^https?:\/\//i.test(activeMention.sourceUrl);
                const platformLabel = isAiMention
                  ? (activeMention.platform?.replace(/^ai:/, "") ?? "AI")
                  : activeMention.platform;

                return (
                  <>
                    <div className="mt-4 space-y-4">
                      {activeMention.sourceTitle && (
                        <h3 className="font-medium">{activeMention.sourceTitle}</h3>
                      )}
                      {activeMention.mentionContext && (
                        <div
                          className={
                            isAiMention
                              ? "text-sm whitespace-pre-wrap max-h-[60vh] overflow-y-auto rounded-md border p-3 bg-muted/30"
                              : "text-sm whitespace-pre-wrap"
                          }
                        >
                          {activeMention.mentionContext}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {isAiMention ? (
                          <Badge variant="outline" className="capitalize">
                            AI · {platformLabel}
                          </Badge>
                        ) : null}
                        <Badge
                          variant={
                            activeMention.sentiment === "positive"
                              ? "default"
                              : activeMention.sentiment === "negative"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {activeMention.sentiment}
                        </Badge>
                        {activeMention.sentimentScore != null && (
                          <Badge variant="outline">Score: {activeMention.sentimentScore}</Badge>
                        )}
                        {activeMention.engagementScore != null && (
                          <Badge variant="outline">
                            Engagement: {activeMention.engagementScore}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {canOpenExternally ? (
                      <SheetFooter className="mt-6">
                        <Button asChild data-testid="button-open-mention-source">
                          <a
                            href={activeMention.sourceUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open on <span className="capitalize">{platformLabel}</span>
                            <ExternalLink className="h-4 w-4 ml-2" />
                          </a>
                        </Button>
                      </SheetFooter>
                    ) : null}
                  </>
                );
              })()}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ============================================================
// Wave 9.4: Manual-entry dialogs. Each is intentionally minimal —
// just the fields the schema requires + a couple of useful optionals.
// Server-side validates ownership and returns 409 on duplicate URL.
// ============================================================

interface ManualAddListicleProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    title: string;
    url: string;
    sourcePublication?: string;
    isIncluded?: number;
    listPosition?: number;
  }) => void;
  pending: boolean;
}

function ManualAddListicleDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: ManualAddListicleProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [sourcePublication, setSourcePublication] = useState("");
  const [included, setIncluded] = useState(false);
  const [listPosition, setListPosition] = useState("");
  const reset = () => {
    setTitle("");
    setUrl("");
    setSourcePublication("");
    setIncluded(false);
    setListPosition("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a listicle</DialogTitle>
          <DialogDescription>
            Track a "best of" article that the discover scanner missed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="10 Best CRM Tools for Startups in 2025"
              data-testid="input-add-listicle-title"
            />
          </div>
          <div className="space-y-1">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/best-crm-tools"
              data-testid="input-add-listicle-url"
            />
          </div>
          <div className="space-y-1">
            <Label>Source publication (optional)</Label>
            <Input
              value={sourcePublication}
              onChange={(e) => setSourcePublication(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={included}
              onChange={(e) => setIncluded(e.target.checked)}
              id="manual-listicle-included"
            />
            <Label htmlFor="manual-listicle-included">My brand is included in this list</Label>
          </div>
          {included && (
            <div className="space-y-1">
              <Label>Position (optional)</Label>
              <Input
                type="number"
                min={1}
                value={listPosition}
                onChange={(e) => setListPosition(e.target.value)}
                placeholder="3"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !url.trim() || pending}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                url: url.trim(),
                sourcePublication: sourcePublication.trim() || undefined,
                isIncluded: included ? 1 : 0,
                listPosition:
                  included && listPosition ? parseInt(listPosition, 10) || undefined : undefined,
              })
            }
            data-testid="button-add-listicle-submit"
          >
            {pending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ManualAddWikipediaProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    pageTitle: string;
    pageUrl: string;
    mentionType: "existing" | "opportunity";
  }) => void;
  pending: boolean;
}

function ManualAddWikipediaDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: ManualAddWikipediaProps) {
  const [pageTitle, setPageTitle] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [mentionType, setMentionType] = useState<"existing" | "opportunity">("opportunity");
  const reset = () => {
    setPageTitle("");
    setPageUrl("");
    setMentionType("opportunity");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Wikipedia page</DialogTitle>
          <DialogDescription>
            Track an existing mention or a target page where you'd like to be cited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Page title</Label>
            <Input
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              placeholder="Customer relationship management"
            />
          </div>
          <div className="space-y-1">
            <Label>Page URL</Label>
            <Input
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://en.wikipedia.org/wiki/Customer_relationship_management"
            />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select
              value={mentionType}
              onValueChange={(v: "existing" | "opportunity") => setMentionType(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="existing">Existing mention</SelectItem>
                <SelectItem value="opportunity">Opportunity (not yet mentioned)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!pageTitle.trim() || !pageUrl.trim() || pending}
            onClick={() =>
              onSubmit({
                pageTitle: pageTitle.trim(),
                pageUrl: pageUrl.trim(),
                mentionType,
              })
            }
          >
            {pending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ManualAddMentionProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    platform: string;
    sourceUrl: string;
    sourceTitle?: string;
    mentionContext?: string;
    sentiment?: string;
  }) => void;
  pending: boolean;
}

function ManualAddMentionDialog({ open, onOpenChange, onSubmit, pending }: ManualAddMentionProps) {
  const [platform, setPlatform] = useState("reddit");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [mentionContext, setMentionContext] = useState("");
  const [sentiment, setSentiment] = useState<"positive" | "neutral" | "negative">("neutral");
  const reset = () => {
    setPlatform("reddit");
    setSourceUrl("");
    setSourceTitle("");
    setMentionContext("");
    setSentiment("neutral");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a brand mention</DialogTitle>
          <DialogDescription>
            For mentions the scanner missed (Discord, Slack, blog comments, etc.).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reddit">Reddit</SelectItem>
                <SelectItem value="hackernews">Hacker News</SelectItem>
                <SelectItem value="quora">Quora</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="forum">Forum</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Source URL</Label>
            <Input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://reddit.com/r/saas/comments/..."
            />
          </div>
          <div className="space-y-1">
            <Label>Title (optional)</Label>
            <Input
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              placeholder="Post or thread title"
            />
          </div>
          <div className="space-y-1">
            <Label>Context (optional)</Label>
            <Textarea
              value={mentionContext}
              onChange={(e) => setMentionContext(e.target.value)}
              placeholder="Snippet of the mention text..."
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>Sentiment</Label>
            <Select
              value={sentiment}
              onValueChange={(v: "positive" | "neutral" | "negative") => setSentiment(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!sourceUrl.trim() || pending}
            onClick={() =>
              onSubmit({
                platform,
                sourceUrl: sourceUrl.trim(),
                sourceTitle: sourceTitle.trim() || undefined,
                mentionContext: mentionContext.trim() || undefined,
                sentiment,
              })
            }
          >
            {pending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
