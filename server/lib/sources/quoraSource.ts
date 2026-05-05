// server/lib/sources/quoraSource.ts
//
// Brand-mention scanner for Quora — uses Puppeteer + headless Chromium to
// load Quora's own search results page (`/search?q=...&type=question`) and
// extract question-slug links from the rendered DOM.
//
// On Vercel Hobby the binary is fetched at runtime from a GitHub release tar
// via @sparticuz/chromium-min (< 50 MB compressed). Local dev falls back to a
// system Chrome installation (override via QUORA_LOCAL_CHROME_PATH env var).
//
// Empty results are NOT treated as failures. The `failed` field is set only
// when something definitively went wrong (rate-limited, navigation error on
// every variation, etc.).

import type { Browser } from "puppeteer-core";
import { passesBrandPresenceGate } from "../brandPresenceGate";
import { acquireOrWait } from "../rateLimitBuckets";
import { logger } from "../logger";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type QuoraScanInput = {
  query: string; // kept for orchestrator compat — used as fallback when variations is empty
  variations: string[];
  brandId: string;
};

export type QuoraMention = {
  platform: "quora";
  sourceUrl: string;
  sourceTitle: string;
  /** Always empty — we can't fetch the answer body without hitting Quora's auth wall. */
  mentionContext: string;
  mentionLocation: "post";
  matchedVariation: string;
  matchedField: "title" | "selftext" | "body" | "comment";
  engagementInputs?: undefined;
};

