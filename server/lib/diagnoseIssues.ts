// server/lib/diagnoseIssues.ts
//
// Aggregates issue rows for one brand by querying source surfaces in parallel.
// Mirrors how /act Production aggregates 4 source tables. Honest by construction:
// zero counts stay zero (no fabricated rows).
//
// Source tables today (Task 20):
//   - brand_hallucinations  → IssueType "hallucination"
//   - listicles             → IssueType "listicle_gap" (rows where isIncluded === 0)
//   - wikipedia_mentions    → IssueType "wikipedia_gap" (rows where isActive === 0)
//   - geo_signal_runs       → IssueType "weak_signal" (latest run per article, score < 60)
//   - articles              → IssueType "stale_article" (published & updatedAt > 90d ago)
//
// crawler_block and missing_schema are intentionally NOT aggregated here —
// they need new persistence tables landing in E.6.5. Their stats stay zero
// and the canvas degrades gracefully.

import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { storage } from "../storage";
import { geoSignalRuns, articles } from "@shared/schema";
import type { Issue, IssueStats, IssueSeverity, IssueStatus } from "@shared/diagnoseTypes";

const WEAK_SIGNAL_THRESHOLD = 60;
const STALE_ARTICLE_DAYS = 90;
const STALE_ARTICLE_MS = STALE_ARTICLE_DAYS * 24 * 60 * 60 * 1000;

