// Mention routes moved to server/routes/mentions.ts (mentions rebuild)
//
// REST surface (single canonical owner of all /api/brand-mentions/* paths):
//   GET    /api/brand-mentions/:brandId              cursor-paginated list + stats
//   POST   /api/brand-mentions                       manual-add with SSRF + brand-gate + sentiment
//   PATCH  /api/brand-mentions/:id                   status update with transition validation
//   DELETE /api/brand-mentions/:id                   hard delete; returns row for undo
//   POST   /api/brand-mentions/bulk-delete           { ids: string[] } max 100
//   POST   /api/brand-mentions/delete-all/:brandId   { brandName } typed-confirm gate
//   POST   /api/brand-mentions/scans/:brandId        idempotent scan-start; 4h manual cooldown
//   GET    /api/brand-mentions/scans/active          active scans for current user
//   GET    /api/brand-mentions/scans/:scanId         status poll; 404 cross-tenant
//   PATCH  /api/brand-mentions/brands/:brandId/monitor-mentions  toggle daily auto-scan
//
// All endpoints: isAuthenticated + ownership scoping. 404 on cross-tenant (anti-enumeration).
// Fixes audit issues: C3 (transition validation), C5/G1 (URL scheme), C13/C14 (ownership), A17 (idempotency).

import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireBrand, requireMentionOwnership } from "../lib/ownership";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { safeFetchText } from "../lib/ssrf";
import { passesBrandPresenceGate } from "../lib/brandPresenceGate";
import { canonicalizeMentionUrl } from "../lib/canonicalUrl";
import { judgeSentimentBatch } from "../lib/sentimentBatcher";
import { runMentionScan } from "../lib/runMentionScan";
import { acquireOrWait } from "../lib/rateLimitBuckets";

export const mentionsRouter = Router();

// ---------------------------------------------------------------------------
// Server-anchored age helpers.
//
// Why: clock skew between the DB host, the Node process, and the client browser
// can each be many minutes (or hours, when timezones are misconfigured). The
// only stable thing is "how long ago did THIS server perceive this event?".
//
// On every response that includes a timestamp the user will see as relative
// time ("about 6 hours ago"), we attach `ageSeconds` computed against
// `Date.now()` on the request handler. The client renders the relative label
// from `ageSeconds` directly — no `new Date()` anchoring needed on the client.
//
// We also include the ISO string for absolute-date displays (detail sheet).
// ---------------------------------------------------------------------------
const ageSeconds = (ts: Date | string | null | undefined): number | null => {
  if (!ts) return null;
  const t = typeof ts === "string" ? new Date(ts) : ts;
  const ms = Date.now() - t.getTime();
  return Math.max(0, Math.floor(ms / 1000));
};

const withAge = <T extends Record<string, unknown>>(
  row: T,
  fields: readonly (keyof T)[],
): T & Record<string, unknown> => {
  const out: Record<string, unknown> = { ...row };
  for (const field of fields) {
    const v = row[field];
    if (v != null) {
      out[`${String(field)}AgeSeconds`] = ageSeconds(v as Date | string);
    }
  }
  return out as T & Record<string, unknown>;
};

// --- Schemas ---
const PLATFORMS = ["reddit", "hackernews", "quora"] as const;
const STATUSES = ["new", "acknowledged", "replied", "false_positive", "ignored"] as const;
type Platform = (typeof PLATFORMS)[number];
type Status = (typeof STATUSES)[number];

const PLATFORM_HOSTS: Record<Platform, RegExp> = {
  reddit: /^([a-z0-9-]+\.)?reddit\.com$|^redd\.it$/i,
  hackernews: /^news\.ycombinator\.com$/i,
  quora: /^([a-z0-9-]+\.)?quora\.com$/i,
};

