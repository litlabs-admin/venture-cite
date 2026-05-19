// client/src/components/fact-sheet/FactRow.tsx
import { Edit2, Trash2, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { iconForDomain, type Domain } from "./domainIcons";
import { formatRelativeTime, daysSince } from "@/lib/formatRelativeTime";
import { useInspector } from "@/components/AppShell";

const SOURCE_MEANING: Record<ResolvedFact["source"], string> = {
  scraped: "Auto-extracted by the fact agent from the source below.",
  user: "Entered by you.",
  manual: "Added manually.",
};

// Inspector body: the fact's PROVENANCE. The row shows the value + a source
// badge, but never the source URL — "did the system actually find this on
// the brand's site, or invent it?" is the trust question this answers.
// Only fields the client already holds (ResolvedFact); no synthesized
// confidence score is shown (it isn't in the client model and its
// provenance isn't defensible — honest by construction).
function FactProvenance({ fact }: { fact: ResolvedFact }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {fact.subcategory} · {fact.factKey}
        </p>
        {fact.valueType === "array" ? (
          <ul className="mt-1 list-disc pl-4 text-foreground">
            {(fact.valuePayload?.items ?? []).map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-foreground">
            {fact.valueType === "number"
              ? (fact.valuePayload?.n ?? fact.factValue)
              : fact.factValue}
          </p>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Source
        </p>
        <p className="mt-1 text-foreground">{SOURCE_MEANING[fact.source]}</p>
        {fact.sourceUrl ? (
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all text-primary hover:underline"
          >
            {fact.sourceUrl}
          </a>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No source URL recorded.</p>
        )}
      </div>
      <div className="border-t border-border pt-3 text-xs text-muted-foreground">
        {fact.lastVerified ? (
          <p>Last verified {formatRelativeTime(fact.lastVerified)}</p>
        ) : (
          <p>Not yet re-verified.</p>
        )}
        <p className="mt-2">Shown exactly as stored — no inferred or estimated values.</p>
      </div>
    </div>
  );
}

export type ResolvedFact = {
  id: string;
  brandId: string;
  domain: Domain | string;
  subcategory: string;
  factKey: string;
  factValue: string;
  valueType: "string" | "number" | "array";
  valuePayload: { n?: number; items?: string[] } | null;
  source: "user" | "scraped" | "manual";
  sourceUrl: string | null;
  lastVerified: string | null;
};

const SOURCE_BADGE: Record<ResolvedFact["source"], { emoji: string; label: string }> = {
  scraped: { emoji: "🤖", label: "AI" },
  user: { emoji: "👤", label: "You" },
  manual: { emoji: "✋", label: "Manual" },
};

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
  const badge = SOURCE_BADGE[fact.source];
  const inspector = useInspector();

  // Per Spec 2 §4.6: staleness shows on scraped rows ONLY.
  const showStale = fact.source === "scraped";
  const days = showStale ? daysSince(fact.lastVerified) : null;
  const staleClass =
    days === null
      ? ""
      : days > 180
        ? "text-chart-3"
        : days > 90
          ? "text-muted-foreground"
          : "text-muted-foreground";

  return (
    <div
      className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3"
      data-testid={`fact-row-${fact.id}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {fact.subcategory}
            </Badge>
            <span className="text-sm font-medium text-foreground">{fact.factKey}</span>
            <span
              className="text-[10px] text-muted-foreground"
              title={`Source: ${badge.label}`}
              data-testid={`source-badge-${fact.id}`}
            >
              {badge.emoji} {badge.label}
            </span>
          </div>

          {fact.valueType === "string" && (
            <p className="text-sm text-foreground">{fact.factValue}</p>
          )}
          {fact.valueType === "number" && (
            <p className="font-mono text-sm text-foreground">
              {fact.valuePayload?.n ?? fact.factValue}
            </p>
          )}
          {fact.valueType === "array" && (
            <ul className="ml-4 list-disc text-sm text-foreground">
              {(fact.valuePayload?.items ?? []).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}

          {showStale && fact.lastVerified ? (
            <p className={cn("mt-1 text-xs", staleClass)} data-testid={`last-verified-${fact.id}`}>
              Last verified {formatRelativeTime(fact.lastVerified)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() =>
            inspector.open({ title: fact.factKey, body: <FactProvenance fact={fact} /> })
          }
          aria-label="Fact provenance"
          data-testid={`btn-provenance-${fact.id}`}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
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
