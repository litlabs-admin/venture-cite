import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import SafeMarkdown from "@/components/SafeMarkdown";
import { createHighlightPlugin } from "@/lib/highlightTermsRehype";
import { useToast } from "@/hooks/use-toast";
import { PLATFORM_COLORS } from "@/lib/platformColors";

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
  // Wave 9: optional — when present, lets the "Open in chat" link send the
  // user directly to a fresh chat with the same prompt pre-filled.
  prompt?: string;
  /** Phase 3: list of URLs the LLM cited in its response. Null on
   *  rows written before migration 0047. */
  citedUrls?: string[] | null;
};

// Wave 9: known-platform palette (shared single source) stays explicit so the
// brand colors look right; everything else falls back to a stable hash → HSL
// so a 6th / 7th platform doesn't render as plain grey.

// Wave 9: inline color hash for unknown platforms. djb2-ish — stable across
// renders, distributes hues evenly. Returns CSS variables so the same
// value works for bg/text/border with consistent opacity.
function hashHue(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function colorClassForPlatform(platform: string): string {
  if (PLATFORM_COLORS[platform]) return PLATFORM_COLORS[platform];
  // hsl-based inline style won't work via class; render as Tailwind arbitrary value.
  const hue = hashHue(platform);
  return `border [color:hsl(${hue},70%,40%)] dark:[color:hsl(${hue},70%,70%)] [background-color:hsl(${hue},70%,95%)] dark:[background-color:hsl(${hue},70%,15%)] [border-color:hsl(${hue},70%,80%)] dark:[border-color:hsl(${hue},70%,30%)]`;
}

// Wave 9: deep-link templates. ChatGPT supports ?q=... on the share URL,
// Claude only opens the home page so we fall back to clipboard, etc.
// `null` = no deep link, just copy-to-clipboard.
const PLATFORM_DEEP_LINKS: Record<string, ((prompt: string) => string) | null> = {
  ChatGPT: (q) => `https://chat.openai.com/?q=${encodeURIComponent(q)}`,
  Perplexity: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`,
  Gemini: (q) => `https://gemini.google.com/app?q=${encodeURIComponent(q)}`,
  Claude: null,
  DeepSeek: null,
};

// One card per platform result inside the by-prompt accordion. Shows a clear
// status pill, a short snippet, and an expand control to reveal the full
// markdown-rendered AI response.
export function PlatformResultCard({
  result,
  highlightTerms = [],
}: {
  result: PlatformResult;
  highlightTerms?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const colorClass = colorClassForPlatform(result.platform);
  // Wave 9: detect transport failures (rate-limit, network blip etc.) so
  // we surface them inline as an error pill rather than burying them
  // behind the expand toggle. The citation pipeline writes
  // "Check failed: <reason>" into snippet on failure.
  const isError = !!result.snippet?.startsWith("Check failed:");

  const handleCopy = async () => {
    if (!result.fullResponse) return;
    try {
      await navigator.clipboard.writeText(result.fullResponse);
      toast({ title: "Response copied" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  const deepLink = result.prompt ? PLATFORM_DEEP_LINKS[result.platform]?.(result.prompt) : null;
  const handleOpenInChat = () => {
    if (deepLink) {
      window.open(deepLink, "_blank", "noopener,noreferrer");
    } else if (result.prompt) {
      // Fallback for platforms with no public deep-link query — copy the
      // prompt so the user can paste it.
      navigator.clipboard
        .writeText(result.prompt)
        .then(() =>
          toast({ title: "Prompt copied", description: `Paste into ${result.platform}.` }),
        )
        .catch(() => toast({ title: "Couldn't copy prompt", variant: "destructive" }));
    }
  };

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

      {/* Wave 9: failure pill. Previously, a "Check failed: rate limited"
          snippet was hidden behind an expand toggle — the user had no
          way to see WHY the platform didn't respond without clicking
          through. Show it inline + tinted red so it's unmissable. */}
      {isError && (
        <div className="px-3 py-2 border-t bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900">
          <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{result.snippet}</span>
          </div>
        </div>
      )}

      {result.fullResponse ? (
        <div className="border-t">
          <div className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40 transition-colors">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground flex-1 text-left"
              data-testid={`toggle-response-${result.platform.toLowerCase()}`}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {expanded ? "Hide full response" : "Show full response"}
            </button>
            {/* Wave 9: copy + open-in-chat actions. Only render when
                expanded so they don't add visual noise to the collapsed
                row. */}
            {expanded && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy();
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted"
                  title="Copy response to clipboard"
                  data-testid={`button-copy-${result.platform.toLowerCase()}`}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
                {result.prompt && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenInChat();
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted"
                    title={
                      deepLink
                        ? `Open this prompt in ${result.platform}`
                        : `Copy the prompt — ${result.platform} has no deep-link support`
                    }
                    data-testid={`button-open-in-chat-${result.platform.toLowerCase()}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in {result.platform}
                  </button>
                )}
              </div>
            )}
          </div>
          {expanded && (
            <div className="px-4 py-3 bg-muted/20 border-t max-h-[480px] overflow-y-auto">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-pre:text-xs">
                <SafeMarkdown rehypePlugins={[createHighlightPlugin(highlightTerms)]}>
                  {result.fullResponse}
                </SafeMarkdown>
                {result.citedUrls && result.citedUrls.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-2">Sources cited in response</p>
                    <div className="flex flex-wrap gap-2">
                      {result.citedUrls.map((url) => {
                        let hostname = url;
                        try {
                          hostname = new URL(url).hostname;
                        } catch {
                          // Defensive — render the raw URL if URL parsing fails.
                        }
                        return (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-1 rounded bg-secondary hover:bg-accent transition-colors"
                            title={url}
                          >
                            {hostname}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : !isError && result.snippet ? (
        // Wave 9: snippet without fullResponse and not an error → unusual
        // legacy state. Show inline so the user sees what was captured.
        <div className="px-3 py-2 border-t text-xs text-muted-foreground italic">
          {result.snippet}
        </div>
      ) : !isError ? (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground italic">
          No response captured. Re-run the check to populate.
        </div>
      ) : null}
    </div>
  );
}
