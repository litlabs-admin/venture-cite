// Evidence block. Fixes Trakkr's I6 - the label is NEVER rendered with an
// empty body (01-trakkr-teardown.md R4: their "Sources checked" is the empty
// state of this exact block, sitting unlabelled right above the follow-up
// chips, which is why it reads as captioning them). Here: render nothing at
// all when there are zero items, and AskFollowups always carries its own
// "Ask next" label, so the two can never be mistaken for one construct.
//
// Rendered as compact source chips, not a list - beautifului.dev's
// "Streaming Text" reference (streamed answer with inline source cards)
// reads the sources as part of the answer's texture, not a second panel.
import { Globe } from "lucide-react";
import type { EvidenceItem } from "@shared/ask/blocks";

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function AskEvidence({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-caption font-medium text-vc-tertiary">
        <Globe className="h-3 w-3" />
        Found {items.length} source{items.length === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            title={item.url}
            className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-vc-default bg-vc-surface px-2.5 py-1 text-caption text-vc-secondary transition-colors hover:bg-vc-hover"
          >
            <span className="truncate">{item.outlet ?? hostFromUrl(item.url)}</span>
            {typeof item.authority === "number" && (
              <span className="shrink-0 text-vc-tertiary">· {item.authority}</span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
