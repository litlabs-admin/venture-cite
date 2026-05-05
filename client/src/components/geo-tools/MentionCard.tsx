import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check,
  Globe,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { type KeyboardEvent } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BrandMention } from "@shared/schema";

/**
 * Format a server-computed age (in seconds) as a relative-time label.
 * Server-anchored: the server measured both "now" and the row timestamp on
 * the same clock, so this is immune to DB-host, Node-process, or browser
 * clock skew.
 */
function formatAgeSeconds(s: number): string {
  if (s < 45) return "just now";
  if (s < 90) return "about 1 minute ago";
  const m = Math.round(s / 60);
  if (m < 45) return `${m} minutes ago`;
  if (m < 90) return "about 1 hour ago";
  const h = Math.round(m / 60);
  if (h < 24) return `about ${h} hours ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(mo / 12);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Status display map (mirrors MENTION_STATUS_DISPLAY in geo-tools.tsx).
// ---------------------------------------------------------------------------
const MENTION_STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-slate-100 text-slate-700" },
  acknowledged: { label: "Acknowledged", className: "bg-blue-100 text-blue-800" },
  replied: { label: "Replied", className: "bg-emerald-100 text-emerald-800" },
  false_positive: { label: "False positive", className: "bg-amber-100 text-amber-800" },
  ignored: { label: "Ignored", className: "bg-gray-200 text-gray-600" },
};

type MentionStatus = "new" | "acknowledged" | "replied" | "false_positive" | "ignored";

// Transition rules per spec §3.10:
//   new → anything
//   acknowledged → replied | false_positive | ignored
//   replied | false_positive | ignored → terminal (no transitions)
function allowedTransitions(current: string): MentionStatus[] {
  switch (current) {
    case "new":
      return ["acknowledged", "replied", "false_positive", "ignored"];
    case "acknowledged":
      return ["replied", "false_positive", "ignored"];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Platform icon — lucide-only (react-icons is in the allowed import list for
// the geo-tools page but not for new leaf components per spec §3.1 imports).
// ---------------------------------------------------------------------------
function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform.toLowerCase()) {
    case "reddit":
      // Reddit's brand icon isn't in lucide; use MessageSquare as a stand-in.
      return <MessageSquare className={cn("h-4 w-4 text-orange-500", className)} />;
    case "hackernews":
    case "hacker_news":
      return <MessageSquare className={cn("h-4 w-4 text-orange-700", className)} />;
    default:
      return <Globe className={cn("h-4 w-4 text-muted-foreground", className)} />;
  }
}

function platformLabel(platform: string): string {
  switch (platform.toLowerCase()) {
    case "reddit":
      return "Reddit";
    case "hackernews":
    case "hacker_news":
      return "Hacker News";
    default:
      return platform;
  }
}

// ---------------------------------------------------------------------------
// Sentiment badge — color-blind safe (icon + color).
// ---------------------------------------------------------------------------
function SentimentBadge({ sentiment }: { sentiment: string | null | undefined }) {
  switch (sentiment) {
    case "positive":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
          <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
          Positive
        </span>
      );
    case "negative":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
          Negative
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">
          <Minus className="h-3 w-3 shrink-0" aria-hidden="true" />
          Pending
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
          <Minus className="h-3 w-3 shrink-0" aria-hidden="true" />
          Neutral
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const display = MENTION_STATUS_DISPLAY[status] ?? MENTION_STATUS_DISPLAY.new;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        display.className,
      )}
    >
      {display.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Engagement — 0-100 normalized score with tooltip.
// ---------------------------------------------------------------------------
function EngagementDisplay({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return (
      <span className="text-xs text-muted-foreground" aria-label="Engagement unavailable">
        —
      </span>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-xs text-muted-foreground">
            Engagement: <span className="font-medium text-foreground">{score}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-[200px] text-xs">
            Normalized engagement score (0–100) across upvotes, comments, and views for this
            platform.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Within-24h check for "New" badge
// ---------------------------------------------------------------------------
function isWithin24h(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  return Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export type MentionCardProps = {
  mention: BrandMention;
  onOpen: (mention: BrandMention) => void;
  onChangeStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onMarkFalsePositive: (id: string) => void;
  isActive?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MentionCard({
  mention,
  onOpen,
  onChangeStatus,
  onDelete,
  onMarkFalsePositive,
  isActive = false,
}: MentionCardProps) {
  const transitions = allowedTransitions(mention.status);
  const isNew = isWithin24h(mention.discoveredAt);
  const isManual = mention.source === "manual";
  const isDeadLink = mention.linkStatus === "dead";

  const title = mention.sourceTitle ?? mention.sourceUrl;
  // Prefer server-anchored age when present (immune to client/DB clock skew).
  // Falls back to formatDistanceToNow for backwards compatibility.
  const ageSec = (mention as unknown as { discoveredAtAgeSeconds?: number }).discoveredAtAgeSeconds;
  const relativeDate =
    typeof ageSec === "number"
      ? formatAgeSeconds(ageSec)
      : formatDistanceToNow(new Date(mention.discoveredAt), { addSuffix: true });
  const ariaLabel = [
    platformLabel(mention.platform),
    "mention:",
    title,
    `— ${mention.sentiment ?? "neutral"} sentiment,`,
    `status: ${MENTION_STATUS_DISPLAY[mention.status]?.label ?? mention.status},`,
    `discovered ${relativeDate}`,
  ].join(" ");

  function handleCardClick() {
    onOpen(mention);
  }

  function handleCardKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(mention);
    }
  }

  // Shared pill row for sm+: platform icon, title, badges, date, engagement, menu
  // Mobile: three rows laid out via flex-col inside.

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        // Base card styling
        "group relative w-full cursor-pointer rounded-lg border bg-card text-left transition-colors",
        "hover:border-primary/40 hover:shadow-sm",
        // Focus ring
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        // Active state (currently shown in detail sheet)
        isActive && "border-primary/60 bg-primary/5",
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* sm+ single-row layout                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="hidden sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-3">
        {/* Platform icon */}
        <span className="shrink-0" aria-label={platformLabel(mention.platform)}>
          <PlatformIcon platform={mention.platform} />
        </span>

        {/* Title */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
          {title}
        </span>

        {/* Pills row */}
        <div className="flex shrink-0 items-center gap-2">
          {/* "New" badge for recently discovered mentions */}
          {isNew && (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              New
            </span>
          )}

          {/* "Manual" badge */}
          {isManual && (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
              Manual
            </span>
          )}

          {/* Dead-link indicator */}
          {isDeadLink && (
            <span
              className="inline-flex items-center gap-1 text-xs text-destructive"
              title="Link unavailable"
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">Link unavailable</span>
            </span>
          )}

          <SentimentBadge sentiment={mention.sentiment} />
          <StatusBadge status={mention.status} />

          {/* Date */}
          <span className="whitespace-nowrap text-xs text-muted-foreground">{relativeDate}</span>

          {/* Actions menu — stopPropagation so click doesn't open the sheet */}
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <ActionsMenu
              mention={mention}
              transitions={transitions}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
              onMarkFalsePositive={onMarkFalsePositive}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* <sm three-row layout                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-2 px-3 py-3 sm:hidden">
        {/* Row 1: icon + title */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0" aria-label={platformLabel(mention.platform)}>
            <PlatformIcon platform={mention.platform} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
            {title}
          </span>
        </div>

        {/* Row 2: badges + date */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isNew && (
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
              New
            </span>
          )}
          {isManual && (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
              Manual
            </span>
          )}
          {isDeadLink && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Link unavailable
            </span>
          )}
          <SentimentBadge sentiment={mention.sentiment} />
          <StatusBadge status={mention.status} />
          <span className="text-xs text-muted-foreground">{relativeDate}</span>
        </div>

        {/* Row 3: actions */}
        <div className="flex items-center justify-end">
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <ActionsMenu
              mention={mention}
              transitions={transitions}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
              onMarkFalsePositive={onMarkFalsePositive}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* "Why matched" hint — shown below both layouts when data is present  */}
      {/* ------------------------------------------------------------------ */}
      {mention.matchedVariation && mention.matchedField && (
        <div className="border-t px-3 pb-2 pt-1.5 sm:px-4">
          <p className="text-xs text-muted-foreground">
            Found{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              {mention.matchedVariation}
            </code>{" "}
            in <span className="font-medium">{mention.matchedField}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions menu
// ---------------------------------------------------------------------------
type ActionsMenuProps = {
  mention: BrandMention;
  transitions: MentionStatus[];
  onChangeStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onMarkFalsePositive: (id: string) => void;
};

function ActionsMenu({
  mention,
  transitions,
  onChangeStatus,
  onDelete,
  onMarkFalsePositive,
}: ActionsMenuProps) {
  const statusLabels: Record<MentionStatus, string> = {
    new: "New",
    acknowledged: "Acknowledged",
    replied: "Replied",
    false_positive: "False positive",
    ignored: "Ignored",
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Mention actions"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "transition-colors",
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Change status submenu — only rendered when transitions exist */}
        {transitions.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Change status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {transitions.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => onChangeStatus(mention.id, s)}>
                  {statusLabels[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Mark false positive */}
        {mention.status !== "false_positive" && (
          <DropdownMenuItem onSelect={() => onMarkFalsePositive(mention.id)}>
            <XCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Mark false positive
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Delete */}
        <DropdownMenuItem
          onSelect={() => onDelete(mention.id)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
