// Composes all v2 page-level modules into one pure orchestrator.
// Inputs: URL + brand context + fetcher + llm + robots cache.
// Output: PageOutcome with facts, diagnostics, optional canonical redirect.
//
// The fetcher and llm are injected for testability — production wires
// safeFetchTextWithLockedIp + the failover LLM client.
import { canonicalizeUrl } from "../canonicalize";
import { detectLanguage } from "../langDetect";
import { sanitizeFactsForInjection } from "../promptInjectionSanitizer";
import { redactSecretsFromFacts } from "../secretRedactor";
import { validateFact } from "../validators";
import { dedupWithinRun } from "../dedup";
import type { ExtractedFact } from "../types";
import { extractHydration } from "./rscExtractor";
import { extractStructuredData, stripToBodyText } from "./pageExtractors";
import {
  isNonHtml,
  isWafBlocked,
  isSoft404,
  isCookieWall,
  isHollowShell,
  detectCanonicalRedirect,
} from "./pageGuards";
import { sanitizeHydration } from "./hydrationSanitizer";
import { discoverSubdomainUrls } from "./urlDiscovery";
import { buildExtractionPrompt, parseFactsWithRepair, type LlmCallable } from "./extractionPrompt";
import { type Fact, subcategoryFor, type Domain } from "@shared/factAgent/schema";
import { fetchViaJina, isJinaAvailable } from "./jinaFallback";
import { emitEvent } from "./eventLog";
import { extractStructuredFacts } from "./structuredDataExtractor";

// 2026-05-28 (revised): body cap bumped from 6 KB to 16 KB.
//
// The earlier 6 KB cap was overfit to the four audit sites whose hero/
// about content sat in the first ~4 KB. Real brands cram:
//   - Stripe's pricing page: 18 KB
//   - Samsung About + heritage: 15 KB
//   - Notion's feature matrix: 22 KB
// The first 6 KB on any of those was the navbar + hero; everything that
// described the brand was below. 16 KB lets the bottom half of a typical
// hero+features+social-proof page through, while still bounded enough
// that the LLM call stays under 25 s for non-pathological pages.
//
// Latency note: with json_schema strict mode, gpt-4o-mini handles a 16
// KB body + 12 KB hydration payload in ~3-6 s on the audit pages. The
// per-call timeout (LLM_CALL_TIMEOUT_MS in runFullScrape.ts) is 25 s,
// so we have ~4× margin.
const MAX_BODY_CHARS = 16_000;

export interface FetcherResponse {
  status: number;
  text: string;
  contentType: string | null;
  headers: Record<string, string>;
}
export type Fetcher = (url: string, opts?: { timeoutMs?: number }) => Promise<FetcherResponse>;

export interface RobotsCache {
  isAllowed(url: string): Promise<boolean>;
  raw(): string | null;
}

export interface RunStaticSourceArgs {
  url: string;
  brandUrl: string;
  brandName?: string;
  industry?: string | null;
  runId?: string;
  fetcher: Fetcher;
  llm: LlmCallable;
  robotsCache: RobotsCache;
}

export type PageOutcomeStatus =
  | "done"
  | "failed"
  | "skipped_robots"
  | "skipped_lang"
  | "skipped_spa"
  | "skipped_non_html"
  | "skipped_soft_404"
  | "skipped_cookie_wall"
  | "skipped_waf"
  | "skipped_canonical"
  | "skipped_redirect_loop"
  | "skipped_hollow_shell";

export interface PageOutcomeDiagnostics {
  lang: string | null;
  hadRsc: boolean;
  hadHydration: boolean;
  hasStructuredData: boolean;
  bodyTextLength: number;
  wafBlocked?: boolean;
  isHollowShell?: boolean;
  repairUsed?: boolean;
}

export interface PageOutcome {
  status: PageOutcomeStatus;
  facts: Fact[];
  statusCode: number | null;
  bytes: number;
  errorKind: string | null;
  errorMessage: string | null;
  canonicalRedirect: string | null;
  discoveredUrls: string[];
  diagnostics: PageOutcomeDiagnostics;
}

