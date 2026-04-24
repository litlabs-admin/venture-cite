import { useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SafeMarkdown from "@/components/SafeMarkdown";

export type PlatformResult = {
  platform: string;
  isCited: boolean;
  snippet: string | null;
  fullResponse: string | null;
  checkedAt: string;
  // Set when the citation was revealed by a stored-re-check pass using a
  // newly-added name variation. Rank is null on these rows because the
  // original LLM run didn't see the brand, so we have no honest rank signal.
  reDetectedAt?: string | null;
};

const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  Claude: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  Gemini: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  Perplexity: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  DeepSeek: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
};

// One card per platform result inside the by-prompt accordion. Shows a clear
// status pill, a short snippet, and an expand control to reveal the full
// markdown-rendered AI response.
export function PlatformResultCard({ result }: { result: PlatformResult }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass =
    PLATFORM_COLORS[result.platform] || "bg-muted text-muted-foreground border-border";

  return (
    <div
      className="border rounded-lg overflow-hidden"
      data-testid={`platform-result-${result.platform.toLowerCase()}`}
    >
      <div className="flex items-center gap-3 p-3 bg-muted/30">
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}
        >
          <span>{result.platform}</span>
        </div>
        {result.isCited ? (
          <>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Cited
            </div>
            {result.reDetectedAt ? (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                title="Revealed by a stored-data re-check using an updated name variation. Rank isn't available because the original run didn't see this brand."
              >
                Re-detected
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            <XCircle className="h-3 w-3" />
            Not cited
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(result.checkedAt), { addSuffix: true })}
        </span>
      </div>

      {result.fullResponse ? (
        <div className="border-t">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
            data-testid={`toggle-response-${result.platform.toLowerCase()}`}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {expanded ? "Hide full response" : "Show full response"}
          </button>
          {expanded && (
            <div className="px-4 py-3 bg-muted/20 border-t max-h-[480px] overflow-y-auto">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-pre:text-xs">
                <SafeMarkdown>{result.fullResponse}</SafeMarkdown>
              </div>
            </div>
          )}
        </div>
      ) : result.snippet ? (
        // Snippet present but no expanded response — typically a stored error
        // line like "Check failed: rate limited". Show the snippet inline so
        // the user can see what happened rather than a generic message.
        <div className="px-3 py-2 border-t text-xs text-muted-foreground italic">
          {result.snippet}
        </div>
      ) : (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground italic">
          No response captured. Re-run the check to populate.
        </div>
      )}
    </div>
  );
}
