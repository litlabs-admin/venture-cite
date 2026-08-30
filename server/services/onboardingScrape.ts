// Onboarding brand-scrape pipeline, extracted verbatim from
// server/routes/onboarding.ts (POST /api/onboarding/scrape-stream) as part
// of the B7 service-layer split.
//
// Runs two strategies against the target domain to build a BrandProfile:
// a homepage read, then (if thin) a sitemap-driven "about" page merge.
// Progress is reported through `emit`, a plain callback the caller wires to
// its own transport (SSE in the route) - this module never touches Express
// types, req, or res.
//
// The only change from the original inline handler body is the progress
// sink: direct `sseWrite(res, event)` calls became `emit(event)` calls.
// Everything else - fetch order, thresholds, error classification - is
// unchanged.

import { logger } from "../lib/logger";
import { safeFetchText } from "../lib/ssrf";
import { scrapeLogoUrl } from "../lib/logoScraper";
import { extractPageContent, extractBodyText } from "../lib/pageText";
import { downloadAndStoreLogo } from "../lib/logoStorage";
import crypto from "crypto";
import { getOpenrouterClient } from "../lib/factAgent/v2/openrouterClient";
import {
  BRAND_PROFILE_SYSTEM_PROMPT,
  brandProfileSchema,
  parseBrandProfile,
  type BrandProfile,
} from "../lib/brandProfilePrompt";
import { MODELS } from "../lib/modelConfig";

export type ScrapeEvent = Record<string, unknown>;

export type OnboardingScrapeOutcome =
  | { kind: "llm_failed" }
  | { kind: "unreachable"; domain: string }
  | {
      kind: "success";
      data: {
        brandName: string;
        companyName: string;
        industry: string;
        description: string;
        tone: string;
        products: BrandProfile["products"];
        keyValues: BrandProfile["keyValues"];
        uniqueSellingPoints: BrandProfile["uniqueSellingPoints"];
        targetAudience: string;
        brandVoice: string;
        nameVariations: BrandProfile["nameVariations"];
        logoUrl: string | null;
        competitors: BrandProfile["competitors"];
      };
    };

