import {
  eq,
  and,
  desc,
  asc,
  sql,
  gte,
  gt,
  lt,
  or,
  isNull,
  inArray,
  getTableColumns,
} from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";
import {
  type ClaimedContentGenerationJob,
  type CompletedContentJob,
  type CompletedContentJobCost,
  type ContentJobTerminalUpdate,
  type FailedContentJob,
} from "./storage";
import { enqueueContentCostCommand } from "./outbox/contentCostOutboxAdapter";
import {
  type User,
  type InsertUser,
  type Citation,
  type InsertCitation,
  type Article,
  type InsertArticle,
  type Distribution,
  type InsertDistribution,
  type GeoRanking,
  type InsertGeoRanking,
  type GeoSignalRun,
  type InsertGeoSignalRun,
  type ContentGenerationJob,
  type InsertContentGenerationJob,
  type Brand,
  type InsertBrand,
  type BetaInviteCode,
  type InsertBetaInviteCode,
  type BrandVisibilitySnapshot,
  type InsertBrandVisibilitySnapshot,
  type Listicle,
  type InsertListicle,
  type WikipediaMention,
  type InsertWikipediaMention,
  type BofuContent,
  type InsertBofuContent,
  type FaqItem,
  type InsertFaqItem,
  type BrandMention,
  type InsertBrandMention,
  type TrackedContentUrl,
  type InsertTrackedContentUrl,
  type CitationQuality,
  type InsertCitationQuality,
  type BrandHallucination,
  type InsertBrandHallucination,
  type BrandFactSheet,
  type InsertBrandFactSheet,
  type BrandFactScrapeRun,
  type InsertBrandFactScrapeRun,
  type BrandFactScrapePage,
  type InsertBrandFactScrapePage,
  type BrandMonthlyCostCap,
  type AgentTask,
  type InsertAgentTask,
  type KeywordResearch,
  type InsertKeywordResearch,
  type CitationRun,
  type InsertCitationRun,
  type ArticleRevision,
  type InsertArticleRevision,
  type ScanJob,
} from "@shared/schema";

export { applyTourStateOp } from "./lib/tourStateOps";

const CONTENT_JOB_LEASE_SECONDS = 90;

export class DatabaseStorage {
  // List DAOs accept optional pagination. Internal callers
  // that need every row (analytics rollups, scheduled jobs) omit opts
  // and get the legacy "all rows" behavior. HTTP routes pass through
  // parsePagination() so unbounded responses can't escape.
  // Every brand reader filters out soft-deleted rows so the
  // UI doesn't see brands that are inside their 30-day grace window.
  // The cron-driven hard-delete (runBrandPurgeJob) eventually removes
  // them; until then they stay in the DB but invisible to the API.
  // Optimistic-lock variant of updateBrand. The caller passes the
  // version they last read; the UPDATE only matches when nobody has
  // written in between. Returns undefined when 0 rows matched - caller
  // must distinguish "not found" from "version conflict" by re-fetching.
  // Atomically change autopilot_status from 'failed' to 'pending'. The
  // WHERE clause is what guarantees race safety - two simultaneous
  // retries both reach the UPDATE, but only one row will match the
  // "still failed" predicate; the other returns 0 rows. Caller maps
  // false → 409. Also clears autopilotError so the stale failure
  // message doesn't bleed into the new run.
  // Schedule a brand for deletion in 30 days. Return the
  // updated row or undefined if the brand wasn't found / already
  // soft-deleted. Idempotent: re-scheduling preserves the original
  // grace window so a double-click doesn't extend the timer.
  // SQL scoping by brand owner makes LIMIT mean
  // "100 of your articles" instead of "100 globally then filter to yours".
  // Joins through brands so soft-deleted brands' articles are excluded.
  // Optimistic-lock variant of updateArticle.
  /** Phase 6 - Pulse cross-feature. Returns the latest Signals run's
   *  ranAt AND its overallScore so the recommendations engine can fire
   *  a DIFFERENT rec for a low-scoring scan ("Your last scan returned
   *  35% - content depth is below threshold") vs just a stale-scan
   *  rec ("Last scan was N days ago"). Previously the engine only had
   *  ranAt and treated every scan equally regardless of result. */
  // The async kickoff path uses this single-row read. The HTTP handler
  // creates the row, hands the runId to a detached `runBrandPrompts(...)`,
  // and returns immediately; runBrandPrompts uses this to load it back.
  // Recompute totals and a per-platform breakdown for a run by
  // reading geo_rankings live. The canonical aggregator - call this any
  // time is_cited mutates on a ranking (re-detect, future bulk fixes)
  // so the cached aggregate on citation_runs stays in sync with what the
  // drill-down would show. Cheaper than dragging it through application
  // code: one indexed read of the run's rankings.
  // The live-update polling hook uses this lightweight "is any run live for this brand" check.
  // live-update polling hook on every dependent page. Hits the partial
  // index on (brand_id, status) - should be O(1) regardless of run history.
  // Atomic progress bump. The worker calls this every Nth completed task
  // so the SSE handler + status-gate endpoint see live values without a
  // full updateCitationRun round-trip.
  // Single read of one run's live state for the SSE handler's tick loop.
  // Returns rankings written for this run since the cursor (a timestamp).
  // Used by the SSE handler to emit per-ranking events without re-sending
  // already-emitted rows. Ordered by checkedAt so the cursor advances
  // monotonically.
  // Atomic claim: pick the oldest pending job and flip it to running in one
  // UPDATE so two worker ticks can't grab the same job. Returns undefined if
  // nothing is pending.
  /** Legacy completion path for callers that do not have provider usage data. */
  // Crash recovery - flip `running` jobs older than N minutes back to
  // `failed`. Called once on server boot so we don't have orphaned rows.
  // Also classify the failure as 'timeout', which the refund
  // helper considers refundable) and returns the affected jobs so the
  // caller can issue refunds + flip the linked article back to draft.
  // Case-insensitive append. Returns true if the variation was added,
  // false if it already existed (or the brand doesn't exist). The dedup
  // runs client-side because Postgres array-contains is case-sensitive.
  // ============================================================================
  // ── Unified article methods ───────────────────────────────────────────────
  // ─── Mentions rebuild (Task 7) ────────────────────────────────────────────
  // Source health ------------------------------------------------------------
  // Sentiment cache ----------------------------------------------------------
  // Daily sentiment cap counter ----------------------------------------------
  // Brand mention monitoring -------------------------------------------------
  // ── system_state ──────────────────────────────────────────────────────
}
