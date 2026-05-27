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

// 2026-05-28 production cap: the LLM input is now bounded at ~6 KB of
// body text + 12 KB of sanitised hydration + however much structured
// data was found. Past this point we get diminishing returns on fact
// extraction and a meaningful tail-latency cost. Hero/about content
// typically lives in the first 4 KB; we keep slack for sites that put
// the relevant copy slightly lower.
const MAX_BODY_CHARS = 6_000;

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

  // 10. Hollow-shell guard — pure CSR SPA with no extractable signal
  if (
    isHollowShell({
      hadHydration: hydra.hadHydration,
      hadRsc: hydra.hadRsc,
      hasStructuredData: structured.hasStructuredData,
      bodyTextLength: body.length,
    })
  ) {
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

  // 11. Subdomain URL discovery (cheap; do before the LLM call)
  const discoveredUrls = discoverSubdomainUrls(res.text, args.brandUrl);

  // 12. Compose LLM payload: structured metadata + sanitised hydration + body text.
  //
  // Body is trimmed to MAX_BODY_CHARS — empirically the hero/about
  // content sits within the first 4-6 KB on every site we audited;
  // beyond that is footer / repeated nav / blog excerpts that
  // contribute noise more than signal.
  const sanitizedHydration = sanitizeHydration(hydra.payload);
  const trimmedBody = body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) : body;
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

  // 13a. Zero-fact retry on rich content — the v1 audit showed pages
  // with 5-18k characters of body still returning facts=[] because the
  // model was being overly conservative about confidence. The relaxed
  // prompt explicitly tells it lower-confidence paraphrases are OK.
  // We only retry once, and only when the page clearly has content
  // worth a second pass; otherwise tail latency creeps up.
  if (parseResult.facts.length === 0 && body.length >= 2000) {
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

  // 14. Post-processing: derive subcategory from (domain, factKey),
  // tag sourceUrl, dedup, sanitize, redact, validate.
  //
  // v2 (2026-05-28): subcategory is no longer LLM-picked. We derive it
  // here so the (brandId, domain, subcategory, factKey) partial unique
  // index in `brand_fact_sheet` cleanly collapses cross-page
  // duplicates of the same logical fact.
  const tagged: ExtractedFact[] = parseResult.facts.map((f: Fact) => ({
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
    // null when the page is its own canonical.
    canonicalRedirect,
    discoveredUrls,
    diagnostics: {
      lang,
      hadRsc: hydra.hadRsc,
      hadHydration: hydra.hadHydration,
      hasStructuredData: structured.hasStructuredData,
      bodyTextLength: body.length,
      repairUsed: parseResult.repairUsed,
    },
  };
}
