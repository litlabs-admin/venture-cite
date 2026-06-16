import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, ExternalLink, Link2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { cn } from "@/lib/utils";

export interface CitedUrlItem {
  platform: string;
  prompt: string;
  url: string;
  citedAt: string;
}

interface CitedUrlsResponse {
  success: boolean;
  data: { items: CitedUrlItem[]; total?: number; truncated?: boolean };
}

type View = "page" | "prompt";

// cited_urls is LLM-extracted text, so a value could be a bare domain, a full
// URL, or junk (including a `javascript:`/`data:` scheme). We only ever render
// an <a href> for a normalized http(s) URL; everything else is shown as plain
// (React-escaped) text so a hostile value can't become a clickable XSS vector.
function safeHttpHref(url: string): string | null {
  let candidate = url.trim();
  if (!candidate) return null;
  // Bare domains like "example.com/page" have no scheme — assume https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

// Human-friendly label: host (no www) + path, no trailing slash. Falls back to
// the raw string when it is not a valid absolute URL (cited_urls can hold bare
// domains). Distinguishes two pages on the same host (host alone would not).
function prettyUrl(url: string): string {
  try {
    const u = new URL(safeHttpHref(url) ?? url);
    const host = u.host.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return host + path;
  } catch {
    return url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");
  }
}

// A safe external link to a cited page (or plain text if the URL isn't http(s)).
function UrlLink({ url }: { url: string }) {
  const href = safeHttpHref(url);
  const label = prettyUrl(url);
  if (!href) {
    return (
      <span className="block truncate text-muted-foreground" title={url}>
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // `flex` (not inline-flex) so the anchor fills — and is bound by — the
      // min-w-0 column; otherwise it shrink-wraps to the full URL and overflows
      // onto the platform chips. The inner span then truncates to fit.
      className="flex min-w-0 items-center gap-1 text-primary hover:underline"
      title={url}
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

// Caps the visible chips so a page cited by every engine can't widen the row's
// right group enough to crush the URL. The overflow chip carries the full list
// in its title; the per-platform detail is one expand away regardless.
function PlatformChips({ platforms, max = 4 }: { platforms: string[]; max?: number }) {
  const shown = platforms.slice(0, max);
  const extra = platforms.length - shown.length;
  return (
    <div className="flex items-center gap-1">
      {shown.map((p) => (
        <Badge key={p} variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
          {p}
        </Badge>
      ))}
      {extra > 0 && (
        <Badge
          variant="outline"
          className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
          title={platforms.join(", ")}
        >
          +{extra}
        </Badge>
      )}
    </div>
  );
}

interface PageGroup {
  key: string;
  url: string;
  platforms: string[];
  count: number;
  lastCitedAt: string;
  details: { prompt: string; platform: string; citedAt: string }[];
}

interface PromptGroup {
  key: string;
  prompt: string;
  count: number;
  lastCitedAt: string;
  details: { url: string; platform: string; citedAt: string }[];
}

function newer(a: string, b: string): string {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// Shows which pages AI engines cited for this brand, sourced from the already
// stored geo_rankings.cited_urls[]. Reused on the Monitor Overview and Reports.
// The flat endpoint rows (one per platform×prompt×url) are aggregated here into
// a "By page" view (default — which pages get cited most) or a "By prompt" view
// (what each prompt surfaced), each row expandable for the detail.
export default function CitedUrlsCard({
  brandId,
  refetchInterval = false,
  initialLimit = 10,
}: {
  brandId: string | null | undefined;
  refetchInterval?: number | false;
  initialLimit?: number;
}) {
  const [view, setView] = useState<View>("page");
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<CitedUrlsResponse>({
    queryKey: ["/api/dashboard/cited-urls", brandId],
    enabled: !!brandId,
    refetchInterval,
  });

  const items = useMemo(() => data?.data?.items ?? [], [data]);

  const pageGroups = useMemo<PageGroup[]>(() => {
    const map = new Map<string, PageGroup>();
    for (const it of items) {
      const g = map.get(it.url);
      if (g) {
        g.count += 1;
        g.lastCitedAt = newer(g.lastCitedAt, it.citedAt);
        if (!g.platforms.includes(it.platform)) g.platforms.push(it.platform);
        g.details.push({ prompt: it.prompt, platform: it.platform, citedAt: it.citedAt });
      } else {
        map.set(it.url, {
          key: it.url,
          url: it.url,
          platforms: [it.platform],
          count: 1,
          lastCitedAt: it.citedAt,
          details: [{ prompt: it.prompt, platform: it.platform, citedAt: it.citedAt }],
        });
      }
    }
    const groups = Array.from(map.values());
    for (const g of groups) {
      g.platforms.sort();
      g.details.sort((a, b) => new Date(b.citedAt).getTime() - new Date(a.citedAt).getTime());
    }
    return groups.sort(
      (a, b) =>
        b.count - a.count || new Date(b.lastCitedAt).getTime() - new Date(a.lastCitedAt).getTime(),
    );
  }, [items]);

  const promptGroups = useMemo<PromptGroup[]>(() => {
    const map = new Map<string, PromptGroup>();
    for (const it of items) {
      const g = map.get(it.prompt);
      if (g) {
        g.count += 1;
        g.lastCitedAt = newer(g.lastCitedAt, it.citedAt);
        g.details.push({ url: it.url, platform: it.platform, citedAt: it.citedAt });
      } else {
        map.set(it.prompt, {
          key: it.prompt,
          prompt: it.prompt,
          count: 1,
          lastCitedAt: it.citedAt,
          details: [{ url: it.url, platform: it.platform, citedAt: it.citedAt }],
        });
      }
    }
    const groups = Array.from(map.values());
    for (const g of groups) {
      g.details.sort((a, b) => new Date(b.citedAt).getTime() - new Date(a.citedAt).getTime());
    }
    return groups.sort(
      (a, b) =>
        b.count - a.count || new Date(b.lastCitedAt).getTime() - new Date(a.lastCitedAt).getTime(),
    );
  }, [items]);

  const groups: Array<PageGroup | PromptGroup> = view === "page" ? pageGroups : promptGroups;
  const visible = showAll ? groups : groups.slice(0, initialLimit);

  const toggleOpen = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setViewSafe = (v: View) => {
    setView(v);
    setOpenKeys(new Set());
    setShowAll(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Cited pages
              {groups.length > 0 && (
                <Badge variant="outline" className="ml-1 font-normal">
                  {groups.length}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === "page"
                ? "The pages AI engines cited about your brand, ranked by how often."
                : "What each prompt surfaced when AI engines answered about your brand."}
            </p>
          </div>
          {/* Lens toggle */}
          <div className="inline-flex rounded-md border border-border p-0.5 print:hidden">
            {(
              [
                ["page", "By page"],
                ["prompt", "By prompt"],
              ] as [View, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setViewSafe(val)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  view === val
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`cited-urls-view-${val}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No cited pages yet. Once an AI engine cites a page about your brand, it will appear
            here.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border/60">
              {visible.map((g) => {
                const isOpen = openKeys.has(g.key);
                return (
                  <li key={g.key} data-testid="cited-url-group">
                    <div className="flex items-center gap-2 py-2">
                      <button
                        type="button"
                        onClick={() => toggleOpen(g.key)}
                        className="-ml-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Collapse details" : "Expand details"}
                        data-testid="cited-url-group-toggle"
                      >
                        <ChevronRight
                          className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")}
                        />
                      </button>
                      <div className="min-w-0 flex-1 text-sm font-medium">
                        {view === "page" ? (
                          <UrlLink url={(g as PageGroup).url} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleOpen(g.key)}
                            className="block w-full truncate text-left"
                            title={(g as PromptGroup).prompt}
                          >
                            {(g as PromptGroup).prompt}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {view === "page" && (
                          <PlatformChips platforms={(g as PageGroup).platforms} />
                        )}
                        <Badge variant="secondary" className="font-normal" title="Total citations">
                          {g.count} cite{g.count === 1 ? "" : "s"}
                        </Badge>
                        <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
                          {formatRelativeTime(g.lastCitedAt)}
                        </span>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="space-y-1.5 pb-3 pl-6 pr-1">
                        {view === "page"
                          ? (g as PageGroup).details.map((d, i) => (
                              <div
                                key={`${d.platform}-${i}`}
                                className="flex items-start justify-between gap-3 text-xs"
                              >
                                <span className="min-w-0 text-muted-foreground" title={d.prompt}>
                                  <span className="line-clamp-2">{d.prompt}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="px-1.5 py-0 text-[10px] font-normal"
                                  >
                                    {d.platform}
                                  </Badge>
                                  <span className="whitespace-nowrap text-muted-foreground">
                                    {formatRelativeTime(d.citedAt)}
                                  </span>
                                </span>
                              </div>
                            ))
                          : (g as PromptGroup).details.map((d, i) => (
                              <div
                                key={`${d.url}-${i}`}
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <span className="min-w-0">
                                  <UrlLink url={d.url} />
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="px-1.5 py-0 text-[10px] font-normal"
                                  >
                                    {d.platform}
                                  </Badge>
                                  <span className="whitespace-nowrap text-muted-foreground">
                                    {formatRelativeTime(d.citedAt)}
                                  </span>
                                </span>
                              </div>
                            ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {groups.length > initialLimit && (
              <div className="mt-3 text-center print:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll((v) => !v)}
                  data-testid="cited-urls-toggle"
                >
                  {showAll ? "Show less" : `Show all ${groups.length}`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
