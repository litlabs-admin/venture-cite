import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Download, FileText } from "lucide-react";
import { useDashboardData } from "./useDashboardData";

// ─── Context-bar actions ─────────────────────────────────────────────────────
// The reference's header carries Share ▾, Export ▾ and Reports ▾.
//
// Share is NOT reproduced: this app has no share-link capability at all (no
// tokens, no public report routes), and a menu whose items cannot work is
// worse than an absent one. Export and Reports are both backed by something
// real — a CSV built from the data already on screen, the existing print
// stylesheet, and the /report route.
//
// Button chrome is the measured reference spec: h-8, px-2.5, rounded, 1px
// border, 12px/500 label, 14px icons, 150ms colour transition.

const BTN =
  "flex h-8 items-center gap-1.5 rounded border border-vc-default px-2.5 text-caption font-medium text-vc-secondary transition-colors duration-150 hover:bg-vc-muted/50";
const MENU =
  "absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded border border-vc-default bg-vc-surface py-1 shadow-vc-overlay";
const ITEM =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-caption text-vc-secondary transition-colors hover:bg-vc-muted/60 hover:text-vc-primary";

function csvEscape(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Close on outside click and on Escape — a dropdown that only closes by
 *  re-clicking its trigger is a trap for keyboard users. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function HeaderActions({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  // Same query keys the dashboard already mounted, so this is a cache read.
  const d = useDashboardData(brandId);

  function exportCsv() {
    const rows: (string | number | null)[][] = [
      ["VentureCite — Dashboard export"],
      ["Brand", brandName],
      ["Generated", new Date().toISOString()],
      [],
      ["Metric", "Value"],
      ["Visibility score", d.hero?.visibilityScore ?? ""],
      ["Visibility delta (vs. last snapshot)", d.hero?.visibilityDelta ?? ""],
      ["Cited checks", d.hero?.citedChecks ?? ""],
      ["Total checks", d.hero?.totalChecks ?? ""],
      ["Citation rate %", d.hero?.citationRate ?? ""],
      ["Mentions (7d, Reddit + HN)", d.mentions7d ?? ""],
      ["Citations this week", d.citationsThisWeek ?? ""],
      ["Cited URLs (30d)", d.totalCitedUrls ?? ""],
      [],
      ["Weekly citation trend"],
      ["Week starting", "Cited", "Total", "Citation rate %"],
      ...d.weeks.map((w) => [w.weekStart, w.cited, w.total, w.citationRate]),
      [],
      ["Rankings (by share of voice)"],
      ["Rank", "Name", "Domain", "Is own brand", "Share of voice", "Total citations"],
      ...[...d.leaderboard]
        .sort((a, b) => b.shareOfVoice - a.shareOfVoice)
        .map((r, i) => [
          i + 1,
          r.name,
          r.domain,
          r.isOwn ? "yes" : "no",
          Math.round(r.shareOfVoice),
          r.totalCitations,
        ]),
      [],
      ["Platforms"],
      ["Platform", "Cited", "Checks", "Visibility score"],
      ...d.platforms.map((p) => [p.aiPlatform, p.citedCount, p.totalCount, p.visibilityScore]),
      [],
      ["Top prompts"],
      ["Prompt", "Platforms citing"],
      ...d.prompts.map((p) => [p.prompt, p.platforms.filter((x) => x.isCited).length]),
      [],
      ["Top citing sources (30d)"],
      ["Domain", "Cited URLs"],
      ...d.topSources.map((s) => [s.domain, s.count]),
    ];
    const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    download(
      `venturecite-dashboard-${brandName.replace(/\W+/g, "-").toLowerCase()}-${stamp}.csv`,
      body,
      "text/csv;charset=utf-8",
    );
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={ref}>
        <button
          type="button"
          className={BTN}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        {open && (
          <div className={MENU} role="menu">
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={() => {
                setOpen(false);
                // Deferred so the menu is unmounted before the print dialog
                // snapshots the page.
                setTimeout(() => window.print(), 0);
              }}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              PDF Report
            </button>
            <button type="button" role="menuitem" className={ITEM} onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" aria-hidden />
              CSV Data
            </button>
          </div>
        )}
      </div>

      <Link to="/report" className={BTN}>
        <FileText className="h-3.5 w-3.5" aria-hidden />
        Reports
      </Link>
    </div>
  );
}
