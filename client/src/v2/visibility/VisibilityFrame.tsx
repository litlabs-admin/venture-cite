import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { StateBadge } from "../state/StateBadge";

// The Visibility area's frame and its small shared parts.
//
// Geometry follows the Today screen rather than the artboards' 244px rail:
// the shell ships a 200px rail and the content column REFLOWS into what is
// left instead of being rescaled. The 322px evidence rail and the 32px
// gutters are the artboards' own numbers and are kept.
//
// Below `lg` the rail stacks under the content with a top hairline instead of
// a left one. The rail carries the coverage counts that qualify every number
// in the main column, so a narrow viewport reflows it rather than hiding it.

const COLUMN = "min-w-0 flex-1 px-8 py-6";
const RAIL =
  "w-full shrink-0 border-t border-vc-default px-8 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6";

export function VisibilityFrame({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-stretch lg:flex-row">
      <div className={COLUMN}>{main}</div>
      <aside className={RAIL} aria-label="Coverage and evidence">
        {rail}
      </aside>
    </div>
  );
}

/** The page's place in the area. The artboards put this in the top bar; the
 *  shell's context bar belongs to the brand control, so it leads the page. */
export function Breadcrumb({ trail }: { trail: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-caption text-vc-secondary">
      {trail.map((entry, index) => (
        <span key={entry}>
          {index > 0 && <span className="px-1.5 text-vc-tertiary">/</span>}
          <span className={index === trail.length - 1 ? "text-vc-primary" : undefined}>
            {entry}
          </span>
        </span>
      ))}
    </nav>
  );
}

/**
 * The area's tab strip.
 *
 * An entry without a `to` is rendered as a non-interactive label carrying the
 * reason it is not there yet, following `V2Nav`: a tab that navigates nowhere
 * is worse than one that says it is not ready.
 */
export type Tab = {
  label: string;
  to?: "/v2/visibility" | "/v2/visibility/evidence" | "/v2/visibility/results";
  active?: boolean;
};

const TAB_BASE = "border-b-2 pb-2.5 text-body transition-colors duration-150";

export function TabStrip({ tabs }: { tabs: Tab[] }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-6 border-b border-vc-default">
      {tabs.map((tab) =>
        tab.to ? (
          <Link
            key={tab.label}
            to={tab.to}
            className={`${TAB_BASE} ${
              tab.active
                ? "border-vc-accent font-medium text-vc-accent"
                : "border-transparent text-vc-secondary hover:text-vc-primary"
            }`}
            data-v2-tab={tab.label}
          >
            {tab.label}
          </Link>
        ) : (
          <span
            key={tab.label}
            aria-disabled="true"
            title="This view is not built yet."
            className={`${TAB_BASE} cursor-default border-transparent text-vc-tertiary`}
            data-v2-tab={tab.label}
          >
            {tab.label}
            <span className="ml-1.5 text-data text-vc-tertiary">Soon</span>
          </span>
        ),
      )}
    </div>
  );
}

/** A panel or rail heading. Uppercase micro-label on the artboards. */
export function PanelHeading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`text-data font-medium uppercase tracking-wider text-vc-tertiary ${className}`}>
      {children}
    </h2>
  );
}

export function RailHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-section font-semibold text-vc-primary">{children}</h2>;
}

/**
 * One rail row: a label and its value, on a hairline.
 *
 * `value === null` is the case this product exists to get right - it renders
 * the "Not measured" badge rather than a zero, because no endpoint in this
 * area can tell a never-observed count from an observed count of nothing.
 */
export function RailRow({ label, value }: { label: string; value: ReactNode | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-vc-default py-2.5">
      <span className="text-body text-vc-secondary">{label}</span>
      {value === null ? (
        <StateBadge state="not_measured" />
      ) : (
        <span className="shrink-0 text-body font-semibold tabular-nums text-vc-primary">
          {value}
        </span>
      )}
    </div>
  );
}

/** The artboards' loading bars, shared by all three screens. */
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

/** A read that has no source anywhere in the API. Stated as an absence, with
 *  the one action that would create the source - never as a zero. */
export function NotConnected({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-4 text-center">
      <span
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-vc-muted text-vc-tertiary"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-body font-semibold text-vc-primary">{title}</p>
      <p className="mt-1 max-w-[220px] text-caption text-vc-tertiary">{hint}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** `YYYY-MM-DD` or an ISO timestamp, in the artboards' `8 Sep 2026` form.
 *  Formatted in UTC so a browser behind UTC does not print the day before. */
export function formatStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The same stamp with the time, for a row that records when a check ran. */
export function formatStampWithTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })}, ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })}`;
}

/** The path of a cited source, which is what the evidence table shows. The
 *  full URL stays available on the row that owns it. */
export function sourcePath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
  } catch {
    return url;
  }
}
