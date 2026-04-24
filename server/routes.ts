import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import {
  insertBrandSchema,
  insertCompetitorSchema,
  insertCompetitorCitationSnapshotSchema,
  usageLimits,
} from "@shared/schema";
import {
  AI_PLATFORMS as SHARED_AI_PLATFORMS,
  CITATION_SCORING,
  ANALYTICS_WINDOWS,
  MS_PER_DAY,
} from "@shared/constants";
import { runBrandPrompts, DEFAULT_CITATION_PLATFORMS, checkForCitation } from "./citationChecker";
import { judgeCitation } from "./citationJudge";
import { attachAiLogger } from "./lib/aiLogger";
import { MODELS } from "./lib/modelConfig";
import { enqueueContentGenerationJob, type GenerationPayload } from "./contentGenerationWorker";
import { generateBrandPrompts } from "./lib/promptGenerator";
import { generateSuggestedPrompts } from "./lib/suggestionGenerator";
import { z } from "zod";
import OpenAI from "openai";
import {
  setupAuth,
  attachUserIfPresent,
  requireAuthForApi,
  enforceBrandOwnership,
  brandIdParamHandler,
  isAdmin,
} from "./auth";
import {
  requireUser,
  requireBrand,
  requireArticle,
  requireCompetitor,
  requireFaq,
  requireListicle,
  requireBofuContent,
  requireHallucination,
  requireBrandFact,
  requireBrandMention,
  requireAiSource,
  requirePromptTest,
  requireAgentTask,
  requireOutreachCampaign,
  requireAutomationRule,
  requirePublicationTarget,
  requireOutreachEmail,
  requireCommunityPost,
  requirePromptPortfolio,
  requireCitationQuality,
  requireKeywordResearch,
  requireAlertSetting,
  requireCitation,
  getUserBrandIds,
  pickFields,
  sendOwnershipError,
  OwnershipError,
} from "./lib/ownership";
import { safeFetchText } from "./lib/ssrf";
import { encryptToken, decryptToken } from "./lib/tokenCipher";
import { logAudit } from "./lib/audit";
import { logger } from "./lib/logger";
import { withArticleQuota, withBrandQuota, isUsageLimitError } from "./lib/usageLimit";
import type { Tier } from "./lib/llmPricing";
import { parsePagination } from "./lib/pagination";
import { setupUserAccountRoutes } from "./routes/userAccount";
import { setupUnsubscribeRoutes } from "./routes/unsubscribe";
import { setupOnboardingRoutes } from "./routes/onboarding";
import { setupLogoProxyRoutes } from "./routes/logoProxy";
import { setupBrandRoutes } from "./routes/brands";
import { setupBufferRoutes } from "./routes/buffer";
import { setupBillingRoutes } from "./routes/billing";
import { setupRevenueRoutes } from "./routes/revenue";

import { setupContentRoutes } from "./routes/content";
import { setupArticlesRoutes } from "./routes/articles";
import { setupPromptsRoutes } from "./routes/prompts";
import { setupPublicationsRoutes } from "./routes/publications";
import { setupAnalyticsRoutes } from "./routes/analytics";
import { setupDashboardRoutes } from "./routes/dashboard";
import { setupContentTypesRoutes } from "./routes/contentTypes";
import { setupIntelligenceRoutes } from "./routes/intelligence";
import { setupAgentRoutes } from "./routes/agent";
import { setupGeoSignalsRoutes } from "./routes/geoSignals";
import { setupCommunityRoutes } from "./routes/community";
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Upstream hangs block worker threads indefinitely without a timeout.
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

// Maximum accepted length for user-supplied content on AI endpoints. Caps
// worst-case OpenAI token consumption so a hostile request can't drain the
// bill on a single call. 40 KB ≈ ~10k tokens input which is already
// generous for article-scale analysis.
const MAX_CONTENT_LENGTH = 40_000;

