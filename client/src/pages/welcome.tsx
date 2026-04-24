import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";
import { validateDomain } from "@shared/validateDomain";

type Scene = "input" | "scraping" | "confirm";

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

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
        description: "Please enter a brand name to continue.",
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
      setLocation(`/dashboard?brandId=${json.brandId}`);
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

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center p-6">
      {scene === "input" && (
        <Card className="w-full max-w-[480px] shadow-sm">
          <CardContent className="p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Let's find your brand
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your website and we'll do the rest.
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
                <p className="text-sm text-red-600" role="alert">
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
                We'll detect your brand automatically. Takes about 30 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {scene === "scraping" && (
        <Card className="w-full max-w-[560px] shadow-sm">
          <CardContent className="p-8">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Lock className="h-3 w-3" />
                {validateDomain(domain).valid
                  ? (validateDomain(domain) as { normalized: string }).normalized
                  : domain}
              </div>
              {scrapeError ? null : (
                <span className="text-xs text-muted-foreground">Analyzing...</span>
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
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                      )}
                    </div>
                    <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{log.message}</p>
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">Connecting...</p>
              ) : null}
            </div>

            {scrapeError ? (
              <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
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
      )}

      {scene === "confirm" && scrapedData && (
        <Card className="w-full max-w-[720px] shadow-sm my-8">
          <CardContent className="p-8">
            <h2 className="text-2xl font-semibold tracking-tight">Does this look right?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tweak anything before we go live.</p>

            {/* Logo + Name */}
            <div className="mt-6 flex items-center gap-4">
              {scrapedData.logoUrl && !logoBroken ? (
                <img
                  src={scrapedData.logoUrl}
                  alt="Brand logo"
                  className="h-16 w-16 rounded-full object-cover border bg-white"
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
                <FieldLabel label="Target audience" touched={touchedFields.has("targetAudience")} />
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
                {submitting ? "Confirming..." : "Confirm and go live"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
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
