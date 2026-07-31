// client/src/components/fact-sheet/FactRow.tsx
import { useState } from "react";
import { ChevronRight, Edit2, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { iconForDomain, type Domain } from "./domainIcons";
import { formatRelativeTime, daysSince } from "@/lib/formatRelativeTime";
import { safeExternalHref } from "@/lib/urlSafety";

// v2 provenance: every scraped fact carries the list of pages that
// contributed to it (sources) and any disagreeing values seen on other
// pages (alternatives). v1 rows (no sources/alternatives) render
// unchanged - fields are optional.
export type FactSourceEntry = {
  url: string;
  excerpt: string;
  confidence: number;
};

export type FactAlternativeEntry = {
  value: string;
  sources: FactSourceEntry[];
};

export type ResolvedFact = {
  id: string;
  brandId: string;
  domain: Domain | string;
  subcategory: string;
  factKey: string;
  factValue: string;
  valueType: "string" | "number" | "array";
  valuePayload: {
    n?: number;
    items?: string[];
    sources?: FactSourceEntry[];
    alternatives?: FactAlternativeEntry[];
    otherLabel?: string;
  } | null;
  source: "user" | "user_manual" | "scraped" | "manual" | "paste";
  sourceUrl: string | null;
  lastVerified: string | null;
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "") || "/";
    return path.length > 36 ? path.slice(0, 33) + "…" : path;
  } catch {
    return url;
  }
}

const SOURCE_BADGE: Record<ResolvedFact["source"], { emoji: string; label: string }> = {
  scraped: { emoji: "🤖", label: "AI" },
  user: { emoji: "👤", label: "You" },
  user_manual: { emoji: "✋", label: "Manual" },
  manual: { emoji: "✋", label: "Manual" },
  paste: { emoji: "📋", label: "Pasted" },
};

// Defensive fallback so an unexpected source value can never crash the row.
const FALLBACK_BADGE = { emoji: "📝", label: "Fact" };

export function FactRow({
  fact,
  onEdit,
  onDismiss,
}: {
  fact: ResolvedFact;
  onEdit: (fact: ResolvedFact) => void;
  onDismiss: (fact: ResolvedFact) => void;
}) {
  const Icon = iconForDomain(fact.domain);
  const badge = SOURCE_BADGE[fact.source] ?? FALLBACK_BADGE;

  // Per Spec 2 §4.6: staleness shows on scraped rows ONLY.
  const showStale = fact.source === "scraped";
  const days = showStale ? daysSince(fact.lastVerified) : null;
  const staleClass =
    days === null
      ? ""
      : days > 180
        ? "text-warning"
        : days > 90
          ? "text-muted-foreground"
          : "text-muted-foreground";

  const sources = fact.valuePayload?.sources ?? [];
  const alternatives = fact.valuePayload?.alternatives ?? [];
  const hasProvenance = sources.length > 0 || alternatives.length > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3"
      data-testid={`fact-row-${fact.id}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {/* fact.subcategory is already the human label derived from
                factKey (subcategoryFor in shared/factAgent/schema.ts) - e.g.
                factKey "tagline" -> subcategory "Tagline". A second element
                spelling out the raw factKey stated the row's name twice;
                keep it available on hover instead. */}
            <Badge
              variant="secondary"
              className="text-label uppercase tracking-wide"
              title={`Field: ${fact.factKey}`}
            >
              {fact.subcategory}
            </Badge>
            <span
              className="text-label text-muted-foreground"
              title={`Source: ${badge.label}`}
              data-testid={`source-badge-${fact.id}`}
            >
              {badge.emoji} {badge.label}
            </span>
            {sources.length > 1 && (
              <span
                className="text-label text-muted-foreground tnum"
                title={`Verified across ${sources.length} pages`}
                data-testid={`sources-count-${fact.id}`}
              >
                · {sources.length} sources
              </span>
            )}
            {alternatives.length > 0 && (
              <Badge
                variant="outline"
                className="text-label font-normal border-(--warning)/30 text-(--warning)"
                data-testid={`alternatives-count-${fact.id}`}
              >
                {alternatives.length} variant{alternatives.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>

          {fact.valueType === "string" && (
            <p className="text-caption text-foreground">{fact.factValue}</p>
          )}
          {fact.valueType === "number" && (
            <p className="font-mono text-caption text-foreground">
              {fact.valuePayload?.n ?? fact.factValue}
            </p>
          )}
          {fact.valueType === "array" && (
            <ul className="ml-4 list-disc text-caption text-foreground">
              {(fact.valuePayload?.items ?? []).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}

          {showStale && fact.lastVerified ? (
            <p
              className={cn("mt-1 text-caption", staleClass)}
              data-testid={`last-verified-${fact.id}`}
            >
              Last verified {formatRelativeTime(fact.lastVerified)}
            </p>
          ) : null}

          {hasProvenance && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-data text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-expanded={expanded}
                aria-controls={`provenance-${fact.id}`}
                data-testid={`btn-provenance-${fact.id}`}
              >
                <ChevronRight
                  className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
                  aria-hidden
                />
                {expanded ? "Hide provenance" : "Show provenance"}
              </button>
              {expanded && (
                <div
                  id={`provenance-${fact.id}`}
                  className="mt-2 space-y-3 rounded-md border border-border bg-(--bg-surface-1) p-3"
                >
                  {sources.length > 0 && (
                    <div>
                      <p className="text-label font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                        Sources ({sources.length})
                      </p>
                      <ul className="space-y-1.5">
                        {sources.map((s, i) => (
                          <li
                            key={`s-${i}`}
                            className="flex items-start gap-2 text-caption text-foreground"
                          >
                            <a
                              href={safeExternalHref(s.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline shrink-0 max-w-[200px] truncate"
                              title={s.url}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                              {hostnameOf(s.url)}
                              {shortPath(s.url) !== "/" ? shortPath(s.url) : ""}
                            </a>
                            <span className="text-muted-foreground tnum text-label">
                              {Math.round(s.confidence * 100)}%
                            </span>
                            {s.excerpt && (
                              <span className="text-muted-foreground italic truncate">
                                "{s.excerpt}"
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {alternatives.length > 0 && (
                    <div>
                      <p className="text-label font-medium uppercase tracking-wider text-(--warning) mb-1.5">
                        Other values found
                      </p>
                      <ul className="space-y-2">
                        {alternatives.map((alt, i) => (
                          <li key={`a-${i}`} className="text-caption">
                            <p className="text-foreground">{alt.value}</p>
                            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                              {alt.sources.map((s, j) => (
                                <a
                                  key={`a-${i}-s-${j}`}
                                  href={safeExternalHref(s.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-label text-primary hover:underline"
                                  title={s.url}
                                >
                                  <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                                  {hostnameOf(s.url)}
                                  {shortPath(s.url) !== "/" ? shortPath(s.url) : ""}
                                </a>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(fact)}
          aria-label="Edit fact"
          data-testid={`btn-edit-${fact.id}`}
        >
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDismiss(fact)}
          aria-label="Dismiss fact"
          data-testid={`btn-dismiss-${fact.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