export async function runOnboardingBrandScrape(
  domain: string,
  homepageUrl: string,
  emit: (event: ScrapeEvent) => void,
): Promise<OnboardingScrapeOutcome> {
  emit({ type: "log", icon: "search", message: `Reading ${domain}…` });

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

  // extractPageContent puts the <head> metadata (title, description,
  // Open Graph) in front of the body text. That is what makes a
  // client-rendered site usable: humanarc.io's body strips to 53
  // characters, well under the threshold below, but its head carries
  // 488 characters describing the product. Before this the page read
  // as empty and the LLM call was skipped entirely.
  const page = extractPageContent(html, 8_000);
  const pageText = page.text;

  let logoUrl: string | null = null;
  let scrapedLogoSource: string | null = null;
  if (html && homepageStatus >= 200 && homepageStatus < 400) {
    emit({ type: "log", icon: "page", message: "Found your homepage." });
    scrapedLogoSource = await scrapeLogoUrl(homepageUrl, html).catch(() => null);
    if (scrapedLogoSource) {
      emit({ type: "log", icon: "check", message: "Detected brand logo." });
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

  // Tracks whether an LLM call THREW, which is different from one that
  // returned little. A thin site legitimately yields a thin profile and
  // the user corrects it on the confirm screen - that is by design. A
  // FAILED call produced the same empty object, and this endpoint
  // reported both as success, so an OpenRouter timeout or rate limit
  // reached the user as "we read your site and found nothing", with no
  // error shown and nothing to retry. Measured against the real
  // venturecite.com homepage this call takes 8.2-10.4s, so it fails
  // often enough to matter.
  let llmFailed = false;

  const callBrandLLM = async (context: string): Promise<BrandProfile> => {
    const client = getOpenrouterClient();
    if (!client) throw new Error("AI service is not configured");
    const completion = await client.chat.completions.create(
      {
        model: MODELS.brandAutofill,
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: BRAND_PROFILE_SYSTEM_PROMPT },
          { role: "user", content: context },
        ],
        // Was 1200, which this prompt routinely brushes against.
        // Measured on the real venturecite.com homepage: completion
        // lengths of 895, 902, 1182 and 1209 tokens across four runs.
        // Above the cap the model stops mid-JSON, finish_reason comes
        // back "length", parseBrandProfile cannot parse the truncated
        // object and returns null - which used to become an empty
        // profile reported as success. That is the coin flip behind
        // "sometimes it fills the form, sometimes every field is
        // blank" on content-rich sites. Headroom is cheap; a silent
        // blank confirm screen is not.
        max_tokens: 3000,
      },
      // This call had no timeout at all, so a hung provider held the
      // request open until the platform killed the whole function -
      // which closes the SSE stream with no error event and leaves
      // the client waiting forever. 25s matches the sibling call in
      // routes/brands.ts and sits under vercel.json's maxDuration.
      { signal: AbortSignal.timeout(25_000) },
    );
    const choice = completion.choices[0];
    const profile = parseBrandProfile(choice?.message?.content);
    if (!profile) {
      // Unparseable output is a failed call, not an empty website.
      // Throwing routes it into the caller's catch, which sets
      // llmFailed and surfaces a retryable error instead of an
      // empty confirm screen.
      throw new Error(
        `brand profile unparseable (finish_reason=${choice?.finish_reason ?? "unknown"})`,
      );
    }
    return profile;
  };

  let parsed: BrandProfile = brandProfileSchema.parse({});
  if (pageText.length > 200) {
    emit({ type: "log", icon: "brain", message: "Analyzing homepage content…" });
    parsed = await callBrandLLM(
      `Website URL: ${homepageUrl}\n\nWebsite content:\n${pageText}`,
    ).catch((err) => {
      logger.warn({ err, domain }, "onboarding scrape: strategy 1 LLM failed");
      llmFailed = true;
      return brandProfileSchema.parse({});
    });
    if (parsed.name) {
      emit({
        type: "log",
        icon: "check",
        message: `Detected brand name: ${parsed.name}`,
      });
    }
  }

  const factsCount = (obj: BrandProfile): number => {
    let n = 0;
    for (const value of [
      obj.name,
      obj.industry,
      obj.description,
      obj.targetAudience,
      obj.brandVoice,
    ]) {
      if (typeof value === "string" && value.trim()) n += 1;
    }
    for (const list of [obj.products, obj.keyValues, obj.uniqueSellingPoints]) {
      if (Array.isArray(list) && list.length > 0) n += 1;
    }
    return n;
  };

  if (factsCount(parsed) < 3) {
    emit({
      type: "log",
      icon: "retry",
      message: "Thin results - trying sitemap…",
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
              fetched.push(extractBodyText(page.text).slice(0, 4_000));
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
      ).catch((err) => {
        logger.warn({ err, domain }, "onboarding scrape: strategy 2 LLM failed");
        llmFailed = true;
        return brandProfileSchema.parse({});
      });
      // A successful second pass clears the first pass's failure: an
      // answer did arrive, so this is no longer an error to report.
      if (merged.name) llmFailed = false;
      for (const [k, v] of Object.entries(merged) as [keyof BrandProfile, unknown][]) {
        const current = parsed[k];
        if (!current || (Array.isArray(current) && current.length === 0)) {
          (parsed as Record<string, unknown>)[k] = v;
        }
      }
    }
  }

  // A third strategy used to live here: when the first two returned
  // thin data it asked the model "What do you know about the domain
  // X?" with NO page content at all. For any company below Wikipedia
  // notability that is a hallucination generator, and it fired
  // exactly when the user had least evidence to catch it - the
  // output goes straight onto the "Confirm the brand" screen.
  // Thin input must present as thin so the user corrects it.

  // Report a failed read as a failure. Until now every path fell
  // through to the `result` event below, so three different outcomes
  // arrived at the confirm screen looking identical - a logo and
  // empty fields:
  //   1. the page had nothing to say (correct, user fills it in),
  //   2. the LLM call threw (an error, and retrying often works),
  //   3. the page could not be fetched at all (an error).
  // Only the first is a legitimate result. The other two now surface,
  // so the user retries instead of hand-filling a form because they
  // were told their site is empty.
  if (llmFailed && !parsed.name) {
    return { kind: "llm_failed" };
  }
  if (!html) {
    return { kind: "unreachable", domain };
  }

  const data = {
    brandName: parsed.name ?? "",
    companyName: parsed.companyName ?? "",
    industry: parsed.industry ?? "",
    description: parsed.description ?? "",
    tone: parsed.tone ?? "",
    products: parsed.products,
    keyValues: parsed.keyValues,
    uniqueSellingPoints: parsed.uniqueSellingPoints,
    targetAudience: parsed.targetAudience ?? "",
    brandVoice: parsed.brandVoice ?? "",
    nameVariations: parsed.nameVariations,
    logoUrl,
    competitors: parsed.competitors,
  };

  return { kind: "success", data };
}
