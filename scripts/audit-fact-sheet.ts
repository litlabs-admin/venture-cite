// End-to-end audit harness for the brand fact sheet pipeline.
//
// Exercises the same v2 modules that production uses (sitemap discovery,
// URL tier scoring, the page guards, hydration extraction, structured-
// data extraction, body text extraction, and optionally the LLM
// extraction prompt) against real production URLs, no database or HTTP
// server required.
//
// Why this exists: the user reported the brand fact sheet "doesn't work
// properly" on real sites. This script collects the exact data the
// pipeline collects and prints it in a way that surfaces:
//
//   - which sites have parseable sitemaps and which fall through to
//     robots.txt
//   - which URLs get selected vs dropped by tier scoring (and why)
//   - which pages pass / which get skipped at each guard, with the
//     diagnostics value the guard saw
//   - LLM cost + fact count per page, when LLM is enabled
//
// Run: npx tsx scripts/audit-fact-sheet.ts
//      npx tsx scripts/audit-fact-sheet.ts --llm   (also runs extraction)
//      npx tsx scripts/audit-fact-sheet.ts --site notion.com
//
// Output: structured JSON-ish report to stdout + summary at the end.

// Load env from the .env file like the rest of the app does.
import "dotenv/config";

import { safeFetchTextWithLockedIp } from "../server/lib/ssrf";
import { discoverSitemapUrls } from "../server/lib/factAgent/v2/sitemapDiscovery";
import { selectTopUrls, scoreUrl } from "../server/lib/factAgent/v2/urlTierScoring";
import {
  isNonHtml,
  isWafBlocked,
  isSoft404,
  isCookieWall,
  isHollowShell,
  detectCanonicalRedirect,
} from "../server/lib/factAgent/v2/pageGuards";
import { extractHydration } from "../server/lib/factAgent/v2/rscExtractor";
import { extractStructuredData, stripToBodyText } from "../server/lib/factAgent/v2/pageExtractors";
import { canonicalizeUrl } from "../server/lib/factAgent/canonicalize";
import {
  buildExtractionPrompt,
  parseFactsWithRepair,
} from "../server/lib/factAgent/v2/extractionPrompt";
import { sanitizeHydration } from "../server/lib/factAgent/v2/hydrationSanitizer";
import { MODELS } from "../server/lib/modelConfig";
import { subcategoryFor, type Domain } from "../shared/factAgent/schema";
import OpenAI from "openai";

const TEST_SITES = [
  { brand: "Adyen", url: "https://adyen.com/" },
  { brand: "Samsung", url: "https://samsung.com/" },
  { brand: "VenturePR", url: "https://venturepr.com/" },
  { brand: "Notion", url: "https://notion.com/" },
];

const args = process.argv.slice(2);
const LLM_ENABLED = args.includes("--llm");
const SITE_FILTER = args.find((a, i) => args[i - 1] === "--site");

const sites = SITE_FILTER
  ? TEST_SITES.filter((s) => s.url.toLowerCase().includes(SITE_FILTER.toLowerCase()))
  : TEST_SITES;

if (sites.length === 0) {
  console.error(`No sites matched --site=${SITE_FILTER}`);
  process.exit(1);
}

// ------------- helpers -------------

function box(title: string) {
  const line = "═".repeat(78);
  console.log(`\n╔${line}╗\n║ ${title.padEnd(76)} ║\n╚${line}╝`);
}

function section(title: string) {
  console.log(`\n──── ${title} ${"─".repeat(Math.max(0, 73 - title.length))}`);
}

function ms(start: number) {
  return `${Date.now() - start}ms`;
}

function bytes(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

// The fetcher used by sitemap discovery — supports byte caps.
const sitemapFetcher = async (
  url: string,
  opts?: { maxBytes?: number },
): Promise<{ status: number; text: string }> => {
  try {
    const r = await safeFetchTextWithLockedIp(url, {
      maxBytes: opts?.maxBytes ?? 500_000,
      timeoutMs: 10_000,
    });
    return { status: r.status, text: r.text };
  } catch (err) {
    return { status: 0, text: "" };
  }
};

// Build the LLM caller (OpenAI direct, no failover for clarity in the
// audit output).
const openai = LLM_ENABLED
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 })
  : null;