export type QuoraScanResult = {
  mentions: QuoraMention[];
  failed?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VARIATIONS = 2;
const MAX_MENTIONS = 25;

/**
 * Chromium binary tarball compatible with @sparticuz/chromium-min@148.0.0.
 * The version here must match the installed package version — bump together
 * if you upgrade @sparticuz/chromium-min.
 */
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.tar";

/**
 * Excluded path prefixes — defence-in-depth on top of the slug regex.
 * The slug regex already rejects paths with internal slashes, but being
 * explicit guards against future regex loosening.
 *
 * Uses `(\/|$)` as the boundary (not `\b`) to avoid false-positives on
 * paths like `/q-a-linear` where `q` is immediately followed by a hyphen
 * (`-` is a non-word char so `\b` would trigger, incorrectly excluding it).
 */
const EXCLUDED_PATH_PREFIXES_RE = /^\/(topic|profile|q|topic_main|tribunes)(\/|$)/i;

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

/**
 * Launch a headless Chromium browser. Uses dynamic imports so the chromium
 * binary only loads when this function is actually called — avoids paying
 * the cold-start cost on every request that doesn't scan Quora.
 *
 * Environment detection:
 *   VERCEL=1   → Vercel production → use @sparticuz/chromium-min + URL download
 *   NODE_ENV=production → treat as production (catches non-Vercel deployments)
 *   Otherwise  → local dev → use system Chrome (path configurable via env var)
 */
async function launchBrowser(): Promise<Browser> {
  const isVercel = !!process.env["VERCEL"] || process.env["NODE_ENV"] === "production";

  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });
  }

  // Local dev: use a system Chrome installation.
  // Windows default path; override via QUORA_LOCAL_CHROME_PATH env var.
  const puppeteer = await import("puppeteer-core");
  const localPath =
    process.env["QUORA_LOCAL_CHROME_PATH"] ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return puppeteer.launch({ executablePath: localPath, headless: true });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scanQuoraSource(input: QuoraScanInput): Promise<QuoraScanResult> {
  // Cap to MAX_VARIATIONS (2). Each page-load costs 5-10 s; 2 × 10 s = 20 s,
  // well within the Vercel Hobby 60 s function ceiling.
  const variations = (input.variations.length > 0 ? input.variations : [input.query]).slice(
    0,
    MAX_VARIATIONS,
  );

  // Accumulated mentions keyed by canonical URL — dedupes across variations.
  const mentions = new Map<string, QuoraMention>();
  const failures: string[] = [];

  // Single browser instance shared across all variations to avoid the extra
  // startup cost of launching a new browser per variation.
  let browser: Browser | null = null;

  try {
    for (const variation of variations) {
      // Rate-limit gate (shared quora bucket).
      const acquired = await acquireOrWait("quora", input.brandId, 10_000);
      if (!acquired) {
        failures.push(`rate-limited on "${variation}"`);
        continue;
      }

      try {
        if (!browser) browser = await launchBrowser();

        const page = await browser.newPage();

        // Mimic a real browser to reduce Cloudflare friction.
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        );
        await page.setViewport({ width: 1280, height: 800 });

        const url = `https://www.quora.com/search?q=${encodeURIComponent(variation)}&type=question`;
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });

        // Wait briefly for question-link anchors to appear in the DOM.
        // Don't fail hard if they don't — Quora may show a login wall or
        // return zero results; we'll just get an empty link list.
        try {
          await page.waitForSelector('a[href^="/"]', { timeout: 5_000 });
        } catch {
          // Intentionally swallow: proceed with whatever rendered.
        }

        // Extract all anchor tags whose href starts with "/" (relative Quora
        // paths). The browser will have resolved them to absolute URLs by the
        // time we read .href in $$eval.
        // The callback runs inside the page context; parameters are typed as
        // Element[] in puppeteer-core's generics.
        const links = await page.$$eval('a[href^="/"]', (anchors: Element[]) =>
          anchors
            .map((a: Element) => ({
              href: (a as HTMLAnchorElement).href,
              text: (a as HTMLAnchorElement).innerText.trim(),
            }))
            .filter((l: { href: string; text: string }) => l.href && l.text),
        );

        // Capture page-level signals to distinguish login wall vs empty results.
        const pageTitle = await page.title();
        const bodySnippet = await page
          .$eval("body", (b: Element) => (b as HTMLElement).innerText.slice(0, 400))
          .catch(() => "");
        const looksLikeLoginWall =
          /sign\s*in|log\s*in|continue with|join quora/i.test(bodySnippet) ||
          /sign\s*in|log\s*in/i.test(pageTitle);

        await page.close();

        // Diagnostics — break down why links are rejected so we can tell
        // a login-wall (rawLinks ~ 0) from a gate-rejection (many slugs, none
        // pass brand gate).
        let invalidUrl = 0;
        let nonQuoraHost = 0;
        let nonSlugPath = 0;
        let excludedPrefix = 0;
        let gateRejected = 0;
        let accepted = 0;
        const gateRejectedSamples: string[] = [];

        // Filter links and run brand-presence gate.
        for (const { href, text } of links) {
          if (mentions.size >= MAX_MENTIONS) break;

          let parsed: URL;
          try {
            parsed = new URL(href);
          } catch {
            invalidUrl++;
            continue;
          }

          // Must be quora.com.
          if (!parsed.hostname.endsWith("quora.com")) {
            nonQuoraHost++;
            continue;
          }

          // Normalise the path for regex tests: strip any trailing slash so
          // `/Why-is-Linear-cool/` and `/Why-is-Linear-cool` are treated
          // identically.
          const normPath = parsed.pathname.replace(/\/+$/, "");

          // Must match question-slug pattern: a single path segment with at
          // least one hyphen — e.g. /Some-Question-Title.
          const slugMatch = /^\/[^/?#]+(-[^/?#]+)+$/.test(normPath);
          if (!slugMatch) {
            nonSlugPath++;
            continue;
          }

          // Reject known non-question path prefixes.
          if (EXCLUDED_PATH_PREFIXES_RE.test(normPath)) {
            excludedPrefix++;
            continue;
          }

          // Brand presence gate — title text must contain a brand variation.
          const gate = passesBrandPresenceGate(
            { title: text },
            input.variations.length > 0 ? input.variations : [input.query],
          );
          if (!gate.matched) {
            gateRejected++;
            if (gateRejectedSamples.length < 5) {
              gateRejectedSamples.push(`${normPath} :: ${text.slice(0, 120)}`);
            }
            continue;
          }
          accepted++;

          // Canonical URL: lowercase path, no query/fragment, no trailing slash.
          const canonical = `${parsed.protocol}//${parsed.host}${parsed.pathname.toLowerCase().replace(/\/+$/, "")}`;
          if (mentions.has(canonical)) continue;

          mentions.set(canonical, {
            platform: "quora",
            sourceUrl: canonical,
            sourceTitle: text.slice(0, 300),
            mentionContext: "",
            mentionLocation: "post",
            matchedVariation: gate.matchedVariation,
            matchedField: gate.matchedField,
          });
        }

        logger.info(
          {
            variation,
            pageTitle,
            looksLikeLoginWall,
            bodySnippet: bodySnippet.slice(0, 200),
            rawLinks: links.length,
            invalidUrl,
            nonQuoraHost,
            nonSlugPath,
            excludedPrefix,
            gateRejected,
            accepted,
            gateRejectedSamples,
          },
          "quora.variation_diagnostics",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`fetch error on "${variation}": ${msg}`);
        logger.warn({ variation, err: msg }, "quora.variation_failed");
      }
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Swallow close errors — the scan result is what matters.
      }
    }
  }

  // Every variation failed → surface the first failure message.
  if (mentions.size === 0 && failures.length === variations.length) {
    return {
      mentions: [],
      failed: `quora: ${failures[0] ?? "all variation queries failed"}`,
    };
  }

  return { mentions: Array.from(mentions.values()) };
}
