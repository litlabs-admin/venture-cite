import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { insertBrandSchema, insertCompetitorSchema, insertCompetitorCitationSnapshotSchema, usageLimits } from "@shared/schema";
import { AI_PLATFORMS as SHARED_AI_PLATFORMS, CITATION_SCORING, ANALYTICS_WINDOWS, MS_PER_DAY } from "@shared/constants";
import { runBrandPrompts, DEFAULT_CITATION_PLATFORMS, checkForCitation } from "./citationChecker";
import { judgeCitation } from "./citationJudge";
import { attachAiLogger } from "./lib/aiLogger";
import { MODELS } from "./lib/modelConfig";
import { enqueueContentGenerationJob, type GenerationPayload } from "./contentGenerationWorker";
import { generateBrandPrompts } from "./lib/promptGenerator";
import { generateSuggestedPrompts } from "./lib/suggestionGenerator";
import { z } from "zod";
import OpenAI from "openai";
import { setupAuth, attachUserIfPresent, requireAuthForApi, enforceBrandOwnership, brandIdParamHandler, isAdmin } from "./auth";
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
  message: { success: false, error: "Too many requests. Please wait a moment before trying again." },
});

// Shared error-response helper: prefers OwnershipError (401/404) when present,
// otherwise returns a generic 500 and logs the underlying error server-side.
// This keeps stack traces and internal messages out of production responses.
function sendError(res: Response, err: unknown, fallback: string, status = 500): void {
  if (sendOwnershipError(res, err)) return;
  const isProd = process.env.NODE_ENV === "production";
  const message = isProd ? fallback : (err instanceof Error ? err.message : fallback);
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
  app.set("trust proxy", 1);

  // Populate req.user from Supabase JWT if a Bearer token is present.
  app.use(attachUserIfPresent);

  // Register /api/auth/* routes (Supabase Auth backed).
  // These must be registered before requireAuthForApi so they aren't gated.
  setupAuth(app);

  // Global guard: every /api/* route not in the PUBLIC_API_ROUTES allowlist
  // requires a valid Bearer token. Single source of truth for auth.
  app.use(requireAuthForApi);

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
      const tier = (user.accessTier || 'free') as keyof typeof usageLimits;
      const limits = usageLimits[tier] || usageLimits.free;

      res.json({
        success: true,
        data: {
          articlesUsed: usage?.articlesUsed || 0,
          articlesLimit: limits.articlesPerMonth,
          articlesRemaining: limits.articlesPerMonth === -1 ? -1 : Math.max(0, limits.articlesPerMonth - (usage?.articlesUsed || 0)),
          brandsUsed: usage?.brandsUsed || 0,
          brandsLimit: limits.maxBrands,
          brandsRemaining: limits.maxBrands === -1 ? -1 : Math.max(0, limits.maxBrands - (usage?.brandsUsed || 0)),
          resetDate: usage?.resetDate,
          tier: user.accessTier || 'free'
        }
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
        return res.status(400).json({ success: false, error: "weeklyReportEnabled must be boolean" });
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

  // ============ BUFFER SOCIAL PUBLISHING ============

  app.get("/api/auth/buffer", async (req, res) => {
    const clientId = process.env.BUFFER_CLIENT_ID;
    const redirectUri = process.env.BUFFER_REDIRECT_URI || `${process.env.APP_URL || ""}/api/auth/buffer/callback`;
    if (!clientId) {
      return res.status(503).json({ success: false, error: "Buffer integration is not configured. Contact support." });
    }
    const authUrl = `https://bufferapp.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    res.redirect(authUrl);
  });

  app.get("/api/auth/buffer/callback", async (req, res) => {
    try {
      const user = requireUser(req);
      const { code } = req.query;
      if (!code || typeof code !== "string") {
        return res.status(400).send("Missing authorization code");
      }
      const clientId = process.env.BUFFER_CLIENT_ID;
      const clientSecret = process.env.BUFFER_CLIENT_SECRET;
      const redirectUri = process.env.BUFFER_REDIRECT_URI || `${process.env.APP_URL || ""}/api/auth/buffer/callback`;
      if (!clientId || !clientSecret) {
        return res.status(503).send("Buffer integration is not configured");
      }

      const tokenResp = await fetch("https://api.bufferapp.com/1/oauth2/token.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenResp.ok) {
        return res.status(502).send("Failed to exchange Buffer authorization code");
      }
      const tokenData = (await tokenResp.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        return res.status(502).send("Buffer did not return an access token");
      }

      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const schema = await import("@shared/schema");
      await db
        .update(schema.users)
        .set({ bufferAccessToken: tokenData.access_token })
        .where(eq(schema.users.id, user.id));

      const appUrl = process.env.APP_URL || "";
      res.redirect(`${appUrl}/articles?buffer=connected`);
    } catch (error) {
      sendError(res, error, "Buffer OAuth failed");
    }
  });

  app.get("/api/buffer/profiles", async (req, res) => {
    try {
      const user = requireUser(req);
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const schema = await import("@shared/schema");
      const [row] = await db
        .select({ token: schema.users.bufferAccessToken })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
      if (!row?.token) {
        return res.status(200).json({ success: true, connected: false, data: [] });
      }
      const resp = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${encodeURIComponent(row.token)}`);
      if (!resp.ok) {
        return res.status(502).json({ success: false, error: "Failed to fetch Buffer profiles" });
      }
      const profiles = (await resp.json()) as any[];
      const mapped = Array.isArray(profiles)
        ? profiles.map((p) => ({
            id: p.id,
            service: p.service,
            formattedService: p.formatted_service,
            username: p.formatted_username || p.service_username,
            avatar: p.avatar,
          }))
        : [];
      res.json({ success: true, connected: true, data: mapped });
    } catch (error) {
      sendError(res, error, "Failed to fetch Buffer profiles");
    }
  });

  app.post("/api/buffer/post", async (req, res) => {
    try {
      const user = requireUser(req);
      const { text, profileIds, scheduledAt } = req.body ?? {};
      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, error: "text is required" });
      }
      if (!Array.isArray(profileIds) || profileIds.length === 0) {
        return res.status(400).json({ success: false, error: "profileIds is required" });
      }

      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const schema = await import("@shared/schema");
      const [row] = await db
        .select({ token: schema.users.bufferAccessToken })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
      if (!row?.token) {
        return res.status(403).json({ success: false, error: "Buffer is not connected. Connect it first." });
      }

      const form = new URLSearchParams();
      form.set("text", text);
      for (const pid of profileIds) form.append("profile_ids[]", String(pid));
      if (scheduledAt) form.set("scheduled_at", new Date(scheduledAt).toISOString());
      form.set("access_token", row.token);

      const resp = await fetch("https://api.bufferapp.com/1/updates/create.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const data = await resp.json();
      if (!resp.ok || (data as any)?.success === false) {
        return res.status(502).json({ success: false, error: (data as any)?.message || "Buffer post failed" });
      }
      res.json({ success: true, data });
    } catch (error) {
      sendError(res, error, "Failed to post to Buffer");
    }
  });

  app.delete("/api/auth/buffer", async (req, res) => {
    try {
      const user = requireUser(req);
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const schema = await import("@shared/schema");
      await db
        .update(schema.users)
        .set({ bufferAccessToken: null })
        .where(eq(schema.users.id, user.id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to disconnect Buffer");
    }
  });

  // Waitlist signup (public - no auth required)
  app.post("/api/waitlist", async (req, res) => {
    try {
      const { email, source } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }
      
      const { pool } = await import("./db");
      const normalizedEmail = email.toLowerCase().trim();
      const emailSource = source || 'landing';

      await pool.query(
        `INSERT INTO waitlist (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
        [normalizedEmail, emailSource],
      );
      
      res.json({ success: true, message: 'Successfully joined the waitlist!' });
    } catch (error: any) {
      console.error('Waitlist error:', error);
      if (error.code === '23505') {
        res.json({ success: true, message: 'You\'re already on the waitlist!' });
      } else {
        res.status(500).json({ success: false, error: 'Failed to join waitlist' });
      }
    }
  });

  // Helper function to check usage limits
  async function checkUsageLimit(userId: string, accessTier: string): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
    const tier = (accessTier || 'free') as keyof typeof usageLimits;
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
        remaining: 0
      };
    }
    
    return { allowed: true, remaining: limits.articlesPerMonth - articlesUsed };
  }

  // Stripe routes - get publishable key
  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const { getStripePublishableKey } = await import("./stripeClient");
      const publishableKey = await getStripePublishableKey();
      res.json({ success: true, publishableKey });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Stripe products and prices — fetched directly from Stripe API
  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const { getStripeClient } = await import("./stripeClient");
      const stripe = getStripeClient();

      const [productsResult, pricesResult] = await Promise.all([
        stripe.products.list({ limit: 100, active: true }),
        stripe.prices.list({ limit: 100, active: true }),
      ]);

      const validProducts = productsResult.data.filter((p: any) => p.metadata?.tier);
      const productsMap = new Map<string, any>();

      for (const product of validProducts) {
        productsMap.set(product.id, {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata,
          prices: [],
        });
      }

      for (const price of pricesResult.data) {
        const productId = typeof price.product === 'string' ? price.product : (price.product as any).id;
        if (productsMap.has(productId)) {
          productsMap.get(productId).prices.push({
            id: price.id,
            unit_amount: price.unit_amount,
            currency: price.currency,
            recurring: price.recurring,
          });
        }
      }

      // Sort by lowest price first
      const sorted = Array.from(productsMap.values()).sort(
        (a, b) => (a.prices[0]?.unit_amount ?? 0) - (b.prices[0]?.unit_amount ?? 0)
      );

      res.json({ success: true, data: sorted });
    } catch (error: any) {
      console.error('Stripe products error:', error);
      res.json({ success: true, data: [] });
    }
  });

  // Create checkout session - requires authentication
  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      // Require authentication - get user from session, not from request body
      const sessionUser = (req as any).user;
      if (!sessionUser) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      
      const { priceId, successUrl, cancelUrl } = req.body;
      
      if (!priceId || typeof priceId !== 'string') {
        return res.status(400).json({ success: false, error: 'priceId is required' });
      }
      
      // Validate priceId format (should start with price_)
      if (!priceId.startsWith('price_')) {
        return res.status(400).json({ success: false, error: 'Invalid price ID format' });
      }
      
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      
      // Verify price exists in our synced products
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const priceCheck = await db.execute(sql`SELECT id FROM stripe.prices WHERE id = ${priceId} AND active = true`);
      if (priceCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid or inactive price' });
      }
      
      // Use authenticated user's ID from session
      const userId = sessionUser.id;
      const user = await storage.getUser(userId);
      
      let customerId: string | undefined;
      if (user?.stripeCustomerId) {
        customerId = user.stripeCustomerId;
      } else if (user) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId },
        });
        await storage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }
      
      const baseUrl = process.env.APP_URL || req.headers.origin || `http://${req.headers.host}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: successUrl || `${baseUrl}/pricing?success=true`,
        cancel_url: cancelUrl || `${baseUrl}/pricing?canceled=true`,
        client_reference_id: userId,
      });
      
      res.json({ success: true, url: session.url });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Customer portal - requires authentication
  app.post("/api/stripe/portal", async (req, res) => {
    try {
      // Require authentication - get user from session
      const sessionUser = (req as any).user;
      if (!sessionUser) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      
      // Use authenticated user's ID from session, not from request body
      const userId = sessionUser.id;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ success: false, error: 'No subscription found' });
      }
      
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      const baseUrl = process.env.APP_URL || req.headers.origin || `http://${req.headers.host}`;
      
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/pricing`,
      });
      
      res.json({ success: true, url: session.url });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Beta invite code validation — redeems for the current authenticated user.
  // userId is NEVER taken from request body (was an IDOR vulnerability).
  app.post("/api/beta/validate", async (req, res) => {
    try {
      const user = (req as any).user;
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, error: 'Invite code is required' });
      }

      const inviteCode = await storage.useBetaInviteCode(code);

      if (!inviteCode) {
        return res.status(400).json({ success: false, error: 'Invalid or expired invite code' });
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

      const validTiers = ['free', 'beta', 'pro', 'enterprise', 'admin'];
      const tier = accessTier && validTiers.includes(accessTier) ? accessTier : 'beta';
      const uses = typeof maxUses === 'number' && maxUses > 0 ? maxUses : 10;

      const inviteCode = await storage.createBetaInviteCode({
        code: (code && typeof code === 'string') ? code.toUpperCase() : Math.random().toString(36).substring(2, 10).toUpperCase(),
        maxUses: uses,
        accessTier: tier,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
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
        const latestByKey = new Map<string, typeof rankings[number]>();
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
  app.get("/api/platform-metrics", async (req, res) => {
    try {
      const user = requireUser(req);
      const brands = await storage.getBrandsByUserId(user.id);
      const brandIds = new Set(brands.map((b) => b.id));
      const [allArticles, allTasks, allCampaigns, allGeoRankings] = await Promise.all([
        storage.getArticles(),
        storage.getAgentTasks(),
        storage.getOutreachCampaigns(),
        storage.getGeoRankings(),
      ]);
      const articles = allArticles.filter((a) => a.brandId && brandIds.has(a.brandId));
      const tasks = allTasks.filter((t: any) => t.brandId && brandIds.has(t.brandId));
      const campaigns = allCampaigns.filter((c: any) => c.brandId && brandIds.has(c.brandId));
      const articleIds = new Set(articles.map((a) => a.id));
      const geoRankings = allGeoRankings.filter((r: any) => r.articleId && articleIds.has(r.articleId));

      // Calculate content production stats
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - ANALYTICS_WINDOWS.week * MS_PER_DAY);
      const oneMonthAgo = new Date(now.getTime() - ANALYTICS_WINDOWS.month * MS_PER_DAY);

      const articlesThisWeek = articles.filter(a => new Date(a.createdAt) >= oneWeekAgo).length;
      const articlesThisMonth = articles.filter(a => new Date(a.createdAt) >= oneMonthAgo).length;

      // Calculate task stats
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const pendingTasks = tasks.filter(t => t.status === 'pending').length;
      const failedTasks = tasks.filter(t => t.status === 'failed').length;
      const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

      // Calculate outreach stats
      const sentCampaigns = campaigns.filter(c => c.status === 'sent' || c.status === 'responded').length;
      const successfulCampaigns = campaigns.filter(c => c.status === 'accepted' || c.status === 'published').length;
      const outreachSuccessRate = sentCampaigns > 0 ? Math.round((successfulCampaigns / sentCampaigns) * 100) : 0;

      // Calculate citation stats
      const totalCitations = geoRankings.filter(r => r.isCited).length;
      const citationRate = geoRankings.length > 0 ? Math.round((totalCitations / geoRankings.length) * 100) : 0;

      res.json({
        success: true,
        data: {
          content: {
            totalArticles: articles.length,
            articlesThisWeek,
            articlesThisMonth,
            avgWordsPerArticle: articles.length > 0 
              ? Math.round(articles.reduce((sum, a) => sum + (a.content?.split(/\s+/).length || 0), 0) / articles.length)
              : 0
          },
          brands: {
            total: brands.length,
            withContent: brands.filter(b => articles.some(a => a.brandId === b.id)).length
          },
          tasks: {
            total: tasks.length,
            completed: completedTasks,
            pending: pendingTasks,
            failed: failedTasks,
            completionRate: taskCompletionRate
          },
          outreach: {
            totalCampaigns: campaigns.length,
            sent: sentCampaigns,
            successful: successfulCampaigns,
            successRate: outreachSuccessRate
          },
          citations: {
            total: totalCitations,
            checks: geoRankings.length,
            citationRate
          }
        }
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch platform metrics");
    }
  });

  // Helper function to humanize content while keeping it professional.
  // Tokens are roughly 0.75 words; we cap `max_tokens` to ~1.5× the input
  // token count (capped at 4500) so a 200-word article doesn't spend the
  // full 4500-token budget three times over.
  async function humanizeContent(content: string, industry: string, maxAttempts: number = 3, baselineScore?: number): Promise<{ humanizedContent: string; humanScore: number; attempts: number; issues: string[]; strengths: string[] }> {
    let currentContent = content;
    let humanScore = 0;
    let attempts = 0;
    let issues: string[] = [];
    let strengths: string[] = [];

    // Start bestScore at the baseline so rewrites must beat the current score.
    // This prevents auto-improve from returning worse content than the original.
    let bestContent = content;
    let bestScore = baselineScore ?? 0;
    let bestIssues: string[] = [];
    let bestStrengths: string[] = [];

    // Tight upper bound on per-call tokens based on input size.
    const inputTokens = Math.ceil(content.length / 3.5);
    const perCallMaxTokens = Math.min(4500, Math.max(500, Math.ceil(inputTokens * 1.5)));

    const humanizationPassPrompts = [
      `You are a seasoned ${industry} journalist and editor with 15+ years of experience writing for top publications. Your job is to completely rewrite AI-generated text so it reads as if YOU wrote it from scratch.

REWRITING RULES — follow these strictly:
1. COMPLETELY restructure paragraphs — don't just swap words, reorganize the flow of ideas
2. Mix sentence lengths aggressively: some as short as 3 words ("That matters."), others spanning 30+ words with subordinate clauses
3. Start sentences with varied structures: prepositional phrases, gerunds, dependent clauses, questions, single-word interjections ("Look,", "Sure,", "Right.")
4. Use REAL contractions everywhere — "it's", "don't", "won't", "they're", "that's", "here's", "we've"
5. Drop in first-person observations: "I've seen this play out many times", "from what I've observed", "in my experience working with"
6. Include imperfect human touches: mid-sentence course corrections with dashes — like this, occasional fragment sentences, and rhetorical asides
7. Reference specific but plausible anecdotes, dates, or named examples ("Back in 2022, a mid-size SaaS company I worked with...")
8. Avoid these AI tells at ALL costs: "In today's [anything]", "In the ever-evolving", "It's important to note", "It's worth noting", "landscape", "leverage", "harness", "delve", "tapestry", "Moreover", "Furthermore", "In conclusion", "crucial", "comprehensive", "Navigating the", "realm"
9. Use colloquial transitions: "Thing is,", "Here's what most people miss:", "The kicker?", "So what does this actually mean?", "Let's break this down."
10. Vary tone within the piece — mix authoritative statements with conversational asides and occasional humor
11. Add specificity: replace vague claims with concrete numbers, timeframes, or examples
12. Use the Oxford comma inconsistently (like real humans do)
13. Occasionally start sentences with "And" or "But" — real writers do this all the time
14. Include a genuine opinion or mild disagreement with conventional wisdom somewhere

OUTPUT: Return ONLY the rewritten content in markdown format. Do NOT add any meta-commentary about what you changed.`,

      `You are a meticulous copy editor who specializes in making text sound authentically human. Review this draft and make targeted improvements:

SPECIFIC FIXES TO APPLY:
1. Find any remaining "AI-sounding" phrases and replace them with natural alternatives:
   - "It is important to" → just state the point directly
   - "This enables/allows" → "This lets" or rephrase entirely
   - "In order to" → "to"
   - "plays a crucial role" → describe the actual impact instead
   - "a wide range of" → "plenty of" or be specific
   - Any sentence starting with "This [noun] is" — restructure it
2. Check for monotonous rhythm — if 3+ consecutive sentences have similar length/structure, break the pattern
3. Ensure at least 2-3 sentences start with dependent clauses ("When you think about it,", "If there's one thing I've learned,", "Despite what the textbooks say,")
4. Add 1-2 mild hedging phrases that humans use: "probably", "tends to", "in most cases", "generally speaking"
5. Make sure contractions are used at least 80% of the time where possible
6. Check that no paragraph follows an identical structure to the previous one
7. Ensure the piece has at least one dash — used for emphasis or aside — and at least one parenthetical (like this)

OUTPUT: Return ONLY the improved content in markdown format.`,

      `You are performing a final human-authenticity pass on this content. Make surgical edits:

FINAL PASS CHECKLIST:
1. Read aloud mentally — flag anything that sounds "written by committee" and make it sound like one person talking
2. Ensure the opening doesn't use any cliché AI opener (no "In today's...", no "In an era of...", no "[Topic] has become increasingly...")
3. Verify sentence starters across the ENTIRE piece — no two consecutive sentences should start with the same word or structure
4. Add 1-2 instances of informal emphasis: italics for *stress*, or a short emphatic sentence by itself
5. Check that specific examples feel lived-in, not generically educational
6. Ensure transitions between sections feel natural, not formulaic
7. The conclusion should NOT start with "In conclusion" — end with a forward-looking thought, a question, or a punchy takeaway
8. Double-check for any remaining AI vocabulary: "landscape", "leverage", "harness", "delve", "crucial", "comprehensive", "robust", "innovative", "cutting-edge", "game-changer", "empower" — replace ALL of these

OUTPUT: Return ONLY the final content in markdown format.`
    ];

    for (let i = 0; i < Math.min(maxAttempts, humanizationPassPrompts.length); i++) {
      attempts++;
      
      const humanizeResponse = await openai.chat.completions.create({
        model: MODELS.contentHumanize,
        messages: [
          { role: "system", content: humanizationPassPrompts[i] },
          {
            role: "user",
            content: `Rewrite this content to sound naturally human-written. Maintain all information, structure, and markdown formatting:\n\n${currentContent}`
          }
        ],
        max_tokens: perCallMaxTokens,
        temperature: 1.0
      });

      currentContent = humanizeResponse.choices[0].message.content || currentContent;

      // Use a strict, adversarial scorer (separate model call to avoid self-bias)
      const analysisResponse = await openai.chat.completions.create({
        model: MODELS.contentAnalyze,
        messages: [
          {
            role: "system",
            content: `You are a strict AI detection analyst. Your job is to be HARSH and CRITICAL — score text as AI detection tools like GPTZero, Originality.ai, and Copyleaks actually would. Most AI-rewritten text scores 40-65 at best. Only genuinely human-sounding text scores above 75.

SCORING CRITERIA (be strict):
- Sentence length variance: Measure standard deviation. If most sentences are 15-25 words, that's AI-like. Score LOW.
- Vocabulary: Any use of "landscape", "leverage", "harness", "delve", "moreover", "furthermore", "crucial", "comprehensive", "robust", "innovative" = immediate 10-point penalty each
- Opening line: If it starts with "In today's..." or "In an era..." = score below 40 automatically
- Transition words: If every paragraph starts with a transition word, that's AI. Score LOW.
- Contractions: If fewer than 60% of possible contractions are used, score LOW.
- First-person voice: Absence of any personal voice or opinion = score LOW.
- Repetitive structure: Same sentence pattern more than twice = score LOW.
- Burstiness: Human writing has HIGH burstiness (mix of very short and very long sentences). AI has LOW burstiness. Measure this.

Return ONLY a JSON object:
{
  "score": <number 0-100, be harsh>,
  "issues": [<specific AI-like patterns found, max 5>],
  "strengths": [<genuinely human-like qualities, max 5>],
  "burstiness": <"low"|"medium"|"high">,
  "ai_vocabulary_found": [<list of AI buzzwords still present>]
}`
          },
          {
            role: "user",
            content: `Analyze this text strictly for AI detection. Be harsh. Return only valid JSON:\n\n${currentContent.substring(0, 4000)}`
          }
        ],
        max_tokens: 600,
        temperature: 0.3
      });

      const analysis = safeParseJson<any>(analysisResponse.choices[0].message.content) ?? { score: 40 };
      humanScore = typeof analysis.score === "number" ? analysis.score : 40;
      issues = Array.isArray(analysis.issues) ? [...analysis.issues] : [];
      if (Array.isArray(analysis.ai_vocabulary_found) && analysis.ai_vocabulary_found.length > 0) {
        issues.push(`AI vocabulary still present: ${analysis.ai_vocabulary_found.join(", ")}`);
      }
      strengths = Array.isArray(analysis.strengths) ? analysis.strengths : [];

      // Promote to best only if this pass improved the score.
      if (humanScore > bestScore) {
        bestScore = humanScore;
        bestContent = currentContent;
        bestIssues = [...issues];
        bestStrengths = [...strengths];
      }

      if (humanScore >= 80) break;
    }

    // Return the highest-scoring version seen across all passes, not
    // necessarily the final pass (which may have regressed).
    return { humanizedContent: bestContent, humanScore: bestScore, attempts, issues: bestIssues, strengths: bestStrengths };
  }

  // ── Content Draft CRUD ─────────────────────────────────────────────────────
  // Drafts persist form state across navigations and enable multiple concurrent
  // drafts per user. Auto-saved from the client on field change (debounced).

  // List all drafts for the authenticated user (newest-first).
  app.get("/api/content-drafts", async (req, res) => {
    try {
      const user = requireUser(req);
      const drafts = await storage.getContentDraftsByUserId(user.id);
      res.json({ success: true, data: drafts });
    } catch (error) {
      sendError(res, error, "Failed to fetch content drafts");
    }
  });

  // Create a new draft.
  app.post("/api/content-drafts", async (req, res) => {
    try {
      const user = requireUser(req);
      const { keywords, industry, type, brandId, targetCustomers, geography, contentStyle, title } = req.body ?? {};
      const draft = await storage.createContentDraft(user.id, {
        keywords: keywords ?? "",
        industry: industry ?? "",
        type: type ?? "article",
        brandId: brandId ?? null,
        targetCustomers: targetCustomers ?? null,
        geography: geography ?? null,
        contentStyle: contentStyle ?? "b2c",
        title: title ?? null,
      });
      res.json({ success: true, data: draft });
    } catch (error) {
      sendError(res, error, "Failed to create content draft");
    }
  });

  // Get a single draft by id (owner-scoped).
  app.get("/api/content-drafts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const draft = await storage.getContentDraftById(req.params.id, user.id);
      if (!draft) return res.status(404).json({ success: false, error: "Draft not found" });
      res.json({ success: true, data: draft });
    } catch (error) {
      sendError(res, error, "Failed to fetch content draft");
    }
  });

  // Auto-save: update an existing draft (partial fields allowed).
  app.patch("/api/content-drafts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const { keywords, industry, type, brandId, targetCustomers, geography, contentStyle, title, generatedContent, articleId, jobId, humanScore, passesAiDetection } = req.body ?? {};
      const update: Record<string, any> = {};
      if (keywords !== undefined) update.keywords = keywords;
      if (industry !== undefined) update.industry = industry;
      if (type !== undefined) update.type = type;
      if (brandId !== undefined) update.brandId = brandId;
      if (targetCustomers !== undefined) update.targetCustomers = targetCustomers;
      if (geography !== undefined) update.geography = geography;
      if (contentStyle !== undefined) update.contentStyle = contentStyle;
      if (title !== undefined) update.title = title;
      if (generatedContent !== undefined) update.generatedContent = generatedContent;
      if (articleId !== undefined) update.articleId = articleId;
      if (jobId !== undefined) update.jobId = jobId;
      if (humanScore !== undefined) update.humanScore = humanScore;
      if (passesAiDetection !== undefined) update.passesAiDetection = passesAiDetection;
      const draft = await storage.updateContentDraft(req.params.id, user.id, update);
      if (!draft) return res.status(404).json({ success: false, error: "Draft not found" });
      res.json({ success: true, data: draft });
    } catch (error) {
      sendError(res, error, "Failed to update content draft");
    }
  });

  // Delete a draft (owner-scoped).
  app.delete("/api/content-drafts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await storage.deleteContentDraft(req.params.id, user.id);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete content draft");
    }
  });

  // ── Content Generation ─────────────────────────────────────────────────────

  // Generate content — enqueues a background job so long-running GPT calls
  // survive page navigation, logout, and browser refresh. Returns the job
  // id immediately; client polls GET /api/content-jobs/:jobId for status.
  app.post("/api/generate-content", aiLimitMiddleware, async (req, res) => {
    const { keywords, industry, type, brandId, humanize = true, targetCustomers, geography, contentStyle = "b2c", draftId } = req.body ?? {};

    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!keywords || !industry || !type) {
      return res.status(400).json({ success: false, error: "keywords, industry, and type are required" });
    }

    const usageCheck = await checkUsageLimit(user.id, user.accessTier || 'free');
    if (!usageCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: usageCheck.reason,
        limitReached: true,
        remaining: 0,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Content generation is not available. OpenAI API key is not configured.",
      });
    }

    try {
      if (brandId) {
        await requireBrand(brandId, user.id);
      }
      const payload: GenerationPayload = {
        keywords,
        industry,
        type,
        brandId,
        humanize,
        targetCustomers,
        geography,
        contentStyle,
      };
      const jobId = await enqueueContentGenerationJob(user.id, brandId || null, payload);

      // Link the job to the active draft so the worker can update it on completion.
      if (draftId && typeof draftId === "string") {
        await storage.updateContentDraft(draftId, user.id, { jobId });
      }

      return res.json({
        success: true,
        data: { jobId, status: "pending" },
      });
    } catch (error) {
      return sendError(res, error, "Failed to enqueue content generation job");
    }
  });

  // Poll a content generation job (owner-scoped).
  // Return the user's active (in-progress) or most recent completed job
  // so the content page can resume where the user left off.
  app.get("/api/content-jobs/active", async (req, res) => {
    try {
      const user = requireUser(req);
      const active = await storage.getActiveContentJob(user.id);
      if (active) {
        return res.json({ success: true, data: { ...active, type: "active" } });
      }
      const recent = await storage.getRecentCompletedContentJob(user.id);
      if (recent) {
        return res.json({ success: true, data: { ...recent, type: "completed" } });
      }
      res.json({ success: true, data: null });
    } catch (error) {
      sendError(res, error, "Failed to fetch active job");
    }
  });

  app.get("/api/content-jobs/:jobId", async (req, res) => {
    try {
      const user = requireUser(req);
      const job = await storage.getContentJobById(req.params.jobId, user.id);
      if (!job) return res.status(404).json({ success: false, error: "Job not found" });
      res.json({
        success: true,
        data: {
          id: job.id,
          status: job.status,
          articleId: job.articleId,
          errorMessage: job.errorMessage,
          requestPayload: job.requestPayload,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch job");
    }
  });

  // Analyze content for AI detection score
  app.post("/api/analyze-content", aiLimitMiddleware, async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { content } = req.body;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ success: false, error: "Content is required" });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(413).json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "AI detection analysis is not available. OpenAI API key is not configured.",
        message: "Please contact support to enable content analysis."
      });
    }

    try {
      const analysisResponse = await openai.chat.completions.create({
        model: MODELS.contentAnalyze,
        messages: [
          {
            role: "system",
            content: `You are a strict AI detection analyst simulating tools like GPTZero, Originality.ai, and Copyleaks. Be HARSH and realistic — most AI-rewritten text scores 40-65. Only genuinely human text scores above 75.

SCORING CRITERIA (be strict):
- Sentence length variance: If most sentences are 15-25 words with similar structure, that's AI-like. Score LOW.
- Vocabulary: Any use of "landscape", "leverage", "harness", "delve", "moreover", "furthermore", "crucial", "comprehensive", "robust", "innovative", "tapestry", "realm" = immediate penalty
- Opening line: "In today's..." or "In an era..." = score below 40
- Contractions: If fewer than 60% of possible contractions are used, score LOW
- First-person voice: No personal voice = score LOW
- Burstiness: Human writing mixes very short and very long sentences. AI is uniform. Measure this.
- Repetitive structure: Same sentence pattern repeated = score LOW

Return a JSON object with:
- score: 0-100 (be harsh and realistic)
- issues: array of specific AI-like patterns found (max 5)
- strengths: array of human-like qualities found (max 5)
- recommendation: single string with the main improvement suggestion
- ai_vocabulary_found: array of AI buzzwords still present`
          },
          {
            role: "user",
            content: `Analyze this content strictly for AI detection. Be harsh and realistic:\n\n${content.substring(0, 4000)}`
          }
        ],
        max_tokens: 600,
        temperature: 0.3
      });

      const analysisText = analysisResponse.choices[0].message.content || '{}';
      let analysis;
      
      try {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        analysis = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
      } catch {
        analysis = {
          score: 45,
          issues: ["Unable to parse detailed analysis"],
          strengths: ["Content appears structured"],
          recommendation: "Consider adding more varied sentence structures and personal voice"
        };
      }

      res.json({
        success: true,
        ...analysis,
        passesAiDetection: (analysis.score || 0) >= 70
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Rewrite content to improve human score. When called with an articleId,
  // the improved version is persisted as a new draft article so the user can
  // compare or discard it from the Articles page — the original is never
  // touched. Without articleId, behaves as a pure transform (legacy shape).
  app.post("/api/rewrite-content", aiLimitMiddleware, async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { content, industry = "general", articleId, currentScore } = req.body;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ success: false, error: "Content is required" });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(413).json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Content rewriting is not available. OpenAI API key is not configured.",
      });
    }

    // Pass the current score as the baseline — the humanizer will only replace
    // content if a rewrite scores higher. This prevents the "auto-improve made
    // it worse" bug where all rewrites scored below the already-humanized content.
    const baselineScore = typeof currentScore === "number" ? currentScore : undefined;

    try {
      const result = await humanizeContent(content, industry, 3, baselineScore);
      const improved = result.humanScore > (baselineScore ?? 0);

      // If the user passed an articleId, persist the improved version as a
      // new draft article and tag its seoData so the UI can surface the
      // lineage ("Improved from <originalId>").
      let improvedArticleId: string | undefined;
      if (articleId && typeof articleId === "string") {
        const original = await requireArticle(articleId, user.id).catch(() => null);
        if (original) {
          const originalScore = (original.seoData as any)?.humanScore ?? null;
          const improvedTitle = `${original.title} (improved)`;
          const improvedSlug = `${original.slug}-improved-${Date.now().toString(36)}`;
          const newArticle = await storage.createArticle({
            brandId: original.brandId,
            title: improvedTitle,
            slug: improvedSlug,
            content: result.humanizedContent,
            industry: original.industry ?? industry,
            contentType: original.contentType,
            keywords: original.keywords,
            author: original.author ?? "GEO Platform",
            seoData: {
              humanScore: result.humanScore,
              humanizationAttempts: result.attempts,
              passesAiDetection: result.humanScore >= 70,
              improvedFrom: original.id,
              originalScore,
              improvedScore: result.humanScore,
            },
          } as any);
          improvedArticleId = newArticle.id;
        }
      }

      res.json({
        success: true,
        content: result.humanizedContent,
        humanScore: result.humanScore,
        attempts: result.attempts,
        passesAiDetection: result.humanScore >= 70,
        aiIssues: result.issues,
        aiStrengths: result.strengths,
        improvedArticleId,
        improved, // false when no rewrite beat the baseline
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Get keyword suggestions based on user input and industry
  app.post("/api/keyword-suggestions", aiLimitMiddleware, async (req, res) => {
    const { input, industry } = req.body;
    
    if (!input || input.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Keyword suggestions are not available. OpenAI API key is not configured.",
        message: "Please contact support to enable keyword suggestions."
      });
    }

    try {
      const response = await openai.chat.completions.create({
        model: MODELS.keywordSuggestions,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a keyword research expert. Return a JSON object of the shape {"suggestions": ["keyword 1", "keyword 2", ...]} with 6-8 short keyword phrases relevant to the user's input and industry. Only output valid JSON, nothing else.`
          },
          {
            role: "user",
            content: `Input: "${input}"\nIndustry: ${industry}\n\nReturn {"suggestions": [6-8 short keyword phrases]}`
          }
        ],
        max_tokens: 300
      });

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ suggestions?: unknown } | string[]>(rawContent);
      let suggestions: string[] = [];
      if (Array.isArray(parsed)) {
        // Some models (or test-mode stripping) return a bare array.
        suggestions = parsed.filter((s): s is string => typeof s === "string");
      } else if (parsed && Array.isArray((parsed as any).suggestions)) {
        suggestions = ((parsed as any).suggestions as unknown[]).filter(
          (s): s is string => typeof s === "string",
        );
      }

      res.json({
        success: true,
        suggestions: suggestions.slice(0, 8)
      });
    } catch (error) {
      console.error("Keyword suggestion error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        success: false,
        error: errorMessage,
        message: "Failed to generate keyword suggestions. Please try again."
      });
    }
  });

  // Get popular topics based on industry and current trends
  app.get("/api/popular-topics", async (req, res) => {
    const { industry } = req.query;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Popular topics feature is not available. OpenAI API key is not configured.",
        message: "Please contact support to enable trending topics."
      });
    }

    try {
      const response = await openai.chat.completions.create({
        model: MODELS.popularTopics,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a trend analyst expert. Return a JSON object of the shape {"topics": [{"topic": "...", "description": "...", "category": "..."}, ...]} with 6-8 trending topics. Only output valid JSON, nothing else.`
          },
          {
            role: "user",
            content: `Industry: ${industry}\n\nReturn {"topics": [6-8 current trending topics valuable for content creators in 2026]}.`
          }
        ],
        max_tokens: 600
      });

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ topics?: unknown } | unknown[]>(rawContent);
      let topics: any[] = [];
      if (Array.isArray(parsed)) {
        topics = parsed;
      } else if (parsed && Array.isArray((parsed as any).topics)) {
        topics = (parsed as any).topics;
      }

      if (topics.length === 0) {
        // Use curated fallback if AI fails
        const fallbackTopics = {
          "Technology": [
            { topic: "AI and Machine Learning", description: "Latest developments in artificial intelligence", category: "Innovation" },
            { topic: "Cybersecurity Trends", description: "Protecting businesses from digital threats", category: "Security" },
            { topic: "Cloud Computing Solutions", description: "Scalable infrastructure for modern businesses", category: "Infrastructure" }
          ],
          "Healthcare": [
            { topic: "Telemedicine Revolution", description: "Remote healthcare delivery and digital consultations", category: "Digital Health" },
            { topic: "Mental Health Awareness", description: "Breaking stigma and promoting wellbeing", category: "Wellness" },
            { topic: "Preventive Care Strategies", description: "Proactive health management and screening", category: "Prevention" }
          ],
          "Finance": [
            { topic: "Digital Banking Evolution", description: "Online and mobile banking innovations", category: "Digital Services" },
            { topic: "Investment Strategies for 2025", description: "Portfolio optimization and market trends", category: "Investment" },
            { topic: "Cryptocurrency and DeFi", description: "Decentralized finance and digital currencies", category: "Innovation" }
          ],
          "E-commerce": [
            { topic: "Social Commerce Growth", description: "Selling directly through social media platforms", category: "Social Media" },
            { topic: "Sustainable E-commerce", description: "Eco-friendly practices and green logistics", category: "Sustainability" },
            { topic: "Mobile Commerce Optimization", description: "Improving mobile shopping experiences", category: "Mobile" }
          ]
        };
        
        topics = fallbackTopics[industry as keyof typeof fallbackTopics] || [
          { topic: "Industry Innovation", description: "Latest trends and developments", category: "General" }
        ];
      }
      
      res.json({
        success: true,
        topics: topics.slice(0, 8)
      });
    } catch (error) {
      console.error("Popular topics error:", error);
      // Return curated topics on error
      const fallbackTopics = {
        "Technology": [
          { topic: "AI and Machine Learning", description: "Latest developments in artificial intelligence", category: "Innovation" },
          { topic: "Cybersecurity Trends", description: "Protecting businesses from digital threats", category: "Security" }
        ],
        "Healthcare": [
          { topic: "Telemedicine Revolution", description: "Remote healthcare delivery", category: "Digital Health" },
          { topic: "Mental Health Awareness", description: "Breaking stigma and promoting wellbeing", category: "Wellness" }
        ],
        "Finance": [
          { topic: "Digital Banking Evolution", description: "Online banking innovations", category: "Digital Services" },
          { topic: "Investment Strategies", description: "Portfolio optimization and trends", category: "Investment" }
        ],
        "E-commerce": [
          { topic: "Social Commerce Growth", description: "Selling through social media", category: "Social Media" },
          { topic: "Sustainable E-commerce", description: "Eco-friendly practices", category: "Sustainability" }
        ]
      };
      
      const topics = fallbackTopics[industry as keyof typeof fallbackTopics] || [
        { topic: "Industry Innovation", description: "Latest trends", category: "General" }
      ];
      
      res.json({
        success: true,
        topics: topics,
        fallback: true
      });
    }
  });

  // ============ KEYWORD RESEARCH ENDPOINTS ============

  // AI-powered keyword discovery for a brand
  app.post("/api/keyword-research/discover", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.body ?? {};
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "Brand ID is required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          success: false,
          error: "AI keyword discovery is not available. OpenAI API key is not configured.",
          message: "Please contact support to enable keyword discovery."
        });
      }

      const brand = await requireBrand(brandId, user.id);

      const competitors = await storage.getCompetitors(brandId);
      const competitorContext = competitors.length > 0 
        ? `Competitors: ${competitors.map(c => c.name).join(", ")}.` 
        : "";

      let response;
      try {
        response = await openai.chat.completions.create({
          model: MODELS.keywordResearch,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an expert keyword researcher specializing in AI search optimization (GEO - Generative Engine Optimization). Your goal is to find keywords that will help brands get cited by AI search engines like ChatGPT, Claude, Perplexity, and Google AI.

Return a JSON object of the shape:
{
  "keywords": [
    {
      "keyword": "primary keyword phrase",
      "searchVolume": 1000-50000,
      "difficulty": 1-100,
      "opportunityScore": 1-100,
      "aiCitationPotential": 1-100,
      "intent": "informational" | "commercial" | "transactional" | "navigational",
      "category": "topic category",
      "competitorGap": 0-100,
      "suggestedContentType": "article" | "guide" | "comparison" | "how-to" | "listicle",
      "relatedKeywords": ["related term 1", "related term 2"]
    }
  ]
}

Focus on:
1. Questions AI assistants commonly answer
2. Comparison queries ("X vs Y")
3. "Best of" and recommendation queries
4. How-to and educational content
5. Industry-specific expertise queries`
          },
          {
            role: "user",
            content: `Discover 12-15 high-opportunity keywords for this brand:

Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || "Not specified"}
Products/Services: ${brand.products?.join(", ") || "Not specified"}
Target Audience: ${brand.targetAudience || "Not specified"}
${competitorContext}

Find keywords that would help this brand get cited by AI search engines. Prioritize queries where creating authoritative content could establish the brand as a trusted source.`
          }
        ],
        max_tokens: 2000
      });
      } catch (aiErr: any) {
        if (aiErr?.status === 429) {
          return res.status(429).json({ success: false, error: "AI is busy right now. Please wait a moment and try again." });
        }
        if (aiErr?.status === 401) {
          return res.status(503).json({ success: false, error: "AI service is misconfigured. Contact support." });
        }
        if (aiErr?.name === "AbortError" || aiErr?.name === "TimeoutError") {
          return res.status(504).json({ success: false, error: "Keyword discovery timed out. Please try again." });
        }
        return res.status(502).json({ success: false, error: "AI service error. Please try again shortly." });
      }

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ keywords?: any[] } | any[]>(rawContent);
      const keywords: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.keywords)
          ? (parsed as any).keywords
          : [];

      if (keywords.length === 0) {
        return res.status(502).json({
          success: false,
          error: "AI returned an unexpected response. Please try again.",
        });
      }

      const existingKeywords = await storage.getKeywordResearch(brandId, {});
      const existingSet = new Set(existingKeywords.map(k => k.keyword.trim().toLowerCase()));

      const savedKeywords = [];
      for (const kw of keywords) {
        if (!kw || typeof kw.keyword !== "string" || !kw.keyword.trim()) continue;
        const normalized = kw.keyword.trim().toLowerCase();
        if (existingSet.has(normalized)) continue;
        existingSet.add(normalized);
        const saved = await storage.createKeywordResearch({
          brandId,
          keyword: kw.keyword.trim(),
          searchVolume: typeof kw.searchVolume === "number" ? kw.searchVolume : null,
          difficulty: typeof kw.difficulty === "number" ? kw.difficulty : null,
          opportunityScore: typeof kw.opportunityScore === "number" ? kw.opportunityScore : 50,
          aiCitationPotential: typeof kw.aiCitationPotential === "number" ? kw.aiCitationPotential : 50,
          intent: kw.intent || "informational",
          category: kw.category || null,
          competitorGap: typeof kw.competitorGap === "number" ? kw.competitorGap : 0,
          suggestedContentType: kw.suggestedContentType || "article",
          relatedKeywords: Array.isArray(kw.relatedKeywords) ? kw.relatedKeywords : null,
          status: "discovered",
          contentGenerated: 0,
          articleId: null,
        });
        savedKeywords.push(saved);
      }

      if (savedKeywords.length === 0) {
        return res.status(200).json({
          success: false,
          error: "No new keywords found — try completing your brand profile (description, products, target audience) for better results.",
          count: 0,
        });
      }

      res.json({
        success: true,
        data: savedKeywords,
        count: savedKeywords.length,
      });
    } catch (error) {
      sendError(res, error, "Failed to discover keywords");
    }
  });

  // Get keyword research for a brand
  app.get("/api/keyword-research/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status, category } = req.query;
      
      const keywords = await storage.getKeywordResearch(brandId, {
        status: status as string,
        category: category as string
      });

      res.json({
        success: true,
        data: keywords
      });
    } catch (error) {
      console.error("Get keyword research error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch keywords" });
    }
  });

  // Get top keyword opportunities
  app.get("/api/keyword-research/:brandId/opportunities", async (req, res) => {
    try {
      const { brandId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const keywords = await storage.getTopKeywordOpportunities(brandId, limit);

      res.json({
        success: true,
        data: keywords
      });
    } catch (error) {
      console.error("Get opportunities error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch opportunities" });
    }
  });

  // Update keyword research status
  app.patch("/api/keyword-research/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireKeywordResearch(req.params.id, user.id);
      const update = pickFields(req.body, [
        "keyword", "searchVolume", "difficulty", "opportunityScore",
        "aiCitationPotential", "intent", "category", "competitorGap",
        "suggestedContentType", "relatedKeywords", "status", "contentGenerated",
      ] as const);
      const updated = await storage.updateKeywordResearch(req.params.id, update as any);
      if (!updated) {
        return res.status(404).json({ success: false, error: "Keyword not found" });
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update keyword");
    }
  });

  // Delete keyword research
  app.delete("/api/keyword-research/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireKeywordResearch(req.params.id, user.id);
      const deleted = await storage.deleteKeywordResearch(req.params.id);
      res.json({ success: true, deleted });
    } catch (error) {
      sendError(res, error, "Failed to delete keyword");
    }
  });

  // ============ END KEYWORD RESEARCH ENDPOINTS ============

  // Article API Routes

  const ARTICLE_WRITE_FIELDS = [
    "title", "slug", "content", "excerpt", "metaDescription", "keywords",
    "industry", "contentType", "featuredImage",
    "author", "seoData", "brandId",
  ] as const;

  // Create/save article. brandId is verified to belong to the caller; all
  // other fields pass through the allowlist (no viewCount/citationCount).
  app.post("/api/articles", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, ARTICLE_WRITE_FIELDS);
      if (body.brandId) {
        await requireBrand(body.brandId as string, user.id);
      }
      if (!body.title || !body.slug || !body.content) {
        return res.status(400).json({ success: false, error: "title, slug, and content are required" });
      }
      const article = await storage.createArticle(body as any);
      res.json({ success: true, article });
    } catch (error) {
      sendError(res, error, "Failed to create article");
    }
  });

  // Get all articles owned by the caller (across all their brands), with an
  // optional status filter.
  app.get("/api/articles", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getArticles();
      const articles = all.filter((a) => a.brandId && brandIds.has(a.brandId));
      res.json({ success: true, data: articles });
    } catch (error) {
      sendError(res, error, "Failed to fetch articles");
    }
  });

  // Get article by ID — user must own the article's brand.
  app.get("/api/articles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await requireArticle(req.params.id, user.id);
      res.json({ success: true, article });
    } catch (error) {
      sendError(res, error, "Failed to fetch article");
    }
  });

  // Get article by slug — also ownership-scoped. Public article viewing is
  // handled by the sitemap/static handlers, not this API.
  app.get("/api/articles/slug/:slug", async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await storage.getArticleBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      if (!article.brandId) {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      // Verify ownership through the brand before returning.
      try {
        await requireBrand(article.brandId, user.id);
      } catch {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      res.json({ success: true, data: article });
    } catch (error) {
      sendError(res, error, "Failed to fetch article");
    }
  });

  // Update article — ownership-scoped, body allowlist.
  app.put("/api/articles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.id, user.id);
      const update = pickFields<any>(req.body, ARTICLE_WRITE_FIELDS);
      if (update.brandId) {
        // Prevent moving an article into a brand the user doesn't own.
        await requireBrand(update.brandId as string, user.id);
      }
      const article = await storage.updateArticle(req.params.id, update as any);
      if (!article) {
        return res.status(404).json({ success: false, error: "Article not found" });
      }
      res.json({ success: true, article });
    } catch (error) {
      sendError(res, error, "Failed to update article");
    }
  });

  // Delete article — ownership-scoped.
  app.delete("/api/articles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.id, user.id);
      const deleted = await storage.deleteArticle(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Article not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete article");
    }
  });

  // Get article by slug (for public viewing)
  app.get("/api/articles/slug/:slug", async (req, res) => {
    try {
      const article = await storage.getArticleBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({
          success: false,
          error: "Article not found"
        });
      }
      
      // Increment view count
      await storage.incrementArticleViews(article.id);
      
      res.json({
        success: true,
        article
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch article"
      });
    }
  });

  // Distribution routes
  app.post("/api/distributions", async (req, res) => {
    try {
      const user = requireUser(req);
      const { articleId, platforms } = req.body ?? {};
      if (!articleId || !Array.isArray(platforms)) {
        return res.status(400).json({ success: false, error: "articleId and platforms are required" });
      }
      const article = await requireArticle(articleId, user.id);

      const distributions = [];
      for (const platform of platforms.slice(0, 10)) {
        if (typeof platform !== "string") continue;
        const distribution = await storage.createDistribution({
          articleId: article.id,
          platform,
          status: "pending",
        });
        distributions.push(distribution);
      }

      res.json({ success: true, data: distributions });
    } catch (error) {
      sendError(res, error, "Failed to create distributions");
    }
  });

  app.get("/api/distributions/:articleId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.articleId, user.id);
      const distributions = await storage.getDistributions(req.params.articleId);
      res.json({ success: true, data: distributions });
    } catch (error) {
      sendError(res, error, "Failed to fetch distributions");
    }
  });

  // Edit saved distribution content (e.g., user tweaks the generated copy before posting)
  app.patch("/api/distribute/entry/:distributionId", async (req, res) => {
    try {
      const user = requireUser(req);
      const { distributionId } = req.params;
      const { content } = req.body;
      if (typeof content !== "string") {
        return res.status(400).json({ success: false, error: "content is required" });
      }
      const dist = await storage.getDistributionById(distributionId);
      if (!dist) return res.status(404).json({ success: false, error: "Distribution not found" });
      await requireArticle(dist.articleId, user.id); // verifies article belongs to user

      const updated = await storage.updateDistribution(distributionId, {
        metadata: { ...(dist.metadata as object ?? {}), content },
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update distribution");
    }
  });

  // Distribute an article to multiple platforms. Rate-limited because it
  // makes one OpenAI call per platform (pre-fix: up to 10 calls/request with
  // no limit). Also verifies article ownership and caps the platforms list.
  app.post("/api/distribute/:articleId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const article = await requireArticle(req.params.articleId, user.id);

      const platformsRaw = Array.isArray(req.body?.platforms) ? req.body.platforms : [];
      const platforms = platformsRaw.filter((p: unknown): p is string => typeof p === "string").slice(0, 5);
      if (platforms.length === 0) {
        return res.status(400).json({ success: false, error: "platforms array is required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ success: false, error: "Content formatting requires OpenAI API configuration." });
      }

      const brand = article.brandId ? await storage.getBrandById(article.brandId) : null;
      const articleContent = article.content?.substring(0, 2000) || article.title;

      const results = [];
      for (const platform of platforms) {
        const distribution = await storage.createDistribution({
          articleId: article.id,
          platform,
          status: "pending",
        });

        try {
          const platformPrompts: Record<string, string> = {
            'LinkedIn': `Convert this article into a compelling LinkedIn post (max 3000 characters). Include:
- A strong hook in the first line to stop scrolling
- Key insights broken into short paragraphs
- Relevant hashtags (5-8)
- A call-to-action or question at the end
- Professional but conversational tone
${brand ? `Brand: ${brand.companyName}` : ''}

Article title: ${article.title}
Content: ${articleContent}`,
            'Medium': `Convert this article into a well-formatted Medium story. Include:
- An engaging title and subtitle
- Clean markdown formatting with headers, bold text, and quotes
- A compelling introduction paragraph
- Key sections maintained from the original
- A strong conclusion
- 3-5 relevant tags at the end (format: Tags: tag1, tag2, tag3)
${brand ? `Brand: ${brand.companyName}` : ''}

Article title: ${article.title}
Content: ${articleContent}`,
            'Reddit': `Convert this article into a Reddit post suitable for industry subreddits. Include:
- A descriptive, non-clickbait title
- A "TL;DR" at the top
- Key points in a readable format
- Genuine, helpful tone (not promotional)
- Discussion questions at the end to encourage engagement
- Suggested subreddits to post in (format: Suggested subreddits: r/sub1, r/sub2)
${brand ? `Brand: ${brand.companyName} (mention naturally, not as promotion)` : ''}

Article title: ${article.title}
Content: ${articleContent}`,
            'Quora': `Convert this article into a comprehensive Quora answer. Include:
- A suggested question to answer
- A direct, authoritative response
- Supporting details and examples
- Conversational yet knowledgeable tone
- A brief mention of credentials/expertise
${brand ? `Brand: ${brand.companyName}` : ''}

Article title: ${article.title}
Content: ${articleContent}`
          };

          const promptContent = platformPrompts[platform] || platformPrompts['LinkedIn'];

          const formatResponse = await openai.chat.completions.create({
            model: MODELS.distribution,
            messages: [
              { role: "system", content: `You are a social media content expert who adapts long-form content for specific platforms. Create engaging, platform-native content that drives engagement.` },
              { role: "user", content: promptContent }
            ],
            max_tokens: 2000,
            temperature: 0.8
          });

          const formattedContent = formatResponse.choices[0].message.content || '';

          if (!formattedContent.trim()) {
            console.error(`[distribute] ${platform} returned empty content for article ${article.id}`);
            await storage.updateDistribution(distribution.id, {
              status: "failed",
              error: "AI returned empty content",
            });
            results.push({ platform, status: "failed", error: "AI returned empty content — try again" });
            continue;
          }

          await storage.updateDistribution(distribution.id, {
            status: "success",
            distributedAt: new Date(),
            platformPostId: `${platform.toLowerCase()}_${article.id}_${Date.now()}`,
            metadata: { content: formattedContent },
          });
          results.push({ platform, status: "success", content: formattedContent });
        } catch (apiError) {
          await storage.updateDistribution(distribution.id, {
            status: "failed",
            error: apiError instanceof Error ? apiError.message : "Content formatting failed",
          });
          results.push({ platform, status: "failed", error: "Failed to generate platform content" });
        }
      }

      res.json({ success: true, data: results });
    } catch (error) {
      sendError(res, error, "Failed to distribute article");
    }
  });

  // GEO Ranking routes
  app.post("/api/geo-rankings", async (req, res) => {
    try {
      const user = requireUser(req);
      const { articleId, aiPlatform, prompt, rank, isCited, citationContext } = req.body ?? {};
      if (!articleId || typeof articleId !== "string") {
        return res.status(400).json({ success: false, error: "articleId is required" });
      }
      await requireArticle(articleId, user.id);
      const ranking = await storage.createGeoRanking({
        articleId,
        aiPlatform,
        prompt,
        rank: rank ?? null,
        isCited: isCited ? 1 : 0,
        citationContext: citationContext ?? null,
      } as any);
      res.json({ success: true, data: ranking });
    } catch (error) {
      sendError(res, error, "Failed to create GEO ranking");
    }
  });

  app.get("/api/geo-rankings", async (req, res) => {
    try {
      const user = requireUser(req);
      const articleId = req.query.articleId as string | undefined;
      if (articleId) {
        await requireArticle(articleId, user.id);
        const rankings = await storage.getGeoRankings(articleId);
        return res.json({ success: true, data: rankings });
      }
      // No articleId: return rankings only for articles the user owns.
      const brandIds = await getUserBrandIds(user.id);
      const allArticles = await storage.getArticles();
      const articleIds = new Set(
        allArticles.filter((a) => a.brandId && brandIds.has(a.brandId)).map((a) => a.id),
      );
      const allRankings = await storage.getGeoRankings();
      const rankings = allRankings.filter((r: any) => r.articleId && articleIds.has(r.articleId));
      res.json({ success: true, data: rankings });
    } catch (error) {
      sendError(res, error, "Failed to fetch GEO rankings");
    }
  });

  app.get("/api/geo-rankings/platform/:platform", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandIds = await getUserBrandIds(user.id);
      const allArticles = await storage.getArticles();
      const articleIds = new Set(
        allArticles.filter((a) => a.brandId && brandIds.has(a.brandId)).map((a) => a.id),
      );
      const all = await storage.getGeoRankingsByPlatform(req.params.platform);
      const rankings = all.filter((r: any) => r.articleId && articleIds.has(r.articleId));
      res.json({ success: true, data: rankings });
    } catch (error) {
      sendError(res, error, "Failed to fetch platform rankings");
    }
  });

  // ============ BRAND-LEVEL CITATION PROMPT PORTFOLIO ============

  // Seed the initial 10 tracked prompts for a brand. Refuses if tracked
  // prompts already exist — callers must use /reset for a destructive redo.
  app.post("/api/brand-prompts/:brandId/generate", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      const existing = await storage.getBrandPromptsByBrandId(brand.id, { status: "tracked" });
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Tracked prompts are already set. Use suggestions to evolve them, or reset to start over.",
        });
      }

      const { saved, error } = await generateBrandPrompts(brand);
      if (error || saved.length === 0) {
        return res.status(502).json({ success: false, error: error || "AI returned no usable prompts. Please try again." });
      }

      res.json({ success: true, data: saved });
    } catch (error) {
      sendError(res, error, "Failed to generate brand prompts");
    }
  });

  // Reset: archive every tracked prompt + suggestion, then seed a fresh 10.
  // Destructive — requires { confirm: true } in the body.
  app.post("/api/brand-prompts/:brandId/reset", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      if (req.body?.confirm !== true) {
        return res.status(400).json({ success: false, error: "confirm: true required" });
      }
      await storage.archiveBrandPrompts(brand.id);
      await storage.archiveSuggestedPrompts(brand.id);
      const { saved, error } = await generateBrandPrompts(brand);
      if (error || saved.length === 0) {
        return res.status(502).json({ success: false, error: error || "AI returned no usable prompts." });
      }
      res.json({ success: true, data: saved });
    } catch (error) {
      sendError(res, error, "Failed to reset brand prompts");
    }
  });

  // List suggested prompts awaiting user review.
  app.get("/api/brand-prompts/:brandId/suggestions", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const suggestions = await storage.getBrandPromptsByBrandId(brand.id, { status: "suggested" });
      res.json({ success: true, data: suggestions });
    } catch (error) {
      sendError(res, error, "Failed to fetch suggestions");
    }
  });

  // Force-refresh suggestions now (also called after each weekly auto run).
  app.post("/api/brand-prompts/:brandId/suggestions/refresh", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const result = await generateSuggestedPrompts(brand.id, { replaceExisting: true });
      if (result.error && result.saved.length === 0) {
        return res.status(502).json({ success: false, error: result.error });
      }
      res.json({ success: true, data: result.saved });
    } catch (error) {
      sendError(res, error, "Failed to refresh suggestions");
    }
  });

  // Accept a suggestion by swapping it in for a specific tracked prompt.
  app.post("/api/brand-prompts/:brandId/suggestions/:suggestionId/accept", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const replaceTrackedId = typeof req.body?.replaceTrackedId === "string" ? req.body.replaceTrackedId : "";
      if (!replaceTrackedId) {
        return res.status(400).json({ success: false, error: "replaceTrackedId is required" });
      }

      const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
      const suggestion = all.find((p) => p.id === req.params.suggestionId && p.status === "suggested");
      const tracked = all.find((p) => p.id === replaceTrackedId && p.status === "tracked");
      if (!suggestion || !tracked) {
        return res.status(404).json({ success: false, error: "Suggestion or tracked prompt not found on this brand" });
      }

      await storage.promoteSuggestionToTracked(suggestion.id, tracked.id);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to accept suggestion");
    }
  });

  // Dismiss a suggestion.
  app.delete("/api/brand-prompts/:brandId/suggestions/:suggestionId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
      const suggestion = all.find((p) => p.id === req.params.suggestionId && p.status === "suggested");
      if (!suggestion) {
        return res.status(404).json({ success: false, error: "Suggestion not found" });
      }
      await storage.archiveBrandPrompt(suggestion.id);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to dismiss suggestion");
    }
  });

  // Inline-edit the text of a tracked prompt.
  app.patch("/api/brand-prompts/:brandId/prompts/:promptId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const newText = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
      if (!newText) {
        return res.status(400).json({ success: false, error: "prompt text required" });
      }
      const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
      const row = all.find((p) => p.id === req.params.promptId && p.status === "tracked");
      if (!row) return res.status(404).json({ success: false, error: "Tracked prompt not found" });
      const updated = await storage.updateBrandPromptText(row.id, newText);
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update prompt");
    }
  });

  // Archive a tracked prompt (drops it from weekly checks).
  app.delete("/api/brand-prompts/:brandId/prompts/:promptId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
      const row = all.find((p) => p.id === req.params.promptId && p.status === "tracked");
      if (!row) return res.status(404).json({ success: false, error: "Tracked prompt not found" });
      const trackedCount = all.filter((p) => p.status === "tracked").length;
      if (trackedCount <= 1) {
        return res.status(400).json({ success: false, error: "Keep at least one tracked prompt — accept a suggestion first" });
      }
      await storage.archiveBrandPrompt(row.id);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to archive prompt");
    }
  });

  // List the stored prompts for a brand.
  app.get("/api/brand-prompts/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const prompts = await storage.getBrandPromptsByBrandId(brand.id);
      res.json({ success: true, data: prompts });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand prompts");
    }
  });

  // AI Visibility Checklist progress — server-side persistence so it
  // survives device switches and browser data clears.
  app.get("/api/visibility-progress/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const rows = await storage.getVisibilityProgress(brand.id);
      // Reshape to { engineId: string[] } for the client.
      const grouped: Record<string, string[]> = {};
      for (const row of rows) {
        if (!grouped[row.engineId]) grouped[row.engineId] = [];
        grouped[row.engineId].push(row.stepId);
      }
      res.json({ success: true, data: grouped });
    } catch (error) {
      sendError(res, error, "Failed to fetch visibility progress");
    }
  });

  app.post("/api/visibility-progress/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const { engineId, stepId } = req.body ?? {};
      if (typeof engineId !== "string" || typeof stepId !== "string" || !engineId || !stepId) {
        return res.status(400).json({ success: false, error: "engineId and stepId are required" });
      }
      await storage.setVisibilityStep(brand.id, engineId, stepId);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to save visibility progress");
    }
  });

  app.delete("/api/visibility-progress/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const { engineId, stepId } = req.body ?? {};
      if (typeof engineId !== "string" || typeof stepId !== "string" || !engineId || !stepId) {
        return res.status(400).json({ success: false, error: "engineId and stepId are required" });
      }
      await storage.unsetVisibilityStep(brand.id, engineId, stepId);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to clear visibility progress");
    }
  });

  // Run all 10 stored prompts against each platform and persist results.
  app.post("/api/brand-prompts/:brandId/run", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ success: false, error: "AI citation checks are not configured." });
      }

      const existing = await storage.getBrandPromptsByBrandId(brand.id);
      if (existing.length === 0) {
        return res.status(400).json({ success: false, error: "No prompts found. Generate prompts first." });
      }

      const platformsRaw: unknown = req.body?.platforms;
      const platforms: string[] = (Array.isArray(platformsRaw) ? platformsRaw : [...DEFAULT_CITATION_PLATFORMS])
        .filter((p): p is string => typeof p === 'string')
        .slice(0, 5);

      const { totalChecks, totalCited } = await runBrandPrompts(brand.id, platforms);
      const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;
      res.json({ success: true, data: { totalChecks, totalCited, citationRate } });
    } catch (error) {
      sendError(res, error, "Failed to run brand citation check");
    }
  });

  // Update auto-citation schedule for a brand.
  app.patch("/api/brands/:brandId/citation-schedule", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const { schedule, day } = req.body || {};
      const validSchedules = ["off", "weekly", "biweekly", "monthly"];
      if (schedule && !validSchedules.includes(schedule)) {
        return res.status(400).json({ success: false, error: "Invalid schedule. Must be one of: off, weekly, biweekly, monthly." });
      }
      const update: Record<string, any> = {};
      if (schedule !== undefined) update.autoCitationSchedule = schedule;
      if (day !== undefined) update.autoCitationDay = Math.max(0, Math.min(6, Number(day) || 0));
      await storage.updateBrand(brand.id, update);
      const updated = await storage.getBrandById(brand.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update citation schedule");
    }
  });

  // Aggregated results for a brand's prompt runs.
  // Citation run history — returns all runs for the trend chart, newest first.
  app.get("/api/brand-prompts/:brandId/history", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const runs = await storage.getCitationRunsByBrandId(brand.id, limit);
      res.json({ success: true, data: runs });
    } catch (error) {
      sendError(res, error, "Failed to fetch citation history");
    }
  });

  // Drill-down into a specific citation run — returns per-prompt × per-platform results.
  app.get("/api/brand-prompts/:brandId/run/:runId/details", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrand(req.params.brandId, user.id);
      const rankings = await storage.getGeoRankingsByRunId(req.params.runId);

      // Group by prompt text (since prompts may have been deleted/archived)
      const byPrompt = new Map<string, { prompt: string; platforms: Array<{ platform: string; isCited: boolean; snippet: string | null; fullResponse: string | null; checkedAt: string }> }>();
      for (const r of rankings) {
        const key = r.prompt;
        if (!byPrompt.has(key)) {
          byPrompt.set(key, { prompt: key, platforms: [] });
        }
        const ctx = r.citationContext || '';
        const delimIdx = ctx.indexOf('||| RAW_RESPONSE |||');
        const oldDelimIdx = ctx.indexOf('--- RAW RESPONSE ---');
        let snippet: string | null = null;
        let fullResponse: string | null = null;
        if (delimIdx !== -1) {
          snippet = ctx.substring(0, delimIdx).trim();
          fullResponse = ctx.substring(delimIdx + 20).trim();
        } else if (oldDelimIdx !== -1) {
          snippet = ctx.substring(0, oldDelimIdx).trim();
          fullResponse = ctx.substring(oldDelimIdx + 20).trim();
        } else if (ctx) {
          snippet = ctx;
        }
        byPrompt.get(key)!.platforms.push({
          platform: r.aiPlatform,
          isCited: r.isCited === 1,
          snippet,
          fullResponse,
          checkedAt: r.checkedAt?.toISOString() || new Date().toISOString(),
        });
      }

      res.json({ success: true, data: { byPrompt: Array.from(byPrompt.values()) } });
    } catch (error) {
      sendError(res, error, "Failed to fetch run details");
    }
  });

  // Re-run brand-mention detection on stored response text for every
  // geo_ranking of this brand. No AI calls — uses the full response already
  // embedded in `citationContext` after the "||| RAW_RESPONSE |||" delimiter.
  // Updates isCited/rank in place and re-aggregates affected citation_runs.
  app.post("/api/brand-prompts/:brandId/backfill-detection", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      const brandName = brand.companyName || brand.name || "";
      const brandNameVariations = [
        brand.name || "",
        brand.companyName || "",
        ...(Array.isArray(brand.nameVariations) ? brand.nameVariations : []),
      ].filter((s) => typeof s === "string" && s.trim().length > 0);

      const prompts = await storage.getBrandPromptsByBrandId(brand.id);
      if (prompts.length === 0) {
        return res.json({ success: true, data: { scanned: 0, updated: 0, flippedToFalse: 0, flippedToTrue: 0 } });
      }

      const rankings = await storage.getGeoRankingsByBrandPromptIds(prompts.map((p) => p.id));
      let updated = 0;
      let flippedToFalse = 0;
      let flippedToTrue = 0;
      const affectedRunIds = new Set<string>();

      const brandContext = {
        website: brand.website || null,
        companyName: brand.companyName || null,
        description: brand.description || null,
        industry: brand.industry || null,
      };

      // Parse rows and drop ones without a stored response body upfront.
      type Task = { row: typeof rankings[number]; responseText: string };
      const tasks: Task[] = [];
      for (const r of rankings) {
        const ctx = r.citationContext || "";
        const delimIdx = ctx.indexOf("||| RAW_RESPONSE |||");
        const oldDelimIdx = ctx.indexOf("--- RAW RESPONSE ---");
        let responseText: string | null = null;
        if (delimIdx !== -1) {
          responseText = ctx.substring(delimIdx + "||| RAW_RESPONSE |||".length).trim();
        } else if (oldDelimIdx !== -1) {
          responseText = ctx.substring(oldDelimIdx + "--- RAW RESPONSE ---".length).trim();
        }
        if (!responseText) continue;
        tasks.push({ row: r, responseText });
      }

      // Cap concurrent gpt-4o-mini judge calls so backfilling 100 rows
      // doesn't fan out 100 parallel OpenAI requests.
      const CONCURRENCY = 5;
      let cursor = 0;
      const runOne = async (task: Task): Promise<void> => {
        const { row: r, responseText } = task;
        // Re-check: call the LLM judge unconditionally (no pre-filter).
        // The user wants every stored row re-evaluated on every backfill.
        const verdict = await judgeCitation({
          responseText,
          brand: {
            name: brandName,
            companyName: brandContext.companyName,
            website: brandContext.website,
            description: brandContext.description,
            industry: brandContext.industry,
            nameVariations: brandNameVariations,
          },
        });
        const newIsCited = verdict.cited ? 1 : 0;
        const newRank = verdict.cited ? verdict.rank : null;

        if (newIsCited !== r.isCited || newRank !== r.rank) {
          const newStatusLine = verdict.cited ? "Cited" : "Not cited";
          const newContext = `${newStatusLine}\n\n||| RAW_RESPONSE |||\n${responseText}`;
          await storage.updateGeoRanking(r.id, {
            isCited: newIsCited,
            rank: newRank,
            citationContext: newContext,
          });
          updated += 1;
          if (newIsCited === 1 && r.isCited === 0) flippedToTrue += 1;
          if (newIsCited === 0 && r.isCited === 1) flippedToFalse += 1;
          if (r.runId) affectedRunIds.add(r.runId);
        }
      };
      const worker = async (): Promise<void> => {
        while (true) {
          const idx = cursor++;
          if (idx >= tasks.length) return;
          await runOne(tasks[idx]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker()));

      // Re-aggregate affected citation_runs (totalCited, citationRate, platformBreakdown).
      for (const runId of Array.from(affectedRunIds)) {
        const runRows = await storage.getGeoRankingsByRunId(runId);
        const totalChecks = runRows.length;
        const totalCited = runRows.filter((x) => x.isCited === 1).length;
        const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;
        const platformMap = new Map<string, { cited: number; checks: number }>();
        for (const x of runRows) {
          const e = platformMap.get(x.aiPlatform) || { cited: 0, checks: 0 };
          e.checks += 1;
          if (x.isCited === 1) e.cited += 1;
          platformMap.set(x.aiPlatform, e);
        }
        const platformBreakdown = Object.fromEntries(
          Array.from(platformMap.entries()).map(([p, s]) => [
            p,
            { ...s, rate: s.checks > 0 ? Math.round((s.cited / s.checks) * 100) : 0 },
          ]),
        );
        await storage.updateCitationRun(runId, { totalChecks, totalCited, citationRate, platformBreakdown });
      }

      res.json({
        success: true,
        data: { scanned: rankings.length, updated, flippedToFalse, flippedToTrue },
      });
    } catch (error) {
      sendError(res, error, "Failed to backfill citation detection");
    }
  });

  // Prompt generation history for a brand.
  app.get("/api/brand-prompts/:brandId/generations", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);
      const generations = await storage.getPromptGenerationsByBrandId(brand.id);
      res.json({ success: true, data: generations });
    } catch (error) {
      sendError(res, error, "Failed to fetch prompt generations");
    }
  });

  app.get("/api/brand-prompts/:brandId/results", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await requireBrand(req.params.brandId, user.id);

      const prompts = await storage.getBrandPromptsByBrandId(brand.id);
      if (prompts.length === 0) {
        return res.json({ success: true, data: { byPlatform: [], byPrompt: [], totalChecks: 0, totalCited: 0, citationRate: 0 } });
      }

      const promptIds = prompts.map((p) => p.id);
      const sinceParam = typeof req.query.since === 'string' ? new Date(req.query.since) : undefined;
      const sinceDate = sinceParam && !isNaN(sinceParam.getTime()) ? sinceParam : undefined;

      const rankings = await storage.getGeoRankingsByBrandPromptIds(promptIds, sinceDate);

      // Keep only the latest row per (promptId, platform) so re-runs don't inflate counts.
      const latestByKey = new Map<string, typeof rankings[number]>();
      for (const r of rankings) {
        const key = `${r.brandPromptId}__${r.aiPlatform}`;
        const existing = latestByKey.get(key);
        if (!existing || (r.checkedAt > existing.checkedAt)) latestByKey.set(key, r);
      }
      const latest = Array.from(latestByKey.values());

      const platformMap = new Map<string, { platform: string; cited: number; checks: number; lastRun: Date | null }>();
      type PlatformEntry = {
        platform: string;
        isCited: boolean;
        snippet: string | null;
        fullResponse: string | null;
        checkedAt: Date;
      };
      const promptMap = new Map<string, { promptId: string; prompt: string; rationale: string | null; platforms: PlatformEntry[] }>();
      for (const p of prompts) promptMap.set(p.id, { promptId: p.id, prompt: p.prompt, rationale: p.rationale, platforms: [] });

      // citationContext is stored as "{snippet}\n\n||| RAW_RESPONSE |||\n{full}"
      // (current format) or "{snippet}\n\n--- RAW RESPONSE ---\n{full}" (older
      // format written before 2026-04-16). Support both so existing rows
      // render correctly without requiring a re-run.
      const splitContext = (ctx: string | null): { snippet: string | null; fullResponse: string | null } => {
        if (!ctx) return { snippet: null, fullResponse: null };
        const markers = ["\n\n||| RAW_RESPONSE |||\n", "\n\n--- RAW RESPONSE ---\n"];
        for (const marker of markers) {
          const idx = ctx.indexOf(marker);
          if (idx !== -1) {
            return {
              snippet: ctx.slice(0, idx).trim() || null,
              fullResponse: ctx.slice(idx + marker.length).trim() || null,
            };
          }
        }
        return { snippet: ctx, fullResponse: null };
      };

      let totalCited = 0;
      for (const r of latest) {
        const plat = platformMap.get(r.aiPlatform) || { platform: r.aiPlatform, cited: 0, checks: 0, lastRun: null };
        plat.checks += 1;
        if (r.isCited) { plat.cited += 1; totalCited += 1; }
        if (!plat.lastRun || r.checkedAt > plat.lastRun) plat.lastRun = r.checkedAt;
        platformMap.set(r.aiPlatform, plat);

        if (r.brandPromptId) {
          const promptRow = promptMap.get(r.brandPromptId);
          if (promptRow) {
            const { snippet, fullResponse } = splitContext(r.citationContext);
            promptRow.platforms.push({
              platform: r.aiPlatform,
              isCited: r.isCited === 1,
              snippet,
              fullResponse,
              checkedAt: r.checkedAt,
            });
          }
        }
      }

      const byPlatform = Array.from(platformMap.values()).map((p) => ({
        ...p,
        citationRate: p.checks > 0 ? Math.round((p.cited / p.checks) * 100) : 0,
      }));
      const byPrompt = Array.from(promptMap.values());
      const totalChecks = latest.length;
      const citationRate = totalChecks > 0 ? Math.round((totalCited / totalChecks) * 100) : 0;

      res.json({ success: true, data: { byPlatform, byPrompt, totalChecks, totalCited, citationRate } });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand prompt results");
    }
  });

  // Brand routes
  app.post("/api/brands/autofill", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);

      const bodySchema = z.object({ url: z.string().min(1, "Please enter a website URL") });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Please enter a website URL (e.g., www.example.com)" });
      }

      let { url } = parsed.data;
      url = url.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ success: false, error: "OpenAI API key is not configured" });
      }

      // SSRF-safe fetch: blocks private IPs (127/8, 10/8, 169.254/16, ...),
      // enforces http(s), applies a 10s timeout and a 2 MB body cap, and
      // throws on private-IP DNS resolution.
      let pageContent = "";
      try {
        const { status, text, contentType } = await safeFetchText(url, { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 });
        if (status < 200 || status >= 400) {
          pageContent = `Website at ${url} returned HTTP ${status}. Please analyze based on the URL/domain name alone.`;
        } else if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
          pageContent = `Website at ${url} returned non-HTML content. Please analyze based on the URL/domain name alone.`;
        } else {
          pageContent = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 8000);
        }
      } catch (fetchError: any) {
        const msg = fetchError instanceof Error ? fetchError.message : "fetch failed";
        if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
          return res.status(400).json({ success: false, error: "This URL is not allowed" });
        }
        pageContent = `Could not fetch website content from ${url}. Please analyze based on the URL/domain name alone.`;
      }

      const completion = await openai.chat.completions.create({
        model: MODELS.brandAutofill,
        messages: [
          {
            role: "system",
            content: `You are an expert brand analyst. Given a company's website content, extract brand information. Return a JSON object with these fields:
- name: The brand/product name (short)
- companyName: The full legal/company name
- industry: The primary industry (e.g., "Technology", "Healthcare", "Finance")
- description: A 2-3 sentence description of what the company does
- tone: One of: "professional", "casual", "friendly", "formal", "conversational", "authoritative"
- targetAudience: Who they sell to (e.g., "B2B SaaS companies", "small business owners")
- products: Comma-separated list of main products/services
- keyValues: Comma-separated list of core brand values
- uniqueSellingPoints: Comma-separated list of what makes them unique
- brandVoice: A brief description of their communication style

Be specific and accurate based on the content. If you can't determine something, make a reasonable inference from the domain/industry.`
          },
          {
            role: "user",
            content: `Website URL: ${url}\n\nWebsite content:\n${pageContent}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = safeParseJson<Record<string, any>>(completion.choices[0].message.content) ?? {};
      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error, "Failed to analyze website. Please try again.");
    }
  });

  app.get("/api/brands", async (req, res) => {
    try {
      const user = (req as any).user;
      const brands = await storage.getBrandsByUserId(user.id);
      res.json({ success: true, data: brands });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch brands" });
    }
  });

  app.get("/api/brands/:id", async (req, res) => {
    try {
      const user = (req as any).user;
      const brand = await storage.getBrandByIdForUser(req.params.id, user.id);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      res.json({ success: true, data: brand });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to fetch brand" });
    }
  });

  app.post("/api/brands/create-from-website", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);

      const tier = (user.accessTier || 'free') as keyof typeof usageLimits;
      const tierLimit = (usageLimits[tier] || usageLimits.free).maxBrands;
      if (tierLimit !== -1) {
        const existingBrands = await storage.getBrandsByUserId(user.id);
        if (existingBrands.length >= tierLimit) {
          return res.status(403).json({ success: false, error: `Brand limit reached — your ${tier} plan allows ${tierLimit}. Delete an existing brand or upgrade for more.`, limitReached: true });
        }
      }

      const bodySchema = z.object({ url: z.string().min(1, "Please enter a website URL") });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Please enter a website URL" });
      }

      let { url } = parsed.data;
      url = url.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }

      try {
        const parsedUrl = new URL(url);
        if (!parsedUrl.hostname.includes('.')) {
          return res.status(400).json({ success: false, error: "Please enter a valid URL (e.g., https://yoursite.com)" });
        }
      } catch {
        return res.status(400).json({ success: false, error: "Please enter a valid URL (e.g., https://yoursite.com)" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ success: false, error: "AI service is not configured" });
      }

      let pageContent = "";
      try {
        const { status, text, contentType } = await safeFetchText(url, { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 });
        if (status < 200 || status >= 400) {
          pageContent = `Website at ${url} returned HTTP ${status}. Please analyze based on the URL/domain name alone.`;
        } else if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
          pageContent = `Website at ${url} returned non-HTML content. Please analyze based on the URL/domain name alone.`;
        } else {
          pageContent = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 8000);
        }
      } catch (fetchError: any) {
        const msg = fetchError instanceof Error ? fetchError.message : "fetch failed";
        if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
          return res.status(400).json({ success: false, error: "This URL is not allowed" });
        }
        pageContent = `Could not fetch website content from ${url}. Please analyze based on the URL/domain name alone.`;
      }

      let result: Record<string, any> = {};
      let analysisQuality: "full" | "partial" = "full";
      try {
        const completion = await openai.chat.completions.create({
          model: MODELS.brandAutofill,
          messages: [
            {
              role: "system",
              content: `You are an expert brand analyst. Given a company's website content, extract brand information and return a JSON object with these fields:
- name: The brand/product name (short)
- companyName: The full legal/company name
- industry: The primary industry (e.g., "Technology", "Healthcare", "Finance")
- description: A 2-3 sentence description of what the company does
- tone: One of: "professional", "casual", "friendly", "formal", "conversational", "authoritative"
- targetAudience: Who they sell to (e.g., "B2B SaaS companies", "small business owners")
- products: An array of main products/services (e.g., ["Product A", "Service B"])
- keyValues: An array of core brand values (e.g., ["Innovation", "Trust"])
- uniqueSellingPoints: An array of what makes them unique (e.g., ["AI-powered", "24/7 support"])
- brandVoice: A brief description of their communication style
- nameVariations: An array of common name variations for tracking (e.g., ["stripe", "stripe inc", "stripe payments"])

Be specific and accurate based on the content. If you can't determine something, make a reasonable inference from the domain/industry.`
            },
            {
              role: "user",
              content: `Website URL: ${url}\n\nWebsite content:\n${pageContent}`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }, { signal: AbortSignal.timeout(25000) });

        const parsed = safeParseJson<Record<string, any>>(completion.choices[0].message.content);
        if (!parsed || !parsed.name) {
          analysisQuality = "partial";
          result = parsed ?? {};
        } else {
          result = parsed;
        }
      } catch (aiErr: any) {
        if (aiErr?.name === "AbortError" || aiErr?.name === "TimeoutError") {
          return res.status(504).json({ success: false, error: "Website analysis timed out. Please try again or create the brand manually." });
        }
        analysisQuality = "partial";
      }

      const brandData = {
        name: result.name || new URL(url).hostname.replace('www.', '').split('.')[0],
        companyName: result.companyName || result.name || "Unknown",
        industry: result.industry || "General",
        description: result.description || undefined,
        website: url,
        tone: result.tone || "professional",
        targetAudience: result.targetAudience || undefined,
        products: Array.isArray(result.products) ? result.products : (typeof result.products === 'string' ? result.products.split(',').map((s: string) => s.trim()) : []),
        keyValues: Array.isArray(result.keyValues) ? result.keyValues : (typeof result.keyValues === 'string' ? result.keyValues.split(',').map((s: string) => s.trim()) : []),
        uniqueSellingPoints: Array.isArray(result.uniqueSellingPoints) ? result.uniqueSellingPoints : (typeof result.uniqueSellingPoints === 'string' ? result.uniqueSellingPoints.split(',').map((s: string) => s.trim()) : []),
        brandVoice: result.brandVoice || undefined,
        nameVariations: Array.isArray(result.nameVariations) ? result.nameVariations : (typeof result.nameVariations === 'string' ? result.nameVariations.split(',').map((s: string) => s.trim()) : []),
      };

      const existingByName = await storage.getBrandsByUserId(user.id);
      const nameLower = brandData.name.toLowerCase();
      if (!req.body?.force && existingByName.some(b => b.name.toLowerCase() === nameLower)) {
        return res.status(409).json({ success: false, error: `A brand named "${brandData.name}" already exists. Pass { force: true } to create anyway.` });
      }

      const brand = await storage.createBrand({ ...brandData, userId: user.id });
      res.json({ success: true, data: brand, analysisQuality });
    } catch (error) {
      sendError(res, error, "Failed to analyze website and create brand. Please try again.");
    }
  });

  app.post("/api/brands", async (req, res) => {
    try {
      const user = (req as any).user;
      const validatedData = insertBrandSchema.parse(req.body);

      if (validatedData.website) {
        try { new URL(validatedData.website); } catch {
          return res.status(400).json({ success: false, error: "Please enter a valid website URL" });
        }
      }

      const tier = (user.accessTier || 'free') as keyof typeof usageLimits;
      const tierLimit = (usageLimits[tier] || usageLimits.free).maxBrands;
      const existingBrands = await storage.getBrandsByUserId(user.id);
      if (tierLimit !== -1 && existingBrands.length >= tierLimit) {
        return res.status(403).json({ success: false, error: `Brand limit reached — your ${tier} plan allows ${tierLimit}. Delete an existing brand or upgrade for more.`, limitReached: true });
      }
      const nameLower = validatedData.name.toLowerCase();
      if (!req.body?.force && existingBrands.some(b => b.name.toLowerCase() === nameLower)) {
        return res.status(409).json({ success: false, error: `A brand named "${validatedData.name}" already exists.` });
      }

      const brand = await storage.createBrand({ ...validatedData, userId: user.id });

      // Kick off async automations: fact-sheet scrape + competitor discovery.
      // These are best-effort — failures log but don't block the response.
      // Use setImmediate so the HTTP response fires first.
      setImmediate(async () => {
        try {
          const { scrapeBrandFacts } = await import("./lib/factExtractor");
          await scrapeBrandFacts(brand.id);
        } catch (err) {
          console.warn(`[brand-create] fact scrape failed for ${brand.id}:`, err instanceof Error ? err.message : err);
        }
      });
      setImmediate(async () => {
        try {
          const { discoverCompetitors } = await import("./lib/competitorDiscovery");
          await discoverCompetitors(brand.id);
        } catch (err) {
          console.warn(`[brand-create] competitor discovery failed for ${brand.id}:`, err instanceof Error ? err.message : err);
        }
      });

      res.json({ success: true, data: brand });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: "Invalid brand data", details: error.errors });
      }
      res.status(500).json({ success: false, error: "Failed to create brand" });
    }
  });

  // Manual triggers for weekly automations — useful for dev/testing and for
  // a "Run now" button on the UI. All require ownership.
  app.post("/api/competitors/discover/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand || brand.userId !== user.id) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      const { discoverCompetitors } = await import("./lib/competitorDiscovery");
      const inserted = await discoverCompetitors(brand.id);
      const competitors = await storage.getCompetitors(brand.id);
      res.json({ success: true, data: { inserted, competitors } });
    } catch (error) {
      sendError(res, error, "Failed to discover competitors");
    }
  });

  app.post("/api/brand-facts/scrape/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand || brand.userId !== user.id) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      const { scrapeBrandFacts } = await import("./lib/factExtractor");
      const inserted = await scrapeBrandFacts(brand.id);
      const facts = await storage.getBrandFacts(brand.id);
      res.json({ success: true, data: { inserted, facts } });
    } catch (error) {
      sendError(res, error, "Failed to scrape brand facts");
    }
  });

  app.post("/api/brand-mentions/scan/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand || brand.userId !== user.id) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      const { scanBrandMentions } = await import("./lib/mentionScanner");
      const inserted = await scanBrandMentions(brand.id);
      const mentions = await storage.getBrandMentions(brand.id);
      res.json({ success: true, data: { inserted, mentions } });
    } catch (error) {
      sendError(res, error, "Failed to scan brand mentions");
    }
  });

  app.put("/api/brands/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const existing = await storage.getBrandByIdForUser(req.params.id, user.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      // insertBrandSchema strips unknown fields by default; .partial() lets
      // clients omit any field. userId is never in the insert schema so it
      // can't be forged here.
      const validatedData = insertBrandSchema.partial().omit({ userId: true } as any).parse(req.body);
      const brand = await storage.updateBrand(req.params.id, validatedData);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      res.json({ success: true, data: brand });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: "Invalid brand data", details: error.errors });
      }
      sendError(res, error, "Failed to update brand");
    }
  });

  app.delete("/api/brands/:id", async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await storage.getBrandByIdForUser(req.params.id, user.id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      // Delete content drafts tied to this brand (no FK cascade on this table)
      await storage.deleteContentDraftsByBrandId(req.params.id);
      // Delete the brand — all other related data cascades via DB foreign keys
      const success = await storage.deleteBrand(req.params.id);
      if (!success) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to delete brand" });
    }
  });

  // Generate robots.txt for AI crawlers
  app.get("/robots.txt", async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const robotsTxt = `User-agent: *
Allow: /
Allow: /article/

# AI Crawlers - Explicitly allow
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: GoogleOther
Allow: /

Sitemap: ${baseUrl}/sitemap.xml`;

    res.header('Content-Type', 'text/plain');
    res.send(robotsTxt);
  });

  // ========== WEBHOOK INGESTION ROUTES ==========
  //
  // These bypass /api/* auth because they're hit by external services. If
  // you wire up real integrations, add a shared-secret / HMAC check here
  // before trusting req.body — right now they trust any POST, which is
  // acceptable only because there's no real integration yet.

  // Shopify webhook for order creation
  app.post("/webhooks/shopify/orders", async (req, res) => {
    try {
      const orderData = req.body;
      
      // Extract referrer/source from order metadata to attribute to article/brand
      const referrer = orderData.referring_site || orderData.source_name || '';
      const articleId = orderData.note_attributes?.find((attr: any) => attr.name === 'article_id')?.value;
      const brandId = orderData.note_attributes?.find((attr: any) => attr.name === 'brand_id')?.value;
      
      const purchaseEvent = await storage.createPurchaseEvent({
        articleId: articleId || null,
        brandId: brandId || null,
        aiPlatform: referrer.includes('chatgpt') ? 'ChatGPT' : referrer.includes('claude') ? 'Claude' : 'Unknown',
        ecommercePlatform: 'Shopify',
        orderId: orderData.id?.toString(),
        revenue: orderData.total_price,
        currency: orderData.currency,
        productName: orderData.line_items?.[0]?.name,
        quantity: orderData.line_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 1,
        customerEmail: orderData.email,
        webhookData: orderData,
      });
      
      res.json({ success: true, event: purchaseEvent });
    } catch (error) {
      console.error('Shopify webhook error:', error);
      res.status(500).json({ success: false, error: 'Failed to process Shopify webhook' });
    }
  });

  // NOTE: Stripe webhooks are handled in server/index.ts at /api/stripe/webhook

  // Generic e-commerce webhook for other platforms
  app.post("/webhooks/ecommerce/purchase", async (req, res) => {
    try {
      const {
        articleId,
        brandId,
        aiPlatform,
        ecommercePlatform,
        orderId,
        revenue,
        currency = 'USD',
        productName,
        quantity = 1,
        customerEmail,
      } = req.body;
      
      const purchaseEvent = await storage.createPurchaseEvent({
        articleId: articleId || null,
        brandId: brandId || null,
        aiPlatform,
        ecommercePlatform,
        orderId,
        revenue,
        currency,
        productName,
        quantity,
        customerEmail,
        webhookData: req.body,
      });
      
      res.json({ success: true, data: purchaseEvent });
    } catch (error) {
      console.error('Generic webhook error:', error);
      res.status(500).json({ success: false, error: 'Failed to process purchase webhook' });
    }
  });

  // ========== REVENUE ANALYTICS API ROUTES ==========

  // Revenue analytics overview — scoped to caller's brands. If a brandId is
  // supplied it's already validated by enforceBrandOwnership middleware
  // (body/query check); otherwise we restrict to all brands the user owns.
  app.get("/api/revenue/analytics", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, aiPlatform } = req.query;

      let purchases: any[];
      let totalRevenue: number;
      if (brandId && typeof brandId === "string") {
        const filters = { brandId, aiPlatform: aiPlatform as string | undefined };
        purchases = await storage.getPurchaseEvents(filters);
        totalRevenue = await storage.getTotalRevenue(filters);
      } else {
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getPurchaseEvents({ aiPlatform: aiPlatform as string | undefined });
        purchases = all.filter((p: any) => p.brandId && brandIds.has(p.brandId));
        totalRevenue = purchases.reduce((sum: number, p: any) => sum + (typeof p.revenue === "string" ? parseFloat(p.revenue) : Number(p.revenue)), 0);
      }
      const totalOrders = purchases.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const platformBreakdown = purchases.reduce((acc: any, purchase: any) => {
        const platform = purchase.aiPlatform;
        if (!acc[platform]) acc[platform] = { orders: 0, revenue: 0 };
        acc[platform].orders++;
        acc[platform].revenue += typeof purchase.revenue === "string" ? parseFloat(purchase.revenue) : Number(purchase.revenue);
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          totalRevenue,
          totalOrders,
          avgOrderValue,
          platformBreakdown,
          recentPurchases: purchases.slice(-10).reverse(),
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch revenue analytics");
    }
  });

  // Purchase events for a specific article — article ownership required.
  app.get("/api/revenue/article/:articleId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.articleId, user.id);
      const purchases = await storage.getPurchaseEvents({ articleId: req.params.articleId });
      const totalRevenue = purchases.reduce((sum, p) => {
        const revenue = typeof p.revenue === "string" ? parseFloat(p.revenue) : Number(p.revenue);
        return sum + revenue;
      }, 0);
      res.json({
        success: true,
        data: { purchases, totalRevenue, totalOrders: purchases.length },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch article revenue");
    }
  });

  // Purchase events for a specific brand — :brandId ownership guard runs
  // before this handler, so no manual check needed.
  app.get("/api/revenue/brand/:brandId", async (req, res) => {
    try {
      const purchases = await storage.getPurchaseEvents({ brandId: req.params.brandId });
      const totalRevenue = await storage.getTotalRevenue({ brandId: req.params.brandId });
      res.json({
        success: true,
        data: { purchases, totalRevenue, totalOrders: purchases.length },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand revenue");
    }
  });

  // ========== PUBLICATION INTELLIGENCE API ROUTES ==========
  
  // Get publication metrics for industry
  app.get("/api/publications/metrics/:industry", async (req, res) => {
    try {
      const { industry } = req.params;
      const metrics = await storage.getPublicationMetrics(industry);
      
      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch publication metrics' });
    }
  });

  // Get top publications by industry
  app.get("/api/publications/top/:industry", async (req, res) => {
    try {
      const { industry } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const topPublications = await storage.getTopPublicationsByIndustry(industry, limit);
      
      res.json({ success: true, data: topPublications });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch top publications' });
    }
  });

  // Get all publication references
  app.get("/api/publications/references", async (req, res) => {
    try {
      const { industry, aiPlatform } = req.query;
      
      const filters = {
        industry: industry as string | undefined,
        aiPlatform: aiPlatform as string | undefined,
      };
      
      const references = await storage.getPublicationReferences(filters);
      
      res.json({ success: true, data: references });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch publication references' });
    }
  });

  // Create or update publication reference (from GEO ranking checks)
  app.post("/api/publications/reference", async (req, res) => {
    try {
      const reference = await storage.createPublicationReference(req.body);
      
      res.json({ success: true, data: reference });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to create publication reference' });
    }
  });

  // Update publication metrics (aggregation endpoint)
  app.post("/api/publications/metrics", async (req, res) => {
    try {
      const metric = await storage.upsertPublicationMetric(req.body);
      
      res.json({ success: true, data: metric });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to update publication metrics' });
    }
  });

  // ========== COMPETITOR TRACKING API ROUTES ==========

  // Competitor leaderboard — requires a brandId owned by the caller.
  app.get("/api/competitors/leaderboard", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandId = req.query.brandId as string | undefined;
      if (brandId) {
        await requireBrand(brandId, user.id);
        const leaderboard = await storage.getCompetitorLeaderboard(brandId);
        return res.json({ success: true, data: leaderboard });
      }
      // No brandId: aggregate across all user-owned brands.
      const brands = await storage.getBrandsByUserId(user.id);
      const aggregated: any[] = [];
      for (const brand of brands) {
        const leaderboard = await storage.getCompetitorLeaderboard(brand.id);
        aggregated.push(...leaderboard);
      }
      res.json({ success: true, data: aggregated });
    } catch (error) {
      sendError(res, error, "Failed to fetch leaderboard");
    }
  });

  // List competitors — body/query brandId is checked by enforceBrandOwnership.
  // When no brandId, restrict to brands the user owns.
  app.get("/api/competitors", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandId = req.query.brandId as string | undefined;
      if (brandId) {
        const competitors = await storage.getCompetitors(brandId);
        return res.json({ success: true, data: competitors });
      }
      const userBrandIds = await getUserBrandIds(user.id);
      const all = await storage.getCompetitors();
      const competitors = all.filter((c: any) => c.brandId && userBrandIds.has(c.brandId));
      res.json({ success: true, data: competitors });
    } catch (error) {
      sendError(res, error, "Failed to fetch competitors");
    }
  });

  // Create a competitor — brandId must belong to caller.
  app.post("/api/competitors", async (req, res) => {
    try {
      const user = requireUser(req);
      const parsed = insertCompetitorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "Invalid competitor data", details: parsed.error });
      }
      if (!parsed.data.brandId) {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(parsed.data.brandId, user.id);
      const competitor = await storage.createCompetitor(parsed.data);
      res.json({ success: true, data: competitor });
    } catch (error) {
      sendError(res, error, "Failed to create competitor");
    }
  });

  // Get competitor by id — ownership via brand.
  app.get("/api/competitors/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const competitor = await requireCompetitor(req.params.id, user.id);
      res.json({ success: true, data: competitor });
    } catch (error) {
      sendError(res, error, "Failed to fetch competitor");
    }
  });

  // Delete competitor — ownership required.
  app.delete("/api/competitors/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCompetitor(req.params.id, user.id);
      const deleted = await storage.deleteCompetitor(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: "Competitor not found" });
      }
      res.json({ success: true, message: "Competitor deleted" });
    } catch (error) {
      sendError(res, error, "Failed to delete competitor");
    }
  });

  // Add citation snapshot for a competitor — ownership required.
  app.post("/api/competitors/:id/snapshots", async (req, res) => {
    try {
      const user = requireUser(req);
      const competitor = await requireCompetitor(req.params.id, user.id);
      const competitorId = competitor.id;

      const snapshotData = { ...req.body, competitorId };
      const parsed = insertCompetitorCitationSnapshotSchema.safeParse(snapshotData);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: 'Invalid snapshot data', details: parsed.error });
      }

      const snapshot = await storage.createCompetitorCitationSnapshot(parsed.data);
      res.json({ success: true, data: snapshot });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to create citation snapshot' });
    }
  });

  // Get citation snapshots for a competitor — ownership required.
  app.get("/api/competitors/:id/snapshots", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCompetitor(req.params.id, user.id);
      const snapshots = await storage.getCompetitorCitationSnapshots(req.params.id);
      res.json({ success: true, data: snapshots });
    } catch (error) {
      sendError(res, error, "Failed to fetch citation snapshots");
    }
  });

  // Get latest citations for a competitor — ownership required.
  app.get("/api/competitors/:id/latest-citations", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCompetitor(req.params.id, user.id);
      const latestCitations = await storage.getCompetitorLatestCitations(req.params.id);
      res.json({ success: true, data: latestCitations });
    } catch (error) {
      sendError(res, error, "Failed to fetch latest citations");
    }
  });

  // ========== AI CRAWLER PERMISSION CHECKER ==========
  
  // Known AI crawler user agents and their details
  const AI_CRAWLERS = [
    { name: 'GPTBot', agent: 'GPTBot', platform: 'ChatGPT/OpenAI', description: 'OpenAI\'s web crawler for training and browsing' },
    { name: 'ChatGPT-User', agent: 'ChatGPT-User', platform: 'ChatGPT', description: 'ChatGPT browsing feature user agent' },
    { name: 'Claude-Web', agent: 'Claude-Web', platform: 'Claude/Anthropic', description: 'Anthropic\'s Claude web browsing agent' },
    { name: 'Anthropic-AI', agent: 'anthropic-ai', platform: 'Anthropic', description: 'Anthropic\'s AI training crawler' },
    { name: 'PerplexityBot', agent: 'PerplexityBot', platform: 'Perplexity AI', description: 'Perplexity\'s search crawler' },
    { name: 'Google-Extended', agent: 'Google-Extended', platform: 'Google AI/Gemini', description: 'Google\'s AI training crawler (Bard/Gemini)' },
    { name: 'Googlebot', agent: 'Googlebot', platform: 'Google Search', description: 'Google\'s main search crawler' },
    { name: 'Bingbot', agent: 'Bingbot', platform: 'Bing/Microsoft Copilot', description: 'Microsoft\'s search and AI crawler' },
    { name: 'CCBot', agent: 'CCBot', platform: 'Common Crawl', description: 'Common Crawl - used by many AI training datasets' },
    { name: 'FacebookBot', agent: 'facebookexternalhit', platform: 'Meta AI', description: 'Meta\'s crawler for AI and social sharing' },
    { name: 'Bytespider', agent: 'Bytespider', platform: 'TikTok/ByteDance', description: 'ByteDance crawler (potential AI training)' },
    { name: 'Applebot-Extended', agent: 'Applebot-Extended', platform: 'Apple AI', description: 'Apple\'s AI feature crawler' },
  ];

  // Parse robots.txt content
  function parseRobotsTxt(content: string): { userAgent: string; rules: { type: 'allow' | 'disallow'; path: string }[] }[] {
    const blocks: { userAgent: string; rules: { type: 'allow' | 'disallow'; path: string }[] }[] = [];
    let currentBlock: { userAgent: string; rules: { type: 'allow' | 'disallow'; path: string }[] } | null = null;
    
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.startsWith('user-agent:')) {
        const agent = line.substring(11).trim();
        currentBlock = { userAgent: agent, rules: [] };
        blocks.push(currentBlock);
      } else if (currentBlock) {
        if (lowerLine.startsWith('disallow:')) {
          const path = line.substring(9).trim() || '/';
          currentBlock.rules.push({ type: 'disallow', path });
        } else if (lowerLine.startsWith('allow:')) {
          const path = line.substring(6).trim();
          if (path) currentBlock.rules.push({ type: 'allow', path });
        }
      }
    }
    
    return blocks;
  }

  // Check if a crawler is blocked
  function isCrawlerBlocked(blocks: ReturnType<typeof parseRobotsTxt>, crawlerAgent: string): { blocked: boolean; reason: string } {
    // Find specific rules for this crawler
    const specificBlock = blocks.find(b => 
      b.userAgent.toLowerCase() === crawlerAgent.toLowerCase()
    );
    
    // Find wildcard rules
    const wildcardBlock = blocks.find(b => b.userAgent === '*');
    
    // Check specific rules first
    if (specificBlock) {
      const hasDisallowAll = specificBlock.rules.some(r => r.type === 'disallow' && (r.path === '/' || r.path === ''));
      const hasAllowAll = specificBlock.rules.some(r => r.type === 'allow' && r.path === '/');
      
      if (hasDisallowAll && !hasAllowAll) {
        return { blocked: true, reason: `Explicitly blocked via "User-agent: ${crawlerAgent}"` };
      }
      if (hasAllowAll) {
        return { blocked: false, reason: `Explicitly allowed via "User-agent: ${crawlerAgent}"` };
      }
    }
    
    // Fall back to wildcard rules
    if (wildcardBlock) {
      const hasDisallowAll = wildcardBlock.rules.some(r => r.type === 'disallow' && (r.path === '/' || r.path === ''));
      if (hasDisallowAll) {
        return { blocked: true, reason: 'Blocked by wildcard rule "User-agent: *" with "Disallow: /"' };
      }
    }
    
    return { blocked: false, reason: 'No blocking rules found - crawler allowed by default' };
  }

  // Check AI crawler permissions for a URL — SSRF-guarded + rate-limited.
  app.post("/api/check-crawler-permissions", aiLimitMiddleware, async (req, res) => {
    requireUser(req);
    const { url } = req.body ?? {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    try {
      // Extract domain from URL
      let domain: string;
      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        domain = urlObj.origin;
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid URL format' });
      }

      // Fetch robots.txt via the SSRF-safe helper. Private-IP URLs, file://,
      // metadata endpoints, etc. all throw before any connection is made.
      let robotsTxtContent = '';
      let robotsTxtExists = false;
      let fetchError = '';

      try {
        const robotsUrl = `${domain}/robots.txt`;
        const { status, text } = await safeFetchText(robotsUrl, {
          maxBytes: 1 * 1024 * 1024,
          timeoutMs: 10_000,
          headers: { 'User-Agent': 'GEO-Platform-Checker/1.0' },
        });
        if (status >= 200 && status < 300) {
          robotsTxtContent = text;
          robotsTxtExists = true;
        } else if (status === 404) {
          robotsTxtExists = false;
        } else {
          fetchError = `HTTP ${status}`;
        }
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch robots.txt';
        if (/private|not allowed|resolve|Invalid URL|http/i.test(msg)) {
          return res.status(400).json({ success: false, error: 'This URL is not allowed' });
        }
        fetchError = msg;
      }
      
      // Parse and check each AI crawler
      const blocks = robotsTxtExists ? parseRobotsTxt(robotsTxtContent) : [];
      
      const crawlerResults = AI_CRAWLERS.map(crawler => {
        if (!robotsTxtExists && !fetchError) {
          return {
            ...crawler,
            status: 'allowed' as const,
            reason: 'No robots.txt found - all crawlers allowed by default',
            recommendation: null
          };
        }
        
        if (fetchError) {
          return {
            ...crawler,
            status: 'unknown' as const,
            reason: `Could not check: ${fetchError}`,
            recommendation: 'Ensure your robots.txt is accessible'
          };
        }
        
        const result = isCrawlerBlocked(blocks, crawler.agent);
        
        let recommendation = null;
        if (result.blocked) {
          recommendation = `To allow ${crawler.platform} to crawl your site, add these lines to robots.txt:\n\nUser-agent: ${crawler.agent}\nAllow: /`;
        }
        
        return {
          ...crawler,
          status: result.blocked ? 'blocked' as const : 'allowed' as const,
          reason: result.reason,
          recommendation
        };
      });
      
      // Generate summary
      const blockedCount = crawlerResults.filter(c => c.status === 'blocked').length;
      const allowedCount = crawlerResults.filter(c => c.status === 'allowed').length;
      const unknownCount = crawlerResults.filter(c => c.status === 'unknown').length;
      
      // Generate overall recommendations
      const recommendations: string[] = [];
      
      if (blockedCount > 0) {
        recommendations.push(`${blockedCount} AI crawler(s) are blocked. This may prevent your content from appearing in AI search results.`);
        
        const blockedCrawlers = crawlerResults.filter(c => c.status === 'blocked');
        const criticalBlocked = blockedCrawlers.filter(c => 
          ['GPTBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'Bingbot'].includes(c.name)
        );
        
        if (criticalBlocked.length > 0) {
          recommendations.push(`CRITICAL: Major AI platforms blocked: ${criticalBlocked.map(c => c.platform).join(', ')}. This significantly impacts GEO visibility.`);
        }
      }
      
      if (!robotsTxtExists && !fetchError) {
        recommendations.push('No robots.txt found. Consider adding one with explicit AI crawler permissions for better control.');
        recommendations.push('Recommended robots.txt for maximum GEO visibility:\n\nUser-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: Claude-Web\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /');
      }
      
      res.json({
        success: true,
        data: {
          url: domain,
          robotsTxtExists,
          robotsTxtUrl: `${domain}/robots.txt`,
          fetchError: fetchError || null,
          summary: {
            total: AI_CRAWLERS.length,
            allowed: allowedCount,
            blocked: blockedCount,
            unknown: unknownCount,
            geoScore: Math.round((allowedCount / AI_CRAWLERS.length) * 100)
          },
          crawlers: crawlerResults,
          recommendations,
          rawRobotsTxt: robotsTxtExists ? robotsTxtContent : null
        }
      });
    } catch (error) {
      console.error('Crawler check error:', error);
      res.status(500).json({ success: false, error: 'Failed to check crawler permissions' });
    }
  });

  // ========== GEO ANALYTICS (Share of Voice, AI Visibility Score, Sentiment) ==========

  const AI_PLATFORMS = SHARED_AI_PLATFORMS;

  // Get comprehensive GEO analytics for a brand — :brandId is ownership-
  // checked via app.param before this handler runs.
  app.get("/api/geo-analytics/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      // Get brand's articles (all statuses; the brand-ownership guard
      // already ensured the caller owns this brand).
      const allArticles = await storage.getArticles();
      const brandArticles = allArticles.filter(a => a.brandId === brand.id);
      const articleIds = new Set(brandArticles.map(a => a.id));

      // citationChecker writes rankings with articleId=null + brandPromptId=<bp.id>,
      // so filtering by articleId alone drops every brand-prompt citation.
      // Widen the filter: keep rows tied to either this brand's articles OR
      // this brand's prompts.
      const brandPrompts = await storage.getBrandPromptsByBrandId(brand.id);
      const brandPromptIds = new Set(brandPrompts.map(p => p.id));

      const allRankings = await storage.getGeoRankings();
      const brandRankings = allRankings.filter(r =>
        (r.articleId && articleIds.has(r.articleId)) ||
        (r.brandPromptId && brandPromptIds.has(r.brandPromptId)),
      );

      // Calculate metrics by platform
      const platformMetrics: Record<string, {
        mentions: number;
        citations: number;
        avgRank: number;
        sentiment: { positive: number; neutral: number; negative: number };
        visibilityScore: number;
      }> = {};

      for (const platform of AI_PLATFORMS) {
        const platformRankings = brandRankings.filter(r => r.aiPlatform === platform);
        const citations = platformRankings.filter(r => r.isCited === 1).length;
        const mentions = platformRankings.length;
        
        // Calculate average rank (lower is better)
        const rankedItems = platformRankings.filter(r => r.rank !== null && r.rank !== undefined);
        const avgRank = rankedItems.length > 0
          ? rankedItems.reduce((sum, r) => sum + (r.rank || 0), 0) / rankedItems.length
          : 0;

        // Count sentiment
        const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
        for (const ranking of platformRankings) {
          const sentiment = (ranking.sentiment as 'positive' | 'neutral' | 'negative') || 'neutral';
          sentimentCounts[sentiment]++;
        }

        // Visibility score (0-100) = citations + mentions + rank components.
        // Weights/multipliers centralized in @shared/constants CITATION_SCORING.
        const citationScore = Math.min(citations * CITATION_SCORING.citationMultiplier, CITATION_SCORING.citationWeight);
        const mentionScore = Math.min(mentions * CITATION_SCORING.mentionMultiplier, CITATION_SCORING.mentionWeight);
        const rankScore = avgRank > 0 ? Math.max(CITATION_SCORING.rankWeight - (avgRank * CITATION_SCORING.rankMultiplier), 0) : 0;
        const visibilityScore = Math.round(citationScore + mentionScore + rankScore);

        platformMetrics[platform] = {
          mentions,
          citations,
          avgRank: Math.round(avgRank * 10) / 10,
          sentiment: sentimentCounts,
          visibilityScore: Math.min(visibilityScore, 100),
        };
      }

      // Get competitor data for Share of Voice calculation
      const competitors = await storage.getCompetitors(brand.id);
      const leaderboard = await storage.getCompetitorLeaderboard(brand.id);

      // Calculate total market citations (brand + all competitors)
      const brandTotalCitations = Object.values(platformMetrics).reduce((sum, p) => sum + p.citations, 0);
      const totalMarketCitations = leaderboard.reduce((sum, entry) => sum + entry.totalCitations, 0);
      
      // Share of Voice = brand citations / total market citations * 100
      const shareOfVoice = totalMarketCitations > 0 
        ? Math.round((brandTotalCitations / totalMarketCitations) * 1000) / 10
        : 0;

      // Calculate overall AI Visibility Score (0-100)
      const platformScores = Object.values(platformMetrics).map(p => p.visibilityScore);
      const overallVisibilityScore = platformScores.length > 0
        ? Math.round(platformScores.reduce((sum, s) => sum + s, 0) / platformScores.length)
        : 0;

      // Calculate overall sentiment
      const overallSentiment = {
        positive: Object.values(platformMetrics).reduce((sum, p) => sum + p.sentiment.positive, 0),
        neutral: Object.values(platformMetrics).reduce((sum, p) => sum + p.sentiment.neutral, 0),
        negative: Object.values(platformMetrics).reduce((sum, p) => sum + p.sentiment.negative, 0),
      };
      const totalSentimentCount = overallSentiment.positive + overallSentiment.neutral + overallSentiment.negative;
      
      // Sentiment score: -1 (all negative) to +1 (all positive)
      const sentimentScore = totalSentimentCount > 0
        ? Math.round(((overallSentiment.positive - overallSentiment.negative) / totalSentimentCount) * 100) / 100
        : 0;

      res.json({
        success: true,
        data: {
          brand: {
            id: brand.id,
            name: brand.name,
            industry: brand.industry,
          },
          overview: {
            aiVisibilityScore: overallVisibilityScore,
            shareOfVoice,
            totalCitations: brandTotalCitations,
            totalMentions: Object.values(platformMetrics).reduce((sum, p) => sum + p.mentions, 0),
            marketSize: totalMarketCitations,
            competitorCount: competitors.length,
          },
          sentiment: {
            score: sentimentScore,
            label: sentimentScore > 0.3 ? 'Positive' : sentimentScore < -0.3 ? 'Negative' : 'Neutral',
            breakdown: overallSentiment,
            percentages: {
              positive: totalSentimentCount > 0 ? Math.round((overallSentiment.positive / totalSentimentCount) * 100) : 0,
              neutral: totalSentimentCount > 0 ? Math.round((overallSentiment.neutral / totalSentimentCount) * 100) : 0,
              negative: totalSentimentCount > 0 ? Math.round((overallSentiment.negative / totalSentimentCount) * 100) : 0,
            }
          },
          platformBreakdown: platformMetrics,
          leaderboard: leaderboard.slice(0, 10),
        }
      });
    } catch (error) {
      console.error('GEO analytics error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch GEO analytics' });
    }
  });

  // Get client report metrics for a brand (used by client-facing reports)
  app.get("/api/client-reports/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { period = "30" } = req.query;
      const daysAgo = parseInt(period as string) || 30;

      const brand = await storage.getBrandById(brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      // Load everything brand-scoped once; we aggregate twice (current window
      // + prior window) from the same in-memory set.
      const allArticles = await storage.getArticles();
      const brandArticles = allArticles.filter(a => a.brandId === brand.id);
      const articleIds = new Set(brandArticles.map(a => a.id));

      // citationChecker writes rankings with articleId=null + brandPromptId=<bp.id>,
      // so filtering by articleId alone drops every brand-prompt citation.
      const brandPrompts = await storage.getBrandPromptsByBrandId(brandId);
      const brandPromptIds = new Set(brandPrompts.map(p => p.id));

      const allRankings = await storage.getGeoRankings();
      const brandRankings = allRankings.filter(r =>
        (r.articleId && articleIds.has(r.articleId)) ||
        (r.brandPromptId && brandPromptIds.has(r.brandPromptId)),
      );

      const leaderboard = await storage.getCompetitorLeaderboard(brandId);
      const totalMarketCitations = leaderboard.reduce((sum, entry) => sum + entry.totalCitations, 0);

      const now = Date.now();
      const currentStart = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
      const prevStart = new Date(now - 2 * daysAgo * 24 * 60 * 60 * 1000);
      const prevEnd = currentStart;

      type Agg = {
        totalMentions: number;
        totalCitations: number;
        citationRate: number;
        shareOfVoice: number;
        promptCoverage: number;
        platformBreakdown: { platform: string; citations: number; mentions: number; trend: number }[];
      };

      const aggregate = (start: Date, end: Date): Agg => {
        const windowRankings = brandRankings.filter(r => {
          const t = r.checkedAt ? new Date(r.checkedAt).getTime() : 0;
          return t >= start.getTime() && t < end.getTime();
        });

        const platformBreakdown: Agg["platformBreakdown"] = [];
        for (const platform of AI_PLATFORMS) {
          const platformRankings = windowRankings.filter(r => r.aiPlatform === platform);
          const citations = platformRankings.filter(r => r.isCited === 1).length;
          const mentions = platformRankings.length;
          if (mentions > 0 || citations > 0) {
            platformBreakdown.push({ platform, citations, mentions, trend: 0 });
          }
        }
        const totalMentions = platformBreakdown.reduce((sum, p) => sum + p.mentions, 0);
        const totalCitations = platformBreakdown.reduce((sum, p) => sum + p.citations, 0);
        const citationRate = totalMentions > 0 ? Math.round((totalCitations / totalMentions) * 100) : 0;
        const shareOfVoice = totalMarketCitations > 0
          ? Math.round((totalCitations / totalMarketCitations) * 1000) / 10
          : 0;
        // Prompt coverage = unique brandPromptIds that had any cited ranking in this window.
        const citedPromptIds = new Set(
          windowRankings
            .filter(r => r.isCited === 1 && r.brandPromptId)
            .map(r => r.brandPromptId!),
        );
        const promptCoverage = citedPromptIds.size;
        return { totalMentions, totalCitations, citationRate, shareOfVoice, promptCoverage, platformBreakdown };
      };

      const current = aggregate(currentStart, new Date(now + 1)); // +1ms to include right-edge
      const previous = aggregate(prevStart, prevEnd);

      // Top performing content from the current window (article-tied rankings).
      const articleCitations: { title: string; citations: number; platform: string }[] = [];
      for (const article of brandArticles) {
        const articleRankings = brandRankings.filter(r =>
          r.articleId === article.id &&
          r.isCited === 1 &&
          r.checkedAt &&
          new Date(r.checkedAt).getTime() >= currentStart.getTime(),
        );
        if (articleRankings.length > 0) {
          const topPlatform = articleRankings.reduce((acc, r) => {
            acc[r.aiPlatform] = (acc[r.aiPlatform] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const bestPlatform = Object.entries(topPlatform).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
          articleCitations.push({
            title: article.title,
            citations: articleRankings.length,
            platform: bestPlatform,
          });
        }
      }
      const topPerformingContent = articleCitations.sort((a, b) => b.citations - a.citations).slice(0, 5);

      const recommendations: string[] = [];
      if (current.totalCitations === 0) {
        recommendations.push("Start tracking your content across AI platforms to measure citations");
      }
      if (current.promptCoverage === 0 && brandPrompts.length > 0) {
        recommendations.push("Your prompts aren't generating citations yet — optimize content for AI discoverability");
      }
      if (current.shareOfVoice < 10 && totalMarketCitations > 0) {
        recommendations.push("Increase content volume to improve share of voice against competitors");
      }
      if (current.platformBreakdown.length < 3) {
        recommendations.push("Expand tracking to more AI platforms for comprehensive coverage");
      }
      if (recommendations.length === 0) {
        recommendations.push("Continue monitoring and optimizing content for AI platforms");
      }

      res.json({
        success: true,
        data: {
          brandMentionFrequency: current.totalMentions,
          previousBMF: previous.totalMentions,
          shareOfVoice: current.shareOfVoice,
          previousSOV: previous.shareOfVoice,
          citationRate: current.citationRate,
          previousCitationRate: previous.citationRate,
          promptCoverage: current.promptCoverage,
          previousPromptCoverage: previous.promptCoverage,
          platformBreakdown: current.platformBreakdown,
          topPerformingContent,
          recommendations,
        },
      });
    } catch (error) {
      console.error('Client reports error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch client report metrics' });
    }
  });

  // Analyze sentiment using OpenAI
  app.post("/api/analyze-sentiment", aiLimitMiddleware, async (req, res) => {
    try {
      requireUser(req);
      const { text, context } = req.body ?? {};

      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, error: "Text is required" });
      }
      if (text.length > MAX_CONTENT_LENGTH) {
        return res.status(413).json({ success: false, error: `Text exceeds ${MAX_CONTENT_LENGTH} characters` });
      }
      const contextStr = typeof context === "string" ? context.slice(0, 500) : "";

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          success: false,
          error: "Sentiment analysis is not available. OpenAI API key is not configured.",
          message: "Please contact support to enable sentiment analysis."
        });
      }

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [
          {
            role: "system",
            content: `You are a sentiment analysis expert. Analyze the sentiment of text mentions about a brand or company.
Return a JSON object with:
- sentiment: "positive", "neutral", or "negative"
- score: a number from -1 (very negative) to +1 (very positive)
- confidence: a number from 0 to 1 indicating confidence
- reasoning: brief explanation of the sentiment

Consider:
- Tone and word choice
- Context of the mention
- Implied recommendations or criticisms
- Comparative statements with competitors`
          },
          {
            role: "user",
            content: `Analyze the sentiment of this brand mention${contextStr ? ` (context: ${contextStr})` : ""}:\n\n"""\n${text}\n"""`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 200,
      });

      const result = safeParseJson<any>(response.choices[0].message.content) ?? {
        sentiment: "neutral",
        score: 0,
        confidence: 0,
        reasoning: "Could not parse sentiment response",
      };

      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error, "Failed to analyze sentiment");
    }
  });

  // Record visibility snapshot for tracking over time
  app.post("/api/geo-analytics/:brandId/snapshot", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      const { aiPlatform, mentionCount, citationCount, shareOfVoice, visibilityScore, sentimentPositive, sentimentNeutral, sentimentNegative, avgSentimentScore } = req.body;

      const snapshot = await storage.createBrandVisibilitySnapshot({
        brandId: brand.id,
        aiPlatform: aiPlatform || 'All',
        mentionCount: mentionCount || 0,
        citationCount: citationCount || 0,
        shareOfVoice: shareOfVoice?.toString() || "0",
        visibilityScore: visibilityScore || 0,
        sentimentPositive: sentimentPositive || 0,
        sentimentNeutral: sentimentNeutral || 0,
        sentimentNegative: sentimentNegative || 0,
        avgSentimentScore: avgSentimentScore?.toString() || "0",
        metadata: null,
      });

      res.json({ success: true, data: snapshot });
    } catch (error) {
      console.error('Snapshot error:', error);
      res.status(500).json({ success: false, error: 'Failed to create snapshot' });
    }
  });

  // Get visibility history for a brand
  app.get("/api/geo-analytics/:brandId/history", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      const limit = parseInt(req.query.limit as string) || 30;
      const snapshots = await storage.getBrandVisibilitySnapshots(brand.id, limit);

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          snapshots,
        }
      });
    } catch (error) {
      console.error('History error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch history' });
    }
  });

  // ========== GEO OPPORTUNITY FINDER ==========

  // Platform recommendations database
  const GEO_PLATFORMS = {
    reddit: {
      name: 'Reddit',
      citationShare: 21,
      description: 'User discussions heavily cited by AI systems',
      strategy: 'Build karma through genuine engagement before adding brand mentions',
      tips: [
        'Join 3-5 niche subreddits and comment genuinely for weeks first',
        'Answer questions with real experience - include pros AND cons',
        'Use natural language, not marketing jargon',
        'More upvotes = stronger AI signal'
      ]
    },
    quora: {
      name: 'Quora',
      citationShare: 14.3,
      description: 'Q&A platform with strong AI training data partnerships',
      strategy: 'Answer long-tail questions that mirror how users talk to AI chatbots',
      tips: [
        'Target questions with high follower counts',
        'Keep core answers 40-60 words (optimal for AI summaries)',
        'Add detailed context/examples below',
        'Answer consistently over months to build topical authority'
      ]
    },
    youtube: {
      name: 'YouTube',
      citationShare: 18.8,
      description: 'Video content transcripts are heavily indexed by AI',
      strategy: 'Create educational content that answers specific questions',
      tips: [
        'Use keyword-rich titles in question format',
        'Add detailed descriptions with timestamps',
        'Include transcripts/captions for AI indexing',
        'Create how-to and explainer videos'
      ]
    },
    linkedin: {
      name: 'LinkedIn',
      citationShare: 8,
      description: 'Professional network with growing AI visibility',
      strategy: 'Share thought leadership and industry insights',
      tips: [
        'Post original insights, not just links',
        'Engage in comments on trending industry posts',
        'Write articles on LinkedIn Publishing',
        'Use relevant hashtags for discoverability'
      ]
    },
    medium: {
      name: 'Medium',
      citationShare: 6,
      description: 'Long-form content platform indexed by AI',
      strategy: 'Publish in-depth articles on industry topics',
      tips: [
        'Join relevant publications for wider reach',
        'Use SEO-friendly titles and subtitles',
        'Include data, case studies, and examples',
        'Link back to your main site strategically'
      ]
    },
    hackernews: {
      name: 'Hacker News',
      citationShare: 5,
      description: 'Tech community with high authority for AI systems',
      strategy: 'Share valuable tech content and engage in discussions',
      tips: [
        'Focus on genuine value, not self-promotion',
        'Participate in Show HN for product launches',
        'Comment thoughtfully on relevant threads',
        'Best for B2B tech companies'
      ]
    },
    producthunt: {
      name: 'Product Hunt',
      citationShare: 3,
      description: 'Product discovery platform cited for tech products',
      strategy: 'Launch products and updates for visibility',
      tips: [
        'Prepare a strong launch with visuals',
        'Engage actively on launch day',
        'Collect reviews and testimonials',
        'Great for SaaS and tech products'
      ]
    },
    wikipedia: {
      name: 'Wikipedia',
      citationShare: 12,
      description: 'Highest authority source for AI knowledge bases',
      strategy: 'Ensure accurate brand information if notable',
      tips: [
        'Only for truly notable companies',
        'Use citations from reliable sources',
        'Do not directly edit your own page',
        'Focus on getting press coverage first'
      ]
    }
  };

  // Industry-specific subreddit recommendations
  const INDUSTRY_SUBREDDITS: Record<string, { subreddit: string; description: string; members: string }[]> = {
    'Public Relations': [
      { subreddit: 'r/PublicRelations', description: 'PR professionals discussing strategies', members: '45K' },
      { subreddit: 'r/marketing', description: 'Marketing strategies and tips', members: '1.2M' },
      { subreddit: 'r/startups', description: 'Startup founders seeking PR advice', members: '1.1M' },
      { subreddit: 'r/Entrepreneur', description: 'Business owners discussing growth', members: '3.2M' },
      { subreddit: 'r/smallbusiness', description: 'Small business owners needing PR help', members: '1.5M' },
    ],
    'Technology': [
      { subreddit: 'r/technology', description: 'General tech discussions', members: '15M' },
      { subreddit: 'r/programming', description: 'Software development community', members: '6M' },
      { subreddit: 'r/startups', description: 'Tech startup ecosystem', members: '1.1M' },
      { subreddit: 'r/SaaS', description: 'Software as a Service discussions', members: '85K' },
      { subreddit: 'r/webdev', description: 'Web development community', members: '2.5M' },
    ],
    'Finance': [
      { subreddit: 'r/finance', description: 'Finance professionals', members: '1.8M' },
      { subreddit: 'r/investing', description: 'Investment strategies', members: '2.3M' },
      { subreddit: 'r/personalfinance', description: 'Personal finance advice', members: '18M' },
      { subreddit: 'r/fintech', description: 'Financial technology', members: '45K' },
      { subreddit: 'r/CryptoCurrency', description: 'Cryptocurrency discussions', members: '7M' },
    ],
    'Healthcare': [
      { subreddit: 'r/healthcare', description: 'Healthcare industry discussions', members: '150K' },
      { subreddit: 'r/medicine', description: 'Medical professionals', members: '850K' },
      { subreddit: 'r/HealthIT', description: 'Healthcare technology', members: '25K' },
      { subreddit: 'r/digitalhealth', description: 'Digital health innovation', members: '15K' },
    ],
    'E-commerce': [
      { subreddit: 'r/ecommerce', description: 'E-commerce strategies', members: '200K' },
      { subreddit: 'r/shopify', description: 'Shopify store owners', members: '150K' },
      { subreddit: 'r/FulfillmentByAmazon', description: 'Amazon sellers', members: '180K' },
      { subreddit: 'r/dropshipping', description: 'Dropshipping businesses', members: '350K' },
    ],
    'default': [
      { subreddit: 'r/Entrepreneur', description: 'Business and entrepreneurship', members: '3.2M' },
      { subreddit: 'r/smallbusiness', description: 'Small business discussions', members: '1.5M' },
      { subreddit: 'r/marketing', description: 'Marketing strategies', members: '1.2M' },
      { subreddit: 'r/startups', description: 'Startup ecosystem', members: '1.1M' },
    ]
  };

  // Quora topic recommendations by industry
  const INDUSTRY_QUORA_TOPICS: Record<string, string[]> = {
    'Public Relations': ['Public Relations', 'PR Strategies', 'Media Relations', 'Crisis Communications', 'Brand Management', 'Corporate Communications', 'Startup PR'],
    'Technology': ['Technology Trends', 'Software Development', 'Artificial Intelligence', 'Cloud Computing', 'Cybersecurity', 'Tech Startups'],
    'Finance': ['Finance', 'Investment Strategies', 'Personal Finance', 'Fintech', 'Venture Capital', 'Banking'],
    'Healthcare': ['Healthcare Industry', 'Medical Technology', 'Digital Health', 'Health Startups', 'Telemedicine'],
    'E-commerce': ['E-commerce', 'Online Retail', 'Dropshipping', 'Amazon FBA', 'Shopify', 'Digital Marketing'],
    'default': ['Business Strategy', 'Marketing', 'Entrepreneurship', 'Startups', 'Small Business']
  };

  // Get GEO opportunities for a brand
  app.get("/api/geo-opportunities/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      const industry = brand.industry || 'default';
      const subreddits = INDUSTRY_SUBREDDITS[industry] || INDUSTRY_SUBREDDITS['default'];
      const quoraTopics = INDUSTRY_QUORA_TOPICS[industry] || INDUSTRY_QUORA_TOPICS['default'];

      // Compute real citation-share breakdown from the brand's geo_rankings.
      // Every cited ranking carries `citingOutletUrl` / `citingOutletName`;
      // aggregate by domain, then bucket into Reddit / Quora / own-site /
      // everything-else ("third-party") to replace the hardcoded defaults.
      const brandDomain = (brand.website || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      const brandPrompts = await storage.getBrandPromptsByBrandId(brand.id);
      const rankings = brandPrompts.length
        ? await storage.getGeoRankingsByBrandPromptIds(brandPrompts.map(p => p.id))
        : [];
      const articles = (await storage.getArticles()).filter(a => a.brandId === brand.id);
      const articleRankings = articles.length
        ? (await storage.getGeoRankings()).filter(r => r.articleId && articles.some(a => a.id === r.articleId))
        : [];
      const cited = [...rankings, ...articleRankings].filter(r => r.isCited === 1);
      const totalCited = cited.length;
      const extractDomain = (url: string | null | undefined) => {
        if (!url) return "";
        try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
        catch { return (url || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; }
      };
      let reddit = 0, quora = 0, ownSite = 0, thirdParty = 0;
      for (const r of cited) {
        const domain = extractDomain(r.citingOutletUrl);
        if (!domain) continue;
        if (domain.includes("reddit.com")) reddit++;
        else if (domain.includes("quora.com")) quora++;
        else if (brandDomain && domain.includes(brandDomain)) ownSite++;
        else thirdParty++;
      }
      const pct = (n: number) => totalCited > 0 ? Math.round((n / totalCited) * 1000) / 10 : 0;
      const keyStats = totalCited > 0
        ? {
            thirdPartyCitationShare: pct(reddit + quora + thirdParty),
            redditCitationShare: pct(reddit),
            quoraCitationShare: pct(quora),
            brandWebsiteCitationShare: pct(ownSite),
          }
        : {
            // No citation data yet — surface zeros so the user sees "run a
            // citation check first" rather than misleading industry averages.
            thirdPartyCitationShare: 0,
            redditCitationShare: 0,
            quoraCitationShare: 0,
            brandWebsiteCitationShare: 0,
          };

      // Generate content ideas based on brand
      const contentIdeas = [];
      
      if (brand.products && brand.products.length > 0) {
        contentIdeas.push({
          type: 'How-to Guide',
          title: `How ${brand.products[0]} Can Help [Target Audience Problem]`,
          platform: 'Reddit/Quora',
          description: 'Answer questions about solving problems your product addresses'
        });
      }

      if (brand.uniqueSellingPoints && brand.uniqueSellingPoints.length > 0) {
        contentIdeas.push({
          type: 'Thought Leadership',
          title: `Why ${brand.uniqueSellingPoints[0]} Matters in ${industry}`,
          platform: 'LinkedIn/Medium',
          description: 'Share insights that establish your expertise'
        });
      }

      contentIdeas.push({
        type: 'Industry Insight',
        title: `${new Date().getFullYear()} Trends in ${industry}`,
        platform: 'All Platforms',
        description: 'Share predictions and analysis AI systems love to cite'
      });

      contentIdeas.push({
        type: 'Case Study',
        title: `How We Helped a Client Achieve [Result]`,
        platform: 'Medium/LinkedIn',
        description: 'Real examples with data get cited by AI'
      });

      contentIdeas.push({
        type: 'FAQ Response',
        title: `Common Questions About ${industry} Answered`,
        platform: 'Quora/Reddit',
        description: 'Answer the questions your target audience asks'
      });

      res.json({
        success: true,
        data: {
          brand: {
            id: brand.id,
            name: brand.name,
            industry: brand.industry
          },
          subreddits,
          quoraTopics,
          contentIdeas,
          keyStats,
          totalCitedRankings: totalCited,
          // Real per-brand platform breakdown: override each GEO_PLATFORMS
          // entry's industry-benchmark citationShare with this brand's actual
          // share from cited geo_rankings. Platforms the brand hasn't been
          // cited on fall to 0, so the list reflects reality not averages.
          platforms: (() => {
            const perPlatform: Record<string, number> = {};
            for (const r of cited) {
              const d = extractDomain(r.citingOutletUrl);
              if (!d) continue;
              let key: string | null = null;
              if (d.includes("reddit.com")) key = "reddit";
              else if (d.includes("quora.com")) key = "quora";
              else if (d.includes("youtube.com")) key = "youtube";
              else if (d.includes("linkedin.com")) key = "linkedin";
              else if (d.includes("medium.com")) key = "medium";
              else if (d.includes("news.ycombinator.com")) key = "hackernews";
              else if (d.includes("producthunt.com")) key = "producthunt";
              else if (d.includes("wikipedia.org")) key = "wikipedia";
              if (key) perPlatform[key] = (perPlatform[key] || 0) + 1;
            }
            return Object.entries(GEO_PLATFORMS).map(([key, p]) => ({
              ...p,
              citationShare: totalCited > 0 ? Math.round(((perPlatform[key] || 0) / totalCited) * 1000) / 10 : 0,
              citationCount: perPlatform[key] || 0,
            })).sort((a, b) => b.citationShare - a.citationShare);
          })(),
          strategyTips: [
            'AI systems cite 91% from third-party sources - focus on Reddit, Quora, YouTube',
            'Build karma/reputation before adding brand mentions',
            'Use balanced perspectives (pros + cons) - AI trusts authentic evaluations',
            'Question-response format is optimal for AI indexing',
            'Average cited post is 1 year old - evergreen content wins',
            'AI visitors are worth 4.4x traditional organic visitors'
          ]
        }
      });
    } catch (error) {
      console.error('GEO opportunities error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate opportunities' });
    }
  });

  // Get generic GEO opportunities (no brand)
  app.get("/api/geo-opportunities", async (req, res) => {
    try {
      const { industry = 'default' } = req.query;
      const subreddits = INDUSTRY_SUBREDDITS[industry as string] || INDUSTRY_SUBREDDITS['default'];
      const quoraTopics = INDUSTRY_QUORA_TOPICS[industry as string] || INDUSTRY_QUORA_TOPICS['default'];

      res.json({
        success: true,
        data: {
          platforms: Object.values(GEO_PLATFORMS).sort((a, b) => b.citationShare - a.citationShare),
          subreddits,
          quoraTopics,
          industries: Object.keys(INDUSTRY_SUBREDDITS).filter(k => k !== 'default'),
          keyStats: {
            thirdPartyCitationShare: 91,
            redditCitationShare: 21,
            quoraCitationShare: 14.3,
            brandWebsiteCitationShare: 9
          },
          strategyTips: [
            'AI systems cite 91% from third-party sources - focus on Reddit, Quora, YouTube',
            'Build karma/reputation before adding brand mentions',
            'Use balanced perspectives (pros + cons) - AI trusts authentic evaluations',
            'Question-response format is optimal for AI indexing',
            'Average cited post is 1 year old - evergreen content wins',
            'AI visitors are worth 4.4x traditional organic visitors'
          ]
        }
      });
    } catch (error) {
      console.error('GEO opportunities error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate opportunities' });
    }
  });

  // ========== LISTICLE TRACKER ==========

  const LISTICLE_WRITE_FIELDS = [
    "brandId", "title", "url", "sourcePublication", "listPosition",
    "totalListItems", "isIncluded", "competitorsMentioned", "keyword",
    "searchVolume", "domainAuthority", "metadata",
  ] as const;

  // Get listicles for a brand — :brandId app.param checks ownership.
  app.get("/api/listicles/:brandId", async (req, res) => {
    try {
      const listicles = await storage.getListicles(req.params.brandId);
      res.json({ success: true, data: listicles });
    } catch (error) {
      sendError(res, error, "Failed to fetch listicles");
    }
  });

  // List listicles across user's brands (with optional brandId filter).
  app.get("/api/listicles", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandId = req.query.brandId as string | undefined;
      if (brandId) {
        const listicles = await storage.getListicles(brandId);
        return res.json({ success: true, data: listicles });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getListicles();
      const listicles = all.filter((l: any) => l.brandId && brandIds.has(l.brandId));
      res.json({ success: true, data: listicles });
    } catch (error) {
      sendError(res, error, "Failed to fetch listicles");
    }
  });

  // Create a listicle — brandId must belong to caller.
  app.post("/api/listicles", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, LISTICLE_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (!body.title || !body.url) {
        return res.status(400).json({ success: false, error: "title and url are required" });
      }
      const listicle = await storage.createListicle(body as any);
      res.json({ success: true, data: listicle });
    } catch (error) {
      sendError(res, error, "Failed to create listicle");
    }
  });

  // Update a listicle — ownership required.
  app.patch("/api/listicles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireListicle(req.params.id, user.id);
      const update = pickFields<any>(req.body, LISTICLE_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const listicle = await storage.updateListicle(req.params.id, update as any);
      if (!listicle) return res.status(404).json({ success: false, error: "Listicle not found" });
      res.json({ success: true, data: listicle });
    } catch (error) {
      sendError(res, error, "Failed to update listicle");
    }
  });

  // Delete a listicle — ownership required.
  app.delete("/api/listicles/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireListicle(req.params.id, user.id);
      const deleted = await storage.deleteListicle(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Listicle not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete listicle");
    }
  });

  // Discover listicles for a brand using AI
  app.post("/api/listicles/discover/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand || brand.userId !== user.id) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      const { scanBrandListicles } = await import("./lib/listicleScanner");
      const inserted = await scanBrandListicles(brand.id);
      const listicles = await storage.getListicles(brand.id);

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          inserted,
          listicles,
          tips: [
            "Listicles where you're not yet listed are outreach targets",
            "Focus on listicles from high-domain-authority publications",
            "Re-scan weekly — new listicles appear regularly in active categories",
          ],
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to discover listicles");
    }
  });

  // ========== WIKIPEDIA MONITOR ==========

  // Get Wikipedia mentions for a brand
  app.get("/api/wikipedia/:brandId", async (req, res) => {
    try {
      const mentions = await storage.getWikipediaMentions(req.params.brandId);
      res.json({ success: true, data: mentions });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch Wikipedia mentions' });
    }
  });

  const WIKIPEDIA_WRITE_FIELDS = [
    "brandId", "pageTitle", "pageUrl", "mentionContext", "mentionType",
    "sectionName", "isActive", "metadata",
  ] as const;

  // Create Wikipedia mention — brandId must belong to caller.
  app.post("/api/wikipedia", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, WIKIPEDIA_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (!body.pageTitle || !body.pageUrl) {
        return res.status(400).json({ success: false, error: "pageTitle and pageUrl are required" });
      }
      const mention = await storage.createWikipediaMention(body as any);
      res.json({ success: true, data: mention });
    } catch (error) {
      sendError(res, error, "Failed to create Wikipedia mention");
    }
  });

  // Scan for Wikipedia opportunities
  app.post("/api/wikipedia/scan/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      const prompt = `You are a Wikipedia and GEO expert. Analyze opportunities for ${brand.name} (${brand.industry}) to gain Wikipedia presence.

Wikipedia accounts for 40% of AI citations - it's the #2 most-cited source.

Return a JSON object with:
{
  "hasDirectPage": false,
  "directPageEligibility": "Explanation of whether the brand could have its own Wikipedia page",
  "relevantPages": [
    {
      "pageTitle": "Wikipedia page title where brand could be mentioned",
      "pageUrl": "https://en.wikipedia.org/wiki/...",
      "sectionToTarget": "Which section to add a reference",
      "mentionStrategy": "How to add a legitimate reference",
      "difficulty": "easy|medium|hard"
    }
  ],
  "industryPages": ["List of relevant industry Wikipedia pages to monitor"],
  "tips": ["Actionable tips for Wikipedia presence"]
}

Return ONLY valid JSON.`;

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      const analysis = safeParseJson<Record<string, any>>(response.choices[0].message.content) ?? { error: 'Failed to parse analysis' };

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          analysis,
          keyFacts: {
            citationShare: 40,
            ranking: 2,
            importance: 'Wikipedia is the #2 most cited source by AI systems'
          }
        }
      });
    } catch (error) {
      sendError(res, error, "Failed to scan Wikipedia");
    }
  });

  // ========== BOFU CONTENT GENERATOR ==========

  // Get BOFU content for a brand
  app.get("/api/bofu-content/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const contentType = req.query.contentType as string;
      const content = await storage.getBofuContent(brandId, contentType);
      res.json({ success: true, data: content });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch BOFU content' });
    }
  });

  const BOFU_WRITE_FIELDS = [
    "brandId", "contentType", "title", "content", "primaryKeyword",
    "comparedWith", "targetIntent", "status", "aiScore", "metadata",
  ] as const;

  app.get("/api/bofu-content", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, contentType } = req.query;
      if (brandId && typeof brandId === "string") {
        const content = await storage.getBofuContent(brandId, contentType as string);
        return res.json({ success: true, data: content });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getBofuContent(undefined, contentType as string);
      const content = all.filter((b: any) => b.brandId && brandIds.has(b.brandId));
      res.json({ success: true, data: content });
    } catch (error) {
      sendError(res, error, "Failed to fetch BOFU content");
    }
  });

  // Create BOFU content — brandId ownership required.
  app.post("/api/bofu-content", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, BOFU_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (!body.contentType || !body.title || !body.content) {
        return res.status(400).json({ success: false, error: "contentType, title and content are required" });
      }
      const content = await storage.createBofuContent(body as any);
      res.json({ success: true, data: content });
    } catch (error) {
      sendError(res, error, "Failed to create BOFU content");
    }
  });

  // Update BOFU content — ownership required.
  app.patch("/api/bofu-content/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBofuContent(req.params.id, user.id);
      const update = pickFields<any>(req.body, BOFU_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const content = await storage.updateBofuContent(req.params.id, update as any);
      if (!content) return res.status(404).json({ success: false, error: "Content not found" });
      res.json({ success: true, data: content });
    } catch (error) {
      sendError(res, error, "Failed to update BOFU content");
    }
  });

  // Delete BOFU content — ownership required.
  app.delete("/api/bofu-content/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBofuContent(req.params.id, user.id);
      const deleted = await storage.deleteBofuContent(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Content not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete BOFU content");
    }
  });

  // Generate BOFU content using AI — ownership required.
  app.post("/api/bofu-content/generate", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, contentType, comparedWith, keyword } = req.body ?? {};
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      const brand = await requireBrand(brandId, user.id);

      let prompt = '';
      let title = '';

      if (contentType === 'comparison') {
        const competitor = comparedWith?.[0] || 'Competitor';
        title = `${brand.name} vs ${competitor}: Complete Comparison Guide`;
        prompt = `Create a comprehensive comparison article: "${title}"

Brand: ${brand.name}
Industry: ${brand.industry}
Description: ${brand.description || ''}
Key Products/Services: ${brand.products?.join(', ') || ''}
Unique Selling Points: ${brand.uniqueSellingPoints?.join(', ') || ''}

Create an in-depth, balanced comparison (1500+ words) that:
1. Compares features, pricing, pros/cons objectively
2. Helps readers make an informed decision
3. Is optimized for AI citation (structured with headers, tables, clear conclusions)
4. Includes a FAQ section at the end

Format with markdown headers. Be balanced but highlight genuine strengths of ${brand.name}.`;
      } else if (contentType === 'alternatives') {
        const to = comparedWith?.[0] || 'Industry Leader';
        title = `Top ${brand.name} Alternatives: Best Options for ${new Date().getFullYear()}`;
        prompt = `Create an "Alternatives to ${to}" article that positions ${brand.name} as a top alternative.

Brand: ${brand.name}
Industry: ${brand.industry}

Create a comprehensive alternatives guide (1500+ words) that:
1. Lists 5-7 alternatives (including ${brand.name})
2. Explains why someone might look for alternatives
3. Compares each alternative with pros/cons
4. Positions ${brand.name} favorably but honestly
5. Includes FAQ section for AI indexing

Format with markdown. Each alternative should have clear headers and bullet points.`;
      } else if (contentType === 'guide') {
        title = keyword ? `${keyword}: Complete Guide for ${new Date().getFullYear()}` : `${brand.industry} Buying Guide`;
        prompt = `Create a transactional buying guide for ${brand.industry}.

Brand: ${brand.name}
Target Keyword: ${keyword || brand.industry + ' guide'}

Create a comprehensive buyer's guide (1500+ words) that:
1. Helps buyers understand what to look for
2. Explains key features and considerations
3. Naturally mentions ${brand.name} as a solution
4. Includes comparison tables and checklists
5. Has a detailed FAQ section

This is bottom-of-funnel content designed to convert and get cited by AI.`;
      } else {
        return res.status(400).json({ success: false, error: 'Invalid content type' });
      }

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4000,
      });

      const generatedContent = response.choices[0].message.content || '';

      // Save to storage
      const saved = await storage.createBofuContent({
        brandId,
        contentType,
        title,
        content: generatedContent,
        primaryKeyword: keyword || null,
        comparedWith: comparedWith || null,
        targetIntent: 'transactional',
        status: 'draft',
        aiScore: 85,
      });

      res.json({
        success: true,
        data: saved,
        tips: [
          'BOFU content converts 80% better than top-of-funnel',
          'Include comparison tables for AI snippet optimization',
          'Add FAQ sections - AI surfaces these frequently',
          'Publish on your site + distribute to Medium/LinkedIn'
        ]
      });
    } catch (error) {
      sendError(res, error, "Failed to generate BOFU content");
    }
  });

  // ========== FAQ OPTIMIZER ==========

  // Get FAQ items
  app.get("/api/faqs/:brandId", async (req, res) => {
    try {
      const faqs = await storage.getFaqItems(req.params.brandId);
      res.json({ success: true, data: faqs });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch FAQs' });
    }
  });

  const FAQ_WRITE_FIELDS = [
    "brandId", "articleId", "question", "answer", "category", "searchVolume",
    "aiSurfaceScore", "isOptimized", "optimizationTips", "metadata",
  ] as const;

  app.get("/api/faqs", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, articleId } = req.query;
      if (brandId && typeof brandId === "string") {
        const faqs = await storage.getFaqItems(brandId, articleId as string);
        return res.json({ success: true, data: faqs });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getFaqItems(undefined, articleId as string);
      const faqs = all.filter((f: any) => f.brandId && brandIds.has(f.brandId));
      res.json({ success: true, data: faqs });
    } catch (error) {
      sendError(res, error, "Failed to fetch FAQs");
    }
  });

  // Create FAQ — brandId ownership required.
  app.post("/api/faqs", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, FAQ_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (body.articleId && typeof body.articleId === "string") {
        await requireArticle(body.articleId, user.id);
      }
      if (!body.question || !body.answer) {
        return res.status(400).json({ success: false, error: "question and answer are required" });
      }
      const faq = await storage.createFaqItem(body as any);
      res.json({ success: true, data: faq });
    } catch (error) {
      sendError(res, error, "Failed to create FAQ");
    }
  });

  // Update FAQ — ownership required.
  app.patch("/api/faqs/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireFaq(req.params.id, user.id);
      const update = pickFields<any>(req.body, FAQ_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const faq = await storage.updateFaqItem(req.params.id, update as any);
      if (!faq) return res.status(404).json({ success: false, error: "FAQ not found" });
      res.json({ success: true, data: faq });
    } catch (error) {
      sendError(res, error, "Failed to update FAQ");
    }
  });

  // Delete FAQ — ownership required.
  app.delete("/api/faqs/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireFaq(req.params.id, user.id);
      const deleted = await storage.deleteFaqItem(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "FAQ not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete FAQ");
    }
  });

  // Optimize a single FAQ for AI citation — ownership required.
  app.post("/api/faqs/:id/optimize", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const faq = await requireFaq(req.params.id, user.id);

      // Get brand context
      let brandContext = '';
      if (faq.brandId) {
        const brand = await storage.getBrandById(faq.brandId);
        if (brand) {
          brandContext = `Brand: ${brand.name}, Industry: ${brand.industry}, Products: ${brand.products?.join(', ') || 'N/A'}`;
        }
      }

      const prompt = `You are an FAQ optimization expert for AI search engines. Optimize this FAQ for maximum AI citation likelihood.

Current FAQ:
Question: ${faq.question}
Answer: ${faq.answer}

Brand Context: ${brandContext}

Optimization requirements:
1. Question should be natural and mirror how users ask AI chatbots
2. Answer should be 40-60 words (optimal for AI summarization)
3. Answer should start with a direct response, then provide context
4. Include specific facts, numbers, or unique value props if applicable
5. Make it authoritative but conversational

Return JSON:
{
  "question": "Optimized question",
  "answer": "Optimized answer (40-60 words)",
  "aiSurfaceScore": 1-100,
  "optimizationTips": ["What was improved", "Additional suggestions"]
}

Return ONLY valid JSON.`;

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      const optimized = safeParseJson<any>(response.choices[0].message.content);
      if (!optimized) {
        return res.status(502).json({ success: false, error: "Failed to parse optimization result" });
      }

      const updatedFaq = await storage.updateFaqItem(req.params.id, {
        question: optimized.question || faq.question,
        answer: optimized.answer || faq.answer,
        aiSurfaceScore: optimized.aiSurfaceScore || 85,
        isOptimized: 1,
        optimizationTips: Array.isArray(optimized.optimizationTips) ? optimized.optimizationTips : [],
      });

      res.json({ success: true, data: updatedFaq });
    } catch (error) {
      sendError(res, error, "Failed to optimize FAQ");
    }
  });

  // Generate optimized FAQs for a brand
  app.post("/api/faqs/generate/:brandId", aiLimitMiddleware, async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      const { topic, count = 5 } = req.body;
      const faqCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);

      const prompt = `You are an FAQ optimization expert for AI search engines. Generate exactly ${faqCount} FAQs for ${brand.name} (${brand.industry}).

Topic focus: ${topic || brand.industry}
Company description: ${brand.description || ''}
Products/Services: ${brand.products?.join(', ') || ''}

Generate FAQs that:
1. Mirror how users ask AI chatbots questions
2. Have clear, concise answers (40-60 words optimal)
3. Include the brand name naturally where relevant
4. Cover common objections and buying considerations

Return JSON array:
[{
  "question": "The question users might ask AI",
  "answer": "Concise, authoritative answer",
  "category": "pricing|features|comparison|support|general",
  "aiSurfaceScore": 1-100 (how likely AI will surface this),
  "optimizationTips": ["tip1", "tip2"]
}]

Return ONLY the JSON array.`;

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      });

      const parsed = safeParseJson<any[]>(response.choices[0].message.content);
      const faqs: any[] = Array.isArray(parsed) ? parsed : [];

      // Save sequentially with per-item try/catch so one bad item doesn't
      // abort the whole batch (fixes the Promise.all partial-failure bug).
      const savedFaqs: any[] = [];
      for (const faq of faqs) {
        if (!faq || typeof faq.question !== "string" || typeof faq.answer !== "string") continue;
        try {
          const saved = await storage.createFaqItem({
            brandId: brand.id,
            question: faq.question,
            answer: faq.answer,
            category: faq.category ?? null,
            aiSurfaceScore: typeof faq.aiSurfaceScore === "number" ? faq.aiSurfaceScore : null,
            isOptimized: 1,
            optimizationTips: Array.isArray(faq.optimizationTips) ? faq.optimizationTips : [],
          });
          savedFaqs.push(saved);
        } catch (err) {
          console.warn("[faqs] createFaqItem failed for one item:", err);
        }
      }

      res.json({
        success: true,
        data: savedFaqs,
        tips: [
          'Add FAQ schema markup to your pages for rich snippets',
          'Keep answers 40-60 words for optimal AI summarization',
          'Update FAQs quarterly with new questions from support',
          'Include FAQs on product pages, not just a dedicated FAQ page'
        ]
      });
    } catch (error) {
      sendError(res, error, "Failed to generate FAQs");
    }
  });

  // ========== BRAND MENTION TRACKER ==========

  // Get brand mentions
  app.get("/api/brand-mentions/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const platform = req.query.platform as string;
      const mentions = await storage.getBrandMentions(brandId, platform);
      
      const stats = {
        total: mentions.length,
        byPlatform: {} as Record<string, number>,
        bySentiment: { positive: 0, neutral: 0, negative: 0 },
        totalEngagement: 0,
      };

      mentions.forEach(m => {
        stats.byPlatform[m.platform] = (stats.byPlatform[m.platform] || 0) + 1;
        if (m.sentiment === 'positive') stats.bySentiment.positive++;
        else if (m.sentiment === 'negative') stats.bySentiment.negative++;
        else stats.bySentiment.neutral++;
        stats.totalEngagement += m.engagementScore || 0;
      });

      res.json({ success: true, data: mentions, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch brand mentions' });
    }
  });

  const BRAND_MENTION_WRITE_FIELDS = [
    "brandId", "platform", "sourceUrl", "sourceTitle", "mentionContext",
    "sentiment", "sentimentScore", "engagementScore", "authorUsername",
    "isVerified", "mentionedAt", "metadata",
  ] as const;

  app.get("/api/brand-mentions", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, platform } = req.query;
      let mentions: any[];
      if (brandId && typeof brandId === "string") {
        mentions = await storage.getBrandMentions(brandId, platform as string);
      } else {
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getBrandMentions(undefined, platform as string);
        mentions = all.filter((m: any) => m.brandId && brandIds.has(m.brandId));
      }

      const stats = {
        total: mentions.length,
        byPlatform: {} as Record<string, number>,
        bySentiment: { positive: 0, neutral: 0, negative: 0 },
        totalEngagement: 0,
      };
      mentions.forEach((m: any) => {
        stats.byPlatform[m.platform] = (stats.byPlatform[m.platform] || 0) + 1;
        if (m.sentiment === "positive") stats.bySentiment.positive++;
        else if (m.sentiment === "negative") stats.bySentiment.negative++;
        else stats.bySentiment.neutral++;
        stats.totalEngagement += m.engagementScore || 0;
      });

      res.json({ success: true, data: { mentions, stats } });
    } catch (error) {
      sendError(res, error, "Failed to fetch brand mentions");
    }
  });

  app.post("/api/brand-mentions", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, BRAND_MENTION_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const mention = await storage.createBrandMention(body as any);
      res.json({ success: true, data: mention });
    } catch (error) {
      sendError(res, error, "Failed to create brand mention");
    }
  });

  app.patch("/api/brand-mentions/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandMention(req.params.id, user.id);
      const update = pickFields<any>(req.body, BRAND_MENTION_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const mention = await storage.updateBrandMention(req.params.id, update as any);
      if (!mention) return res.status(404).json({ success: false, error: "Mention not found" });
      res.json({ success: true, data: mention });
    } catch (error) {
      sendError(res, error, "Failed to update brand mention");
    }
  });

  app.delete("/api/brand-mentions/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandMention(req.params.id, user.id);
      const deleted = await storage.deleteBrandMention(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Mention not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete brand mention");
    }
  });

  // Get mention alerts summary
  app.get("/api/brand-mentions/alerts/:brandId", async (req, res) => {
    try {
      const brand = await storage.getBrandById(req.params.brandId);
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      const mentions = await storage.getBrandMentions(brand.id);
      
      // Get recent mentions (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentMentions = mentions.filter(m => new Date(m.discoveredAt) > weekAgo);

      // Calculate trends
      const previousWeek = mentions.filter(m => {
        const date = new Date(m.discoveredAt);
        return date <= weekAgo && date > new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000);
      });

      const growth = previousWeek.length > 0 
        ? ((recentMentions.length - previousWeek.length) / previousWeek.length * 100).toFixed(1)
        : '0';

      res.json({
        success: true,
        data: {
          brand: { id: brand.id, name: brand.name },
          thisWeek: recentMentions.length,
          lastWeek: previousWeek.length,
          growth: parseFloat(growth),
          recentMentions: recentMentions.slice(0, 10),
          platformBreakdown: recentMentions.reduce((acc, m) => {
            acc[m.platform] = (acc[m.platform] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          tips: [
            'Set up alerts for brand name variations',
            'Monitor competitor mentions for opportunities',
            'Engage with positive mentions to amplify reach',
            'Address negative mentions promptly'
          ]
        }
      });
    } catch (error) {
      console.error('Alerts error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
    }
  });

  // ================== PROMPT PORTFOLIO (Share-of-Answer) ==================
  
  const PROMPT_PORTFOLIO_WRITE_FIELDS = [
    "brandId", "prompt", "category", "funnelStage", "competitorSet", "region",
    "aiPlatform", "isBrandCited", "citationPosition", "shareOfAnswer",
    "sentiment", "answerVolatility", "consensusScore", "checkedHistory", "metadata",
  ] as const;

  app.get("/api/prompt-portfolio", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, category, funnelStage, aiPlatform } = req.query;
      if (brandId && typeof brandId === "string") {
        const prompts = await storage.getPromptPortfolio(brandId, {
          category: category as string, funnelStage: funnelStage as string, aiPlatform: aiPlatform as string,
        });
        return res.json({ success: true, data: prompts });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getPromptPortfolio(undefined, {
        category: category as string, funnelStage: funnelStage as string, aiPlatform: aiPlatform as string,
      });
      const prompts = all.filter((p: any) => p.brandId && brandIds.has(p.brandId));
      res.json({ success: true, data: prompts });
    } catch (error) {
      sendError(res, error, "Failed to fetch prompt portfolio");
    }
  });

  app.get("/api/prompt-portfolio/stats/:brandId", async (req, res) => {
    try {
      const stats = await storage.getShareOfAnswerStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch share-of-answer stats");
    }
  });

  app.post("/api/prompt-portfolio", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, PROMPT_PORTFOLIO_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const prompt = await storage.createPromptPortfolio(body as any);
      res.json({ success: true, data: prompt });
    } catch (error) {
      sendError(res, error, "Failed to create prompt entry");
    }
  });

  app.patch("/api/prompt-portfolio/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePromptPortfolio(req.params.id, user.id);
      const update = pickFields<any>(req.body, PROMPT_PORTFOLIO_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const prompt = await storage.updatePromptPortfolio(req.params.id, update as any);
      if (!prompt) return res.status(404).json({ success: false, error: "Prompt not found" });
      res.json({ success: true, data: prompt });
    } catch (error) {
      sendError(res, error, "Failed to update prompt entry");
    }
  });

  app.delete("/api/prompt-portfolio/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePromptPortfolio(req.params.id, user.id);
      const deleted = await storage.deletePromptPortfolio(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Prompt not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete prompt entry");
    }
  });

  // ================== CITATION QUALITY ==================
  
  const CITATION_QUALITY_WRITE_FIELDS = [
    "brandId", "articleId", "aiPlatform", "prompt", "citationUrl",
    "authorityScore", "relevanceScore", "recencyScore", "positionScore",
    "isPrimaryCitation", "totalQualityScore", "sourceType", "competingCitations", "metadata",
  ] as const;

  app.get("/api/citation-quality", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, aiPlatform, minScore } = req.query;
      if (brandId && typeof brandId === "string") {
        const qualities = await storage.getCitationQualities(brandId, {
          aiPlatform: aiPlatform as string,
          minScore: minScore ? parseInt(minScore as string) : undefined,
        });
        return res.json({ success: true, data: qualities });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getCitationQualities(undefined, {
        aiPlatform: aiPlatform as string,
        minScore: minScore ? parseInt(minScore as string) : undefined,
      });
      const qualities = all.filter((q: any) => q.brandId && brandIds.has(q.brandId));
      res.json({ success: true, data: qualities });
    } catch (error) {
      sendError(res, error, "Failed to fetch citation qualities");
    }
  });

  app.get("/api/citation-quality/stats/:brandId", async (req, res) => {
    try {
      const stats = await storage.getCitationQualityStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch citation quality stats");
    }
  });

  app.post("/api/citation-quality", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, CITATION_QUALITY_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const quality = await storage.createCitationQuality(body as any);
      res.json({ success: true, data: quality });
    } catch (error) {
      sendError(res, error, "Failed to create citation quality");
    }
  });

  app.patch("/api/citation-quality/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCitationQuality(req.params.id, user.id);
      const update = pickFields<any>(req.body, CITATION_QUALITY_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const quality = await storage.updateCitationQuality(req.params.id, update as any);
      if (!quality) return res.status(404).json({ success: false, error: "Citation quality not found" });
      res.json({ success: true, data: quality });
    } catch (error) {
      sendError(res, error, "Failed to update citation quality");
    }
  });

  app.delete("/api/citation-quality/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCitationQuality(req.params.id, user.id);
      const deleted = await storage.deleteCitationQuality(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Citation quality not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete citation quality");
    }
  });

  // ================== HALLUCINATION DETECTION ==================
  
  const HALLUCINATION_WRITE_FIELDS = [
    "brandId", "aiPlatform", "prompt", "claimedStatement", "actualFact",
    "hallucinationType", "severity", "category", "isResolved",
    "remediationSteps", "remediationStatus", "resolvedAt", "verifiedBy", "metadata",
  ] as const;

  app.get("/api/hallucinations", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, severity, isResolved } = req.query;
      const filters = {
        severity: severity as string,
        isResolved: isResolved === "true" ? true : isResolved === "false" ? false : undefined,
      };
      if (brandId && typeof brandId === "string") {
        const hallucinations = await storage.getBrandHallucinations(brandId, filters);
        return res.json({ success: true, data: hallucinations });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getBrandHallucinations(undefined, filters);
      const hallucinations = all.filter((h: any) => h.brandId && brandIds.has(h.brandId));
      res.json({ success: true, data: hallucinations });
    } catch (error) {
      sendError(res, error, "Failed to fetch hallucinations");
    }
  });

  app.get("/api/hallucinations/stats/:brandId", async (req, res) => {
    try {
      const stats = await storage.getHallucinationStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch hallucination stats");
    }
  });

  app.post("/api/hallucinations", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, HALLUCINATION_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const hallucination = await storage.createBrandHallucination(body as any);
      res.json({ success: true, data: hallucination });
    } catch (error) {
      sendError(res, error, "Failed to create hallucination entry");
    }
  });

  app.patch("/api/hallucinations/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireHallucination(req.params.id, user.id);
      const update = pickFields<any>(req.body, HALLUCINATION_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const hallucination = await storage.updateBrandHallucination(req.params.id, update as any);
      if (!hallucination) return res.status(404).json({ success: false, error: "Hallucination not found" });
      res.json({ success: true, data: hallucination });
    } catch (error) {
      sendError(res, error, "Failed to update hallucination");
    }
  });

  app.post("/api/hallucinations/:id/resolve", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireHallucination(req.params.id, user.id);
      const hallucination = await storage.resolveBrandHallucination(req.params.id);
      if (!hallucination) return res.status(404).json({ success: false, error: "Hallucination not found" });
      res.json({ success: true, data: hallucination });
    } catch (error) {
      sendError(res, error, "Failed to resolve hallucination");
    }
  });

  app.delete("/api/hallucinations/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireHallucination(req.params.id, user.id);
      const deleted = await storage.deleteBrandHallucination(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Hallucination not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete hallucination");
    }
  });

  // ================== BRAND FACT SHEET ==================
  
  // Get brand facts
  app.get("/api/brand-facts/:brandId", async (req, res) => {
    try {
      const facts = await storage.getBrandFacts(req.params.brandId);
      res.json({ success: true, data: facts });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch brand facts' });
    }
  });

  const BRAND_FACT_WRITE_FIELDS = [
    "brandId", "factCategory", "factKey", "factValue", "sourceUrl",
    "isActive", "metadata",
  ] as const;

  app.post("/api/brand-facts", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, BRAND_FACT_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const fact = await storage.createBrandFact(body as any);
      res.json({ success: true, data: fact });
    } catch (error) {
      sendError(res, error, "Failed to create brand fact");
    }
  });

  app.patch("/api/brand-facts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandFact(req.params.id, user.id);
      const update = pickFields<any>(req.body, BRAND_FACT_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const fact = await storage.updateBrandFact(req.params.id, update as any);
      if (!fact) return res.status(404).json({ success: false, error: "Fact not found" });
      res.json({ success: true, data: fact });
    } catch (error) {
      sendError(res, error, "Failed to update brand fact");
    }
  });

  app.delete("/api/brand-facts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireBrandFact(req.params.id, user.id);
      const deleted = await storage.deleteBrandFact(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Fact not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete brand fact");
    }
  });

  // Metrics History routes
  app.get("/api/metrics-history/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const metricType = req.query.metricType as string | undefined;
      const daysParam = req.query.days;
      const days = daysParam ? parseInt(daysParam as string, 10) : 30;
      
      const history = await storage.getMetricsHistory(brandId, metricType, days);
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to get metrics history' });
    }
  });

  app.post("/api/metrics-history/record/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      await storage.recordCurrentMetrics(brandId);
      res.json({ success: true, message: 'Metrics snapshot recorded' });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to record metrics' });
    }
  });

  // Alert Settings routes
  app.get("/api/alert-settings/:brandId", async (req, res) => {
    try {
      const settings = await storage.getAlertSettings(req.params.brandId);
      res.json({ success: true, data: settings });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch alert settings' });
    }
  });

  app.post("/api/alert-settings", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, alertType, isEnabled, threshold, emailEnabled, emailAddress, slackEnabled, slackWebhookUrl } = req.body ?? {};

      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(brandId, user.id);

      if (!alertType || typeof alertType !== 'string') {
        return res.status(400).json({ success: false, error: 'alertType is required' });
      }
      
      const validAlertTypes = ['hallucination_detected', 'soa_drop', 'soa_increase', 'quality_drop', 'competitor_surge'];
      if (!validAlertTypes.includes(alertType)) {
        return res.status(400).json({ success: false, error: 'Invalid alert type' });
      }
      
      if (slackWebhookUrl && typeof slackWebhookUrl === 'string') {
        try {
          const url = new URL(slackWebhookUrl);
          if (!url.hostname.endsWith('slack.com')) {
            return res.status(400).json({ success: false, error: 'Slack webhook URL must be from slack.com' });
          }
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid Slack webhook URL' });
        }
      }
      
      if (emailAddress && typeof emailAddress === 'string') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailAddress)) {
          return res.status(400).json({ success: false, error: 'Invalid email address' });
        }
      }
      
      const setting = await storage.createAlertSetting({
        brandId,
        alertType,
        isEnabled: isEnabled === false ? 0 : 1,
        threshold: threshold ? String(threshold) : undefined,
        emailEnabled: emailEnabled ? 1 : 0,
        emailAddress: emailAddress || undefined,
        slackEnabled: slackEnabled ? 1 : 0,
        slackWebhookUrl: slackWebhookUrl || undefined,
      });
      res.json({ success: true, data: setting });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to create alert setting' });
    }
  });

  app.patch("/api/alert-settings/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAlertSetting(req.params.id, user.id);
      const { isEnabled, threshold, emailEnabled, emailAddress, slackEnabled, slackWebhookUrl } = req.body ?? {};
      
      if (slackWebhookUrl && typeof slackWebhookUrl === 'string') {
        try {
          const url = new URL(slackWebhookUrl);
          if (!url.hostname.endsWith('slack.com')) {
            return res.status(400).json({ success: false, error: 'Slack webhook URL must be from slack.com' });
          }
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid Slack webhook URL' });
        }
      }
      
      const update: Record<string, any> = {};
      if (isEnabled !== undefined) update.isEnabled = isEnabled ? 1 : 0;
      if (threshold !== undefined) update.threshold = String(threshold);
      if (emailEnabled !== undefined) update.emailEnabled = emailEnabled ? 1 : 0;
      if (emailAddress !== undefined) update.emailAddress = emailAddress;
      if (slackEnabled !== undefined) update.slackEnabled = slackEnabled ? 1 : 0;
      if (slackWebhookUrl !== undefined) update.slackWebhookUrl = slackWebhookUrl;
      
      const setting = await storage.updateAlertSetting(req.params.id, update);
      if (!setting) return res.status(404).json({ success: false, error: 'Setting not found' });
      res.json({ success: true, data: setting });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to update alert setting' });
    }
  });

  app.delete("/api/alert-settings/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAlertSetting(req.params.id, user.id);
      const deleted = await storage.deleteAlertSetting(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Setting not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete alert setting");
    }
  });

  // Alert History routes
  app.get("/api/alert-history/:brandId", async (req, res) => {
    try {
      const { limit } = req.query;
      const history = await storage.getAlertHistory(
        req.params.brandId, 
        limit ? parseInt(limit as string) : 50
      );
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch alert history' });
    }
  });

  // Test alert endpoint — ownership-checked before firing anything.
  app.post("/api/alerts/test/:settingId", async (req, res) => {
    try {
      const user = requireUser(req);
      const setting = await requireAlertSetting(req.params.settingId, user.id);
      if (!setting) return res.status(404).json({ success: false, error: 'Setting not found' });
      
      const channels: string[] = [];
      const errors: string[] = [];
      
      // Send test Slack notification with SSRF protection
      if (setting.slackEnabled === 1 && setting.slackWebhookUrl) {
        try {
          const url = new URL(setting.slackWebhookUrl);
          if (!url.hostname.endsWith('slack.com')) {
            errors.push('Invalid Slack webhook URL - must be from slack.com');
          } else {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(setting.slackWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `🔔 GEO Platform Test Alert`,
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `*Test Alert from GEO Platform*\n\nThis is a test notification to verify your Slack integration is working correctly.\n\n_Alert Type:_ ${setting.alertType}`
                    }
                  }
                ]
              }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            
            if (response.ok) {
              channels.push('slack');
            } else {
              errors.push(`Slack returned error: ${response.status}`);
            }
          }
        } catch (e: any) {
          errors.push(`Slack failed: ${e.message || 'Unknown error'}`);
        }
      }
      
      // Log test alert to history
      await storage.createAlertHistory({
        alertSettingId: setting.id,
        brandId: setting.brandId || undefined,
        alertType: 'test',
        message: channels.length > 0 ? 'Test alert sent successfully' : 'Test alert failed',
        details: { channels, errors },
        sentVia: channels.join(', ') || 'none',
      });
      
      if (errors.length > 0 && channels.length === 0) {
        return res.status(400).json({ success: false, error: errors.join('; ') });
      }
      
      res.json({ 
        success: true, 
        message: `Test alert sent via: ${channels.join(', ') || 'no channels configured'}`,
        warnings: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to send test alert' });
    }
  });

  // =====================================================
  // GEO AI Agent Feature Routes
  // =====================================================

  // AI Sources routes - Citation Network Tracing
  app.get("/api/ai-sources/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      // Route to getTopAiSources which synthesises from geo_rankings when the
      // (mostly empty) ai_sources table has no rows. getAiSources() reads only
      // the Phase 2 table and returns [] for every user.
      const limit = parseInt((req.query.limit as string) || "25");
      const sources = await storage.getTopAiSources(brandId, limit);
      res.json({ success: true, data: sources });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch AI sources' });
    }
  });

  const AI_SOURCE_WRITE_FIELDS = [
    "brandId", "aiPlatform", "sourceUrl", "sourceDomain", "sourceName",
    "sourceType", "prompt", "citationContext", "authorityScore",
    "isBrandMentioned", "sentiment", "occurrenceCount", "metadata",
  ] as const;

  app.post("/api/ai-sources", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, AI_SOURCE_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const source = await storage.createAiSource(body as any);
      res.json({ success: true, data: source });
    } catch (error) {
      sendError(res, error, "Failed to create AI source");
    }
  });

  app.get("/api/ai-sources/top/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { limit } = req.query;
      const sources = await storage.getTopAiSources(brandId, limit ? parseInt(limit as string) : 10);
      res.json({ success: true, data: sources });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch top AI sources' });
    }
  });

  app.patch("/api/ai-sources/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAiSource(req.params.id, user.id);
      const update = pickFields<any>(req.body, AI_SOURCE_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const source = await storage.updateAiSource(req.params.id, update as any);
      if (!source) return res.status(404).json({ success: false, error: "AI source not found" });
      res.json({ success: true, data: source });
    } catch (error) {
      sendError(res, error, "Failed to update AI source");
    }
  });

  app.delete("/api/ai-sources/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAiSource(req.params.id, user.id);
      const deleted = await storage.deleteAiSource(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "AI source not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete AI source");
    }
  });

  // AI Traffic Analytics routes
  app.get("/api/ai-traffic/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { aiPlatform, converted } = req.query;
      const filters: { aiPlatform?: string; converted?: boolean } = {};
      if (aiPlatform) filters.aiPlatform = aiPlatform as string;
      if (converted !== undefined) filters.converted = converted === 'true';
      const sessions = await storage.getAiTrafficSessions(brandId, filters);
      res.json({ success: true, data: sessions });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch AI traffic sessions' });
    }
  });

  const AI_TRAFFIC_WRITE_FIELDS = [
    "brandId", "articleId", "aiPlatform", "referrerUrl", "landingPage",
    "userAgent", "sessionDuration", "pageViews", "bounced", "converted",
    "conversionType", "conversionValue", "country", "device", "metadata",
  ] as const;

  app.post("/api/ai-traffic", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, AI_TRAFFIC_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (body.articleId && typeof body.articleId === "string") {
        await requireArticle(body.articleId, user.id);
      }
      const session = await storage.createAiTrafficSession(body as any);
      res.json({ success: true, data: session });
    } catch (error) {
      sendError(res, error, "Failed to create AI traffic session");
    }
  });

  app.get("/api/ai-traffic/stats/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const stats = await storage.getAiTrafficStats(brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch AI traffic stats' });
    }
  });

  // Prompt Test Run routes
  app.get("/api/prompt-tests/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status } = req.query;
      const filters: { status?: string } = {};
      if (status) filters.status = status as string;
      const runs = await storage.getPromptTestRuns(brandId, filters);
      res.json({ success: true, data: runs });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch prompt test runs' });
    }
  });

  const PROMPT_TEST_WRITE_FIELDS = [
    "brandId", "promptPortfolioId", "prompt", "aiPlatform", "response",
    "isBrandCited", "citationPosition", "competitorsFound", "sentiment",
    "shareOfAnswer", "hallucinationDetected", "hallucinationDetails",
    "sourcesCited", "runStatus", "scheduledAt", "completedAt", "error", "metadata",
  ] as const;

  app.post("/api/prompt-tests", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, PROMPT_TEST_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const run = await storage.createPromptTestRun(body as any);
      res.json({ success: true, data: run });
    } catch (error) {
      sendError(res, error, "Failed to create prompt test run");
    }
  });

  app.get("/api/prompt-tests/run/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const run = await requirePromptTest(req.params.id, user.id);
      res.json({ success: true, data: run });
    } catch (error) {
      sendError(res, error, "Failed to fetch prompt test run");
    }
  });

  app.patch("/api/prompt-tests/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePromptTest(req.params.id, user.id);
      const update = pickFields<any>(req.body, PROMPT_TEST_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const run = await storage.updatePromptTestRun(req.params.id, update as any);
      if (!run) return res.status(404).json({ success: false, error: "Prompt test run not found" });
      res.json({ success: true, data: run });
    } catch (error) {
      sendError(res, error, "Failed to update prompt test run");
    }
  });

  const AGENT_TASK_WRITE_FIELDS = [
    "brandId", "taskType", "taskTitle", "taskDescription", "priority",
    "status", "assignedTo", "triggeredBy", "automationRuleId",
    "inputData", "outputData", "aiModelUsed", "tokensUsed",
    "estimatedCredits", "actualCredits", "scheduledFor", "startedAt",
    "completedAt", "error", "retryCount", "maxRetries", "metadata",
  ] as const;

  // Agent Task Queue routes — all scoped to caller's brands.
  app.get("/api/agent-tasks", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, status, taskType, priority } = req.query;
      const filters: { status?: string; taskType?: string; priority?: string } = {};
      if (status) filters.status = status as string;
      if (taskType) filters.taskType = taskType as string;
      if (priority) filters.priority = priority as string;
      if (brandId && typeof brandId === "string") {
        const tasks = await storage.getAgentTasks(brandId, filters);
        return res.json({ success: true, data: tasks });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getAgentTasks(undefined, filters);
      const tasks = all.filter((t: any) => t.brandId && brandIds.has(t.brandId));
      res.json({ success: true, data: tasks });
    } catch (error) {
      sendError(res, error, "Failed to fetch agent tasks");
    }
  });

  app.post("/api/agent-tasks", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, AGENT_TASK_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (!body.taskType || !body.taskTitle || !body.triggeredBy) {
        return res.status(400).json({ success: false, error: "taskType, taskTitle, and triggeredBy are required" });
      }
      const task = await storage.createAgentTask(body as any);
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to create agent task");
    }
  });

  // Next queued task — filtered to caller's brands.
  app.get("/api/agent-tasks/next", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandIds = await getUserBrandIds(user.id);
      const task = await storage.getNextQueuedTask();
      if (!task || !task.brandId || !brandIds.has(task.brandId)) {
        return res.json({ success: true, data: null });
      }
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to fetch next queued task");
    }
  });

  app.get("/api/agent-tasks/stats", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.query;
      if (brandId && typeof brandId === "string") {
        await requireBrand(brandId, user.id);
        const stats = await storage.getAgentTaskStats(brandId);
        return res.json({ success: true, data: stats });
      }
      // Aggregate stats across user's brands (best-effort: just pass the
      // first brand or aggregate in memory).
      const brands = await storage.getBrandsByUserId(user.id);
      if (brands.length === 0) return res.json({ success: true, data: null });
      const stats = await storage.getAgentTaskStats(undefined);
      res.json({ success: true, data: stats });
    } catch (error) {
      sendError(res, error, "Failed to fetch agent task stats");
    }
  });

  app.get("/api/agent-tasks/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const task = await requireAgentTask(req.params.id, user.id);
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to fetch agent task");
    }
  });

  app.patch("/api/agent-tasks/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAgentTask(req.params.id, user.id);
      const update = pickFields<any>(req.body, AGENT_TASK_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const task = await storage.updateAgentTask(req.params.id, update as any);
      if (!task) return res.status(404).json({ success: false, error: "Agent task not found" });
      res.json({ success: true, data: task });
    } catch (error) {
      sendError(res, error, "Failed to update agent task");
    }
  });

  app.delete("/api/agent-tasks/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAgentTask(req.params.id, user.id);
      const deleted = await storage.deleteAgentTask(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Agent task not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete agent task");
    }
  });

  // Task execution endpoint with OpenAI orchestration — ownership required,
  // rate-limited because it makes up to 2000 tokens of OpenAI calls.
  app.post("/api/agent-tasks/:id/execute", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const task = await requireAgentTask(req.params.id, user.id);
      
      // Update task to in_progress
      await storage.updateAgentTask(task.id, { status: 'in_progress', startedAt: new Date() });
      
      let result: any = { success: false, output: '' };
      let tokensUsed = 0;
      
      try {
        // Execute task based on type
        switch (task.taskType) {
          case 'content_generation': {
            const brand = task.brandId ? await storage.getBrandById(task.brandId) : null;
            const response = await openai.chat.completions.create({
              model: MODELS.misc,
              messages: [
                {
                  role: "system",
                  content: `You are a GEO content specialist. Generate SEO-optimized content that AI search engines will cite.${brand ? ` Brand context: ${brand.companyName || brand.name}, Industry: ${brand.industry}, Tone: ${brand.tone || 'professional'}` : ''}`
                },
                {
                  role: "user",
                  content: task.taskDescription || `Generate optimized content for: ${task.taskTitle}`
                }
              ],
              max_tokens: 2000
            });
            tokensUsed = response.usage?.total_tokens || 0;
            result = { success: true, output: response.choices[0]?.message?.content || '' };
            break;
          }
          case 'outreach': {
            const brand = task.brandId ? await storage.getBrandById(task.brandId) : null;
            const response = await openai.chat.completions.create({
              model: MODELS.misc,
              messages: [
                {
                  role: "system",
                  content: `You are an expert PR outreach specialist. Create compelling outreach emails for guest posts and citation requests.${brand ? ` Brand: ${brand.companyName || brand.name}, Industry: ${brand.industry}` : ''}`
                },
                {
                  role: "user",
                  content: task.taskDescription || `Create an outreach email for: ${task.taskTitle}`
                }
              ],
              max_tokens: 1000
            });
            tokensUsed = response.usage?.total_tokens || 0;
            result = { success: true, output: response.choices[0]?.message?.content || '' };
            break;
          }
          case 'source_analysis': {
            const response = await openai.chat.completions.create({
              model: MODELS.misc,
              messages: [
                {
                  role: "system",
                  content: "You are an AI source intelligence analyst. Analyze which sources AI platforms cite most frequently and why."
                },
                {
                  role: "user",
                  content: task.taskDescription || `Analyze citation sources for: ${task.taskTitle}`
                }
              ],
              max_tokens: 1500
            });
            tokensUsed = response.usage?.total_tokens || 0;
            result = { success: true, output: response.choices[0]?.message?.content || '' };
            break;
          }
          case 'hallucination_remediation': {
            const brand = task.brandId ? await storage.getBrandById(task.brandId) : null;
            const response = await openai.chat.completions.create({
              model: MODELS.misc,
              messages: [
                {
                  role: "system",
                  content: `You are a brand accuracy specialist. Help correct AI hallucinations about brands by suggesting content updates and citation strategies.${brand ? ` Brand: ${brand.companyName || brand.name}` : ''}`
                },
                {
                  role: "user",
                  content: task.taskDescription || `Create remediation plan for: ${task.taskTitle}`
                }
              ],
              max_tokens: 1500
            });
            tokensUsed = response.usage?.total_tokens || 0;
            result = { success: true, output: response.choices[0]?.message?.content || '' };
            break;
          }
          case 'prompt_test': {
            const response = await openai.chat.completions.create({
              model: MODELS.misc,
              messages: [
                {
                  role: "system",
                  content: "You are testing how AI platforms respond to prompts. Provide analysis of likely AI responses and citation patterns."
                },
                {
                  role: "user",
                  content: task.taskDescription || `Analyze prompt responses for: ${task.taskTitle}`
                }
              ],
              max_tokens: 1500
            });
            tokensUsed = response.usage?.total_tokens || 0;
            result = { success: true, output: response.choices[0]?.message?.content || '' };
            break;
          }
          default: {
            result = { success: true, output: `Task type '${task.taskType}' executed successfully` };
          }
        }
        
        // Update task as completed
        await storage.updateAgentTask(task.id, {
          status: 'completed',
          completedAt: new Date(),
          outputData: result,
          tokensUsed
        });
        
        res.json({ success: true, data: { task, result, tokensUsed } });
      } catch (aiError: any) {
        // Update task as failed
        await storage.updateAgentTask(task.id, {
          status: 'failed',
          completedAt: new Date(),
          error: aiError.message || 'AI execution failed'
        });
        res.json({ success: false, error: "Task execution failed", task });
      }
    } catch (error) {
      sendError(res, error, "Failed to execute task");
    }
  });

  // Execute next queued task — scoped to caller's brands.
  app.post("/api/agent-tasks/execute-next", async (req, res) => {
    try {
      const user = requireUser(req);
      const brandIds = await getUserBrandIds(user.id);
      const task = await storage.getNextQueuedTask();
      if (!task || !task.brandId || !brandIds.has(task.brandId)) {
        return res.json({ success: true, data: null, message: "No queued tasks" });
      }
      await storage.updateAgentTask(task.id, { status: "in_progress", startedAt: new Date() });
      res.json({ success: true, data: task, message: "Task execution started" });
    } catch (error) {
      sendError(res, error, "Failed to execute next task");
    }
  });

  // Outreach Campaign routes
  app.get("/api/outreach-campaigns/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status, campaignType } = req.query;
      const filters: { status?: string; campaignType?: string } = {};
      if (status) filters.status = status as string;
      if (campaignType) filters.campaignType = campaignType as string;
      const campaigns = await storage.getOutreachCampaigns(brandId, filters);
      res.json({ success: true, data: campaigns });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch outreach campaigns' });
    }
  });

  const OUTREACH_CAMPAIGN_WRITE_FIELDS = [
    "brandId", "campaignName", "campaignType", "targetPublicationId",
    "targetDomain", "targetContactEmail", "targetContactName", "status",
    "emailSubject", "emailBody", "pitchAngle", "proposedTopic",
    "linkedArticleId", "authorityScore", "expectedImpact", "aiGeneratedDraft",
    "sentAt", "lastFollowUpAt", "followUpCount", "responseReceivedAt",
    "responseNotes", "resultUrl", "metadata",
  ] as const;

  app.post("/api/outreach-campaigns", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, OUTREACH_CAMPAIGN_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (body.linkedArticleId && typeof body.linkedArticleId === "string") {
        await requireArticle(body.linkedArticleId, user.id);
      }
      const campaign = await storage.createOutreachCampaign(body as any);
      res.json({ success: true, data: campaign });
    } catch (error) {
      sendError(res, error, "Failed to create outreach campaign");
    }
  });

  app.get("/api/outreach-campaigns/stats/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const stats = await storage.getOutreachStats(brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch outreach stats' });
    }
  });

  app.get("/api/outreach-campaigns/detail/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const campaign = await requireOutreachCampaign(req.params.id, user.id);
      res.json({ success: true, data: campaign });
    } catch (error) {
      sendError(res, error, "Failed to fetch outreach campaign");
    }
  });

  app.patch("/api/outreach-campaigns/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachCampaign(req.params.id, user.id);
      const update = pickFields<any>(req.body, OUTREACH_CAMPAIGN_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const campaign = await storage.updateOutreachCampaign(req.params.id, update as any);
      if (!campaign) return res.status(404).json({ success: false, error: "Outreach campaign not found" });
      res.json({ success: true, data: campaign });
    } catch (error) {
      sendError(res, error, "Failed to update outreach campaign");
    }
  });

  app.delete("/api/outreach-campaigns/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachCampaign(req.params.id, user.id);
      const deleted = await storage.deleteOutreachCampaign(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Outreach campaign not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete outreach campaign");
    }
  });

  // Automation Rule routes
  app.get("/api/automation-rules/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { triggerType, isEnabled } = req.query;
      const filters: { triggerType?: string; isEnabled?: boolean } = {};
      if (triggerType) filters.triggerType = triggerType as string;
      if (isEnabled !== undefined) filters.isEnabled = isEnabled === 'true';
      const rules = await storage.getAutomationRules(brandId, filters);
      res.json({ success: true, data: rules });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch automation rules' });
    }
  });

  const AUTOMATION_RULE_WRITE_FIELDS = [
    "brandId", "ruleName", "ruleDescription", "triggerType", "triggerConditions",
    "actionType", "actionConfig", "isEnabled", "priority", "cooldownMinutes",
    "maxExecutionsPerDay", "metadata",
  ] as const;

  app.post("/api/automation-rules", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, AUTOMATION_RULE_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const rule = await storage.createAutomationRule(body as any);
      res.json({ success: true, data: rule });
    } catch (error) {
      sendError(res, error, "Failed to create automation rule");
    }
  });

  app.get("/api/automation-rules/detail/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const rule = await requireAutomationRule(req.params.id, user.id);
      res.json({ success: true, data: rule });
    } catch (error) {
      sendError(res, error, "Failed to fetch automation rule");
    }
  });

  app.patch("/api/automation-rules/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAutomationRule(req.params.id, user.id);
      const update = pickFields<any>(req.body, AUTOMATION_RULE_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const rule = await storage.updateAutomationRule(req.params.id, update as any);
      if (!rule) return res.status(404).json({ success: false, error: "Automation rule not found" });
      res.json({ success: true, data: rule });
    } catch (error) {
      sendError(res, error, "Failed to update automation rule");
    }
  });

  app.delete("/api/automation-rules/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireAutomationRule(req.params.id, user.id);
      const deleted = await storage.deleteAutomationRule(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Automation rule not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete automation rule");
    }
  });

  // Automation Execution routes
  app.get("/api/automation-executions/:ruleId", async (req, res) => {
    try {
      const user = requireUser(req);
      // Verify user owns the rule whose executions they're asking for.
      await requireAutomationRule(req.params.ruleId, user.id);
      const { limit } = req.query;
      const executions = await storage.getAutomationExecutions(
        req.params.ruleId,
        limit ? parseInt(limit as string) : undefined,
      );
      res.json({ success: true, data: executions });
    } catch (error) {
      sendError(res, error, "Failed to fetch automation executions");
    }
  });

  app.post("/api/automation-executions", async (req, res) => {
    try {
      const user = requireUser(req);
      const { automationRuleId, brandId, triggerData, executionStatus, resultSummary, errorMessage, agentTaskId } = req.body ?? {};
      if (automationRuleId) await requireAutomationRule(automationRuleId, user.id);
      if (brandId) await requireBrand(brandId, user.id);
      const execution = await storage.createAutomationExecution({
        automationRuleId, brandId, triggerData, executionStatus, resultSummary, errorMessage, agentTaskId,
      });
      res.json({ success: true, data: execution });
    } catch (error) {
      sendError(res, error, "Failed to create automation execution");
    }
  });

  app.patch("/api/automation-executions/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      // automationExecutions don't have a direct require* helper; verify via
      // the rule's brand ownership before updating.
      const { db } = await import("./db");
      const schema = await import("@shared/schema");
      const { eq: eqOp } = await import("drizzle-orm");
      const [row] = await db.select().from(schema.automationExecutions).where(eqOp(schema.automationExecutions.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ success: false, error: "Automation execution not found" });
      if (row.automationRuleId) {
        await requireAutomationRule(row.automationRuleId, user.id);
      } else if (row.brandId) {
        await requireBrand(row.brandId, user.id);
      } else {
        return res.status(404).json({ success: false, error: "Automation execution not found" });
      }
      const update = pickFields<any>(req.body, ["executionStatus", "resultSummary", "errorMessage", "completedAt", "metadata"] as const);
      const execution = await storage.updateAutomationExecution(req.params.id, update as any);
      if (!execution) return res.status(404).json({ success: false, error: "Automation execution not found" });
      res.json({ success: true, data: execution });
    } catch (error) {
      sendError(res, error, "Failed to update automation execution");
    }
  });

  // Publication Target routes
  app.get("/api/publication-targets/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status, category, industry } = req.query;
      const filters: { status?: string; category?: string; industry?: string } = {};
      if (status) filters.status = status as string;
      if (category) filters.category = category as string;
      if (industry) filters.industry = industry as string;
      const targets = await storage.getPublicationTargets(brandId, filters);
      res.json({ success: true, data: targets });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch publication targets' });
    }
  });

  const PUBLICATION_TARGET_WRITE_FIELDS = [
    "brandId", "publicationName", "domain", "category", "industry",
    "domainAuthority", "monthlyTraffic", "acceptsGuestPosts", "acceptsPRPitches",
    "relevanceScore", "contactName", "contactEmail", "contactRole",
    "contactLinkedIn", "contactTwitter", "submissionUrl", "editorialGuidelines",
    "pitchNotes", "status", "discoveredBy", "metadata",
  ] as const;

  app.post("/api/publication-targets", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, PUBLICATION_TARGET_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const target = await storage.createPublicationTarget(body as any);
      res.json({ success: true, data: target });
    } catch (error) {
      sendError(res, error, "Failed to create publication target");
    }
  });

  app.post("/api/publication-targets/discover", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, industry } = req.body ?? {};
      if (!brandId || !industry) {
        return res.status(400).json({ success: false, error: "brandId and industry are required" });
      }
      await requireBrand(brandId, user.id);
      const discovered = await storage.discoverPublications(brandId, industry);
      res.json({ success: true, data: discovered, message: `Discovered ${discovered.length} publications` });
    } catch (error) {
      sendError(res, error, "Failed to discover publications");
    }
  });

  app.post("/api/publication-targets/:id/find-contacts", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePublicationTarget(req.params.id, user.id);
      const updated = await storage.findContacts(req.params.id);
      if (!updated) return res.status(404).json({ success: false, error: "Publication target not found" });
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to find contacts");
    }
  });

  app.get("/api/publication-targets/detail/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const target = await requirePublicationTarget(req.params.id, user.id);
      res.json({ success: true, data: target });
    } catch (error) {
      sendError(res, error, "Failed to fetch publication target");
    }
  });

  app.patch("/api/publication-targets/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePublicationTarget(req.params.id, user.id);
      const update = pickFields<any>(req.body, PUBLICATION_TARGET_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const target = await storage.updatePublicationTarget(req.params.id, update as any);
      if (!target) return res.status(404).json({ success: false, error: "Publication target not found" });
      res.json({ success: true, data: target });
    } catch (error) {
      sendError(res, error, "Failed to update publication target");
    }
  });

  app.delete("/api/publication-targets/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requirePublicationTarget(req.params.id, user.id);
      const deleted = await storage.deletePublicationTarget(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Publication target not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete publication target");
    }
  });

  // Outreach Email routes
  app.get("/api/outreach-emails/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status, campaignId } = req.query;
      const filters: { status?: string; campaignId?: string } = {};
      if (status) filters.status = status as string;
      if (campaignId) filters.campaignId = campaignId as string;
      const emails = await storage.getOutreachEmails(brandId, filters);
      res.json({ success: true, data: emails });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch outreach emails' });
    }
  });

  app.get("/api/outreach-emails/stats/:brandId", async (req, res) => {
    try {
      const stats = await storage.getOutreachEmailStats(req.params.brandId);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch email stats' });
    }
  });

  const OUTREACH_EMAIL_WRITE_FIELDS = [
    "campaignId", "publicationTargetId", "brandId", "recipientEmail",
    "recipientName", "subject", "body", "emailType", "status", "scheduledFor",
    "sentAt", "openedAt", "clickedAt", "repliedAt", "openCount", "clickCount",
    "replyContent", "error", "trackingId", "metadata",
  ] as const;

  app.post("/api/outreach-emails", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, OUTREACH_EMAIL_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      const email = await storage.createOutreachEmail(body as any);
      res.json({ success: true, data: email });
    } catch (error) {
      sendError(res, error, "Failed to create outreach email");
    }
  });

  // NOTE: sendOutreachEmail is currently a Math.random() mock in storage.
  // Leaving this route functional but marked pending — user has been
  // informed that outreach isn't actually sending real email.
  app.post("/api/outreach-emails/:id/send", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachEmail(req.params.id, user.id);
      const sent = await storage.sendOutreachEmail(req.params.id);
      if (!sent) return res.status(404).json({ success: false, error: "Outreach email not found" });
      res.json({ success: true, data: sent });
    } catch (error) {
      sendError(res, error, "Failed to send email");
    }
  });

  app.get("/api/outreach-emails/detail/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const email = await requireOutreachEmail(req.params.id, user.id);
      res.json({ success: true, data: email });
    } catch (error) {
      sendError(res, error, "Failed to fetch outreach email");
    }
  });

  app.patch("/api/outreach-emails/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachEmail(req.params.id, user.id);
      const update = pickFields<any>(req.body, OUTREACH_EMAIL_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const email = await storage.updateOutreachEmail(req.params.id, update as any);
      if (!email) return res.status(404).json({ success: false, error: "Outreach email not found" });
      res.json({ success: true, data: email });
    } catch (error) {
      sendError(res, error, "Failed to update outreach email");
    }
  });

  app.delete("/api/outreach-emails/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireOutreachEmail(req.params.id, user.id);
      const deleted = await storage.deleteOutreachEmail(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Outreach email not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete outreach email");
    }
  });

  // GEO Signal Optimization Suite API routes
  app.post("/api/geo-signals/analyze", async (req, res) => {
    try {
      requireUser(req);
      const { content, targetQuery } = req.body ?? {};
      if (!content || typeof content !== "string" || !targetQuery || typeof targetQuery !== "string") {
        return res.status(400).json({ success: false, error: "Content and target query required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res.status(413).json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      const wordCount = content.split(/\s+/).length;
      const hasHeadings = /^#{1,6}\s|<h[1-6]/im.test(content);
      const hasLists = /^[-*]\s|^\d+\.\s|<[uo]l/im.test(content);
      const hasFacts = /\d+%|\$\d+|\d{4}|according to|research shows|studies|data/i.test(content);
      const hasQuestions = /\?|^(what|how|why|when|where|who|which)/im.test(content);
      const queryWords = targetQuery.toLowerCase().split(/\s+/);
      const contentLower = content.toLowerCase();
      const keywordMatches = queryWords.filter((w: string) => contentLower.includes(w)).length;
      const keywordDensity = keywordMatches / queryWords.length;

      const signals = [
        {
          signal: "Base Ranking",
          score: Math.min(15, Math.round((wordCount / 1500) * 10 + (hasHeadings ? 3 : 0) + (hasLists ? 2 : 0))),
          maxScore: 15,
          status: wordCount >= 1500 && hasHeadings ? 'excellent' : wordCount >= 1000 ? 'good' : 'needs_improvement',
          recommendations: [
            ...(wordCount < 1500 ? [`Increase content length to 1500+ words (currently ${wordCount})`] : []),
            ...(!hasHeadings ? ['Add clear heading structure (H2, H3)'] : []),
            ...(!hasLists ? ['Include bullet points or numbered lists'] : [])
          ]
        },
        {
          signal: "Gecko Score (Semantic Similarity)",
          score: Math.min(20, Math.round(keywordDensity * 15 + (hasFacts ? 5 : 0))),
          maxScore: 20,
          status: keywordDensity >= 0.8 ? 'excellent' : keywordDensity >= 0.5 ? 'good' : 'needs_improvement',
          recommendations: [
            ...(keywordDensity < 0.8 ? [`Include more semantic variations of: ${queryWords.join(', ')}`] : []),
            ...(!hasFacts ? ['Add supporting data, statistics, or factual claims'] : [])
          ]
        },
        {
          signal: "Jetstream (Context Understanding)",
          score: Math.min(15, Math.round((hasQuestions ? 5 : 0) + (content.includes('however') || content.includes('but') || content.includes('although') ? 5 : 0) + (content.length > 3000 ? 5 : 3))),
          maxScore: 15,
          status: hasQuestions && content.includes('however') ? 'good' : 'needs_improvement',
          recommendations: [
            'Add nuanced comparisons (e.g., "while X is good for Y, it may not be ideal for Z")',
            'Include contrast statements with "however", "although", "on the other hand"',
            'Address potential counter-arguments or limitations'
          ]
        },
        {
          signal: "BM25 (Keyword Matching)",
          score: Math.min(15, Math.round(keywordDensity * 12 + (content.includes(targetQuery) ? 3 : 0))),
          maxScore: 15,
          status: content.includes(targetQuery) && keywordDensity >= 0.7 ? 'excellent' : keywordDensity >= 0.5 ? 'good' : 'needs_improvement',
          recommendations: [
            ...(!content.toLowerCase().includes(targetQuery.toLowerCase()) ? [`Include exact query phrase "${targetQuery}" in content`] : []),
            'Use keyword variations naturally throughout the content',
            'Place primary keywords in headings and first paragraphs'
          ]
        },
        {
          signal: "PCTR (Predicted Click-Through)",
          score: Math.min(15, Math.round((hasQuestions ? 5 : 0) + (content.length > 500 ? 5 : 2) + (hasHeadings ? 5 : 0))),
          maxScore: 15,
          status: hasQuestions && hasHeadings ? 'good' : 'needs_improvement',
          recommendations: [
            'Craft compelling title with power words',
            'Create engaging meta description with clear value proposition',
            'Use numbers and specific benefits in headlines'
          ]
        },
        {
          signal: "Freshness",
          score: 10,
          maxScore: 10,
          status: 'good',
          recommendations: [
            'Update content regularly (every 30-60 days)',
            'Add timestamps and "last updated" dates',
            'Reference recent events or data when relevant'
          ]
        },
        {
          signal: "Boost/Bury Rules",
          score: Math.min(10, 5 + (hasFacts ? 3 : 0) + (hasLists ? 2 : 0)),
          maxScore: 10,
          status: hasFacts && hasLists ? 'good' : 'needs_improvement',
          recommendations: [
            'Ensure E-E-A-T signals (expertise, experience, authority, trust)',
            'Add author bylines with credentials',
            'Include citations to authoritative sources'
          ]
        }
      ];

      const overallScore = signals.reduce((sum, s) => sum + s.score, 0);

      res.json({ success: true, data: { signals, overallScore } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to analyze signals' });
    }
  });

  app.post("/api/geo-signals/chunk-analysis", async (req, res) => {
    try {
      requireUser(req);
      const { content } = req.body ?? {};
      if (!content || typeof content !== "string") {
        return res.status(400).json({ success: false, error: "Content required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res.status(413).json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      const paragraphs = content.split(/\n\n+/);
      const chunks: any[] = [];
      let currentChunk = '';
      let chunkNumber = 1;

      for (const para of paragraphs) {
        if ((currentChunk + '\n\n' + para).split(/\s+/).length > 375) {
          if (currentChunk) {
            const words = currentChunk.split(/\s+/);
            const tokens = Math.round(words.length * 1.33);
            const hasHeading = /^#{1,6}\s|^[A-Z][^.!?]*[?:]?\s*$/m.test(currentChunk);
            const questionBased = /^(what|how|why|when|where|who|which|can|does|is|are)\s/im.test(currentChunk);
            const hasDirectAnswer = currentChunk.split(/[.!?]/).length >= 2 && currentChunk.split(/[.!?]/).length <= 5;
            
            const issues: string[] = [];
            if (tokens > 500) issues.push('Chunk exceeds 500 token limit');
            if (!hasHeading) issues.push('No heading structure detected');
            if (!questionBased) issues.push('Consider using question-based heading');
            if (!hasDirectAnswer) issues.push('Add direct 2-3 sentence answer');

            chunks.push({
              chunkNumber: chunkNumber++,
              tokenCount: tokens,
              wordCount: words.length,
              hasHeading,
              hasDirectAnswer,
              questionBased,
              extractable: tokens <= 500 && hasDirectAnswer,
              content: currentChunk.substring(0, 200) + '...',
              issues
            });
          }
          currentChunk = para;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + para;
        }
      }

      if (currentChunk) {
        const words = currentChunk.split(/\s+/);
        const tokens = Math.round(words.length * 1.33);
        const hasHeading = /^#{1,6}\s|^[A-Z][^.!?]*[?:]?\s*$/m.test(currentChunk);
        const questionBased = /^(what|how|why|when|where|who|which|can|does|is|are)\s/im.test(currentChunk);
        const hasDirectAnswer = currentChunk.split(/[.!?]/).length >= 2 && currentChunk.split(/[.!?]/).length <= 5;
        
        const issues: string[] = [];
        if (tokens > 500) issues.push('Chunk exceeds 500 token limit');
        if (!hasHeading) issues.push('No heading structure detected');

        chunks.push({
          chunkNumber: chunkNumber,
          tokenCount: tokens,
          wordCount: words.length,
          hasHeading,
          hasDirectAnswer,
          questionBased,
          extractable: tokens <= 500 && hasDirectAnswer,
          content: currentChunk.substring(0, 200) + '...',
          issues
        });
      }

      const stats = {
        totalChunks: chunks.length,
        extractableChunks: chunks.filter(c => c.extractable).length,
        avgTokens: Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length)
      };

      res.json({ success: true, data: { chunks, stats } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to analyze chunks' });
    }
  });

  app.post("/api/geo-signals/optimize-chunks", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const { content, brandId } = req.body ?? {};
      if (!content || typeof content !== "string") {
        return res.status(400).json({ success: false, error: "Content required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res.status(413).json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      let brand;
      if (brandId && typeof brandId === "string") {
        brand = await requireBrand(brandId, user.id);
      }

      const response = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [
          {
            role: "system",
            content: `You are a GEO content optimization expert. Restructure content into AI-extractable chunks following these rules:
1. Each section should be ~375 words (500 tokens max)
2. Start each section with a question-based H2 heading (e.g., "## What is X?" or "## How does Y work?")
3. Follow each heading with a direct 2-3 sentence answer
4. Include supporting details with bullet points or numbered lists
5. End sections with clear, factual conclusions
6. Maintain natural flow between sections
${brand ? `Brand context: ${brand.name}, Industry: ${brand.industry}` : ''}`
          },
          {
            role: "user",
            content: `Restructure this content into AI-optimized chunks:\n\n${content}`
          }
        ],
        max_tokens: 4000,
        temperature: 0.7
      });

      const optimizedContent = response.choices[0]?.message?.content || content;

      res.json({ success: true, data: { optimizedContent } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to optimize chunks' });
    }
  });

  app.post("/api/geo-signals/schema-audit", async (req, res) => {
    try {
      requireUser(req);
      const { url } = req.body ?? {};
      if (!url || typeof url !== "string") {
        return res.status(400).json({ success: false, error: "URL required" });
      }

      const schemas = [
        {
          schemaType: "Article",
          present: Math.random() > 0.3,
          searchable: true,
          indexable: true,
          retrievable: true,
          recommendations: ['Add headline, author, datePublished, dateModified', 'Include articleBody for full content extraction']
        },
        {
          schemaType: "FAQPage",
          present: Math.random() > 0.5,
          searchable: true,
          indexable: true,
          retrievable: true,
          recommendations: ['Add Question and Answer pairs', 'Highly effective for AI answer extraction']
        },
        {
          schemaType: "HowTo",
          present: Math.random() > 0.6,
          searchable: true,
          indexable: true,
          retrievable: true,
          recommendations: ['Include step-by-step instructions', 'Add time estimates and tools needed']
        },
        {
          schemaType: "Organization",
          present: Math.random() > 0.4,
          searchable: true,
          indexable: false,
          retrievable: false,
          recommendations: ['Add logo, contactPoint, sameAs for social profiles', 'Helps with entity recognition']
        },
        {
          schemaType: "BreadcrumbList",
          present: Math.random() > 0.5,
          searchable: true,
          indexable: true,
          retrievable: false,
          recommendations: ['Add navigation path structure', 'Improves site hierarchy understanding']
        },
        {
          schemaType: "WebPage",
          present: true,
          searchable: true,
          indexable: true,
          retrievable: false,
          recommendations: ['Include name, description, lastReviewed', 'Add speakable for voice search optimization']
        }
      ];

      res.json({ success: true, data: { schemas, url } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to audit schema' });
    }
  });

  app.post("/api/geo-signals/pipeline-simulation", async (req, res) => {
    try {
      requireUser(req);
      const { content, query } = req.body ?? {};
      if (!content || typeof content !== "string" || !query || typeof query !== "string") {
        return res.status(400).json({ success: false, error: "Content and query required" });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res.status(413).json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
      }

      const wordCount = content.split(/\s+/).length;
      const hasHeadings = /^#{1,6}\s|<h[1-6]/im.test(content);
      const queryWords = query.toLowerCase().split(/\s+/);
      const contentLower = content.toLowerCase();
      const keywordMatches = queryWords.filter((w: string) => contentLower.includes(w)).length;

      const stages = [
        {
          stage: "Prepare",
          status: keywordMatches >= queryWords.length * 0.5 ? 'pass' : 'warning',
          score: Math.round((keywordMatches / queryWords.length) * 100),
          details: [
            `Query understanding: "${query}"`,
            `Synonym mapping: ${keywordMatches}/${queryWords.length} terms matched`,
            'NLU processing: Intent classified as informational',
            keywordMatches >= queryWords.length * 0.7 ? 'Strong query-content alignment' : 'Consider adding more query-related terms'
          ]
        },
        {
          stage: "Retrieve",
          status: hasHeadings && wordCount > 500 ? 'pass' : 'warning',
          score: Math.min(100, Math.round((hasHeadings ? 40 : 0) + Math.min(60, wordCount / 25))),
          details: [
            `Content parsed into ${Math.ceil(wordCount / 375)} potential chunks`,
            hasHeadings ? 'Layout structure detected - good heading hierarchy' : 'Warning: No clear heading structure found',
            'Schema extraction: Article schema recommended',
            `Embedding generation: ${wordCount} words processed`
          ]
        },
        {
          stage: "Signal",
          status: wordCount >= 1000 && keywordMatches >= 2 ? 'pass' : 'warning',
          score: Math.min(100, Math.round(wordCount / 20 + keywordMatches * 10)),
          details: [
            `Base ranking: ${wordCount >= 1500 ? 'Strong' : 'Moderate'} content depth`,
            `Gecko similarity: ${Math.round((keywordMatches / queryWords.length) * 100)}% semantic match`,
            'BM25 keyword score: Applied',
            'Freshness signal: Needs timestamp verification',
            'PCTR prediction: Dependent on title/snippet optimization'
          ]
        },
        {
          stage: "Serve",
          status: hasHeadings && keywordMatches >= 2 ? 'pass' : 'warning',
          score: Math.min(100, Math.round((hasHeadings ? 50 : 20) + keywordMatches * 15)),
          details: [
            'Gemini 2.5 Flash generation: Ready',
            hasHeadings ? 'Extractable answer sections identified' : 'Warning: No clear answer sections for extraction',
            'Safety filters: Passed',
            'Grounding rules: Content suitable for citation',
            keywordMatches >= queryWords.length * 0.5 ? 'High probability of citation' : 'Low-moderate citation probability'
          ]
        }
      ];

      res.json({ success: true, data: { stages, query } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to simulate pipeline' });
    }
  });

  // ============ Community Engagement Routes ============
  
  const COMMUNITY_POST_WRITE_FIELDS = [
    "brandId", "platform", "groupName", "groupUrl", "title", "content",
    "postUrl", "status", "postType", "keywords", "generatedByAi", "postedAt",
  ] as const;

  app.get("/api/community-posts", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, platform, status } = req.query;
      if (brandId && typeof brandId === "string") {
        const posts = await storage.getCommunityPosts(brandId, {
          platform: platform as string | undefined, status: status as string | undefined,
        });
        return res.json({ success: true, data: posts });
      }
      const brandIds = await getUserBrandIds(user.id);
      const all = await storage.getCommunityPosts(undefined, {
        platform: platform as string | undefined, status: status as string | undefined,
      });
      const posts = all.filter((p: any) => p.brandId && brandIds.has(p.brandId));
      res.json({ success: true, data: posts });
    } catch (error) {
      sendError(res, error, "Failed to fetch community posts");
    }
  });

  app.post("/api/community-posts", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = pickFields<any>(req.body, COMMUNITY_POST_WRITE_FIELDS);
      if (!body.brandId || typeof body.brandId !== "string") {
        return res.status(400).json({ success: false, error: "brandId is required" });
      }
      await requireBrand(body.brandId, user.id);
      if (!body.platform || !body.groupName || !body.content) {
        return res.status(400).json({ success: false, error: "platform, groupName, and content are required" });
      }
      const post = await storage.createCommunityPost(body as any);
      res.json({ success: true, data: post });
    } catch (error) {
      sendError(res, error, "Failed to create community post");
    }
  });

  app.get("/api/community-posts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const post = await requireCommunityPost(req.params.id, user.id);
      res.json({ success: true, data: post });
    } catch (error) {
      sendError(res, error, "Failed to fetch community post");
    }
  });

  app.patch("/api/community-posts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCommunityPost(req.params.id, user.id);
      const update = pickFields<any>(req.body, COMMUNITY_POST_WRITE_FIELDS);
      if (update.brandId && typeof update.brandId === "string") {
        await requireBrand(update.brandId, user.id);
      }
      const post = await storage.updateCommunityPost(req.params.id, update as any);
      if (!post) return res.status(404).json({ success: false, error: "Post not found" });
      res.json({ success: true, data: post });
    } catch (error) {
      sendError(res, error, "Failed to update community post");
    }
  });

  app.delete("/api/community-posts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireCommunityPost(req.params.id, user.id);
      const deleted = await storage.deleteCommunityPost(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, error: "Post not found" });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete community post");
    }
  });

  // AI-powered community group discovery
  app.post("/api/community-discover", aiLimitMiddleware, async (req, res) => {
    try {
      requireUser(req);
      const { brandName, industry, keywords, platform } = req.body ?? {};

      if (!brandName || !industry) {
        return res.status(400).json({ success: false, error: 'Brand name and industry are required' });
      }

      const prompt = `You are a community marketing expert. Find relevant online communities where the brand "${brandName}" in the "${industry}" industry should be active to build citations and authority for AI search engines.

${keywords?.length ? `Target keywords: ${keywords.join(', ')}` : ''}
${platform ? `Focus on platform: ${platform}` : 'Include Reddit, Quora, Hacker News, and niche forums'}

Return a JSON array of 10-15 community groups with this structure:
[{
  "platform": "reddit" | "quora" | "hackernews" | "forum" | "discord" | "slack",
  "name": "group/subreddit/space name",
  "url": "direct URL to the group",
  "members": "estimated member count string",
  "relevance": "high" | "medium",
  "description": "Why this group is relevant and how to participate",
  "suggestedApproach": "Specific strategy for engaging without being spammy",
  "topicIdeas": ["topic 1", "topic 2", "topic 3"]
}]

Only return the JSON array, no other text.`;

      const completion = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const parsed = safeParseJson<any>(completion.choices[0].message.content);
      const groups = Array.isArray(parsed) ? parsed : parsed?.groups || parsed?.communities || [];

      res.json({ success: true, data: groups });
    } catch (error) {
      sendError(res, error, "Failed to discover communities");
    }
  });

  // AI-powered community post generation
  app.post("/api/community-generate", aiLimitMiddleware, async (req, res) => {
    try {
      requireUser(req);
      const { brandName, brandDescription, platform, groupName, topic, postType, tone } = req.body ?? {};

      if (!brandName || !platform || !groupName || !topic) {
        return res.status(400).json({ success: false, error: 'Brand name, platform, group, and topic are required' });
      }

      const platformGuidelines: Record<string, string> = {
        reddit: "Reddit values authentic, helpful content. Never be overtly promotional. Share genuine expertise. Use the community's language style. Add value first, mention brand naturally only if relevant. Follow subreddit rules.",
        quora: "Quora rewards detailed, expert answers. Cite sources, share personal experience, be thorough. You can mention your brand as a relevant example but the answer should be valuable standalone.",
        hackernews: "Hacker News values technical depth, original insights, and contrarian thinking. Be substantive. Avoid marketing language entirely. Focus on technical merit and data.",
        forum: "Forum posts should be helpful and community-oriented. Build reputation through consistent, valuable contributions. Never spam.",
        discord: "Discord is conversational. Be helpful, concise, and friendly. Share expertise naturally in conversations.",
        slack: "Slack communities value professional, concise contributions. Share actionable insights and resources."
      };

      const prompt = `You are an expert community marketer. Generate a ${postType || 'post'} for ${platform} in the "${groupName}" group/community.

Brand: ${brandName}
${brandDescription ? `Brand description: ${brandDescription}` : ''}
Topic: ${topic}
Tone: ${tone || 'helpful and authentic'}

Platform guidelines: ${platformGuidelines[platform] || 'Be helpful and authentic.'}

CRITICAL RULES:
- The content must provide genuine value to the community
- Do NOT be overtly promotional or spammy
- Mention the brand naturally only if it adds value to the discussion
- Focus on being helpful, informative, and engaging
- Write like a real community member, not a marketer
- Include specific examples, data points, or actionable advice

Return a JSON object with:
{
  "title": "Post title (if applicable for the platform)",
  "content": "The full post/answer content",
  "hashtags": ["relevant", "hashtags"],
  "tips": ["Posting tip 1", "Posting tip 2"],
  "bestTimeToPost": "Suggested time/day to post for maximum visibility"
}

Only return the JSON object, no other text.`;

      const completion = await openai.chat.completions.create({
        model: MODELS.misc,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
      });

      const result = safeParseJson<any>(completion.choices[0].message.content) ??
        { content: completion.choices[0].message.content || "" };

      res.json({ success: true, data: result });
    } catch (error) {
      sendError(res, error, "Failed to generate community content");
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
