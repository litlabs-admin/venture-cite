// Revenue analytics + generic e-commerce ingestion (Wave 5.1).
//
// Sister to the Stripe billing routes — these are the *outcomes* of
// purchases (rev rollups) rather than the *purchase mechanism*.
//
// Routes:
//   POST /webhooks/ecommerce/purchase  — generic catch-all (NO HMAC verification)
//   GET  /api/revenue/analytics        — top-line + per-platform breakdown
//   GET  /api/revenue/article/:articleId — single article rollup
//   GET  /api/revenue/brand/:brandId    — single brand rollup (ownership via :brandId param)

import type { Express } from "express";
import { storage } from "../storage";
import { requireUser, requireArticle, getUserBrandIds } from "../lib/ownership";
import { sendError } from "../lib/routesShared";
import { dollarsToCents } from "@shared/money";

// Wave 4.1 helper: prefer integer cents, fall back to legacy
// numeric/string revenue. Pulled out so all three rollup endpoints
// agree on the conversion.
function centsOf(p: { revenueCents?: number | null; revenue?: string | number | null }): number {
  if (typeof p.revenueCents === "number" && Number.isFinite(p.revenueCents)) {
    return p.revenueCents;
  }
  const r = p.revenue;
  if (typeof r === "string") return Math.round(parseFloat(r) * 100) || 0;
  if (typeof r === "number") return Math.round(r * 100);
  return 0;
}

export function setupRevenueRoutes(app: Express): void {
  // Generic e-commerce webhook — no HMAC verification (signature-verified
  // ones live in server/index.ts before express.json). Used as a fallback
  // when integrating non-Shopify storefronts that don't have first-class
  // support yet.
  app.post("/webhooks/ecommerce/purchase", async (req, res) => {
    try {
      const {
        articleId,
        brandId,
        aiPlatform,
        ecommercePlatform,
        orderId,
        revenue,
        currency = "USD",
        productName,
        quantity = 1,
        customerEmail,
      } = req.body;

      const revenueCents = dollarsToCents(revenue) ?? 0;

      const purchaseEvent = await storage.createPurchaseEvent({
        articleId: articleId || null,
        brandId: brandId || null,
        aiPlatform,
        ecommercePlatform,
        orderId,
        revenue,
        revenueCents,
        currency,
        productName,
        quantity,
        customerEmail,
        webhookData: req.body,
      });

      res.json({ success: true, data: purchaseEvent });
    } catch (error) {
      console.error("Generic webhook error:", error);
      res.status(500).json({ success: false, error: "Failed to process purchase webhook" });
    }
  });

  // Revenue analytics overview — scoped to caller's brands. If a brandId
  // is supplied it's already validated by enforceBrandOwnership middleware
  // (body/query check); otherwise restrict to all brands the user owns.
  app.get("/api/revenue/analytics", async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId, aiPlatform } = req.query;

      let purchases: any[];
      if (brandId && typeof brandId === "string") {
        const filters = { brandId, aiPlatform: aiPlatform as string | undefined };
        purchases = await storage.getPurchaseEvents(filters);
      } else {
        const brandIds = await getUserBrandIds(user.id);
        const all = await storage.getPurchaseEvents({
          aiPlatform: aiPlatform as string | undefined,
        });
        purchases = all.filter((p: any) => p.brandId && brandIds.has(p.brandId));
      }
      const totalRevenueCents = purchases.reduce((sum, p) => sum + centsOf(p), 0);
      const totalRevenue = totalRevenueCents / 100;
      const totalOrders = purchases.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const platformBreakdown = purchases.reduce((acc: any, purchase: any) => {
        const platform = purchase.aiPlatform;
        if (!acc[platform]) acc[platform] = { orders: 0, revenueCents: 0 };
        acc[platform].orders++;
        acc[platform].revenueCents += centsOf(purchase);
        return acc;
      }, {});
      // Convert per-platform totals back to dollars for the response shape
      // the dashboard expects.
      for (const platform of Object.keys(platformBreakdown)) {
        platformBreakdown[platform].revenue = platformBreakdown[platform].revenueCents / 100;
      }

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

  // Per-article rollup — article ownership required.
  app.get("/api/revenue/article/:articleId", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireArticle(req.params.articleId, user.id);
      const purchases = await storage.getPurchaseEvents({ articleId: req.params.articleId });
      const totalRevenueCents = purchases.reduce((sum, p) => sum + centsOf(p), 0);
      const totalRevenue = totalRevenueCents / 100;
      res.json({
        success: true,
        data: { purchases, totalRevenue, totalOrders: purchases.length },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch article revenue");
    }
  });

  // Per-brand rollup — :brandId ownership guard runs upstream so no
  // manual check needed here.
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
}
