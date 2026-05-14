// client/src/components/fact-sheet/ConflictPair.tsx
import { useState } from "react";
import { ExternalLink, Plus, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FactSide = {
  id: string;
  domain: string;
  subcategory: string;
  factKey: string;
  factValue: string;
  valueType: "string" | "number" | "array";
  valuePayload: { n?: number; items?: string[]; alternatives?: unknown[] } | null;
  confidence: string | number | null;
  sourceUrl: string | null;
  sourceExcerpt: string | null;
  source: "user" | "scraped" | "manual";
};

export type ConflictPairData = {
  userFact: FactSide; // source='user'
  scrapedFact: FactSide; // source='scraped'
};

export type ConflictPairProps = {
  pair: ConflictPairData;
  onUseMine: (pair: ConflictPairData) => void;
  onUseAI: (pair: ConflictPairData) => void;
  onKeepBoth: (pair: ConflictPairData) => void;
  onMergeArray?: (pair: ConflictPairData, mergedItems: string[]) => void;
  disabled?: boolean;
};

export function ConflictPair({
  pair,
  onUseMine,
  onUseAI,
  onKeepBoth,
  onMergeArray,
  disabled,
}: ConflictPairProps) {
  const userFact = pair.userFact;
  const scrapedFact = pair.scrapedFact;
  const domain = userFact.domain;
  const subcategory = userFact.subcategory;
  const factKey = userFact.factKey;

  return (
    <div
      className="rounded-md border border-border bg-card"
      data-testid={`conflict-pair-${pair.userFact.id}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="uppercase tracking-wide">
            {domain}
          </Badge>
          <span>&gt;</span>
          <span className="font-medium text-foreground">{subcategory}</span>
          <span>&gt;</span>
          <span>{factKey}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
        {renderSide(userFact, "user", domain, subcategory, factKey)}
        {renderSide(scrapedFact, "scraped", domain, subcategory, factKey)}
      </div>

      {pair.userFact.valueType === "array" && onMergeArray ? (
        <ArrayMergePanel pair={pair} onMergeArray={onMergeArray} disabled={disabled} />
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUseMine(pair)}
          disabled={disabled}
          data-testid={`btn-use-mine-${pair.userFact.id}`}
        >
          Use mine
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUseAI(pair)}
          disabled={disabled}
          data-testid={`btn-use-ai-${pair.scrapedFact.id}`}
        >
          Use AI&apos;s
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => onKeepBoth(pair)}
          disabled={disabled}
          data-testid={`btn-keep-both-${pair.userFact.id}`}
        >
          Keep both
        </Button>
      </div>
    </div>
  );
}

function renderSide(
  fact: FactSide,
  side: "user" | "scraped",
  _domain: string,
  _sub: string,
  _key: string,
) {
  const isUser = side === "user";
  const heading = isUser ? "You said" : "AI found";
  const sourceLabel = isUser ? "👤 You" : "🤖 AI";

  return (
    <Card
      className={cn("p-3 text-sm", isUser ? "border-primary/40" : "border-chart-4/40")}
      data-testid={`pair-side-${side}-${fact.id}`}
    >
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{heading}</span>
        <span className="text-muted-foreground">{sourceLabel}</span>
      </div>

      {fact.valueType === "string" && <p className="text-foreground">{fact.factValue}</p>}

      {fact.valueType === "number" && (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-foreground">
            {fact.valuePayload?.n ?? fact.factValue}
          </span>
          <span className="text-xs text-muted-foreground">{fact.factValue}</span>
        </div>
      )}

      {fact.valueType === "array" && (
        <ul className="ml-4 list-disc text-foreground">
          {(fact.valuePayload?.items ?? []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}

      {!isUser && fact.sourceUrl ? (
        <a
          href={fact.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {fact.sourceUrl}
        </a>
      ) : null}

      {!isUser && fact.sourceExcerpt ? (
        <p className="mt-2 line-clamp-3 text-xs italic text-muted-foreground">
          “{fact.sourceExcerpt}”
        </p>
      ) : null}

      {!isUser && fact.confidence !== null && fact.confidence !== undefined ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Confidence{" "}
          <span className="font-mono text-foreground">{Number(fact.confidence).toFixed(2)}</span>
        </div>
      ) : null}
    </Card>
  );
}

function ArrayMergePanel({
  pair,
  onMergeArray,
  disabled,
}: {
  pair: ConflictPairData;
  onMergeArray: (pair: ConflictPairData, mergedItems: string[]) => void;
  disabled?: boolean;
}) {
  const userItems = pair.userFact.valuePayload?.items ?? [];
  const aiItems = pair.scrapedFact.valuePayload?.items ?? [];

  // Seed merged with the user's items (the "keep mine" default).
  const [merged, setMerged] = useState<string[]>(() => [...userItems]);

  const addFromAi = (item: string) => {
    if (merged.includes(item)) return;
    setMerged([...merged, item]);
  };
  const removeFromMerged = (item: string) => {
    setMerged(merged.filter((m) => m !== item));
  };

  return (
    <div className="border-t border-border bg-muted/40 px-3 py-2">
      <div className="mb-1 text-xs font-medium text-foreground">Merge items (preview)</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">From AI — add to merged</div>
          <ul className="space-y-1">
            {aiItems.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-foreground">{item}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => addFromAi(item)}
                  disabled={disabled}
                  aria-label={`Add ${item} from AI`}
                  data-testid={`array-add-${i}`}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Merged result</div>
          <ul className="space-y-1">
            {merged.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-foreground">{item}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeFromMerged(item)}
                  disabled={disabled}
                  aria-label={`Remove ${item}`}
                  data-testid={`array-remove-${i}`}
                >
                  <Minus className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => onMergeArray(pair, merged)}
            disabled={disabled}
            data-testid="array-save-merge"
          >
            Save merged array
          </Button>
        </div>
      </div>
    </div>
  );
}