function emptyDiagnostics(overrides: Partial<PageOutcomeDiagnostics> = {}): PageOutcomeDiagnostics {
  return {
    lang: null,
    hadRsc: false,
    hadHydration: false,
    hasStructuredData: false,
    bodyTextLength: 0,
    ...overrides,
  };
}

function empty(status: PageOutcomeStatus, fields: Partial<PageOutcome> = {}): PageOutcome {
  return {
    status,
    facts: [],
    statusCode: null,
    bytes: 0,
    errorKind: status.startsWith("skipped_") ? null : status,
    errorMessage: null,
    canonicalRedirect: null,
    discoveredUrls: [],
    diagnostics: emptyDiagnostics(),
    ...fields,
  };
}

export async function runStaticSource(args: RunStaticSourceArgs): Promise<PageOutcome> {
  const canonical = canonicalizeUrl(args.url);

  // 1. robots check
  if (!(await args.robotsCache.isAllowed(canonical))) {
    return empty("skipped_robots");
  }

  // 2. fetch
  let res: FetcherResponse;
  try {
    res = await args.fetcher(canonical, { timeoutMs: 10_000 });
  } catch (err) {
    return empty("failed", {
      errorKind: "fetch_failed",
      errorMessage: (err as Error).message,
    });
  }

  // Normalise headers to lowercase keys for consistent lookups.
  const headersLower: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) {
    headersLower[k.toLowerCase()] = v;
  }

  // 3. content-type guard — skip binaries, PDFs, images, etc.
  if (isNonHtml(res.contentType)) {
    return empty("skipped_non_html", {
      statusCode: res.status,
      bytes: res.text.length,
    });
  }

  // 4. WAF / CDN block guard
  if (isWafBlocked(res.status, headersLower)) {
    return empty("skipped_waf", {
      statusCode: res.status,
      bytes: res.text.length,
      diagnostics: emptyDiagnostics({ wafBlocked: true }),
    });
  }

  // 5. HTTP error responses
  if (res.status >= 400) {
    return empty("failed", {
      statusCode: res.status,
      bytes: res.text.length,
      errorKind: "fetch_failed",
      errorMessage: `HTTP ${res.status}`,
    });
  }

  // 6. Canonical redirect — informational, NOT a skip.
  //
  // 2026-05-28 production fix: the previous behaviour was to drop ANY
  // page whose <link rel="canonical"> pointed elsewhere. This silently
  // killed scraping for every brand whose homepage canonicalises
  // bare-host → www-host (Adyen, Samsung, Notion, …). The HTML body is
  // present; we should extract from it. The canonical URL is captured
  // and returned so the executor can dedup against future runs that
  // queue the canonical target separately, but we DO NOT skip.
  //
  // Edge case: if a deeper page canonicalises back to the homepage
  // (e.g. venturepr.com/services → venturepr.com/), the homepage
  // dedup-within-run logic will filter the duplicate facts. The
  // alternative (skipping the page) lost real content for cases like
  // bare-host → www-host where every page returns this signal.
  const canonicalRedirect = detectCanonicalRedirect(res.text, canonical);

  // 7. Extract signals: RSC/hydration payloads, structured data, body text.
  const hydra = extractHydration(res.text);
  const structured = extractStructuredData(res.text);
  const body = stripToBodyText(res.text);

  // Language detection: prefer body text, fall back to structured data / hydration.
  const lang = detectLanguage(body || structured.text || hydra.payload);

  const combinedTextForGuards = `${structured.text}\n${body}`;
  const hadAnyHydration = hydra.hadHydration || hydra.hadRsc;

  // 8. Soft-404 guard
  if (isSoft404(combinedTextForGuards, hadAnyHydration)) {
    return empty("skipped_soft_404", {
      statusCode: res.status,
      bytes: res.text.length,
      diagnostics: emptyDiagnostics({
        lang,
        hadRsc: hydra.hadRsc,
        hadHydration: hydra.hadHydration,
        hasStructuredData: structured.hasStructuredData,
        bodyTextLength: body.length,
      }),
    });
  }

  // 9. Cookie wall guard
  if (isCookieWall(combinedTextForGuards, hadAnyHydration)) {
    return empty("skipped_cookie_wall", {
      statusCode: res.status,
      bytes: res.text.length,
      diagnostics: emptyDiagnostics({
        lang,
        hadRsc: hydra.hadRsc,
        hadHydration: hydra.hadHydration,
        hasStructuredData: structured.hasStructuredData,
        bodyTextLength: body.length,
      }),
    });
  }

  // 10. Hollow-shell guard — pure CSR SPA with no extractable signal.
  //
  // 2026-05-28 (Phase 2): instead of giving up immediately, fall back
  // to Jina Reader (https://r.jina.ai/<url>) which renders the page
  // server-side and returns clean markdown. This unlocks every React/
  // Vue/SvelteKit SPA we previously dropped. Only fires when Jina is
  // enabled via env (FACT_AGENT_JINA_ENABLED != 'false', default on).
  let jinaSuppliedBody = "";
  let jinaResolvedUrl: string | null = null;
  if (
    isHollowShell({
      hadHydration: hydra.hadHydration,
      hadRsc: hydra.hadRsc,
      hasStructuredData: structured.hasStructuredData,
      bodyTextLength: body.length,
    })
  ) {
    if (isJinaAvailable()) {
      const jina = await fetchViaJina(canonical);
      if (args.runId) {
        emitEvent({
          runId: args.runId,
          brandId: "", // sourceStatic doesn't have brandId; runFullScrape emits a richer event for the same hop
          stepName: "jina_fallback",
          outcome: jina.ok ? "ok" : "failed",
          durationMs: jina.durationMs,
          metadata: {
            url: canonical,
            errorKind: jina.errorKind,
            markdownBytes: jina.markdown.length,
            resolvedUrl: jina.resolvedUrl,
          },
        });
      }
      if (jina.ok) {
        jinaSuppliedBody = jina.markdown;
        jinaResolvedUrl = jina.resolvedUrl;
      }
    }
    if (!jinaSuppliedBody) {
      return empty("skipped_hollow_shell", {
        statusCode: res.status,
        bytes: res.text.length,
        diagnostics: emptyDiagnostics({
          lang,
          hadRsc: false,
          hadHydration: false,
          hasStructuredData: false,
          bodyTextLength: body.length,
          isHollowShell: true,
        }),
      });
    }
  }

  // 11. Subdomain URL discovery (cheap; do before the LLM call)
  const discoveredUrls = discoverSubdomainUrls(res.text, args.brandUrl);

  // 12. Compose LLM payload: structured metadata + sanitised hydration + body text.
  //
  // If Jina Reader supplied the body (hollow-shell fallback), use it
  // instead of the raw HTML body. Jina markdown is denser per byte
  // than raw text-stripped HTML, so trim to the same cap.
  const sanitizedHydration = sanitizeHydration(hydra.payload);
  const effectiveBody = jinaSuppliedBody || body;
  const trimmedBody =
    effectiveBody.length > MAX_BODY_CHARS ? effectiveBody.slice(0, MAX_BODY_CHARS) : effectiveBody;
  const llmPayload = [structured.text, sanitizedHydration, trimmedBody]
    .filter((s) => s.length > 0)
    .join("\n\n---\n\n");

  // 13. Build prompt and call LLM. Strict JSON Schema mode handles most
  // of what auto-repair used to. We keep a 0-fact retry with the
  // relaxed prompt as a separate concern from JSON-shape repair.
  const basePrompt = buildExtractionPrompt(llmPayload, {
    brandUrl: args.brandUrl,
    brandName: args.brandName,
    industry: args.industry ?? null,
  });

  let parseResult: Awaited<ReturnType<typeof parseFactsWithRepair>>;
  try {
    parseResult = await parseFactsWithRepair(basePrompt, args.llm);
  } catch (err) {
    return empty("failed", {
      statusCode: res.status,
      bytes: res.text.length,
      errorKind: "llm_unavailable",
      errorMessage: (err as Error).message,
      diagnostics: emptyDiagnostics({
        lang,
        hadRsc: hydra.hadRsc,
        hadHydration: hydra.hadHydration,
        hasStructuredData: structured.hasStructuredData,
        bodyTextLength: body.length,
      }),
    });
  }

  // 13a. Zero-fact retry on rich content.
  // 2026-05-28 (revised): threshold lowered from 2 KB to 1 KB. Tight,
  // content-rich About pages (Linear's /method, Anthropic's /company)
  // are 1.2-1.8 KB and were never getting the relaxed retry. The cost
  // of one extra LLM call on a 1 KB page is negligible (~$0.0002 with
  // gpt-4o-mini) compared to the lost facts.
  if (parseResult.facts.length === 0 && body.length >= 1000) {
    const relaxedPrompt = buildExtractionPrompt(llmPayload, {
      brandUrl: args.brandUrl,
      brandName: args.brandName,
      industry: args.industry ?? null,
      relaxed: true,
    });
    try {
      const relaxedResult = await parseFactsWithRepair(relaxedPrompt, args.llm);
      if (relaxedResult.facts.length > 0) {
        parseResult = { facts: relaxedResult.facts, repairUsed: true };
      }
    } catch {
      // Non-fatal; the original 0-fact result stands.
    }
  }

  // 13b. Structured-data pre-pass — extract facts from JSON-LD
  // BEFORE the LLM stage so they're available even if the LLM call
  // fails or is skipped. Schema.org Organization markup is the
  // single highest-signal source per byte on most brand sites:
  // deterministic, free, often complete on its own.
  const structuredFacts = extractStructuredFacts(res.text, canonical);
  // Merge: LLM facts come second so that when both produce the same
  // (domain, factKey), the LLM's confidence value drives the
  // persistFacts merge — but structured facts at confidence 1.0
  // almost always win. The consolidator handles the rest.
  const mergedFacts = [...structuredFacts, ...parseResult.facts];

  // 14. Post-processing: derive subcategory from (domain, factKey),
  // tag sourceUrl, dedup, sanitize, redact, validate.
  //
  // v2 (2026-05-28): subcategory is no longer LLM-picked. We derive it
  // here so the (brandId, domain, subcategory, factKey) partial unique
  // index in `brand_fact_sheet` cleanly collapses cross-page
  // duplicates of the same logical fact.
  const tagged: ExtractedFact[] = mergedFacts.map((f: Fact) => ({
    domain: f.domain,
    subcategory: subcategoryFor(f.domain as Domain, f.factKey),
    factKey: f.factKey,
    factValue: f.factValue,
    valueType: f.valueType,
    valuePayload: f.valuePayload ?? null,
    confidence: f.confidence,
    sourceExcerpt: f.sourceExcerpt ?? "",
    sourceUrl: canonical,
  }));

  const deduped = dedupWithinRun(tagged);
  const injCleared = sanitizeFactsForInjection(deduped).kept;
  const secretCleared = redactSecretsFromFacts(injCleared).kept;
  const validated = secretCleared.filter((f) => validateFact(f).ok);

  // Convert back to Fact[] for the PageOutcome contract.
  const facts: Fact[] = validated.map((f: ExtractedFact) => ({
    domain: f.domain,
    factKey: f.factKey,
    factValue: f.factValue,
    valueType: f.valueType,
    valuePayload: f.valuePayload,
    confidence: f.confidence,
    sourceExcerpt: f.sourceExcerpt,
    sourceUrl: f.sourceUrl,
  }));

  return {
    status: "done",
    facts,
    statusCode: res.status,
    bytes: res.text.length,
    errorKind: null,
    errorMessage: null,
    // Pass the canonical URL through for the executor to use as the
    // identity of this page when persisting / deduping across runs.
    // null when the page is its own canonical. When Jina supplied the
    // body, prefer the resolved URL Jina reported (which may differ
    // from the request URL after redirects Jina followed).
    canonicalRedirect: jinaResolvedUrl ?? canonicalRedirect,
    discoveredUrls,
    diagnostics: {
      lang,
      hadRsc: hydra.hadRsc,
      hadHydration: hydra.hadHydration,
      hasStructuredData: structured.hasStructuredData,
      bodyTextLength: (jinaSuppliedBody || body).length,
      repairUsed: parseResult.repairUsed,
    },
  };
}