async function llmCall(prompt: any): Promise<string> {
  if (!openai) throw new Error("LLM disabled");
  const messages =
    typeof prompt === "string"
      ? [{ role: "user" as const, content: prompt }]
      : [
          { role: "system" as const, content: prompt.system },
          { role: "user" as const, content: prompt.user },
        ];
  // Mirror production: when the prompt carries a json_schema
  // responseFormat, use it for strict schema enforcement.
  const responseFormat =
    typeof prompt === "object" && prompt && "responseFormat" in prompt && prompt.responseFormat
      ? prompt.responseFormat
      : { type: "json_object" };
  const res = await openai.chat.completions.create({
    model: MODELS.misc,
    response_format: responseFormat as never,
    messages,
  });
  return res.choices?.[0]?.message?.content ?? "";
}

// ------------- per-site flow -------------

interface SiteReport {
  brand: string;
  url: string;
  sitemap: {
    urlsDiscovered: number;
    durationMs: number;
    firstFive: string[];
  };
  selected: {
    count: number;
    urls: string[];
    droppedCount: number;
  };
  pages: Array<{
    url: string;
    status: string;
    statusCode: number | null;
    bodyTextLength: number;
    bytes: number;
    hadHydration: boolean;
    hadRsc: boolean;
    hasStructuredData: boolean;
    skipReason: string | null;
    fetchError: string | null;
    durationMs: number;
    factCount?: number;
    llmRepairUsed?: boolean;
    sampleFacts?: Array<{ key: string; value: string; conf: number }>;
  }>;
  observations: string[];
}