// Rate limiter for AI generation endpoints: 10 requests per minute, keyed by
// authenticated user id when available (so shared IPs / proxies don't DoS
// each other) or by IP for unauthenticated callers.
const aiRateKey = (req: Request) => {
  const user = (req as any).user;
  if (user?.id) return `user:${user.id}`;
  return `ip:${req.ip ?? "unknown"}`;
};

const aiLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: aiRateKey,
  message: {
    success: false,
    error: "Too many requests. Please wait a moment before trying again.",
  },
});

// Shared error-response helper: prefers OwnershipError (401/404) when present,
// otherwise returns a generic 500 and logs the underlying error server-side.
// This keeps stack traces and internal messages out of production responses.
function sendError(res: Response, err: unknown, fallback: string, status = 500): void {
  if (sendOwnershipError(res, err)) return;
  const isProd = process.env.NODE_ENV === "production";
  const message = isProd ? fallback : err instanceof Error ? err.message : fallback;
  if (err) console.error("[routes]", fallback, err);
  res.status(status).json({ success: false, error: message });
}

// Try to extract a JSON object from a raw LLM response even when the model
// wraps it in markdown fences, prose, or trailing commentary. Returns null
// on any failure instead of throwing — callers decide the fallback shape.
function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // `trust proxy` is set in server/index.ts before any middleware so that
  // both the HTTPS redirect and rate-limit IP keys see the real client IP.

  // Populate req.user from Supabase JWT if a Bearer token is present.
  app.use(attachUserIfPresent);

  // Register /api/auth/* routes (Supabase Auth backed).
  // These must be registered before requireAuthForApi so they aren't gated.
  setupAuth(app);

  // Global guard: every /api/* route not in the PUBLIC_API_ROUTES allowlist
  // requires a valid Bearer token. Single source of truth for auth.
  app.use(requireAuthForApi);

  // GDPR self-service: account deletion + data export.
  setupUserAccountRoutes(app);

  // Email one-click unsubscribe (HMAC-token authenticated, not session).
  setupUnsubscribeRoutes(app);

  // Server-side onboarding flag store (Wave 4.7).
  setupOnboardingRoutes(app);

  // Logo/favicon image proxy — so scraped external images pass CSP.
  setupLogoProxyRoutes(app);

  // Brand CRUD (Wave 5.1: extracted from this file).
  setupBrandRoutes(app);

  // Buffer social-publishing OAuth + post (Wave 5.1: extracted).
  setupBufferRoutes(app);

  // Stripe billing: publishable key + products + checkout + portal
  // (Wave 5.1: extracted). Webhook stays in server/index.ts (raw body).
  setupBillingRoutes(app);

  // Revenue analytics + generic e-commerce webhook (Wave 5.1: extracted).
  setupRevenueRoutes(app);

  // Body/query brandId ownership guard.
  app.use(enforceBrandOwnership);

  // URL-path :brandId ownership guard. Express fires this whenever a route
  // template contains `:brandId` and it's matched. Prevents authenticated
  // User A from guessing User B's brand IDs via any brand-scoped route.
  app.param("brandId", brandIdParamHandler);

  // Usage tracking API endpoints
  app.get("/api/usage", async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }

      const usage = await storage.getUserUsage(user.id);
      const tier = (user.accessTier || "free") as keyof typeof usageLimits;
      const limits = usageLimits[tier] || usageLimits.free;

      res.json({
        success: true,
        data: {
          articlesUsed: usage?.articlesUsed || 0,
          articlesLimit: limits.articlesPerMonth,
          articlesRemaining:
            limits.articlesPerMonth === -1
              ? -1
              : Math.max(0, limits.articlesPerMonth - (usage?.articlesUsed || 0)),
          brandsUsed: usage?.brandsUsed || 0,
          brandsLimit: limits.maxBrands,
          brandsRemaining:
            limits.maxBrands === -1 ? -1 : Math.max(0, limits.maxBrands - (usage?.brandsUsed || 0)),
          resetDate: usage?.resetDate,
          tier: user.accessTier || "free",
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // User preferences — notification toggles, Buffer connection status
  app.patch("/api/user/preferences", async (req, res) => {
    try {
      const user = requireUser(req);
      const { weeklyReportEnabled } = req.body ?? {};
      if (typeof weeklyReportEnabled !== "boolean") {
        return res
          .status(400)
          .json({ success: false, error: "weeklyReportEnabled must be boolean" });
      }
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const schema = await import("@shared/schema");
      await db
        .update(schema.users)
        .set({ weeklyReportEnabled: weeklyReportEnabled ? 1 : 0 })
        .where(eq(schema.users.id, user.id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to update preferences");
    }
  });

  app.get("/api/user/preferences", async (req, res) => {
    try {
      const user = requireUser(req);
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const schema = await import("@shared/schema");
      const [row] = await db
        .select({
          weeklyReportEnabled: schema.users.weeklyReportEnabled,
          bufferConnected: schema.users.bufferAccessToken,
        })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
      res.json({
        success: true,
        data: {
          weeklyReportEnabled: (row?.weeklyReportEnabled ?? 1) === 1,
          bufferConnected: !!row?.bufferConnected,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch preferences");
    }
  });

  // Waitlist signup (public - no auth required)
  app.post("/api/waitlist", async (req, res) => {
    try {
      const { email, source } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, error: "Email is required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: "Invalid email format" });
      }

      const { pool } = await import("./db");
      const normalizedEmail = email.toLowerCase().trim();
      const emailSource = source || "landing";

      await pool.query(
        `INSERT INTO waitlist (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
        [normalizedEmail, emailSource],
      );

      res.json({ success: true, message: "Successfully joined the waitlist!" });
    } catch (error: any) {
      console.error("Waitlist error:", error);
      if (error.code === "23505") {
        res.json({ success: true, message: "You're already on the waitlist!" });
      } else {
        res.status(500).json({ success: false, error: "Failed to join waitlist" });
      }
    }
  });

  // Helper function to check usage limits
  async function checkUsageLimit(
    userId: string,
    accessTier: string,
  ): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
    const tier = (accessTier || "free") as keyof typeof usageLimits;
    const limits = usageLimits[tier] || usageLimits.free;

    if (limits.articlesPerMonth === -1) {
      return { allowed: true, remaining: -1 };
    }

    const usage = await storage.getUserUsage(userId);
    const articlesUsed = usage?.articlesUsed || 0;

    if (articlesUsed >= limits.articlesPerMonth) {
      return {
        allowed: false,
        reason: `You've reached your monthly limit of ${limits.articlesPerMonth} articles. Upgrade your plan for more.`,
        remaining: 0,
      };
    }

    return { allowed: true, remaining: limits.articlesPerMonth - articlesUsed };
  }

  // Beta invite code validation — redeems for the current authenticated user.
  // userId is NEVER taken from request body (was an IDOR vulnerability).
  app.post("/api/beta/validate", async (req, res) => {
    try {
      const user = (req as any).user;
      const { code } = req.body;

      if (!code || typeof code !== "string") {
        return res.status(400).json({ success: false, error: "Invite code is required" });
      }

      const inviteCode = await storage.useBetaInviteCode(code);

      if (!inviteCode) {
        return res.status(400).json({ success: false, error: "Invalid or expired invite code" });
      }

      await storage.updateUserStripeInfo(user.id, { accessTier: inviteCode.accessTier });

      res.json({ success: true, accessTier: inviteCode.accessTier });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin: Create beta invite codes
  app.post("/api/beta/codes", isAdmin, async (req, res) => {
    try {
      const { code, maxUses, accessTier, expiresAt } = req.body;

      const validTiers = ["free", "beta", "pro", "enterprise", "admin"];
      const tier = accessTier && validTiers.includes(accessTier) ? accessTier : "beta";
      const uses = typeof maxUses === "number" && maxUses > 0 ? maxUses : 10;

      const inviteCode = await storage.createBetaInviteCode({
        code:
          code && typeof code === "string"
            ? code.toUpperCase()
            : Math.random().toString(36).substring(2, 10).toUpperCase(),
        maxUses: uses,
        accessTier: tier,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      await logAudit(req, {
        action: "admin.beta_code.create",
        entityType: "beta_invite_code",
        entityId: inviteCode.id,
        after: inviteCode,
      });
      res.json({ success: true, data: inviteCode });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get all beta codes (admin)
  app.get("/api/beta/codes", isAdmin, async (_req, res) => {
    try {
      const codes = await storage.getAllBetaInviteCodes();
      res.json({ success: true, data: codes });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get dashboard analytics — scoped to the authenticated user. Aggregates
  // across brands they own so one logged-in user cannot see another's data.
  app.get("/api/dashboard", async (req, res) => {
    try {
      const user = requireUser(req);
      const allBrands = await storage.getBrandsByUserId(user.id);
      // Optional ?brandId= filter — when provided, every metric below is
      // scoped to that single brand. Without it, metrics aggregate across
      // every brand the user owns (legacy behaviour).
      const brandIdFilter = typeof req.query.brandId === "string" ? req.query.brandId : "";
      const scopedBrands = brandIdFilter
        ? allBrands.filter((b) => b.id === brandIdFilter)
        : allBrands;
      const brandIds = new Set(scopedBrands.map((b) => b.id));
      const allArticles = await storage.getArticles();
      const articles = allArticles.filter((a) => a.brandId && brandIds.has(a.brandId));
      const totalArticles = articles.length;

      // Real Phase 1 citation metrics come from geo_rankings rows tied to the
      // user's brand_prompts. Aggregate across every brand the user owns and
      // keep only the latest row per (prompt, platform) pair so re-runs don't
      // double-count.
      const promptIdsByBrand = await Promise.all(
        Array.from(brandIds).map((bid) => storage.getBrandPromptsByBrandId(bid)),
      );
      const allPromptIds = promptIdsByBrand.flat().map((p) => p.id);
      let totalCitations = 0;
      let totalChecks = 0;
      if (allPromptIds.length > 0) {
        const rankings = await storage.getGeoRankingsByBrandPromptIds(allPromptIds);
        const latestByKey = new Map<string, (typeof rankings)[number]>();
        for (const r of rankings) {
          const key = `${r.brandPromptId}__${r.aiPlatform}`;
          const existing = latestByKey.get(key);
          if (!existing || r.checkedAt > existing.checkedAt) latestByKey.set(key, r);
        }
        for (const r of Array.from(latestByKey.values())) {
          totalChecks += 1;
          if (r.isCited === 1) totalCitations += 1;
        }
      }
      const citationRate = totalChecks > 0 ? Math.round((totalCitations / totalChecks) * 100) : 0;

      res.json({
        success: true,
        data: {
          totalCitations,
          totalChecks,
          citationRate,
          totalArticles,
          totalBrands: allBrands.length,
          weeklyGrowth: 0,
          avgPosition: 0,
          monthlyTraffic: 0,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch dashboard data");
    }
  });

  // Onboarding status for new user checklist — scoped to the caller.
  app.get("/api/onboarding-status", async (req, res) => {
    try {
      const user = requireUser(req);
      const brands = await storage.getBrandsByUserId(user.id);
      const brandIds = new Set(brands.map((b) => b.id));
      const allArticles = await storage.getArticles();
      const articles = allArticles.filter((a) => a.brandId && brandIds.has(a.brandId));
      const citations = await storage.getCitationsByUserId(user.id);

      // Also count any cited geo_rankings — the automated Phase 1 flow
      // writes there instead of the legacy `citations` table, so without
      // this check users who've run prompt checks would never see the
      // "Track your first citation" step flip to done.
      let citedRankingsCount = 0;
      let citationRunsCount = 0;
      if (brandIds.size > 0) {
        const promptIdsByBrand = await Promise.all(
          Array.from(brandIds).map((bid) => storage.getBrandPromptsByBrandId(bid)),
        );
        const promptIds = promptIdsByBrand.flat().map((p) => p.id);
        if (promptIds.length > 0) {
          const rankings = await storage.getGeoRankingsByBrandPromptIds(promptIds);
          citedRankingsCount = rankings.filter((r) => r.isCited === 1).length;
        }
        // Count citation runs across all brands — completing the step
        // when the user *runs* their first check, not only when something
        // is actually cited.
        const runsByBrand = await Promise.all(
          Array.from(brandIds).map((bid) => storage.getCitationRunsByBrandId(bid, 1)),
        );
        citationRunsCount = runsByBrand.reduce((acc, rs) => acc + rs.length, 0);
      }

      // Server-side onboarding flags — persisted on the users row so they
      // sync across browsers/devices (localStorage doesn't).
      const userRow = await storage.getUser(user.id);

      res.json({
        success: true,
        data: {
          brands,
          articles,
          citations,
          citedRankingsCount,
          citationRunsCount,
          hasArticles: articles.length > 0,
          visibilityVisited: Boolean(userRow?.visibilityGuideVisitedAt),
          visibilityVisitedAt: userRow?.visibilityGuideVisitedAt ?? null,
          visibilityStarted: false,
          // Wave 4.7: cross-device-synced onboarding flags. Empty object
          // for fresh accounts; the PATCH /api/onboarding/state endpoint
          // is what writes into this.
          onboardingState: userRow?.onboardingState ?? {},
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch onboarding status");
    }
  });

  // Mark the "View the AI Visibility Guide" onboarding step as complete
  // server-side. Idempotent — first call stamps the timestamp, subsequent
  // calls are no-ops. Synced across devices via the users table.
  app.post("/api/onboarding/visibility-visited", async (req, res) => {
    try {
      const user = requireUser(req);
      const current = await storage.getUser(user.id);
      if (!current?.visibilityGuideVisitedAt) {
        const { eq } = await import("drizzle-orm");
        const { db } = await import("./db");
        const schema = await import("@shared/schema");
        await db
          .update(schema.users)
          .set({ visibilityGuideVisitedAt: new Date() })
          .where(eq(schema.users.id, user.id));
      }
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to mark visibility visited");
    }
  });

  // Comprehensive platform metrics — scoped to the authenticated user's
  // brands / articles / tasks / campaigns / rankings.
  //
  // Wave 3.1: Promise.allSettled instead of Promise.all so one slow or
  // failed source doesn't blank the entire dashboard. Each source falls
  // back to an empty list and surfaces a flag in `degraded` so the
  // frontend can show a "couldn't load X" badge per card.
  app.get("/api/platform-metrics", async (req, res) => {
    try {
      const user = requireUser(req);
      const brands = await storage.getBrandsByUserId(user.id);
      const brandIds = new Set(brands.map((b) => b.id));
      const [articlesRes, tasksRes, campaignsRes, rankingsRes] = await Promise.allSettled([
        storage.getArticles(),
        storage.getAgentTasks(),
        storage.getOutreachCampaigns(),
        storage.getGeoRankings(),
      ]);

      const degraded: Record<string, true> = {};
      const unwrap = <T>(r: PromiseSettledResult<T[]>, label: string): T[] => {
        if (r.status === "fulfilled") return r.value;
        degraded[label] = true;
        logger.warn({ err: r.reason, source: label }, "platform-metrics: source failed");
        return [];
      };

      const allArticles = unwrap(articlesRes, "articles");
      const allTasks = unwrap(tasksRes, "tasks");
      const allCampaigns = unwrap(campaignsRes, "campaigns");
      const allGeoRankings = unwrap(rankingsRes, "geoRankings");

      const articles = allArticles.filter((a) => a.brandId && brandIds.has(a.brandId));
      const tasks = allTasks.filter((t: any) => t.brandId && brandIds.has(t.brandId));
      const campaigns = allCampaigns.filter((c: any) => c.brandId && brandIds.has(c.brandId));
      const articleIds = new Set(articles.map((a) => a.id));
      const geoRankings = allGeoRankings.filter(
        (r: any) => r.articleId && articleIds.has(r.articleId),
      );

      // Calculate content production stats
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - ANALYTICS_WINDOWS.week * MS_PER_DAY);
      const oneMonthAgo = new Date(now.getTime() - ANALYTICS_WINDOWS.month * MS_PER_DAY);

      const articlesThisWeek = articles.filter((a) => new Date(a.createdAt) >= oneWeekAgo).length;
      const articlesThisMonth = articles.filter((a) => new Date(a.createdAt) >= oneMonthAgo).length;

      // Calculate task stats
      const completedTasks = tasks.filter((t) => t.status === "completed").length;
      const pendingTasks = tasks.filter((t) => t.status === "pending").length;
      const failedTasks = tasks.filter((t) => t.status === "failed").length;
      const taskCompletionRate =
        tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

      // Calculate outreach stats
      const sentCampaigns = campaigns.filter(
        (c) => c.status === "sent" || c.status === "responded",
      ).length;
      const successfulCampaigns = campaigns.filter(
        (c) => c.status === "accepted" || c.status === "published",
      ).length;
      const outreachSuccessRate =
        sentCampaigns > 0 ? Math.round((successfulCampaigns / sentCampaigns) * 100) : 0;

      // Calculate citation stats
      const totalCitations = geoRankings.filter((r) => r.isCited).length;
      const citationRate =
        geoRankings.length > 0 ? Math.round((totalCitations / geoRankings.length) * 100) : 0;

      res.json({
        success: true,
        data: {
          content: {
            totalArticles: articles.length,
            articlesThisWeek,
            articlesThisMonth,
            avgWordsPerArticle:
              articles.length > 0
                ? Math.round(
                    articles.reduce((sum, a) => sum + (a.content?.split(/\s+/).length || 0), 0) /
                      articles.length,
                  )
                : 0,
          },
          brands: {
            total: brands.length,
            withContent: brands.filter((b) => articles.some((a) => a.brandId === b.id)).length,
          },
          tasks: {
            total: tasks.length,
            completed: completedTasks,
            pending: pendingTasks,
            failed: failedTasks,
            completionRate: taskCompletionRate,
          },
          outreach: {
            totalCampaigns: campaigns.length,
            sent: sentCampaigns,
            successful: successfulCampaigns,
            successRate: outreachSuccessRate,
          },
          citations: {
            total: totalCitations,
            checks: geoRankings.length,
            citationRate,
          },
        },
        // Empty when everything succeeded; otherwise per-source flags so
        // the frontend can warn the user that a card is partial-data.
        degraded: Object.keys(degraded).length > 0 ? degraded : undefined,
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch platform metrics");
    }
  });

  // Wave 5.1 domain splits: the rest of the routes live in per-domain
  // files under ./routes. Each mounts its own handlers; middleware above
  // (auth, ownership body/query guard, :brandId param guard) applies.
  setupContentRoutes(app);
  setupArticlesRoutes(app);
  setupPromptsRoutes(app);
  setupPublicationsRoutes(app);
  setupAnalyticsRoutes(app);
  setupDashboardRoutes(app);
  setupContentTypesRoutes(app);
  setupIntelligenceRoutes(app);
  setupAgentRoutes(app);
  setupGeoSignalsRoutes(app);
  setupCommunityRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
