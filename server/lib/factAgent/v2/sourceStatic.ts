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
import type { Fact } from "@shared/factAgent/schema";

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

  // 6. Canonical redirect — must happen before any expensive LLM call.
  const canonicalRedirect = detectCanonicalRedirect(res.text, canonical);
  if (canonicalRedirect) {
    return empty("skipped_canonical", {
      statusCode: res.status,
      bytes: res.text.length,
      canonicalRedirect,
    });
  }

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

  // 12. Compose LLM payload: structured metadata + sanitised hydration + body text
  const sanitizedHydration = sanitizeHydration(hydra.payload);
  const llmPayload = [structured.text, sanitizedHydration, body]
    .filter((s) => s.length > 0)
    .join("\n\n---\n\n");

  // 13. Build prompt and call LLM with one auto-repair retry
  const prompt = buildExtractionPrompt(llmPayload, {
    brandUrl: args.brandUrl,
    brandName: args.brandName,
    industry: args.industry ?? null,
  });

  let parseResult: Awaited<ReturnType<typeof parseFactsWithRepair>>;
  try {
    parseResult = await parseFactsWithRepair(prompt, args.llm);
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

  // 14. Post-processing: tag sourceUrl, dedup, sanitize, redact, validate.
  //
  // The helpers (dedupWithinRun, etc.) operate on ExtractedFact from ../types.
  // Fact from @shared/factAgent/schema is structurally compatible once sourceUrl
  // is set (the only diff is sourceUrl is optional in Fact but required in
  // ExtractedFact). We cast through the shared structural boundary.
  const tagged: ExtractedFact[] = parseResult.facts.map((f: Fact) => ({
    domain: f.domain,
    subcategory: f.subcategory,
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

  // Convert back to Fact[] (same structural shape; sourceUrl is now present).
  const facts: Fact[] = validated.map((f: ExtractedFact) => ({
    domain: f.domain,
    subcategory: f.subcategory,
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
    canonicalRedirect: null,
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
