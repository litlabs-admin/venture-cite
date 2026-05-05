import { storage } from "../storage";
import { logger } from "./logger";
import { captureAndFlush } from "./sentryReport";
import { buildScanQueries } from "./mentionQueryBuilder";
import { canonicalizeMentionUrl, type MentionPlatform } from "./canonicalUrl";
import { judgeSentimentBatch, type SentimentInput } from "./sentimentBatcher";
import { shouldSkipSource, recordSourceSuccess, recordSourceFailure } from "./sourceHealth";
import { scanRedditSource } from "./sources/redditSource";
import { scanHackerNewsSource } from "./sources/hackerNewsSource";

const DAILY_SENTIMENT_CAP = 200;

export type SourceReport = {
  found: number;
  inserted: number;
  duplicates: number;
  failed: boolean;
  reason?: string;
};

export type ScanReport = {
  perSource: {
    reddit: SourceReport;
    hackernews: SourceReport;
  };
  totals: {
    found: number;
    inserted: number;
    duplicates: number;
    failedSources: number;
  };
};

function emptySourceReport(): SourceReport {
  return { found: 0, inserted: 0, duplicates: 0, failed: false };
}

export async function scanBrandMentions(brandId: string, scanId?: string): Promise<ScanReport> {
  const brand = await storage.getBrandById(brandId);
  if (!brand) throw new Error("brand_not_found");

  const queries = buildScanQueries({
    name: brand.name,
    nameVariations: brand.nameVariations as string[] | null,
  });
  const variations = queries.variations;

  const report: ScanReport = {
    perSource: {
      reddit: emptySourceReport(),
      hackernews: emptySourceReport(),
    },
    totals: { found: 0, inserted: 0, duplicates: 0, failedSources: 0 },
  };

  if (variations.length === 0) {
    logger.info({ brandId, scanId }, "scan.skipped.no_variations");
    return report;
  }

  // Accumulates all successfully-fetched mentions for the sentiment + insert phase.
  const allMentions: Array<{ platform: MentionPlatform; data: Record<string, unknown> }> = [];

  // ── Reddit ─────────────────────────────────────────────────────────────────
  const redditSkip = await shouldSkipSource(brandId, "reddit");
  if (redditSkip.skip) {
    report.perSource.reddit = {
      found: 0,
      inserted: 0,
      duplicates: 0,
      failed: true,
      reason: redditSkip.reason ?? "paused",
    };
  } else if (queries.reddit) {
    const lastReddit = await storage.getSourceHealth(brandId, "reddit");
    const sinceReddit = lastReddit?.lastSuccessfulScanAt
      ? Math.floor(lastReddit.lastSuccessfulScanAt.getTime() / 1000)
      : undefined;
    const redditResult = await scanRedditSource({
      query: queries.reddit,
      variations,
      brandId,
      sinceUnix: sinceReddit,
    });
    if (redditResult.failed) {
      report.perSource.reddit = {
        found: 0,
        inserted: 0,
        duplicates: 0,
        failed: true,
        reason: redditResult.failed,
      };
      await recordSourceFailure(brandId, "reddit", redditResult.failed);
    } else {
      report.perSource.reddit.found = redditResult.mentions.length;
      for (const m of redditResult.mentions) {
        allMentions.push({ platform: "reddit", data: m as unknown as Record<string, unknown> });
      }
      await recordSourceSuccess(brandId, "reddit");
    }
  }

  // ── Hacker News ────────────────────────────────────────────────────────────
  const hnSkip = await shouldSkipSource(brandId, "hackernews");
  if (hnSkip.skip) {
    report.perSource.hackernews = {
      found: 0,
      inserted: 0,
      duplicates: 0,
      failed: true,
      reason: hnSkip.reason ?? "paused",
    };
  } else if (queries.hackernews) {
    const lastHn = await storage.getSourceHealth(brandId, "hackernews");
    const sinceHn = lastHn?.lastSuccessfulScanAt
      ? Math.floor(lastHn.lastSuccessfulScanAt.getTime() / 1000)
      : undefined;
    const hnResult = await scanHackerNewsSource({
      query: queries.hackernews,
      variations,
      brandId,
      sinceUnix: sinceHn,
    });
    if (hnResult.failed) {
      report.perSource.hackernews = {
        found: 0,
        inserted: 0,
        duplicates: 0,
        failed: true,
        reason: hnResult.failed,
      };
      await recordSourceFailure(brandId, "hackernews", hnResult.failed);
    } else {
      report.perSource.hackernews.found = hnResult.mentions.length;
      for (const m of hnResult.mentions) {
        allMentions.push({ platform: "hackernews", data: m as unknown as Record<string, unknown> });
      }
      await recordSourceSuccess(brandId, "hackernews");
    }
  }

  // ── Sentiment + insert phase ───────────────────────────────────────────────
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const usedToday = await storage.countSentimentCallsForBrandSince(brandId, today);
  const remainingBudget = Math.max(0, DAILY_SENTIMENT_CAP - usedToday);

  const sentimentInputs: SentimentInput[] = allMentions.map((m, i) => ({
    key: String(i),
    text:
      (m.data.mentionContext as string | undefined) ||
      (m.data.sourceTitle as string | undefined) ||
      "",
  }));

  const verdicts = await judgeSentimentBatch(brand.name, sentimentInputs, {
    remainingBudget,
  });

  for (let i = 0; i < allMentions.length; i++) {
    const { platform, data } = allMentions[i];
    const verdict = verdicts[String(i)];
    const canonical = canonicalizeMentionUrl(platform, data.sourceUrl as string);

    try {
      const inserted = await storage.tryInsertBrandMention({
        brandId,
        platform,
        sourceUrl: canonical,
        sourceTitle: ((data.sourceTitle as string | undefined) ?? "").slice(0, 500) || null,
        mentionContext: ((data.mentionContext as string | undefined) ?? "").slice(0, 2000) || null,
        sentiment: verdict.sentiment,
        sentimentScore: verdict.sentimentScore.toFixed(2),
        sentimentSource: verdict.source,
        authorUsername: (data.authorUsername as string | undefined)?.slice(0, 120) ?? null,
        mentionedAt: (data.mentionedAt as Date | undefined) ?? null,
        mentionLocation: (data.mentionLocation as string | undefined) ?? "post",
        matchedVariation: (data.matchedVariation as string | undefined) ?? null,
        matchedField: (data.matchedField as string | undefined) ?? null,
        source: "scanner",
        scannerVersion: 2,
        linkStatus: "unknown",
      } as Parameters<typeof storage.tryInsertBrandMention>[0]);

      const sourceReport = report.perSource[platform];
      if (inserted) {
        sourceReport.inserted += 1;
      } else {
        sourceReport.duplicates += 1;
      }
    } catch (err) {
      captureAndFlush(err, {
        tags: { source: "mention-scanner-insert" },
        extra: { brandId, scanId },
      });
    }
  }

  // ── Aggregate totals ───────────────────────────────────────────────────────
  for (const k of ["reddit", "hackernews"] as const) {
    const r = report.perSource[k];
    report.totals.found += r.found;
    report.totals.inserted += r.inserted;
    report.totals.duplicates += r.duplicates;
    if (r.failed) report.totals.failedSources += 1;
  }

  logger.info(
    { brandId, scanId, totals: report.totals, perSource: report.perSource },
    "scan.complete",
  );

  return report;
}