const ManualAddSchema = z.object({
  brandId: z.string().uuid(),
  platform: z.enum(PLATFORMS),
  sourceUrl: z
    .string()
    .url()
    .refine((s) => /^https?:\/\//i.test(s), "must be http(s)"),
});

const StatusPatchSchema = z.object({ status: z.enum(STATUSES) });

// Allowed status transitions (spec §3.10 / Q14).
// Terminal states: replied, false_positive, ignored (no way out).
const ALLOWED_TRANSITIONS: Record<Status, readonly Status[]> = {
  new: ["acknowledged", "replied", "false_positive", "ignored"],
  acknowledged: ["replied", "false_positive", "ignored"],
  replied: [],
  false_positive: [],
  ignored: [],
};

// ============================================================
// LIST — cursor-paginated mentions for a brand
// MUST be registered before /:id to avoid route conflicts.
// ============================================================
mentionsRouter.get("/alerts/:brandId", isAuthenticated, async (req, res) => {
  // Legacy alerts endpoint — now ownership-gated (audit C14 fix).
  const { brandId } = req.params;
  const userId = (req as any).user!.id as string;
  let owned: any;
  try {
    owned = await requireBrand(brandId, userId);
  } catch {
    owned = null;
  }
  if (!owned) return res.status(404).json({ error: "not_found" });
  // Delegate to list for now; the legacy alerts shape is not used by the new UI.
  const result = await storage.listMentionsForBrand(brandId, { limit: 10, sort: "newest" });
  res.json({ data: result.rows });
});

// Active scans list — MUST be registered BEFORE /scans/:scanId to avoid route conflict.
mentionsRouter.get("/scans/active", isAuthenticated, async (req, res) => {
  const userId = (req as any).user!.id as string;
  const rows = await storage.getActiveScanJobsForUser(userId);
  const enriched = rows.map((r) => withAge(r as any, ["startedAt", "completedAt", "createdAt"]));
  res.json({ rows: enriched });
});

// Last completed scan for a brand — MUST be before /scans/:scanId to avoid conflict.
mentionsRouter.get("/scans/last/:brandId", isAuthenticated, async (req, res) => {
  const userId = (req as any).user!.id as string;
  const owned = await requireBrand(req.params.brandId, userId).catch(() => null);
  if (!owned) return res.status(404).json({ error: "not_found" });
  const last = await storage.getLastCompletedScanForBrand(req.params.brandId);
  const enriched = last ? withAge(last as any, ["startedAt", "completedAt", "createdAt"]) : null;
  res.json({ data: enriched });
});

// ============================================================
// LIST mentions
// ============================================================
mentionsRouter.get("/:brandId", isAuthenticated, async (req, res) => {
  const { brandId } = req.params;
  const userId = (req as any).user!.id as string;
  let owned: any;
  try {
    owned = await requireBrand(brandId, userId);
  } catch {
    owned = null;
  }
  if (!owned) return res.status(404).json({ error: "not_found" });

  let cursor: { discoveredAt: Date; id: string } | undefined;
  if (req.query.cursor) {
    try {
      const raw = JSON.parse(Buffer.from(req.query.cursor as string, "base64url").toString("utf8"));
      cursor = { discoveredAt: new Date(raw.discoveredAt), id: raw.id };
    } catch {
      return res.status(400).json({ error: "invalid_cursor" });
    }
  }

  const result = await storage.listMentionsForBrand(brandId, {
    cursor,
    limit: Math.min(100, Number(req.query.limit) || 50),
    status: req.query.status as string | undefined,
    platform: req.query.platform as string | undefined,
    sentiment: req.query.sentiment as string | undefined,
    from: req.query.from ? new Date(req.query.from as string) : undefined,
    to: req.query.to ? new Date(req.query.to as string) : undefined,
    q: req.query.q as string | undefined,
    sort: (req.query.sort as "newest" | "oldest" | "engagement") ?? "newest",
  });

  const stats = await storage.getMentionStatsForBrand(brandId);

  const nextCursor = result.nextCursor
    ? Buffer.from(JSON.stringify(result.nextCursor)).toString("base64url")
    : null;

  const rows = result.rows.map((r) =>
    withAge(r as any, ["discoveredAt", "mentionedAt", "lastVerifiedAt"]),
  );

  res.json({ rows, nextCursor, stats });
});

// ============================================================
// MANUAL ADD
// ============================================================
mentionsRouter.post("/", isAuthenticated, async (req, res) => {
  const parsed = ManualAddSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.issues });
  }
  const { brandId, platform, sourceUrl } = parsed.data;

  const userId = (req as any).user!.id as string;
  let owned: any;
  try {
    owned = await requireBrand(brandId, userId);
  } catch {
    owned = null;
  }
  if (!owned) return res.status(404).json({ error: "not_found" });

  // Platform host whitelist — sourceUrl is already validated as http(s) by Zod
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return res.status(400).json({ error: "invalid_url" });
  }
  if (!PLATFORM_HOSTS[platform].test(parsedUrl.hostname)) {
    return res
      .status(400)
      .json({ error: "url_host_mismatch", message: "URL must be from the selected platform." });
  }

  // Per-user manual rate limit (10/min) via shared rateLimitBuckets infrastructure.
  // timeout=0 → fail-fast (no waiting).
  const ok = await acquireOrWait("manual-add", userId, 0);
  if (!ok) {
    return res
      .status(429)
      .json({
        error: "rate_limited",
        message: "Manual add limit reached (10/min). Try again shortly.",
      });
  }

  // SSRF-safe fetch
  let fetched: { status: number; text: string; contentType: string };
  try {
    fetched = await safeFetchText(sourceUrl, { timeoutMs: 15_000, maxBytes: 2_000_000 });
  } catch (err) {
    logger.warn({ err, sourceUrl }, "mention.manual_add.fetch_failed");
    return res.status(400).json({ error: "fetch_failed", message: "Could not fetch the URL." });
  }

  if (fetched.status < 200 || fetched.status >= 300) {
    return res
      .status(400)
      .json({ error: "fetch_failed", message: `URL returned HTTP ${fetched.status}.` });
  }

  // Brand-presence gate
  const brand = await storage.getBrandById(brandId);
  if (!brand) return res.status(404).json({ error: "not_found" });

  const variations = [
    brand.name,
    ...(Array.isArray((brand as any).nameVariations) ? (brand as any).nameVariations : []),
  ].filter(Boolean) as string[];

  const gate = passesBrandPresenceGate({ selftext: fetched.text }, variations);
  if (!gate.matched) {
    return res.status(400).json({
      error: "brand_not_found_in_content",
      message:
        "We couldn't find your brand name on this page. Check the URL or update your brand variations.",
    });
  }

  // Sentiment
  const verdicts = await judgeSentimentBatch(brand.name, [
    { key: "x", text: fetched.text.slice(0, 2000) },
  ]);
  const v = verdicts["x"];

  // Canonical URL
  const canonical = canonicalizeMentionUrl(platform, sourceUrl);

  // Insert (idempotent — returns null on dedup conflict)
  const inserted = await storage.tryInsertBrandMention({
    brandId,
    platform,
    sourceUrl: canonical,
    sourceTitle: fetched.text.slice(0, 200),
    mentionContext: fetched.text.slice(0, 2000),
    sentiment: v.sentiment,
    sentimentScore: String(v.sentimentScore.toFixed(2)),
    sentimentSource: v.source,
    matchedVariation: gate.matched ? (gate as any).matchedVariation : null,
    matchedField: gate.matched ? (gate as any).matchedField : null,
    source: "manual",
    scannerVersion: 2,
    linkStatus: "unknown",
  } as any);

  if (!inserted) {
    return res.status(409).json({ error: "already_exists" });
  }

  logger.info({ id: inserted.id, brandId, userId }, "mention.manual_add.success");
  res.status(201).json({ data: inserted });
});

