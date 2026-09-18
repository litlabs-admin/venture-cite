// Follow-up chips. Always carries its own "Ask next" label - fixes I6
// alongside AskEvidence's empty-state guard (01-trakkr-teardown.md R4).
import { ChevronRight } from "lucide-react";

export function AskFollowups({
  items,
  onPick,
}: {
  items: string[];
  onPick: (text: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-caption font-medium text-vc-tertiary">Ask next</p>
      <div className="flex flex-col items-start gap-1.5">
        {items.map((text, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(text)}
            className="flex items-center gap-1.5 rounded-md border border-vc-default bg-vc-surface px-3 py-1.5 text-left text-caption text-vc-secondary hover:bg-vc-hover"
          >
            <span>{text}</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-vc-tertiary" />
          </button>
        ))}
      </div>
    </div>
  );
}
