// client/src/components/fact-sheet/DomainGroupHeader.tsx
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { iconForDomain, DOMAIN_LABELS, type Domain } from "./domainIcons";

export function DomainGroupHeader({
  domain,
  conflictCount,
  onAcceptAllAI,
  onKeepAllMine,
  disabled,
}: {
  domain: Domain;
  conflictCount: number;
  onAcceptAllAI?: () => void;
  onKeepAllMine?: () => void;
  disabled?: boolean;
}) {
  const Icon = iconForDomain(domain);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2"
      data-testid={`domain-header-${domain}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        <span className="font-medium text-foreground">{DOMAIN_LABELS[domain]}</span>
        {conflictCount > 0 ? (
          <Badge variant="destructive" data-testid={`conflict-count-${domain}`}>
            {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
      {conflictCount > 0 && onAcceptAllAI && onKeepAllMine ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onKeepAllMine}
            disabled={disabled}
            data-testid={`btn-keep-all-mine-${domain}`}
          >
            Keep all mine
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onAcceptAllAI}
            disabled={disabled}
            data-testid={`btn-accept-all-ai-${domain}`}
          >
            Accept all AI
          </Button>
        </div>
      ) : null}
    </div>
  );
}
