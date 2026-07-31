// Brand fact sheet benchmark runner.
//
// Exercises the production pipeline (sitemap discovery → tier scoring →
// page guards → optional LLM extraction) against the curated 50-URL
// benchmark set and produces a structured JSON result that can be:
//
//   - dumped to a file for inspection
//   - diffed against a saved baseline to detect regressions
//   - used as a CI gate (exits non-zero when a category degrades)
//
// Why this exists: every previous change broke at least one site that
// wasn't in my smoke test. The unit tests pass because they mock the
// fetcher. This runner exercises the REAL pipeline against REAL URLs.
//
// Usage:
//   npx tsx scripts/run-fact-sheet-benchmark.ts                  # smoke, no LLM
//   npx tsx scripts/run-fact-sheet-benchmark.ts --full           # all 50, no LLM
//   npx tsx scripts/run-fact-sheet-benchmark.ts --full --llm     # all 50 + extraction
//   npx tsx scripts/run-fact-sheet-benchmark.ts --output=baseline.json
//   npx tsx scripts/run-fact-sheet-benchmark.ts --against=baseline.json
//
// CI usage (nightly):
//   --full --llm --output=/tmp/today.json --against=baseline.json
//   exits 1 if any subset has > REGRESSION_THRESHOLD drop vs baseline

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
import { sanitizeHydration } from "../server/lib/factAgent/v2/hydrationSanitizer";
import {
  buildExtractionPrompt,
  parseFactsWithRepair,
} from "../server/lib/factAgent/v2/extractionPrompt";
import { MODELS } from "../server/lib/modelConfig";

// ── Configuration ────────────────────────────────────────────────────

/** Per-brand thresholds. A run fails if MORE than this fraction of
 *  brands in a category degrade vs baseline. 20% is generous - we
 *  expect <5% category-level variance run over run. */
const REGRESSION_THRESHOLD = 0.2;

/** Per-brand "degraded" is defined as: factCount drops by >30% OR
 *  selectedUrlCount drops by >50% OR pages-OK ratio drops by >25%. */
const PER_BRAND_DEGRADE = {
  factCountDropPct: 0.3,
  selectedUrlsDropPct: 0.5,
  pagesOkRatioDropPct: 0.25,
};

interface BenchmarkConfig {
  version: number;
  lastUpdated: string;
  brands: Array<{ name: string; url: string; category: string; surfaces: string }>;
  subsets: Record<string, { urls?: string[]; useAll?: boolean }>;
}

interface PageReport {
  url: string;
  status: string;
  statusCode: number | null;
  bodyLength: number;
  bytes: number;
  hadHydration: boolean;
  hadRsc: boolean;
  hasStructuredData: boolean;
  durationMs: number;
  skipReason: string | null;
  factCount?: number;
  llmRepairUsed?: boolean;
}

interface BrandResult {
  name: string;
  url: string;
  category: string;
  surfaces: string;
  /** ms */
  totalDurationMs: number;
  sitemapUrlCount: number;
  sitemapKindHint: "had-entries" | "empty";
  selectedUrlCount: number;
  selectedUrls: string[];
  pages: PageReport[];
  pagesOk: number;
  pagesSkipped: number;
  pagesFailed: number;
  totalFacts: number;
  /** When --llm was enabled. */
  llmEnabled: boolean;
  fatalError: string | null;
}

interface RunMetadata {
  runId: string;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  llmEnabled: boolean;
  subset: string;
  brandCount: number;
}

interface BenchmarkReport {
  metadata: RunMetadata;
  brands: BrandResult[];
  /** Aggregated per-category metrics. */
  categories: Record<
    string,
    {
      brandCount: number;
      avgSitemapUrls: number;
      avgSelectedUrls: number;
      avgPagesOk: number;
      avgFactsPerBrand: number;
      brandsWithZeroFacts: number;
      brandsWithZeroPages: number;
    }
  >;
}

// ── CLI parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const LLM_ENABLED = args.includes("--llm");
const OUTPUT_FILE = args.find((a) => a.startsWith("--output="))?.split("=")[1];
const BASELINE_FILE = args.find((a) => a.startsWith("--against="))?.split("=")[1];
const QUIET = args.includes("--quiet");

const SUBSET = FULL ? "full" : "smoke";

// ── Load benchmark config ────────────────────────────────────────────

const CONFIG_PATH = resolve(__dirname, "fact-sheet-benchmark.json");
const config: BenchmarkConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

let brandsToRun = config.brands;
if (SUBSET === "smoke") {
  const smokeUrls = new Set(config.subsets.smoke.urls ?? []);
  brandsToRun = config.brands.filter((b) => smokeUrls.has(b.url));
}

// ── Helpers ──────────────────────────────────────────────────────────

