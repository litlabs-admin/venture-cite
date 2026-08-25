import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import type { SiteHealthFinding } from "@shared/siteHealthFindings";
import { severityOf } from "./ChecksTable";
import { getFixSnippet, CodeBlock } from "./fixSnippets";

// ─── Finding drawer ──────────────────────────────────────────────────────
// One shared shell for every check (reference: trakkr.ai/optimize, a single
// 720px Sheet reused for both "Fix it for me" and "How to fix" rows).
//
// SCOPED DOWN FROM THE REFERENCE, ON PURPOSE (not a silent shortcut):
//   * No live diff view. The reference shows an actual before/after of the
//     page's meta tags; this app has no endpoint that returns a page's
//     current tag VALUES (only pass/fail flags), so rendering a diff would
//     mean inventing "before" text. Ships as an affected-pages list +
//     disabled Apply instead.
//   * "Mark in progress" / "Ignore" / "Mark fixed" ARE real now - backed by
//     site_health_finding_status (migration 0095), not a status that looks
//     saved but isn't.

const AUTOMATABLE_IDS = new Set(["content-meta-tags", "content-open-graph"]);

const GUIDANCE: Record<string, string[]> = {
  "missing-robots-txt": [
    "Create a robots.txt file at your site's root (e.g. /robots.txt).",
    "Explicitly allow the AI crawlers you want reading your site (GPTBot, ClaudeBot, PerplexityBot, etc).",
    "Deploy it and re-run a scan to confirm it's reachable.",
  ],
  "missing-sitemap-xml": [
    "Generate a sitemap.xml listing every page you want AI crawlers to discover.",
    "Reference it from robots.txt with a Sitemap: line.",
    "Keep it in sync automatically if your site adds pages often.",
  ],
  "missing-llms-txt": [
    "Add an llms.txt file at your site's root summarizing what your site is and its key pages.",
    "Keep it short and curated - it's a hint for AI systems, not a full sitemap.",
  ],
  "blocked-ai-crawlers": [
    "Open your robots.txt and check for Disallow rules matching the blocked crawlers listed above.",
    "Remove or narrow those rules if you want that crawler citing your content.",
  ],
  "failed-pages": [
    "Open each affected URL directly and check the response - a 4xx/5xx status or a connection error blocks AI crawlers the same way it blocks browsers.",
    "Fix the underlying cause (broken redirect, server error, removed page) or update internal links pointing at it.",
  ],
  "thin-content": [
    "Check whether this page renders its main content client-side (React/Vue after page load) - non-JS AI crawlers never see that.",
    "Consider server-side rendering or a static prerender for pages you want AI systems to read.",
  ],
  "content-meta-tags": [
    "Give the page a unique, descriptive <title> (under ~60 characters).",
    'Add a <meta name="description"> summarizing the page (120-160 characters).',
    "Avoid reusing the same title/description across multiple pages.",
  ],
  "content-open-graph": [
    "Add og:title, og:description, and og:image meta tags.",
    "These also improve how the page previews when shared, not just AI parsing.",
  ],
  "content-heading-structure": [
    "Make sure the page has exactly one <h1>.",
    "Don't skip heading levels (an <h3> should follow an <h2>, not an <h1> directly).",
  ],
  "content-readability": [
    "Shorten sentences and prefer plain words over jargon where the audience allows it.",
    "Break up long paragraphs - AI systems (and readers) extract claims more reliably from short, direct sentences.",
  ],
  "content-answer-formats": [
    "Add FAQPage, HowTo, or QAPage structured data (JSON-LD) where the content actually is a Q&A or a how-to.",
    "Structured data gives AI systems an explicit, machine-readable answer shape to lift.",
  ],
  "content-faq": [
    "Add an FAQ section addressing the real questions buyers ask about this topic.",
    "Mark it up with FAQPage JSON-LD so AI systems can parse question/answer pairs directly.",
  ],
  "content-density": [
    "Expand thin sections with real detail - specifics, numbers, examples an AI system could quote.",
    "A page that's mostly navigation/boilerplate text relative to its actual content reads as low-value to a crawler.",
  ],
  "missing-mcp-json": [
    "Add an mcp.json file describing any tools/actions your site exposes to MCP-aware agents.",
    "Not scored today - a forward-looking signal, not a citation-readiness requirement.",
  ],
  "missing-security-txt": [
    "Add a security.txt file at /.well-known/security.txt with a disclosure contact.",
    "Best practice, no bearing on AI citation readiness.",
  ],
};

