// Mentions rebuild (0050) — Task 19.2
// Detail panel for a single BrandMention.  Opens as a right-side Sheet on
// desktop and a bottom Sheet on mobile (<768 px) per spec §3.12.E.

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ExternalLink,
  ThumbsUp,
  Minus,
  AlertTriangle,
  MessageSquare,
  Globe,
  HelpCircle,
  Trash2,
  Flag,
} from "lucide-react";
import SafeMarkdown from "@/components/SafeMarkdown";
import type { BrandMention } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MentionDetailSheetProps = {
  mention: BrandMention | null; // null = closed
  onClose: () => void;
  onChangeStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onMarkFalsePositive: (id: string) => void;
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "replied", label: "Replied" },
  { value: "false_positive", label: "False positive" },
  { value: "ignored", label: "Ignored" },
];

/** Terminal statuses cannot be further transitioned. */
const TERMINAL_STATUSES = new Set(["replied", "false_positive", "ignored"]);

// ---------------------------------------------------------------------------
// Sentiment helpers
// ---------------------------------------------------------------------------

type SentimentKey = "positive" | "neutral" | "negative";

interface SentimentConfig {
  label: string;
  icon: React.ReactNode;
  className: string;
}

const SENTIMENT_MAP: Record<SentimentKey, SentimentConfig> = {
  positive: {
    label: "Positive",
    icon: <ThumbsUp className="h-3.5 w-3.5" />,
    className: "bg-green-100 text-green-800 border-green-200",
  },
  neutral: {
    label: "Neutral",
    icon: <Minus className="h-3.5 w-3.5" />,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  negative: {
    label: "Negative",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    className: "bg-red-100 text-red-800 border-red-200",
  },
};

function getSentimentConfig(sentiment: string | null | undefined): SentimentConfig {
  const key = (sentiment ?? "neutral").toLowerCase() as SentimentKey;
  return SENTIMENT_MAP[key] ?? SENTIMENT_MAP.neutral;
}

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

interface PlatformConfig {
  label: string;
  icon: React.ReactNode;
}

function getPlatformConfig(platform: string): PlatformConfig {
  switch (platform.toLowerCase()) {
    case "reddit":
      return {
        label: "Reddit",
        icon: <MessageSquare className="h-4 w-4 text-orange-500" />,
      };
    case "hackernews":
    case "hacker_news":
    case "hn":
      return {
        label: "Hacker News",
        icon: <Globe className="h-4 w-4 text-orange-600" />,
      };
    case "quora":
      return {
        label: "Quora",
        icon: <HelpCircle className="h-4 w-4 text-red-600" />,
      };
    default:
      return {
        label: platform,
        icon: <Globe className="h-4 w-4 text-muted-foreground" />,
      };
  }
}

// ---------------------------------------------------------------------------
// "Open on" button label
// ---------------------------------------------------------------------------

function openOnLabel(platform: string): string {
  const { label } = getPlatformConfig(platform);
  return `Open on ${label}`;
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Unknown";
  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MentionDetailSheet({
  mention,
  onClose,
  onChangeStatus,
  onDelete,
  onMarkFalsePositive,
}: MentionDetailSheetProps) {
  const isOpen = mention !== null;
  const isMobile = useIsMobile();
  // When the Sheet opens, focus moves automatically to the first focusable
  // element inside the dialog (the Radix close button). Radix Dialog handles
  // this via the `autoFocus` strategy — no extra work needed. When closed,
  // the parent's `onClose` callback is responsible for returning focus to the
  // originating row element.

  if (!mention) {
    return (
      <Sheet open={false} onOpenChange={() => {}}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[90vh]" : "w-full sm:max-w-xl"}
        />
      </Sheet>
    );
  }

  const sentimentCfg = getSentimentConfig(mention.sentiment);
  const platformCfg = getPlatformConfig(mention.platform);
  const isTerminal = TERMINAL_STATUSES.has(mention.status ?? "new");
  const linkDead = mention.linkStatus === "dead";

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleStatusChange = (newStatus: string) => {
    if (!isTerminal) {
      onChangeStatus(mention.id, newStatus);
    }
  };

  const handleDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this mention? This cannot be undone.")
    ) {
      return;
    }
    onDelete(mention.id);
  };

  const handleMarkFalsePositive = () => {
    onMarkFalsePositive(mention.id);
  };

  return (
    <TooltipProvider>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={`flex flex-col p-0 overflow-hidden ${isMobile ? "h-[90vh]" : "w-full sm:max-w-xl"}`}
        >
          {/* ---- Header ---- */}
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-start gap-3 pr-8">
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                {platformCfg.icon}
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base leading-snug truncate">
                  {mention.sourceTitle ?? platformCfg.label}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Mention detail for {mention.sourceTitle ?? mention.platform}
                </SheetDescription>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`flex items-center gap-1 text-xs ${sentimentCfg.className}`}
                  >
                    {sentimentCfg.icon}
                    {sentimentCfg.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">
                    {mention.status ?? "new"}
                  </Badge>
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* ---- Scrollable body ---- */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-5 space-y-6">
              {/* Open-on button */}
              <div>
                {linkDead ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        {/* Wrapping span so Tooltip works on a disabled button */}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="pointer-events-none"
                          aria-disabled="true"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Link unavailable
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      This link has been verified as dead and is no longer accessible.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={mention.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={openOnLabel(mention.platform)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      {openOnLabel(mention.platform)}
                    </a>
                  </Button>
                )}
              </div>

              {/* Why matched */}
              {(mention.matchedVariation || mention.matchedField) && (
                <section aria-label="Why matched">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Why matched
                  </h3>
                  <p className="text-sm text-foreground">
                    Found{" "}
                    {mention.matchedVariation ? (
                      <code className="bg-muted px-1 py-0.5 rounded text-xs">
                        {mention.matchedVariation}
                      </code>
                    ) : (
                      "your brand"
                    )}{" "}
                    {mention.matchedField ? (
                      <>
                        in{" "}
                        <code className="bg-muted px-1 py-0.5 rounded text-xs">
                          {mention.matchedField}
                        </code>
                      </>
                    ) : null}
                    .
                  </p>
                </section>
              )}

              {/* Mention context */}
              <section aria-label="Mention content">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Content
                </h3>
                {mention.mentionContext ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm border rounded-md p-3 bg-muted/30">
                    <SafeMarkdown>{mention.mentionContext}</SafeMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No content captured by scanner.
                  </p>
                )}
              </section>

              {/* Status */}
              <section aria-label="Status">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Status
                </h3>
                {isTerminal ? (
                  <div className="space-y-1.5">
                    <Select value={mention.status ?? "new"} disabled>
                      <SelectTrigger className="w-full" aria-label="Mention status (final)">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Status is final — no further transitions allowed.
                    </p>
                  </div>
                ) : (
                  <Select value={mention.status ?? "new"} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-full" aria-label="Change mention status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </section>

              {/* Author / Date metadata */}
              <section aria-label="Mention metadata">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Details
                </h3>
                <dl className="space-y-1.5 text-sm">
                  {mention.authorUsername && (
                    <MetaRow label="Author">
                      <span className="font-mono text-xs">{mention.authorUsername}</span>
                    </MetaRow>
                  )}
                  <MetaRow label="Mentioned">
                    {formatDate(mention.mentionedAt ?? mention.discoveredAt)}
                  </MetaRow>
                  <MetaRow label="Discovered">{formatDate(mention.discoveredAt)}</MetaRow>
                  <MetaRow label="Platform">{platformCfg.label}</MetaRow>
                </dl>
              </section>

              {/* Actions */}
              <section aria-label="Actions" className="space-y-2 pt-1 border-t">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 pt-4">
                  Actions
                </h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMarkFalsePositive}
                    disabled={isTerminal}
                    className="flex-1"
                    aria-label="Mark as false positive"
                  >
                    <Flag className="h-3.5 w-3.5 mr-1.5" />
                    Mark false positive
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    className="flex-1"
                    aria-label="Delete mention"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
                {isTerminal && (
                  <p className="text-xs text-muted-foreground">
                    Mark false positive is unavailable — status is final.
                  </p>
                )}
              </section>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
