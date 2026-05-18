import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lock,
  Search,
  FileText,
  CheckCircle,
  RefreshCw,
  AlertTriangle,
  X as XIcon,
  Plus,
  ArrowRight,
  Loader2,
  Circle,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";
import { validateDomain } from "@shared/validateDomain";
import { cn } from "@/lib/utils";

type Scene = "input" | "scraping" | "confirm" | "activating";

type LogEntry = { icon?: string; message: string; ts: number };

type Competitor = { name: string; domain: string; description?: string };

type ScrapedData = {
  brandName: string;
  industry: string;
  description: string;
  products: string[];
  keyValues: string[];
  uniqueSellingPoints: string[];
  targetAudience: string;
  brandVoice: string;
  logoUrl: string | null;
  competitors: Competitor[];
};

type SseEvent = {
  type: "log" | "result" | "error" | "end";
  icon?: string;
  message?: string;
  data?: any;
  reason?: string;
};

// Server-driven activation pipeline state. The autopilot runs the phases
// strictly in order — FactSheet kernel first, then prompts grounded in
// it, then web-grounded citations — and is resumable server-side, so
// this screen only ever reflects status; it never drives the work.
type AutopilotStatus =
  | "idle"
  | "pending"
  | "scraping_facts"
  | "generating_prompts"
  | "running_citations"
  | "completed"
  | "failed";

type AutopilotData = {
  status: AutopilotStatus;
  step: number;
  progress: { promptsGenerated?: number; citationsRun?: number; citationsTotal?: number } | null;
  error: string | null;
};

const LOG_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  search: Search,
  file: FileText,
  check: CheckCircle,
  refresh: RefreshCw,
  warn: AlertTriangle,
};

function pickIcon(name?: string) {
  if (!name) return Search;
  const key = name.toLowerCase();
  if (key.includes("search")) return Search;
  if (key.includes("file") || key.includes("doc")) return FileText;
  if (key.includes("check") || key.includes("done") || key.includes("success")) return CheckCircle;
  if (key.includes("refresh") || key.includes("retry") || key.includes("sync")) return RefreshCw;
  if (key.includes("warn") || key.includes("alert") || key.includes("error")) return AlertTriangle;
  return LOG_ICONS[key] || Search;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("");
}

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return v;
}

