// Server-side onboarding state (Wave 4.7).
//
// Single endpoint that merges keys into users.onboarding_state. The
// allowlist below defines the only fields that the client can write —
// arbitrary keys are silently dropped. Add new flags here as we
// introduce them; that keeps the column from accumulating dead /
// abusive data.
//
// Backs the SidebarOnboarding component, which reads/writes these
// flags to drive the checklist state.

import type { Express, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { logger } from "../lib/logger";
import { Sentry } from "../instrument";
import { validateDomain } from "@shared/validateDomain";
import { safeFetchText } from "../lib/ssrf";
import { scrapeLogoUrl } from "../lib/factExtractor";
import { downloadAndStoreLogo } from "../lib/logoStorage";
import crypto from "crypto";
import { requireUser } from "../lib/ownership";
import { aiLimitMiddleware, openai, safeParseJson, sendError } from "../lib/routesShared";
import { MODELS } from "../lib/modelConfig";
import { storage } from "../storage";
import { withBrandQuota, isUsageLimitError } from "../lib/usageLimit";
import type { Tier } from "../lib/llmPricing";
import { runOnboardingAutopilot } from "../lib/onboardingAutopilot";

// Allowlist of field names the client can write into onboarding_state.
// Add new keys as new flags appear in the UI.
const ONBOARDING_FIELDS = new Set([
  "guidedSeen",
  "checklistDismissed",
  "checklistExpanded",
  "sidebarSeenAt",
  "platformGuideCompletedSteps",
]);

export function setupOnboardingRoutes(app: Express) {
  app.patch("/api/onboarding/state", async (req, res) => {
    try {
      const user = (req as unknown as { user?: { id: string } }).user;
      if (!user) {
        return res.status(401).json({ success: false, error: "Not authenticated" });
      }

      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ success: false, error: "Body must be a JSON object." });
      }

      // Filter to allowlisted keys. Anything else is silently ignored —
      // the client gets a 200 either way so a slightly out-of-date client
      // doesn't fail outright when the server has tightened the allowlist.
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (ONBOARDING_FIELDS.has(key)) {
          patch[key] = value;
        }
      }

      if (Object.keys(patch).length === 0) {
        // Nothing to write but caller did supply something — surface it
        // as 400 so a client typo doesn't silently no-op forever.
        return res.status(400).json({
          success: false,
          error: "No recognized onboarding fields in body.",
          allowedFields: Array.from(ONBOARDING_FIELDS),
        });
      }

      // jsonb || jsonb merges keys (right wins). One query, atomic.
      const [row] = await db
        .update(users)
        .set({
          onboardingState: sql`COALESCE(${users.onboardingState}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        })
        .where(eq(users.id, user.id))
        .returning({ onboardingState: users.onboardingState });

      res.json({ success: true, onboardingState: row?.onboardingState ?? {} });
    } catch (err) {
      logger.error({ err }, "onboarding state update failed");
      Sentry.captureException(err, { tags: { source: "onboarding-state" } });
      res.status(500).json({ success: false, error: "Failed to save onboarding state." });
    }
  });

  const activeScrapes = new Map<string, true>();

  function sseWrite(res: Response, event: Record<string, unknown>): void {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      logger.warn({ err }, "onboarding scrape: SSE write failed");
    }
  }

  app.post("/api/onboarding/scrape-stream", aiLimitMiddleware, async (req, res) => {
    const user = (req as unknown as { user?: { id: string } }).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const rawDomain = typeof req.body?.domain === "string" ? req.body.domain : "";
    const validation = validateDomain(rawDomain);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    if (!validation.valid) {
      sseWrite(res, { type: "error", reason: validation.reason });
      res.end();
      return;
    }

    if (activeScrapes.has(user.id)) {
      sseWrite(res, { type: "error", reason: "A scrape is already in progress" });
      res.end();
      return;
    }
    activeScrapes.set(user.id, true);

    const domain = validation.normalized;
    const homepageUrl = `https://${domain}`;

    try {
      sseWrite(res, { type: "log", icon: "search", message: `Reading ${domain}…` });

      let html = "";
      let homepageStatus = 0;
      try {
        const fetched = await safeFetchText(homepageUrl, {
          maxBytes: 2 * 1024 * 1024,
          timeoutMs: 10_000,
        });
        homepageStatus = fetched.status;
        html = fetched.text;
      } catch (err) {
        logger.warn({ err, domain }, "onboarding scrape: homepage fetch failed");
      }

      const pageText = html
        ? html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 8_000)
        : "";

      let logoUrl: string | null = null;
      let scrapedLogoSource: string | null = null;
      if (html && homepageStatus >= 200 && homepageStatus < 400) {
        sseWrite(res, { type: "log", icon: "page", message: "Found your homepage." });
        scrapedLogoSource = await scrapeLogoUrl(homepageUrl, html).catch(() => null);
        if (scrapedLogoSource) {
          sseWrite(res, { type: "log", icon: "check", message: "Detected brand logo." });
          // Mirror it to Supabase Storage so we get a stable, CSP-friendly URL
          // that survives source-site redesigns. Keyed by domain hash so
          // re-scraping the same domain overwrites the file.
          const key = crypto.createHash("sha1").update(domain).digest("hex").slice(0, 24);
          logoUrl = await downloadAndStoreLogo(scrapedLogoSource, key);
          if (!logoUrl) {
            logger.warn({ scrapedLogoSource, domain }, "onboarding: logo store failed, dropping");
          }
        }
      }

      const callBrandLLM = async (context: string): Promise<Record<string, any>> => {
        const completion = await openai.chat.completions.create({
          model: MODELS.brandAutofill,
          response_format: { type: "json_object" },
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are an expert brand analyst. Return a JSON object with these fields: brandName, industry, description, products (array), keyValues (array), uniqueSellingPoints (array), targetAudience, brandVoice, competitors (array of {name, domain, description}).
If unsure of a field, omit it or return empty. Never invent a URL.`,
            },
            { role: "user", content: context },
          ],
          max_tokens: 1200,
        });
        return safeParseJson<Record<string, any>>(completion.choices[0]?.message?.content) ?? {};
      };

      let parsed: Record<string, any> = {};
      if (pageText.length > 200) {
        sseWrite(res, { type: "log", icon: "brain", message: "Analyzing homepage content…" });
        parsed = await callBrandLLM(
          `Website URL: ${homepageUrl}\n\nWebsite content:\n${pageText}`,
        ).catch((err) => {
          logger.warn({ err, domain }, "onboarding scrape: strategy 1 LLM failed");
          return {};
        });
        if (parsed.brandName) {
          sseWrite(res, {
            type: "log",
            icon: "check",
            message: `Detected brand name: ${parsed.brandName}`,
          });
        }
      }

      const factsCount = (obj: Record<string, any>): number => {
        let n = 0;
        for (const key of [
          "brandName",
          "industry",
          "description",
          "targetAudience",
          "brandVoice",
        ]) {
          if (typeof obj[key] === "string" && obj[key].trim()) n += 1;
        }
        for (const key of ["products", "keyValues", "uniqueSellingPoints"]) {
          if (Array.isArray(obj[key]) && obj[key].length > 0) n += 1;
        }
        return n;
      };

      if (factsCount(parsed) < 3) {
        sseWrite(res, {
          type: "log",
          icon: "retry",
          message: "Thin results — trying sitemap…",
        });
        let sitemapText = "";
        try {
          const sitemap = await safeFetchText(`${homepageUrl}/sitemap.xml`, {
            maxBytes: 512 * 1024,
            timeoutMs: 8_000,
          });
          if (sitemap.status >= 200 && sitemap.status < 300) {
            const urls = Array.from(sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/gi))
              .map((m) => m[1])
              .filter((u) => /(about|team|company|story)/i.test(u))
              .slice(0, 3);
            const fetched: string[] = [];
            for (const u of urls) {
              try {
                const page = await safeFetchText(u, {
                  maxBytes: 1 * 1024 * 1024,
                  timeoutMs: 8_000,
                });
                if (page.status >= 200 && page.status < 300) {
                  fetched.push(
                    page.text
                      .replace(/<script[\s\S]*?<\/script>/gi, " ")
                      .replace(/<style[\s\S]*?<\/style>/gi, " ")
                      .replace(/<[^>]+>/g, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 4_000),
                  );
                }
              } catch {
                /* skip */
              }
            }
            sitemapText = fetched.join("\n\n---\n\n").slice(0, 8_000);
          }
        } catch (err) {
          logger.warn({ err, domain }, "onboarding scrape: sitemap fetch failed");
        }

        if (sitemapText) {
          const merged = await callBrandLLM(
            `Website URL: ${homepageUrl}\n\nCombined page content:\n${pageText}\n\n${sitemapText}`,
          ).catch(() => ({}) as Record<string, any>);
          for (const [k, v] of Object.entries(merged)) {
            if (!parsed[k] || (Array.isArray(parsed[k]) && parsed[k].length === 0)) {
              parsed[k] = v;
            }
          }
        }
      }

      if (factsCount(parsed) < 3) {
        sseWrite(res, {
          type: "log",
          icon: "brain",
          message: "Still thin — asking the model what it knows…",
        });
        const fallback = await callBrandLLM(
          `What do you know about the domain ${domain}? Return the usual JSON shape.`,
        ).catch(() => ({}) as Record<string, any>);
        for (const [k, v] of Object.entries(fallback)) {
          if (!parsed[k] || (Array.isArray(parsed[k]) && parsed[k].length === 0)) {
            parsed[k] = v;
          }
        }
      }

      const competitors = Array.isArray(parsed.competitors)
        ? parsed.competitors
            .filter((c: any) => c && typeof c.name === "string")
            .slice(0, 10)
            .map((c: any) => ({
              name: String(c.name).slice(0, 200),
              domain: typeof c.domain === "string" ? c.domain.slice(0, 200) : "",
              description: typeof c.description === "string" ? c.description.slice(0, 500) : "",
            }))
        : [];

      const data = {
        brandName: typeof parsed.brandName === "string" ? parsed.brandName : "",
        industry: typeof parsed.industry === "string" ? parsed.industry : "",
        description: typeof parsed.description === "string" ? parsed.description : "",
        products: Array.isArray(parsed.products) ? parsed.products : [],
        keyValues: Array.isArray(parsed.keyValues) ? parsed.keyValues : [],
        uniqueSellingPoints: Array.isArray(parsed.uniqueSellingPoints)
          ? parsed.uniqueSellingPoints
          : [],
        targetAudience: typeof parsed.targetAudience === "string" ? parsed.targetAudience : "",
        brandVoice: typeof parsed.brandVoice === "string" ? parsed.brandVoice : "",
        logoUrl,
        competitors,
      };

      sseWrite(res, { type: "result", data });
      sseWrite(res, { type: "end" });
      res.end();
    } catch (err) {
      logger.error({ err, domain }, "onboarding scrape stream failed");
      Sentry.captureException(err, { tags: { source: "onboarding-scrape" } });
      sseWrite(res, { type: "error", reason: "Scrape failed" });
      res.end();
    } finally {
      activeScrapes.delete(user.id);
    }
  });

  app.post("/api/onboarding/confirm", async (req, res) => {
    try {
      const user = requireUser(req);
      const body = req.body ?? {};
      const brandData = body.brandData ?? {};
      const competitors = Array.isArray(body.competitors) ? body.competitors : [];

      const brandName = typeof brandData.brandName === "string" ? brandData.brandName.trim() : "";
      const website = typeof brandData.website === "string" ? brandData.website.trim() : "";
      if (!brandName) {
        return res.status(400).json({ success: false, error: "brandName is required" });
      }
      if (!website) {
        return res.status(400).json({ success: false, error: "website is required" });
      }

      const tier = (user.accessTier || "free") as Tier;
      const schema = await import("@shared/schema");

      let brand;
      try {
        brand = await withBrandQuota(user.id, tier, async (tx) => {
          const [row] = await tx
            .insert(schema.brands)
            .values({
              userId: user.id,
              name: brandName,
              companyName:
                typeof brandData.companyName === "string" && brandData.companyName.trim()
                  ? brandData.companyName.trim()
                  : brandName,
              industry:
                typeof brandData.industry === "string" && brandData.industry.trim()
                  ? brandData.industry.trim()
                  : "General",
              description: typeof brandData.description === "string" ? brandData.description : null,
              website,
              tone:
                typeof brandData.tone === "string" && brandData.tone.trim()
                  ? brandData.tone.trim()
                  : "professional",
              targetAudience:
                typeof brandData.targetAudience === "string" ? brandData.targetAudience : null,
              products: Array.isArray(brandData.products) ? brandData.products : [],
              keyValues: Array.isArray(brandData.keyValues) ? brandData.keyValues : [],
              uniqueSellingPoints: Array.isArray(brandData.uniqueSellingPoints)
                ? brandData.uniqueSellingPoints
                : [],
              brandVoice: typeof brandData.brandVoice === "string" ? brandData.brandVoice : null,
              logoUrl: typeof brandData.logoUrl === "string" ? brandData.logoUrl : null,
              autopilotStatus: "pending",
              autopilotStep: 0,
            })
            .returning();
          return row;
        });
      } catch (err) {
        if (isUsageLimitError(err)) {
          return res.status(403).json({ success: false, error: err.message, limitReached: true });
        }
        throw err;
      }

      for (const c of competitors) {
        if (!c || typeof c.name !== "string" || !c.name.trim()) continue;
        try {
          await storage.createCompetitor({
            brandId: brand.id,
            name: c.name.trim().slice(0, 200),
            domain: typeof c.domain === "string" ? c.domain.trim().slice(0, 200) : "",
            industry: brand.industry || null,
            description: typeof c.description === "string" ? c.description.slice(0, 500) : null,
            discoveredBy: "manual",
          } as any);
        } catch (err) {
          logger.warn({ err, brandId: brand.id }, "onboarding confirm: competitor insert failed");
        }
      }

      setImmediate(() => {
        void runOnboardingAutopilot(brand.id, user.id);
      });

      res.json({ success: true, brandId: brand.id });
    } catch (err) {
      sendError(res, err, "Failed to confirm onboarding");
    }
  });

  app.get("/api/onboarding/autopilot-status/:brandId", async (req, res) => {
    try {
      const user = requireUser(req);
      const brand = await storage.getBrandByIdForUser(req.params.brandId, user.id);
      if (!brand) {
        return res.status(404).json({ success: false, error: "Brand not found" });
      }
      res.json({
        success: true,
        status: brand.autopilotStatus ?? "idle",
        step: brand.autopilotStep ?? 0,
        progress: brand.autopilotProgress ?? {},
        error: brand.autopilotError ?? null,
        startedAt: brand.autopilotStartedAt ?? null,
        completedAt: brand.autopilotCompletedAt ?? null,
      });
    } catch (err) {
      sendError(res, err, "Failed to fetch autopilot status");
    }
  });
}