// ============================================================
// PATCH STATUS
// ============================================================
mentionsRouter.patch("/:id", isAuthenticated, async (req, res) => {
  const parsed = StatusPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.issues });
  }

  const userId = (req as any).user!.id as string;
  const owned = await requireMentionOwnership(req.params.id, userId);
  if (!owned) return res.status(404).json({ error: "not_found" });

  const current = ((owned as any).status ?? "new") as Status;
  const next = parsed.data.status;

  if (current === next) {
    return res.json({ data: owned });
  }

  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return res.status(409).json({ error: "invalid_transition", from: current, to: next });
  }

  await storage.updateBrandMentionStatus(req.params.id, next);
  logger.info({ id: req.params.id, from: current, to: next, userId }, "mention.status.changed");
  res.json({ ok: true });
});

// ============================================================
// DELETE
// ============================================================
mentionsRouter.delete("/:id", isAuthenticated, async (req, res) => {
  const userId = (req as any).user!.id as string;
  const owned = await requireMentionOwnership(req.params.id, userId);
  if (!owned) return res.status(404).json({ error: "not_found" });

  await storage.deleteBrandMention(req.params.id);
  logger.info({ id: req.params.id, userId }, "mention.deleted");
  res.json({ data: owned }); // returned for client-side undo
});

