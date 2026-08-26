import { Link } from "@tanstack/react-router";
import { ChevronRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Dashboard primitives ───────────────────────────────────────────────
// The dashboard's visual system, ported 1:1 from the reference dashboard
// (captured DOM + computed styles, see docs/dashboard-reference.md).
//
// Every value here is measured, not invented:
//   panel label   10px / 600 / uppercase / tracking-wider / --color-vc-label
//   panel link    10px / --color-vc-label → accent on hover
//   row text      12px / --color-vc-secondary, 13px semibold for figures
//   figures       font-mono tabular-nums, always
//   dividers      1px --color-vc-default, drawn by the section, not the panel
//
// Colors use the `vc-*` utilities (index.css @theme) whose values are the
// reference's own tokens - #3b5bf6 accent, warm-stone gray ramp. They are
// literal, not theme-derived, so this surface renders identically regardless
// of the app's light/dark preference.

// ─── Destinations ────────────────────────────────────────────────────────────
// Every tile, panel header and row in the reference dashboard is a link to a
// specific place - nothing is decorative. These are the equivalents in this
// app's route tree (spine stages + tab search params), declared once so a
// panel never hand-rolls a path.
//
// TanStack Router types `to` against the generated route tree and narrows
// `search` per route. A shared link component can't express that union, so the
// cast is confined to this one wrapper instead of being repeated at ~20 call
// sites. DEST below is the only place route strings are written.
export const DEST = {
  report: { to: "/report" },
  citations: { to: "/monitor", search: { tab: "citations" } },
  // Full trakkr-parity page (Tags/sparkline/Score/Δ/On columns, a real
  // /prompts/$promptId detail page). The lighter embedded table at
  // /monitor?tab=citations&ptab=prompts still exists for citations.tsx's
  // own flow, but this is the canonical destination now.
  prompts: { to: "/prompts" },
  promptResults: { to: "/monitor", search: { tab: "citations", ptab: "results" } },
  competitors: { to: "/monitor", search: { tab: "competitors" } },
  mentions: { to: "/monitor", search: { tab: "mentions" } },
  hallucinations: { to: "/diagnose", search: { tab: "hallucinations" } },
  listicles: { to: "/act", search: { tab: "geo-assets" } },
  signals: { to: "/diagnose", search: { tab: "signals" } },
  crawler: { to: "/diagnose", search: { tab: "crawler" } },
  siteHealth: { to: "/site-health" },
  // The Perception panel's own page (score + evidence + the asked-directly
  // probe matrix). Before this entry existed the panel's "Details" link had
  // nowhere of its own to point and used `mentions`, landing the reader on
  // /monitor?tab=mentions - a different metric entirely.
  perception: { to: "/perception" },
  actions: { to: "/act" },
  settings: { to: "/settings" },
} as const;

export type Dest = { to: string; search?: Record<string, string> };

/** The one place a Dashboard destination becomes a router link. */
export function CCLink({
  dest,
  className,
  children,
  ...rest
}: {
  dest: Dest;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"a">, "href" | "className" | "children">) {
  return (
    <Link
      to={dest.to as never}
      search={(dest.search ?? {}) as never}
      className={className}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** Uppercase panel eyebrow. Every panel header starts with one. */
export function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label font-semibold uppercase tracking-wider text-vc-label whitespace-nowrap">
      {children}
    </span>
  );
}

/** The "View all ›" / "Manage ›" affordance on the right of a panel header. */
export function PanelLink({
  dest,
  children,
  withChevron = true,
}: {
  dest: Dest;
  children: React.ReactNode;
  withChevron?: boolean;
}) {
  return (
    <CCLink
      dest={dest}
      className="group flex flex-shrink-0 items-center gap-0.5 whitespace-nowrap text-label text-vc-label transition-colors hover:text-vc-accent"
    >
      {children}
      {withChevron && <ChevronRight className="h-2.5 w-2.5" aria-hidden />}
    </CCLink>
  );
}

/** Panel header: label left, optional link right. Fixed 16px row so every
 *  panel's first content line sits on the same baseline. */
export function PanelHeader({
  label,
  action,
  className = "mb-3 h-4",
}: {
  label: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex flex-shrink-0 items-center gap-2">
        <PanelLabel>{label}</PanelLabel>
      </div>
      {action}
    </div>
  );
}

/** Signed delta. Accent when up, rose when down, muted dash when unknown -
 *  never a fabricated 0. */
export function Delta({
  value,
  className = "",
  digits = 1,
}: {
  value: number | null | undefined;
  className?: string;
  digits?: number;
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={`tabular-nums text-vc-hover ${className}`}>–</span>;
  }
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={`tabular-nums ${className} ${
        flat ? "text-vc-tertiary" : up ? "text-positive" : "text-destructive"
      }`}
    >
      {up ? "+" : ""}
      {value.toFixed(digits)}
    </span>
  );
}

/** The em-dash we render wherever a metric genuinely has no measurement.
 *  Deliberately distinct from a zero - "not measured" is not "measured zero". */
export function NoValue({ className = "" }: { className?: string }) {
  return (
    <span className={`tabular-nums text-vc-hover ${className}`} title="Not measured yet">
      –
    </span>
  );
}

/** A panel that has no backing data source yet. Mirrors the reference's own
 *  "Connect analytics" treatment rather than inventing numbers. */
export function PanelEmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  cta?: { label: string; dest: Dest };
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded bg-vc-muted/70 text-vc-hover">
          {icon}
        </div>
      )}
      <p className="mb-1 text-body text-vc-tertiary">{title}</p>
      {hint && <p className="mb-4 text-data text-vc-tertiary/80">{hint}</p>}
      {cta && (
        <CCLink
          dest={cta.dest}
          className="inline-flex items-center gap-1 rounded bg-vc-accent-subtle px-3 py-1.5 text-data font-medium text-vc-accent transition-all hover:bg-vc-accent hover:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-vc-accent/20"
        >
          {cta.label}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </CCLink>
      )}
    </div>
  );
}

/** The `ⓘ` beside a KPI label. Hovering explains what the metric measures -
 *  in the reference this is a real hover card, not a native `title`, so the
 *  copy is readable and styled with the rest of the surface. */
export function InfoDot({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block cursor-default" tabIndex={0}>
            <Info
              className="h-3 w-3 text-vc-hover transition-colors hover:text-vc-tertiary"
              aria-hidden
            />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="w-56 rounded border border-vc-default bg-vc-surface px-3 py-2.5 text-data leading-relaxed text-vc-secondary shadow-vc-overlay"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// `HoverCard` lived here - the 192px card the platform strip raised on hover.
// Removed on request along with its only caller (PlatformStrip.tsx): the cards
// covered the panels behind them, and the numbers they showed are one click
// away on the results page each cell already links to. Nothing else used it.

/** Skeleton bar in the dashboard's register - no shimmer, just a quiet block
 *  at the exact height of the text it replaces. */
export function Bar({ w = "w-16", h = "h-4" }: { w?: string; h?: string }) {
  return <span className={`inline-block rounded-sm bg-vc-muted ${w} ${h}`} aria-hidden />;
}