function copyForTicket(f: SiteHealthFinding) {
  const lines = [
    f.title,
    "",
    f.description,
    "",
    f.affectedUrls.length > 0 ? "Affected pages:" : "",
    ...f.affectedUrls,
  ].filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""));
  navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
}

function sendToDevHref(f: SiteHealthFinding) {
  const subject = `Site health fix: ${f.title}`;
  const bodyLines = [
    f.description,
    "",
    f.affectedUrls.length > 0 ? `Affected pages (${f.affectedUrls.length}):` : "",
    ...f.affectedUrls.slice(0, 30),
  ].filter(Boolean);
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
}

/** Groups affected URLs by their first path segment (e.g. every
 *  /blog/compare-x, /blog/best-y -> one "/blog/*" group with a count) -
 *  matches the reference's own "Where it shows up" grouping instead of a
 *  flat list of 30 near-identical paths. */
function groupByPath(urls: string[]): { prefix: string; urls: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch {
      // not a full URL - use as-is
    }
    const firstSegment = pathname.split("/").filter(Boolean)[0];
    const key = firstSegment ? `/${firstSegment}/*` : "/";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(url);
  }
  return [...groups.entries()]
    .map(([prefix, list]) => ({ prefix, urls: list }))
    .sort((a, b) => b.urls.length - a.urls.length);
}

type FindingStatus = "in_progress" | "ignored" | "fixed";
const STATUS_LABEL: Record<FindingStatus, string> = {
  in_progress: "In progress",
  ignored: "Ignored",
  fixed: "Fixed",
};

interface FindingDrawerProps {
  finding: SiteHealthFinding | null;
  onClose: () => void;
  brandId: string;
  platform: string | null;
  currentStatus: FindingStatus | null;
  onOpenPages: (pathPrefix: string) => void;
}