async function auditPage(
  brandName: string,
  brandUrl: string,
  pageUrl: string,
): Promise<SiteReport["pages"][number]> {
  const start = Date.now();
  const result: SiteReport["pages"][number] = {
    url: pageUrl,
    status: "unknown",
    statusCode: null,
    bodyTextLength: 0,
    bytes: 0,
    hadHydration: false,
    hadRsc: false,
    hasStructuredData: false,
    skipReason: null,
    fetchError: null,
    durationMs: 0,
  };

  let res: Awaited<ReturnType<typeof safeFetchTextWithLockedIp>>;
  try {
    res = await safeFetchTextWithLockedIp(pageUrl, {
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 10_000,
    });
  } catch (err) {
    result.fetchError = err instanceof Error ? err.message : String(err);
    result.status = "fetch_failed";
    result.durationMs = Date.now() - start;
    return result;
  }
  result.statusCode = res.status;
  result.bytes = res.text.length;

  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) {
    headersLower[k.toLowerCase()] = v;
  }

  if (isNonHtml(res.contentType)) {
    result.status = "skipped_non_html";
    result.skipReason = `content-type=${res.contentType}`;
    result.durationMs = Date.now() - start;
    return result;
  }
  if (isWafBlocked(res.status, headersLower)) {
    result.status = "skipped_waf";
    result.skipReason = `${res.status} from ${headersLower["server"] || "?"} (cf-ray=${!!headersLower["cf-ray"]})`;
    result.durationMs = Date.now() - start;
    return result;
  }
  if (res.status >= 400) {
    result.status = "fetch_failed_http";
    result.skipReason = `HTTP ${res.status}`;
    result.durationMs = Date.now() - start;
    return result;
  }
  // Canonical redirect is now informational only — we extract content
  // anyway and just record the canonical URL. Mirrors the prod fix in
  // sourceStatic.ts.
  const canonicalRedirect = detectCanonicalRedirect(res.text, pageUrl);
  if (canonicalRedirect) {
    result.skipReason = `canonical→ ${canonicalRedirect}`;
  }

  const hydra = extractHydration(res.text);
  const structured = extractStructuredData(res.text);
  const body = stripToBodyText(res.text);
  result.hadHydration = hydra.hadHydration;
  result.hadRsc = hydra.hadRsc;
  result.hasStructuredData = structured.hasStructuredData;
  result.bodyTextLength = body.length;

  const combinedTextForGuards = `${structured.text}\n${body}`;
  const hadAnyHydration = hydra.hadHydration || hydra.hadRsc;

  if (isSoft404(combinedTextForGuards, hadAnyHydration)) {
    result.status = "skipped_soft_404";
    result.durationMs = Date.now() - start;
    return result;
  }
  if (isCookieWall(combinedTextForGuards, hadAnyHydration)) {
    result.status = "skipped_cookie_wall";
    result.durationMs = Date.now() - start;
    return result;
  }
  if (
    isHollowShell({
      hadHydration: hydra.hadHydration,
      hadRsc: hydra.hadRsc,
      hasStructuredData: structured.hasStructuredData,
      bodyTextLength: body.length,
    })
  ) {
    result.status = "skipped_hollow_shell";
    result.skipReason = `body=${body.length}ch hydration=${hadAnyHydration} structured=${structured.hasStructuredData}`;
    result.durationMs = Date.now() - start;
    return result;
  }

  result.status = "ok";

  if (LLM_ENABLED) {
    const sanitizedHydration = sanitizeHydration(hydra.payload);
    const llmPayload = [structured.text, sanitizedHydration, body]
      .filter((s) => s.length > 0)
      .join("\n\n---\n\n");
    const prompt = buildExtractionPrompt(llmPayload, {
      brandUrl,
      brandName,
      industry: null,
    });
    try {
      const parsed = await parseFactsWithRepair(prompt, llmCall);
      result.factCount = parsed.facts.length;
      result.llmRepairUsed = parsed.repairUsed;
      result.sampleFacts = parsed.facts.slice(0, 5).map((f) => ({
        key: `${f.domain}.${f.factKey} (${subcategoryFor(f.domain as Domain, f.factKey)})`,
        value: typeof f.factValue === "string" ? f.factValue.slice(0, 80) : String(f.factValue),
        conf: Number(f.confidence.toFixed(2)),
      }));
    } catch (err) {
      result.factCount = 0;
      result.llmRepairUsed = false;
      result.sampleFacts = [];
      result.fetchError = `llm: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function auditSite(brandName: string, brandUrl: string): Promise<SiteReport> {
  box(`${brandName} — ${brandUrl}`);
  const obs: string[] = [];

  // Step 1: sitemap discovery
  const t0 = Date.now();
  const sitemapUrls = await discoverSitemapUrls(brandUrl, sitemapFetcher);
  const sitemapDuration = Date.now() - t0;
  section(`1. Sitemap discovery (${ms(t0)})`);
  console.log(`   Found ${sitemapUrls.length} URLs in sitemap`);
  if (sitemapUrls.length > 0) {
    console.log(`   First 5:`);
    sitemapUrls.slice(0, 5).forEach((u) => console.log(`     • ${u}`));
  }

  if (sitemapUrls.length === 0) {
    obs.push("Sitemap discovery returned 0 URLs — falls back to homepage only.");
  }

  // Check if it's a sitemap INDEX (those have <sitemap> wrappers around <loc>)
  // We do a probe fetch to see what the actual /sitemap.xml structure was.
  try {
    const probe = await safeFetchTextWithLockedIp(`${new URL(brandUrl).origin}/sitemap.xml`, {
      maxBytes: 50_000,
      timeoutMs: 5_000,
    });
    if (probe.status >= 200 && probe.status < 300) {
      const hasSitemapIndex = /<sitemap[\s>]/i.test(probe.text);
      if (hasSitemapIndex) {
        obs.push(
          "sitemap.xml is a SITEMAP-INDEX (lists other sitemaps) — current parser only extracts <loc>; no recursion into nested sitemaps.",
        );
      }
    }
  } catch {
    /* ignore probe errors */
  }

  // Step 2: tier scoring
  const selected = selectTopUrls(brandUrl, sitemapUrls);
  const dropped = sitemapUrls.filter((u) => scoreUrl(u) === 3);
  section(`2. URL tier scoring → ${selected.length} picked / ${dropped.length} tier-3 dropped`);
  selected.forEach((u, i) => {
    const tier =
      u === canonicalizeUrl(new URL("/", brandUrl).toString()) ? "home" : `tier${scoreUrl(u)}`;
    console.log(`   ${i + 1}. [${tier}] ${u}`);
  });

  if (selected.length === 1) {
    obs.push(
      "Only homepage selected. Either sitemap is empty / opaque, or no URLs matched tier 1/2 regex (only /about, /pricing, /team, /products, /features, /platform, /contact, /customers, /security counted).",
    );
  }

  // Step 3: per-page audit
  section(`3. Page-by-page diagnostics`);
  const pages: SiteReport["pages"] = [];
  for (const pageUrl of selected) {
    const pageReport = await auditPage(brandName, brandUrl, pageUrl);
    pages.push(pageReport);
    const skipLine = pageReport.skipReason ? ` (${pageReport.skipReason})` : "";
    const llmLine =
      pageReport.factCount !== undefined
        ? ` — ${pageReport.factCount} facts${pageReport.llmRepairUsed ? " [repaired]" : ""}`
        : "";
    console.log(
      `   • ${pageReport.url}\n     status=${pageReport.status}${skipLine} http=${pageReport.statusCode} bytes=${bytes(pageReport.bytes)} body=${pageReport.bodyTextLength}ch hydr=${pageReport.hadHydration} rsc=${pageReport.hadRsc} ld+json=${pageReport.hasStructuredData}${llmLine} (${pageReport.durationMs}ms)`,
    );
    if (pageReport.sampleFacts && pageReport.sampleFacts.length > 0) {
      pageReport.sampleFacts.forEach((f) =>
        console.log(`         · ${f.key}=${JSON.stringify(f.value)} (${f.conf})`),
      );
    }
  }

  // Observations from page-by-page data
  const okCount = pages.filter((p) => p.status === "ok").length;
  const skipCounts = new Map<string, number>();
  for (const p of pages) {
    if (p.status !== "ok") skipCounts.set(p.status, (skipCounts.get(p.status) ?? 0) + 1);
  }
  if (okCount === 0) {
    obs.push(
      `Zero pages reached LLM extraction. Skip codes: ${[...skipCounts.entries()].map(([s, n]) => `${s}=${n}`).join(", ")}.`,
    );
  }
  if (skipCounts.get("skipped_hollow_shell")) {
    obs.push(
      `${skipCounts.get("skipped_hollow_shell")} page(s) flagged as hollow-shell — pure-CSR SPA with no structured data or hydration markers. This site may need a different fetch strategy (Playwright / Puppeteer).`,
    );
  }
  if (skipCounts.get("skipped_waf")) {
    obs.push(
      `${skipCounts.get("skipped_waf")} page(s) blocked by WAF. Bot UA bypass is in place via safeFetchTextWithLockedIp; if these still 403, the site has aggressive bot detection.`,
    );
  }
  if (skipCounts.get("skipped_canonical")) {
    obs.push(
      `${skipCounts.get("skipped_canonical")} page(s) returned a canonical redirect away from the request URL. Production code does NOT re-queue the canonical target — it just drops the page entirely.`,
    );
  }
  if (LLM_ENABLED) {
    const factTotal = pages.reduce((s, p) => s + (p.factCount ?? 0), 0);
    if (factTotal === 0 && okCount > 0) {
      obs.push(
        `${okCount} pages reached the LLM but produced 0 facts total. The extraction prompt or model is failing for this site.`,
      );
    }
  }

  if (obs.length > 0) {
    section(`4. Observations`);
    obs.forEach((o, i) => console.log(`   ${i + 1}. ${o}`));
  }

  return {
    brand: brandName,
    url: brandUrl,
    sitemap: {
      urlsDiscovered: sitemapUrls.length,
      durationMs: sitemapDuration,
      firstFive: sitemapUrls.slice(0, 5),
    },
    selected: {
      count: selected.length,
      urls: selected,
      droppedCount: dropped.length,
    },
    pages,
    observations: obs,
  };
}

// ------------- main -------------

(async () => {
  console.log(`\nBRAND FACT SHEET END-TO-END AUDIT`);
  console.log(
    `LLM extraction: ${LLM_ENABLED ? "ENABLED (using OPENAI_API_KEY)" : "disabled (--llm to enable)"}`,
  );
  console.log(`Sites: ${sites.map((s) => s.brand).join(", ")}`);

  const reports: SiteReport[] = [];
  for (const site of sites) {
    try {
      const report = await auditSite(site.brand, site.url);
      reports.push(report);
    } catch (err) {
      console.error(`\nFATAL during ${site.brand}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────
  box("SUMMARY ACROSS ALL SITES");
  console.log(
    `\n${"Site".padEnd(15)} ${"Sitemap".padEnd(9)} ${"Selected".padEnd(9)} ${"OK".padEnd(4)} ${"Hollow".padEnd(7)} ${"WAF".padEnd(4)} ${"Canon".padEnd(6)} ${"Facts".padEnd(6)}`,
  );
  console.log("─".repeat(80));
  for (const r of reports) {
    const okCount = r.pages.filter((p) => p.status === "ok").length;
    const hollow = r.pages.filter((p) => p.status === "skipped_hollow_shell").length;
    const waf = r.pages.filter((p) => p.status === "skipped_waf").length;
    const canon = r.pages.filter((p) => p.status === "skipped_canonical").length;
    const factTotal = r.pages.reduce((s, p) => s + (p.factCount ?? 0), 0);
    console.log(
      `${r.brand.padEnd(15)} ${String(r.sitemap.urlsDiscovered).padEnd(9)} ${String(r.selected.count).padEnd(9)} ${String(okCount).padEnd(4)} ${String(hollow).padEnd(7)} ${String(waf).padEnd(4)} ${String(canon).padEnd(6)} ${LLM_ENABLED ? String(factTotal).padEnd(6) : "n/a".padEnd(6)}`,
    );
  }
  console.log();
})();