// ============================================================
// BULK DELETE
// ============================================================
mentionsRouter.post("/bulk-delete", isAuthenticated, async (req, res) => {
  const parseResult = z.object({ ids: z.array(z.string().uuid()).max(100) }).safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "invalid_body", details: parseResult.error.issues });
  }
  const { ids } = parseResult.data;
  const userId = (req as any).user!.id as string;

  // Filter to only owned mentions
  const owned = await storage.getOwnedMentionIds(ids, userId);
  await storage.deleteManyBrandMentions(owned);
  logger.info({ count: owned.length, userId }, "mention.bulk_deleted");
  res.json({ deleted: owned.length });
});

// ============================================================
// DELETE ALL FOR BRAND
// ============================================================
mentionsRouter.post("/delete-all/:brandId", isAuthenticated, async (req, res) => {
  const { brandId } = req.params;
  const userId = (req as any).user!.id as string;
  const owned = await requireBrand(brandId, userId).catch(() => null);
  if (!owned) return res.status(404).json({ error: "not_found" });

  if (req.body?.brandName !== owned.name) {
    return res.status(400).json({ error: "name_mismatch" });
  }

  const count = await storage.deleteAllMentionsForBrand(brandId);
  logger.info({ brandId, count, userId }, "mention.delete_all_for_brand");
  res.json({ deleted: count });
});

// ============================================================
// START SCAN
// ============================================================
mentionsRouter.post("/scans/:brandId", isAuthenticated, async (req, res) => {
  const { brandId } = req.params;
  const userId = (req as any).user!.id as string;
  const owned = await requireBrand(brandId, userId).catch(() => null);
  if (!owned) return res.status(404).json({ error: "not_found" });

  // Idempotency: existing active scan?
  const active = await storage.getActiveScanJobForBrand(brandId);
  if (active) {
    return res.json({ scanId: active.id, attached: true });
  }

  // Manual scan cooldown: disabled per user request. Re-enable by setting
  // COOLDOWN_MS > 0 (e.g. 4 * 60 * 60 * 1000 for 4 hours).
  const COOLDOWN_MS = 0;
  if (COOLDOWN_MS > 0) {
    const last = await storage.getMostRecentManualScanForBrand(brandId);
    if (last?.completedAt) {
      const since = Date.now() - last.completedAt.getTime();
      if (since < COOLDOWN_MS) {
        return res.status(429).json({
          error: "cooldown",
          nextAvailableAt: new Date(last.completedAt.getTime() + COOLDOWN_MS),
        });
      }
    }
  }

  const job = await storage.createScanJob({ brandId, userId, trigger: "manual" });

  // Detach the actual work. waitUntil if available (Vercel), else setImmediate.
  const ctx: (p: Promise<unknown>) => void =
    (res as any).waitUntil ?? ((p: Promise<unknown>) => setImmediate(() => p.catch(() => {})));
  ctx(
    runMentionScan(job.id).catch((err) => {
      captureAndFlush(err, {
        tags: { source: "mention-scan-detached" },
        extra: { scanId: job.id },
      });
    }),
  );

  res.status(202).json({ scanId: job.id });
});

// ============================================================
// SCAN STATUS
// ============================================================
mentionsRouter.get("/scans/:scanId", isAuthenticated, async (req, res) => {
  const userId = (req as any).user!.id as string;
  const job = await storage.getScanJob(req.params.scanId);
  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "not_found" });
  }
  res.json(job);
});

// ============================================================
// BRAND OPT-IN TOGGLE
// ============================================================
mentionsRouter.patch("/brands/:brandId/monitor-mentions", isAuthenticated, async (req, res) => {
  const { brandId } = req.params;
  const userId = (req as any).user!.id as string;
  const owned = await requireBrand(brandId, userId).catch(() => null);
  if (!owned) return res.status(404).json({ error: "not_found" });

  await storage.setBrandMonitorMentions(brandId, !!req.body?.enabled);
  res.json({ ok: true });
});