const openai = LLM_ENABLED
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 25_000,
      maxRetries: 0,
    })
  : null;

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
  } catch {
    return { status: 0, text: "" };
  }
};

async function llmCall(prompt: unknown): Promise<string> {
  if (!openai) throw new Error("LLM disabled");
  const messages =
    typeof prompt === "string"
      ? [{ role: "user" as const, content: prompt }]
      : [
          { role: "system" as const, content: (prompt as { system: string }).system },
          { role: "user" as const, content: (prompt as { user: string }).user },
        ];
  const responseFormat =
    typeof prompt === "object" &&
    prompt &&
    "responseFormat" in prompt &&
    (prompt as { responseFormat?: unknown }).responseFormat
      ? (prompt as { responseFormat: unknown }).responseFormat
      : { type: "json_object" as const };
  const res = await openai.chat.completions.create({
    model: MODELS.misc,
    response_format: responseFormat as never,
    messages,
  });
  return res.choices?.[0]?.message?.content ?? "";
}

async function auditPage(
  brandName: string,
  brandUrl: string,
  pageUrl: string,
): Promise<PageReport> {
  const start = Date.now();
  const report: PageReport = {
    url: pageUrl,
    status: "unknown",
    statusCode: null,
    bodyLength: 0,
    bytes: 0,
    hadHydration: false,
    hadRsc: false,
    hasStructuredData: false,
    durationMs: 0,
    skipReason: null,
  };

  let res: Awaited<ReturnType<typeof safeFetchTextWithLockedIp>>;
  try {
    res = await safeFetchTextWithLockedIp(pageUrl, {
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: 10_000,
    });
  } catch (err) {
    report.status = "fetch_failed";
    report.skipReason = err instanceof Error ? err.message : String(err);
    report.durationMs = Date.now() - start;
    return report;
  }

  report.statusCode = res.status;
  report.bytes = res.text.length;

  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) {
    headersLower[k.toLowerCase()] = v;
  }

  if (isNonHtml(res.contentType)) {
    report.status = "skipped_non_html";
    report.skipReason = `content-type=${res.contentType}`;
    report.durationMs = Date.now() - start;
    return report;
  }
  if (isWafBlocked(res.status, headersLower)) {
    report.status = "skipped_waf";
    report.durationMs = Date.now() - start;
    return report;
  }
  if (res.status >= 400) {
    report.status = "fetch_failed_http";
    report.skipReason = `HTTP ${res.status}`;
    report.durationMs = Date.now() - start;
    return report;
  }
  const canonicalRedirect = detectCanonicalRedirect(res.text, pageUrl);
  if (canonicalRedirect) {
    report.skipReason = `canonical→${canonicalRedirect}`;
    // NOTE: production code now treats canonical as informational, not skip.
  }

  const hydra = extractHydration(res.text);
  const structured = extractStructuredData(res.text);
  const body = stripToBodyText(res.text);
  report.hadHydration = hydra.hadHydration;
  report.hadRsc = hydra.hadRsc;
  report.hasStructuredData = structured.hasStructuredData;
  report.bodyLength = body.length;

  const combined = `${structured.text}\n${body}`;
  const hadAny = hydra.hadHydration || hydra.hadRsc;

  if (isSoft404(combined, hadAny)) {
    report.status = "skipped_soft_404";
    report.durationMs = Date.now() - start;
    return report;
  }
  if (isCookieWall(combined, hadAny)) {
    report.status = "skipped_cookie_wall";
    report.durationMs = Date.now() - start;
    return report;
  }
  if (
    isHollowShell({
      hadHydration: hydra.hadHydration,
      hadRsc: hydra.hadRsc,
      hasStructuredData: structured.hasStructuredData,
      bodyTextLength: body.length,
    })
  ) {
    report.status = "skipped_hollow_shell";
    report.durationMs = Date.now() - start;
    return report;
  }

  report.status = "ok";

  if (LLM_ENABLED) {
    const sanitised = sanitizeHydration(hydra.payload);
    const payload = [structured.text, sanitised, body]
      .filter((s) => s.length > 0)
      .join("\n\n---\n\n");
    const prompt = buildExtractionPrompt(payload, {
      brandUrl,
      brandName,
      industry: null,
    });
    try {
      const parsed = await parseFactsWithRepair(prompt, llmCall);
      report.factCount = parsed.facts.length;
      report.llmRepairUsed = parsed.repairUsed;
    } catch (err) {
      report.factCount = 0;
      report.skipReason = `llm: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  report.durationMs = Date.now() - start;
  return report;
}

async function auditBrand(brand: BenchmarkConfig["brands"][number]): Promise<BrandResult> {
  const result: BrandResult = {
    name: brand.name,
    url: brand.url,
    category: brand.category,
    surfaces: brand.surfaces,
    totalDurationMs: 0,
    sitemapUrlCount: 0,
    sitemapKindHint: "empty",
    selectedUrlCount: 0,
    selectedUrls: [],
    pages: [],
    pagesOk: 0,
    pagesSkipped: 0,
    pagesFailed: 0,
    totalFacts: 0,
    llmEnabled: LLM_ENABLED,
    fatalError: null,
  };
  const brandStart = Date.now();

  try {
    const sitemapUrls = await discoverSitemapUrls(brand.url, sitemapFetcher);
    result.sitemapUrlCount = sitemapUrls.length;
    result.sitemapKindHint = sitemapUrls.length > 0 ? "had-entries" : "empty";

    const selected = selectTopUrls(brand.url, sitemapUrls);
    result.selectedUrlCount = selected.length;
    result.selectedUrls = selected;

    for (const pageUrl of selected) {
      const pageReport = await auditPage(brand.name, brand.url, pageUrl);
      result.pages.push(pageReport);
      if (pageReport.status === "ok") result.pagesOk++;
      else if (pageReport.status.startsWith("skipped_")) result.pagesSkipped++;
      else result.pagesFailed++;
      if (pageReport.factCount !== undefined) {
        result.totalFacts += pageReport.factCount;
      }
    }
  } catch (err) {
    result.fatalError = err instanceof Error ? err.message : String(err);
  }

  result.totalDurationMs = Date.now() - brandStart;
  return result;
}

// ── Aggregation ──────────────────────────────────────────────────────

function aggregate(brands: BrandResult[]): BenchmarkReport["categories"] {
  const out: BenchmarkReport["categories"] = {};
  const groups = new Map<string, BrandResult[]>();
  for (const b of brands) {
    const g = groups.get(b.category) ?? [];
    g.push(b);
    groups.set(b.category, g);
  }
  for (const [cat, members] of Array.from(groups.entries())) {
    const n = members.length;
    out[cat] = {
      brandCount: n,
      avgSitemapUrls: members.reduce((s, b) => s + b.sitemapUrlCount, 0) / n,
      avgSelectedUrls: members.reduce((s, b) => s + b.selectedUrlCount, 0) / n,
      avgPagesOk: members.reduce((s, b) => s + b.pagesOk, 0) / n,
      avgFactsPerBrand: members.reduce((s, b) => s + b.totalFacts, 0) / n,
      brandsWithZeroFacts: members.filter((b) => LLM_ENABLED && b.totalFacts === 0).length,
      brandsWithZeroPages: members.filter((b) => b.pagesOk === 0).length,
    };
  }
  return out;
}

// ── Regression detection ─────────────────────────────────────────────

function detectRegressions(
  current: BenchmarkReport,
  baseline: BenchmarkReport,
): { regressed: string[]; improved: string[] } {
  const regressed: string[] = [];
  const improved: string[] = [];

  const baseByUrl = new Map(baseline.brands.map((b) => [b.url, b]));
  for (const cur of current.brands) {
    const base = baseByUrl.get(cur.url);
    if (!base) continue;

    const factDrop = base.totalFacts > 0 ? (base.totalFacts - cur.totalFacts) / base.totalFacts : 0;
    const urlDrop =
      base.selectedUrlCount > 0
        ? (base.selectedUrlCount - cur.selectedUrlCount) / base.selectedUrlCount
        : 0;
    const baseRatio = base.selectedUrlCount > 0 ? base.pagesOk / base.selectedUrlCount : 0;
    const curRatio = cur.selectedUrlCount > 0 ? cur.pagesOk / cur.selectedUrlCount : 0;
    const ratioDrop = baseRatio > 0 ? (baseRatio - curRatio) / baseRatio : 0;

    const reasons: string[] = [];
    if (factDrop > PER_BRAND_DEGRADE.factCountDropPct) {
      reasons.push(`facts ${base.totalFacts}→${cur.totalFacts}`);
    }
    if (urlDrop > PER_BRAND_DEGRADE.selectedUrlsDropPct) {
      reasons.push(`urls ${base.selectedUrlCount}→${cur.selectedUrlCount}`);
    }
    if (ratioDrop > PER_BRAND_DEGRADE.pagesOkRatioDropPct) {
      reasons.push(
        `ok ${base.pagesOk}/${base.selectedUrlCount}→${cur.pagesOk}/${cur.selectedUrlCount}`,
      );
    }
    if (reasons.length > 0) {
      regressed.push(`${cur.name} [${cur.category}]: ${reasons.join(", ")}`);
    } else if (cur.totalFacts > base.totalFacts * 1.2) {
      improved.push(`${cur.name}: facts ${base.totalFacts}→${cur.totalFacts}`);
    }
  }
  return { regressed, improved };
}

// ── Output ───────────────────────────────────────────────────────────

function printSummary(report: BenchmarkReport): void {
  const meta = report.metadata;
  console.log("");
  console.log(`╔${"═".repeat(78)}╗`);
  console.log(
    `║ Brand fact sheet benchmark - ${meta.subset} (${meta.brandCount} brands, LLM=${meta.llmEnabled})${" ".repeat(Math.max(0, 78 - 51 - meta.subset.length - meta.brandCount.toString().length))}║`,
  );
  console.log(`╚${"═".repeat(78)}╝`);
  console.log(`Duration: ${(meta.totalDurationMs / 1000).toFixed(1)}s`);
  console.log("");
  console.log(
    `${"Category".padEnd(22)} ${"Brands".padEnd(7)} ${"AvgSel".padEnd(7)} ${"AvgOK".padEnd(7)} ${"AvgFacts".padEnd(9)} ${"ZeroPages".padEnd(10)} ${"ZeroFacts"}`,
  );
  console.log("─".repeat(80));
  const sorted = Object.entries(report.categories).sort(([a], [b]) => a.localeCompare(b));
  for (const [cat, m] of sorted) {
    console.log(
      `${cat.padEnd(22)} ${m.brandCount.toString().padEnd(7)} ${m.avgSelectedUrls.toFixed(1).padEnd(7)} ${m.avgPagesOk.toFixed(1).padEnd(7)} ${m.avgFactsPerBrand.toFixed(1).padEnd(9)} ${m.brandsWithZeroPages.toString().padEnd(10)} ${m.brandsWithZeroFacts}`,
    );
  }
  console.log("");
  if (!QUIET) {
    console.log("Per-brand zero-pages (these are the URLs the discovery layer fails on):");
    for (const b of report.brands.filter((b) => b.pagesOk === 0)) {
      console.log(
        `   ${b.name.padEnd(20)} ${b.url} - sitemap=${b.sitemapUrlCount} selected=${b.selectedUrlCount}${b.fatalError ? " FATAL:" + b.fatalError.slice(0, 60) : ""}`,
      );
    }
    console.log("");
  }
}

// ── Main ─────────────────────────────────────────────────────────────

(async () => {
  const runStarted = Date.now();
  const runId = `bench-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}`;
  console.log(
    `Running ${SUBSET} subset (${brandsToRun.length} brands)${LLM_ENABLED ? " with LLM extraction" : ""}…`,
  );

  const brands: BrandResult[] = [];
  for (let i = 0; i < brandsToRun.length; i++) {
    const brand = brandsToRun[i];
    process.stdout.write(`  [${i + 1}/${brandsToRun.length}] ${brand.name.padEnd(20)} `);
    const result = await auditBrand(brand);
    brands.push(result);
    const ok = result.pagesOk;
    const sel = result.selectedUrlCount;
    const facts = LLM_ENABLED ? `, ${result.totalFacts} facts` : "";
    const fatal = result.fatalError ? " FATAL" : "";
    console.log(
      `${result.sitemapUrlCount.toString().padStart(4)}→${sel} sitemap urls, ${ok}/${sel} ok${facts}${fatal} (${(result.totalDurationMs / 1000).toFixed(1)}s)`,
    );
  }

  const report: BenchmarkReport = {
    metadata: {
      runId,
      startedAt: new Date(runStarted).toISOString(),
      finishedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - runStarted,
      llmEnabled: LLM_ENABLED,
      subset: SUBSET,
      brandCount: brands.length,
    },
    brands,
    categories: aggregate(brands),
  };

  printSummary(report);

  if (OUTPUT_FILE) {
    writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
    console.log(`Report written to ${OUTPUT_FILE}`);
  }

  if (BASELINE_FILE) {
    const baseline: BenchmarkReport = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
    const { regressed, improved } = detectRegressions(report, baseline);
    console.log("");
    console.log(`Compared against ${BASELINE_FILE}:`);
    if (improved.length > 0) {
      console.log(`  Improved (${improved.length}):`);
      improved.forEach((s) => console.log(`    ✓ ${s}`));
    }
    if (regressed.length > 0) {
      console.log(`  Regressed (${regressed.length}):`);
      regressed.forEach((s) => console.log(`    ✗ ${s}`));
    } else {
      console.log("  No regressions.");
    }
    const regressionRate = regressed.length / Math.max(1, report.brands.length);
    if (regressionRate > REGRESSION_THRESHOLD) {
      console.error(
        `\nFAIL: ${regressed.length}/${report.brands.length} brands regressed (${(regressionRate * 100).toFixed(0)}% > ${(REGRESSION_THRESHOLD * 100).toFixed(0)}% threshold)`,
      );
      process.exit(1);
    }
  }

  process.exit(0);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