function toIsoString(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function isoToMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function normalizeSeverity(raw: unknown): IssueSeverity {
  if (raw === "critical" || raw === "high" || raw === "medium" || raw === "low") return raw;
  return "medium";
}

function hallucinationStatus(row: {
  isResolved?: number | null;
  remediationStatus?: string | null;
}): IssueStatus {
  if (row.isResolved === 1) return "resolved";
  if (row.remediationStatus === "in_progress" || row.remediationStatus === "verified")
    return "in_progress";
  return "open";
}

export async function getDiagnoseIssues(brandId: string): Promise<{
  stats: IssueStats;
  items: Issue[];
}> {
  // Issue everything in parallel. storage methods used here are read-only and
  // already brand-scoped; the two not on `storage` (geoSignalRuns,
  // brand-scoped articles) go straight through drizzle — we are NOT adding
  // new storage methods in this task per the plan.
  const [hallucinationRows, listicleRows, wikipediaRows, signalRows, articleRows] =
    await Promise.all([
      storage.getBrandHallucinations(brandId),
      storage.getListicles(brandId),
      storage.getWikipediaMentions(brandId),
      db
        .select()
        .from(geoSignalRuns)
        .where(eq(geoSignalRuns.brandId, brandId))
        .orderBy(desc(geoSignalRuns.ranAt)),
      db.select().from(articles).where(eq(articles.brandId, brandId)),
    ]);

  const items: Issue[] = [];

  // ---------- Hallucinations ----------
  // Only surface unresolved rows in the queue. Resolved ones still exist in
  // the source table but shouldn't appear as actionable issues.
  for (const h of hallucinationRows) {
    if (h.isResolved === 1) continue;
    const detectedIso = toIsoString(h.detectedAt);
    const claim = h.claimedStatement ?? "";
    items.push({
      id: `hallucination:${h.id}`,
      type: "hallucination",
      severity: normalizeSeverity(h.severity),
      status: hallucinationStatus(h),
      title: claim ? `Hallucination: ${claim.slice(0, 80)}` : "Hallucination detected",
      subtitle: detectedIso ? `Detected ${new Date(detectedIso).toLocaleDateString()}` : "Detected",
      age: detectedIso,
      ctaLabel: "Draft correction",
      inspectorKey: "hallucination",
      metadata: { hallucinationId: h.id, hallucination: h },
    });
  }

  // ---------- Listicle gaps ----------
  // The "gap" is: brand is NOT included in a listicle we discovered.
  for (const l of listicleRows) {
    if (l.isIncluded === 1) continue;
    const createdIso = toIsoString(l.createdAt);
    items.push({
      id: `listicle_gap:${l.id}`,
      type: "listicle_gap",
      // Heuristic: higher search volume = higher severity (more eyeballs missed).
      severity: (l.searchVolume ?? 0) >= 1000 ? "high" : "medium",
      status: "open",
      title: `Missed citation: ${l.title}`,
      subtitle: l.sourcePublication ?? l.url ?? "",
      age: createdIso,
      ctaLabel: "Open outreach",
      inspectorKey: "listicle_gap",
      metadata: { listicleId: l.id },
    });
  }

  // ---------- Wikipedia gaps ----------
  // Treat isActive=0 (mention dropped) as the gap signal. We don't yet have a
  // dedicated "flaggedAsGap" column — when E.6.5 adds one we'll switch.
  for (const w of wikipediaRows) {
    if (w.isActive === 1) continue;
    const createdIso = toIsoString(w.createdAt);
    items.push({
      id: `wikipedia_gap:${w.id}`,
      type: "wikipedia_gap",
      severity: "medium",
      status: "open",
      title: `Wikipedia gap: ${w.pageTitle}`,
      subtitle: w.mentionContext ?? w.pageUrl ?? "",
      age: createdIso,
      ctaLabel: "Open draft helper",
      inspectorKey: "wikipedia_gap",
      metadata: { mentionId: w.id },
    });
  }

  // ---------- Weak GEO signals ----------
  // signalRows is already ordered desc by ranAt — first hit per articleId wins.
  const latestPerArticle = new Map<string, (typeof signalRows)[number]>();
  for (const r of signalRows) {
    if (!r.articleId) continue;
    if (!latestPerArticle.has(r.articleId)) latestPerArticle.set(r.articleId, r);
  }
  for (const r of Array.from(latestPerArticle.values())) {
    const score = r.overallScore ?? 100;
    if (score >= WEAK_SIGNAL_THRESHOLD) continue;
    const ranIso = toIsoString(r.ranAt);
    items.push({
      id: `weak_signal:${r.id}`,
      type: "weak_signal",
      severity: score < 30 ? "high" : "medium",
      status: "open",
      title: `Weak GEO signal on article — ${score}/100`,
      subtitle: r.articleId ? `articleId ${r.articleId}` : "",
      age: ranIso,
      ctaLabel: "Review signals",
      inspectorKey: "weak_signal",
      metadata: { signalRunId: r.id, articleId: r.articleId },
    });
  }

  // ---------- Stale articles ----------
  const cutoff = Date.now() - STALE_ARTICLE_MS;
  for (const a of articleRows) {
    if (a.status !== "ready") continue; // "ready" is this codebase's published-equivalent (see schema)
    const updatedMs = isoToMs(a.updatedAt);
    if (updatedMs <= 0 || updatedMs >= cutoff) continue;
    const ageDays = Math.floor((Date.now() - updatedMs) / (1000 * 60 * 60 * 24));
    items.push({
      id: `stale_article:${a.id}`,
      type: "stale_article",
      severity: "low",
      status: "open",
      title: `Stale: ${a.title ?? "(untitled)"}`,
      subtitle: `Last updated ${ageDays} days ago`,
      age: toIsoString(a.updatedAt),
      ctaLabel: "Open in editor",
      ctaHref: `/content/${a.id}`,
      metadata: { articleId: a.id },
    });
  }

  // crawler_block and missing_schema deferred to E.6.5 — they need new tables.
  // Until then, zero rows; the canvas degrades gracefully.

  const severityRank: Record<IssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  items.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity];
    if (s !== 0) return s;
    return (b.age || "").localeCompare(a.age || "");
  });

  const stats: IssueStats = {
    hallucination: items.filter((i) => i.type === "hallucination").length,
    listicle_gap: items.filter((i) => i.type === "listicle_gap").length,
    wikipedia_gap: items.filter((i) => i.type === "wikipedia_gap").length,
    crawler_block: 0,
    weak_signal: items.filter((i) => i.type === "weak_signal").length,
    missing_schema: 0,
    stale_article: items.filter((i) => i.type === "stale_article").length,
  };

  return { stats, items };
}
