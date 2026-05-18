import { Card, CardContent } from "@/components/ui/card";
import { extractSnippet } from "@/lib/extractSnippet";
import { PLATFORM_COLORS } from "@/lib/platformColors";

export type CitedMention = {
  /** Platform name, e.g. "ChatGPT", "Perplexity" */
  platform: string;
  /** Truncated prompt text */
  prompt: string;
  /** Full AI response text — used to extract a snippet. May be null
   *  if the response wasn't stored, in which case we fall back to the
   *  saved citationContext snippet. */
  fullResponse: string | null;
  /** Pre-computed citation context (may be the same as the snippet
   *  extracted on-the-fly; this is the saved one from geo_rankings). */
  savedSnippet: string | null;
  /** Optional anchor: if the parent provides an onClick, the card
   *  becomes interactive — typically scrolls to the matching
   *  PlatformResultCard in the accordion below. */
  onClick?: () => void;
};

interface CitedMentionsStripProps {
  mentions: CitedMention[];
  highlightTerms: string[];
}

export default function CitedMentionsStrip({ mentions, highlightTerms }: CitedMentionsStripProps) {
  if (mentions.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Where you were cited</h3>
          <span className="text-xs text-muted-foreground">
            {mentions.length} mention{mentions.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {mentions.map((m, i) => {
            const platformClass =
              PLATFORM_COLORS[m.platform] ?? "bg-muted text-foreground border-border";
            // Prefer extracting a snippet from the full response (200 chars
            // around the first brand match). Fall back to the saved snippet
            // if no full response is available.
            const snippet = m.fullResponse
              ? extractSnippet(m.fullResponse, highlightTerms, 150)
              : (m.savedSnippet ?? "");
            return (
              <button
                key={`${m.platform}-${i}`}
                type="button"
                onClick={m.onClick}
                disabled={!m.onClick}
                className={[
                  "snap-start min-w-[280px] max-w-[320px] text-left rounded-lg border p-3",
                  m.onClick
                    ? "hover:border-primary/40 hover:shadow-sm cursor-pointer transition-colors"
                    : "cursor-default",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={[
                      "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border",
                      platformClass,
                    ].join(" ")}
                  >
                    {m.platform}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 mb-1.5">{m.prompt}</p>
                <p className="text-xs leading-relaxed line-clamp-3">{snippet || "(no snippet)"}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