// Quiet enter: opacity + 6px settle, exponential ease, honoring
// prefers-reduced-motion (collapses to an 80ms opacity fade, no move).
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      className={cn(
        "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity motion-reduce:duration-75",
        shown
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-1.5 motion-reduce:translate-y-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activation pipeline model — the single source of progress truth.
// ---------------------------------------------------------------------------

const PHASES: { key: string; label: string; desc: string }[] = [
  {
    key: "facts",
    label: "Building your fact sheet",
    desc: "Reading your site and public sources to establish what's verifiably true about your brand. Everything else is measured against this.",
  },
  {
    key: "prompts",
    label: "Framing your prompts",
    desc: "Writing the real buyer questions we'll put to the AI engines, grounded in the fact sheet, not guesswork.",
  },
  {
    key: "citations",
    label: "Measuring AI citations",
    desc: "Asking ChatGPT, Claude, Gemini, Perplexity and DeepSeek those questions and recording where you're cited.",
  },
];

// status → index of the phase currently doing work (3 == all done).
function activeIndexFor(status: AutopilotStatus): number {
  switch (status) {
    case "generating_prompts":
      return 1;
    case "running_citations":
      return 2;
    case "completed":
      return 3;
    default:
      // idle | pending | scraping_facts | failed → fact-sheet phase
      return 0;
  }
}

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const rqClient = useQueryClient();

  const [scene, setScene] = useState<Scene>("input");
  const [domain, setDomain] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scrapedData, setScrapedData] = useState<ScrapedData | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Confirm-scene editable state
  const [editName, setEditName] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTargetAudience, setEditTargetAudience] = useState("");
  const [editBrandVoice, setEditBrandVoice] = useState("");
  const [editProducts, setEditProducts] = useState<string[]>([]);
  const [editKeyValues, setEditKeyValues] = useState<string[]>([]);
  const [editUsps, setEditUsps] = useState<string[]>([]);
  const [editCompetitors, setEditCompetitors] = useState<Competitor[]>([]);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [newBrandId, setNewBrandId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const debouncedDomain = useDebounced(domain, 300);
  const validation = useMemo(
    () => (debouncedDomain ? validateDomain(debouncedDomain) : null),
    [debouncedDomain],
  );
  const liveValidation = useMemo(() => (domain ? validateDomain(domain) : null), [domain]);
  const inlineError = debouncedDomain && validation && !validation.valid ? validation.reason : null;
  const canSubmit = !!liveValidation && liveValidation.valid;

  // Abort stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ---- Activation status poll -------------------------------------------
  // Mirrors the monitor-overview pattern: poll every 3s while the pipeline
  // is non-terminal, stop once it completes or fails. The work continues
  // server-side regardless of whether this tab is open.
  const { data: autopilotResp } = useQuery<{ success: boolean; data: AutopilotData | null }>({
    queryKey: ["autopilot-status", newBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/onboarding/autopilot-status/${newBrandId}`);
      return res.json();
    },
    enabled: scene === "activating" && !!newBrandId,
    refetchInterval: (q) => {
      const status = (q.state.data as { data?: AutopilotData | null } | undefined)?.data?.status;
      return status && status !== "completed" && status !== "failed" ? 3000 : false;
    },
  });
  const autopilot = autopilotResp?.data ?? null;

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/autopilot-retry", {
        brandId: newBrandId,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Couldn't restart setup");
      return data;
    },
    onSuccess: () => {
      rqClient.invalidateQueries({ queryKey: ["autopilot-status", newBrandId] });
      toast({ title: "Retrying", description: "Picking setup back up where it stopped." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't retry", description: err.message, variant: "destructive" });
    },
  });

  const markTouched = (field: string) =>
    setTouchedFields((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });

  const hydrateConfirm = (data: ScrapedData) => {
    setEditName(data.brandName || "");
    setEditIndustry(data.industry || "");
    setEditDescription(data.description || "");
    setEditTargetAudience(data.targetAudience || "");
    setEditBrandVoice(data.brandVoice || "");
    setEditProducts(Array.isArray(data.products) ? data.products : []);
    setEditKeyValues(Array.isArray(data.keyValues) ? data.keyValues : []);
    setEditUsps(Array.isArray(data.uniqueSellingPoints) ? data.uniqueSellingPoints : []);
    setEditCompetitors(Array.isArray(data.competitors) ? data.competitors : []);
    setTouchedFields(new Set());
  };

  const startScrape = useCallback(async () => {
    const v = validateDomain(domain);
    if (!v.valid) return;
    const normalized = v.normalized;

    setScene("scraping");
    setLogs([]);
    setScrapeError(null);
    setScrapedData(null);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/onboarding/scrape-stream", {
        method: "POST",
        headers,
        body: JSON.stringify({ domain: normalized }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx: number;
        // SSE events are separated by a blank line
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          // Each event may contain multiple `data:` lines; concatenate.
          const dataLines: string[] = [];
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            }
          }
          if (!dataLines.length) continue;
          const payload = dataLines.join("\n");
          let evt: SseEvent;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }

          if (evt.type === "log") {
            setLogs((prev) => [
              ...prev,
              { icon: evt.icon, message: evt.message || "", ts: Date.now() },
            ]);
          } else if (evt.type === "result") {
            const data = evt.data as ScrapedData;
            setScrapedData(data);
            setLogoBroken(false);
            hydrateConfirm(data);
            setScene("confirm");
          } else if (evt.type === "error") {
            setScrapeError(evt.reason || evt.message || "Something went wrong");
          } else if (evt.type === "end") {
            try {
              await reader.cancel();
            } catch {
              /* noop */
            }
            return;
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setScrapeError(err?.message || "Failed to reach server");
    }
  }, [domain]);

  const resetAll = () => {
    abortRef.current?.abort();
    setScene("input");
    setLogs([]);
    setScrapeError(null);
    setScrapedData(null);
    setTouchedFields(new Set());
  };

  const handleConfirm = async () => {
    if (!editName.trim()) {
      toast({
        title: "Brand name required",
        description: "Enter a brand name to continue.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const normalized = validateDomain(domain).valid
        ? (validateDomain(domain) as { normalized: string }).normalized
        : domain;
      const website = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
      const body = {
        brandData: {
          brandName: editName.trim(),
          industry: editIndustry.trim(),
          description: editDescription.trim(),
          targetAudience: editTargetAudience.trim(),
          brandVoice: editBrandVoice.trim(),
          products: editProducts,
          keyValues: editKeyValues,
          uniqueSellingPoints: editUsps,
          logoUrl: scrapedData?.logoUrl ?? null,
          website,
        },
        competitors: editCompetitors,
      };
      const res = await apiRequest("POST", "/api/onboarding/confirm", body);
      const json = (await res.json()) as { brandId: string };
      // Invalidate brands cache so FirstRunGate on /dashboard sees the new
      // brand. The server has already kicked off the ordered activation
      // pipeline (fact sheet → prompts → citations); we just observe it.
      await queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      await queryClient.refetchQueries({ queryKey: ["/api/brands"] });
      setNewBrandId(json.brandId);
      setScene("activating");
    } catch (err: any) {
      toast({
        title: "Could not confirm brand",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-advance into the Command Center the moment the baseline is ready.
  // The spine's global-welcome tour auto-fires at `/`, so the guided tour
  // runs alongside whatever finishes in the background. Failures do NOT
  // auto-redirect — the user chooses retry or proceed.
  useEffect(() => {
    if (scene !== "activating" || !newBrandId) return;
    if (autopilot?.status === "completed") {
      const t = setTimeout(() => setLocation(`/?brandId=${newBrandId}`), 1100);
      return () => clearTimeout(t);
    }
  }, [autopilot?.status, scene, newBrandId, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {scene === "input" && (
        <Reveal>
          <Card className="w-full max-w-[480px]">
            <CardContent className="p-8">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Let's establish your brand
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your website. We read it and the public record to build the fact sheet
                everything else is measured against.
              </p>

              <div className="mt-6 space-y-2">
                <Input
                  autoFocus
                  data-testid="input-website"
                  placeholder="yourbrand.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit) startScrape();
                  }}
                  aria-invalid={!!inlineError}
                />
                {inlineError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {inlineError}
                  </p>
                ) : null}
              </div>

              <div className="mt-6">
                <Button
                  className="w-full"
                  disabled={!canSubmit}
                  onClick={startScrape}
                  data-testid="button-find-brand"
                >
                  Find my brand
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="mt-3 text-xs text-muted-foreground text-center">
                  Detection takes about 30 seconds. You'll review everything before it goes live.
                </p>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {scene === "scraping" && (
        <Reveal>
          <Card className="w-full max-w-[560px]">
            <CardContent className="p-8">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  {validateDomain(domain).valid
                    ? (validateDomain(domain) as { normalized: string }).normalized
                    : domain}
                </div>
                {scrapeError ? null : (
                  <span className="text-xs text-muted-foreground">Reading…</span>
                )}
              </div>

              <div className="mt-6 space-y-3">
                {logs.map((log, idx) => {
                  const Icon = pickIcon(log.icon);
                  const isLatest = idx === logs.length - 1 && !scrapeError;
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="mt-0.5 flex w-3 items-center justify-center">
                        {isLatest ? (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                        )}
                      </div>
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{log.message}</p>
                      </div>
                      <span className="text-[10px] tabular-nums font-mono text-muted-foreground">
                        {new Date(log.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
                {!logs.length && !scrapeError ? (
                  <p className="text-sm text-muted-foreground">Connecting…</p>
                ) : null}
              </div>

              {scrapeError ? (
                <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">We hit a snag</p>
                      <p className="mt-1">{scrapeError}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setScrapeError(null);
                        setScene("input");
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </Reveal>
      )}

      {scene === "confirm" && scrapedData && (
        <Reveal>
          <Card className="w-full max-w-[720px] my-8">
            <CardContent className="p-8">
              <h2 className="text-2xl font-semibold tracking-tight">Confirm what we found</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fields tagged{" "}
                <Badge variant="secondary" className="text-[10px] font-normal align-middle">
                  auto-detected
                </Badge>{" "}
                came from your site. Correct anything that's off — accuracy here sets the baseline.
              </p>

              {/* Logo + Name */}
              <div className="mt-6 flex items-center gap-4">
                {scrapedData.logoUrl && !logoBroken ? (
                  <img
                    src={scrapedData.logoUrl}
                    alt="Brand logo"
                    className="h-16 w-16 rounded-full object-cover border bg-card"
                    onError={() => setLogoBroken(true)}
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full border bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground">
                    {initialsOf(editName || scrapedData.brandName || "?") || "?"}
                  </div>
                )}
                <div className="flex-1">
                  <FieldLabel label="Brand name" touched={touchedFields.has("name")} />
                  <Input
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      markTouched("name");
                    }}
                    data-testid="input-brand-name"
                  />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel label="Industry" touched={touchedFields.has("industry")} />
                  <Input
                    value={editIndustry}
                    onChange={(e) => {
                      setEditIndustry(e.target.value);
                      markTouched("industry");
                    }}
                  />
                </div>
                <div>
                  <FieldLabel
                    label="Target audience"
                    touched={touchedFields.has("targetAudience")}
                  />
                  <Input
                    value={editTargetAudience}
                    onChange={(e) => {
                      setEditTargetAudience(e.target.value);
                      markTouched("targetAudience");
                    }}
                  />
                </div>
              </div>

              <div className="mt-4">
                <FieldLabel label="Description" touched={touchedFields.has("description")} />
                <Textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => {
                    setEditDescription(e.target.value);
                    markTouched("description");
                  }}
                />
              </div>

              <div className="mt-4">
                <FieldLabel label="Brand voice" touched={touchedFields.has("brandVoice")} />
                <Textarea
                  rows={2}
                  value={editBrandVoice}
                  onChange={(e) => {
                    setEditBrandVoice(e.target.value);
                    markTouched("brandVoice");
                  }}
                />
              </div>

              <TagField
                label="Products"
                values={editProducts}
                touched={touchedFields.has("products")}
                onChange={(v) => {
                  setEditProducts(v);
                  markTouched("products");
                }}
              />
              <TagField
                label="Key values"
                values={editKeyValues}
                touched={touchedFields.has("keyValues")}
                onChange={(v) => {
                  setEditKeyValues(v);
                  markTouched("keyValues");
                }}
              />
              <TagField
                label="Unique selling points"
                values={editUsps}
                touched={touchedFields.has("usps")}
                onChange={(v) => {
                  setEditUsps(v);
                  markTouched("usps");
                }}
              />

              {/* Competitors */}
              <div className="mt-6">
                <h3 className="text-sm font-medium">Competitors</h3>
                <div className="mt-3 space-y-2">
                  {editCompetitors.map((c, idx) => (
                    <div key={idx} className="flex items-start gap-3 rounded-md border p-3">
                      {c.domain ? (
                        <img
                          src={`/api/logo-proxy?url=${encodeURIComponent(
                            `https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=32`,
                          )}`}
                          alt=""
                          className="mt-0.5 h-8 w-8 rounded"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                          }}
                        />
                      ) : (
                        <div className="mt-0.5 h-8 w-8 rounded bg-muted" />
                      )}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <Input
                            value={c.name}
                            placeholder="Name"
                            onChange={(e) => {
                              const next = [...editCompetitors];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setEditCompetitors(next);
                            }}
                          />
                          <Input
                            value={c.domain}
                            placeholder="domain.com"
                            onChange={(e) => {
                              const next = [...editCompetitors];
                              next[idx] = { ...next[idx], domain: e.target.value };
                              setEditCompetitors(next);
                            }}
                          />
                        </div>
                        <Input
                          value={c.description || ""}
                          placeholder="Short description"
                          onChange={(e) => {
                            const next = [...editCompetitors];
                            next[idx] = { ...next[idx], description: e.target.value };
                            setEditCompetitors(next);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label="Remove competitor"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setEditCompetitors(editCompetitors.filter((_, i) => i !== idx))
                        }
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    setEditCompetitors([
                      ...editCompetitors,
                      { name: "", domain: "", description: "" },
                    ])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add competitor
                </Button>
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={resetAll} disabled={submitting}>
                  Start over
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={submitting || !editName.trim()}
                  data-testid="button-confirm-brand"
                >
                  {submitting ? "Confirming…" : "Confirm and start measuring"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {scene === "activating" && newBrandId && (
        <Reveal>
          <ActivationPanel
            brandName={editName || scrapedData?.brandName || "your brand"}
            autopilot={autopilot}
            onGoToDashboard={() => setLocation(`/?brandId=${newBrandId}`)}
            onRetry={() => retryMutation.mutate()}
            retrying={retryMutation.isPending}
          />
        </Reveal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activation panel — the ONE progress surface. Ordered phases, four-state
// vocabulary (Done / Working / Queued), one editorial verdict line, honest
// "this finishes without you" copy, and a non-blocking path forward.
// ---------------------------------------------------------------------------

function ActivationPanel({
  brandName,
  autopilot,
  onGoToDashboard,
  onRetry,
  retrying,
}: {
  brandName: string;
  autopilot: AutopilotData | null;
  onGoToDashboard: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const status: AutopilotStatus = autopilot?.status ?? "pending";
  const failed = status === "failed";
  const done = status === "completed";
  const activeIndex = activeIndexFor(status);
  const citTotal = autopilot?.progress?.citationsTotal ?? 0;
  const citRun = autopilot?.progress?.citationsRun ?? 0;

  const verdict = done
    ? `${brandName}'s AI-visibility baseline is ready.`
    : failed
      ? "Setup stopped partway. Your brand is saved — retry, or pick it up from the dashboard."
      : `We're establishing how AI engines represent ${brandName}. This runs on its own.`;

  return (
    <Card className="w-full max-w-[560px]">
      <CardContent className="p-8">
        <div className="flex items-center gap-3">
          {done ? (
            <CheckCircle className="h-5 w-5 text-primary" aria-hidden="true" />
          ) : failed ? (
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          <h2 className="text-xl font-semibold tracking-tight">
            {done ? "You're set" : failed ? "Setup interrupted" : "Establishing your baseline"}
          </h2>
        </div>

        {/* The single editorial verdict sentence — advisor voice, stated
            before the detail. Serif is the one warmth tell. */}
        <p
          className="mt-3 text-lg leading-snug text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {verdict}
        </p>

        <ol className="mt-7 space-y-1">
          {PHASES.map((phase, i) => {
            const state: "done" | "working" | "queued" =
              done || i < activeIndex ? "done" : i === activeIndex ? "working" : "queued";
            const isCitations = phase.key === "citations";
            return (
              <li key={phase.key} className="flex gap-3 rounded-md px-2 py-2.5">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <CheckCircle className="h-5 w-5 text-primary" aria-hidden="true" />
                  ) : state === "working" && !failed ? (
                    <Loader2
                      className="h-[18px] w-[18px] animate-spin text-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-[18px] w-[18px] text-muted-foreground/35"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        state === "queued" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {phase.label}
                    </p>
                    <span
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-wide",
                        state === "done"
                          ? "text-primary"
                          : state === "working"
                            ? "text-foreground"
                            : "text-muted-foreground/60",
                      )}
                    >
                      {state === "done" ? "Done" : state === "working" ? "Working" : "Queued"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {phase.desc}
                  </p>
                  {isCitations && state === "working" && citTotal > 0 ? (
                    <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {citRun}/{citTotal} prompts checked
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {failed && autopilot?.error ? (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {autopilot.error}
          </div>
        ) : null}

        <div className="mt-7 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {done
              ? "Taking you to your command center…"
              : "Safe to leave — this finishes in the background."}
          </p>
          <div className="flex gap-2">
            {failed ? (
              <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {retrying ? "Retrying…" : "Retry"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={done ? "default" : "outline"}
              onClick={onGoToDashboard}
              data-testid="button-skip-to-dashboard"
            >
              {done ? "Go to command center" : "Go to dashboard"}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldLabel({ label, touched }: { label: string; touched: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {!touched ? (
        <Badge variant="secondary" className="text-[10px] font-normal">
          auto-detected
        </Badge>
      ) : null}
    </div>
  );
}

function TagField({
  label,
  values,
  touched,
  onChange,
}: {
  label: string;
  values: string[];
  touched: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commitDraft = () => {
    const parts = splitCsv(draft);
    if (parts.length) {
      onChange([...values, ...parts]);
    }
    setDraft("");
  };
  return (
    <div className="mt-4">
      <FieldLabel label={label} touched={touched} />
      <div className="flex flex-wrap gap-2 rounded-md border bg-background p-2">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commitDraft}
          placeholder={values.length ? "" : "Type and press Enter"}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