export function FindingDrawer({
  finding,
  onClose,
  brandId,
  platform,
  currentStatus,
  onOpenPages,
}: FindingDrawerProps) {
  const [showAllPaths, setShowAllPaths] = useState(false);
  const queryClient = useQueryClient();

  const automatable = finding ? AUTOMATABLE_IDS.has(finding.id) : false;
  const guidance = finding ? GUIDANCE[finding.id] : undefined;
  const snippet = finding ? getFixSnippet(finding.id, platform) : null;

  const pathGroups = useMemo(() => (finding ? groupByPath(finding.affectedUrls) : []), [finding]);
  const shownGroups = showAllPaths ? pathGroups : pathGroups.slice(0, 4);
  const hiddenPathCount = pathGroups.length - shownGroups.length;

  const setStatus = useMutation({
    mutationFn: async (status: FindingStatus) => {
      await apiRequest(
        "PUT",
        `/api/dashboard/site-health/${brandId}/finding-status/${finding!.id}`,
        {
          status,
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/dashboard/site-health/${brandId}/finding-status`],
      });
    },
  });

  const clearStatus = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "DELETE",
        `/api/dashboard/site-health/${brandId}/finding-status/${finding!.id}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/dashboard/site-health/${brandId}/finding-status`],
      });
    },
  });

  const pending = setStatus.isPending || clearStatus.isPending;

  return (
    <Sheet open={!!finding} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[720px]">
        {finding && (
          <>
            <div className="border-b border-vc-default px-6 pb-4 pt-6">
              <div className="flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-vc-label">
                <span>
                  {finding.advisory
                    ? "Advisory"
                    : { high: "High", medium: "Medium", low: "Low" }[severityOf(finding)]}
                  {" · "}
                  {finding.category}
                </span>
                {currentStatus && (
                  <span className="rounded bg-vc-accent-subtle px-1.5 py-0.5 text-vc-accent">
                    {STATUS_LABEL[currentStatus]}
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-dialog font-semibold leading-snug tracking-tight text-vc-primary">
                {finding.title}
              </h2>
              <p className="mt-1 text-caption leading-relaxed text-vc-secondary">
                {finding.description}
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-vc-default border-b border-vc-default">
              <div className="px-4 py-3.5">
                <div className="text-label font-semibold uppercase tracking-wider text-vc-label">
                  Pages
                </div>
                <div className="mt-1.5 font-mono text-metric font-medium leading-none tracking-tight tabular-nums text-vc-primary">
                  {finding.affectedUrls.length > 0 ? finding.affectedUrls.length : "site"}
                </div>
              </div>
              <div className="px-4 py-3.5">
                <div className="text-label font-semibold uppercase tracking-wider text-vc-label">
                  Points
                </div>
                <div className="mt-1.5 font-mono text-metric font-medium leading-none tracking-tight tabular-nums text-vc-primary">
                  {finding.advisory ? "advisory" : `+${finding.points}`}
                </div>
              </div>
            </div>

            <div className="flex-1">
              {pathGroups.length > 0 && (
                <section className="border-b border-vc-default px-6 py-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-label font-semibold uppercase tracking-wider text-vc-label">
                      Where it shows up
                    </h3>
                    <button
                      type="button"
                      onClick={() => onOpenPages(pathGroups[0].prefix)}
                      className="text-data text-vc-secondary transition-colors hover:text-vc-primary"
                    >
                      Open these pages →
                    </button>
                  </div>
                  <ul className="divide-y divide-vc-default/40">
                    {shownGroups.map((g) => (
                      <li key={g.prefix} className="flex h-8 items-center justify-between gap-3">
                        <span className="truncate font-mono text-data text-vc-secondary">
                          {g.prefix}
                        </span>
                        <span className="flex-shrink-0 tabular-nums text-data text-vc-tertiary">
                          {g.urls.length} page{g.urls.length === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {hiddenPathCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllPaths(true)}
                      className="mt-2 text-data text-vc-tertiary hover:text-vc-primary"
                    >
                      and {hiddenPathCount} more path{hiddenPathCount === 1 ? "" : "s"}
                    </button>
                  )}
                </section>
              )}

              {automatable && (
                <section className="border-b border-vc-default px-6 py-5">
                  <h3 className="text-label font-semibold uppercase tracking-wider text-vc-label">
                    Apply fix
                  </h3>
                  <p className="mt-2 max-w-prose text-body leading-relaxed text-vc-secondary">
                    This is a mechanical edit (tags, not prose) - an AI-drafted apply flow is the
                    right shape for it, but that pipeline doesn't exist in this app yet. Use the
                    guidance below to fix it manually for now.
                  </p>
                </section>
              )}

              {(guidance || snippet) && (
                <section className="border-b border-vc-default px-6 py-5">
                  <h3 className="text-label font-semibold uppercase tracking-wider text-vc-label">
                    How to fix
                  </h3>
                  {guidance && (
                    <ol className="mt-3 space-y-2">
                      {guidance.map((step, i) => (
                        <li key={i} className="flex gap-3 text-body text-vc-secondary">
                          <span className="w-4 flex-shrink-0 pt-px text-right font-mono text-data tabular-nums text-vc-tertiary">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}
                  {snippet && <CodeBlock snippet={snippet} />}
                </section>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-2 border-t border-vc-default bg-vc-surface px-6 py-3">
              <button
                type="button"
                onClick={() => copyForTicket(finding)}
                className="rounded px-1 py-0.5 text-data text-vc-tertiary transition-colors hover:text-vc-primary"
              >
                Copy for a ticket
              </button>
              <a
                href={sendToDevHref(finding)}
                className="rounded px-1 py-0.5 text-data text-vc-tertiary transition-colors hover:text-vc-primary"
              >
                Send to dev
              </a>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus.mutate("in_progress")}
                className="rounded px-1 py-0.5 text-data text-vc-tertiary transition-colors hover:text-vc-primary disabled:opacity-50"
              >
                Mark in progress
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus.mutate("ignored")}
                className="rounded px-1 py-0.5 text-data text-vc-tertiary transition-colors hover:text-vc-primary disabled:opacity-50"
              >
                Ignore
              </button>
              <div className="ml-auto flex items-center gap-2">
                {currentStatus && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => clearStatus.mutate()}
                    className="h-8 rounded border border-vc-default px-2.5 text-caption font-medium text-vc-secondary transition-colors hover:bg-vc-muted/50 disabled:opacity-50"
                  >
                    Reset
                  </button>
                )}
                {automatable ? (
                  <button
                    type="button"
                    disabled
                    title="Apply-fix pipeline not built yet"
                    className="flex h-8 cursor-not-allowed items-center rounded bg-vc-muted px-3 text-caption font-medium text-vc-tertiary"
                  >
                    Apply (coming soon)
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending || currentStatus === "fixed"}
                    onClick={() => setStatus.mutate("fixed")}
                    className="flex h-8 items-center rounded bg-vc-accent-subtle px-3 text-caption font-medium text-vc-accent transition-colors hover:bg-vc-accent hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {currentStatus === "fixed" ? "Marked fixed" : "Mark fixed"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
