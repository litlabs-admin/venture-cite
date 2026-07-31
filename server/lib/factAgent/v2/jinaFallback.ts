// Jina Reader fallback for client-rendered SPAs.
//
// When the static fetcher returns a "hollow shell" - i.e. the page has
// no hydration payload, no JSON-LD structured data, and less than 200
// chars of body text - we can't extract facts from the raw HTML. The
// fallback is Jina Reader (https://r.jina.ai/<url>), a free public
// service that renders the page server-side and returns clean
// markdown. This unlocks every React/Vue/SvelteKit SPA we currently
// drop.
//
// API contract:
//   GET https://r.jina.ai/<url-encoded-url>
//   Returns: text/plain markdown (clean, navigable, no JS)
//   Auth: none required (free tier), or `Authorization: Bearer <key>`
//         for higher rate limits via JINA_API_KEY env var.
//   Latency: 2-5 s typical, 10 s tail. We cap timeout at 15 s.
//   Cost: free tier handles ~50 req/min; paid is ~$0.0001/page.
//
// Why we trust Jina:
//   - Open-source rendering pipeline (Playwright under the hood)
//   - No DOM manipulation we don't want; we get the SAME HTML a user
//     would see
//   - They handle bot detection (Cloudflare, etc.) so our flat HTTP
//     fetches that previously got blocked also work via this fallback
//
// What this DOES NOT do:
//   - JSON-LD extraction. The markdown loses <script> tags. If we
//     need JSON-LD, fetch the page with both: raw HTML (for structured
//     data) AND Jina markdown (for body text). Phase 3 will combine.

import { logger } from "../../logger";

import { JINA_TIMEOUT_MS } from "./vercelBudget";

const JINA_BASE_URL = "https://r.jina.ai/";
const JINA_MAX_BYTES = 500_000;

export interface JinaResult {
  /** True iff the fetch succeeded and the markdown looks non-trivial.
   *  False otherwise - callers should fall through to whatever they
   *  were going to do without Jina. */
  ok: boolean;
  /** Cleaned markdown body. Trimmed to ~200 KB if the page is huge. */
  markdown: string;
  /** Final URL after redirects (Jina follows them). */
  resolvedUrl: string;
  /** Wall-clock duration of the fetch. */
  durationMs: number;
  /** Empty when ok=true. */
  errorKind?: "fetch_failed" | "non_2xx" | "empty_body" | "timeout" | "missing_key";
  errorMessage?: string;
}

/** Whether the env is configured to use Jina at all. Returns true even
 *  when JINA_API_KEY is unset because the free tier still works for
 *  modest volume; we just don't get the bearer-token rate-limit lift. */
export function isJinaAvailable(): boolean {
  // The env switch lets operators disable Jina globally without code
  // changes if their network policy forbids egress to r.jina.ai.
  return process.env.FACT_AGENT_JINA_ENABLED !== "false";
}

export async function fetchViaJina(url: string): Promise<JinaResult> {
  const start = Date.now();
  if (!isJinaAvailable()) {
    return {
      ok: false,
      markdown: "",
      resolvedUrl: url,
      durationMs: 0,
      errorKind: "missing_key",
      errorMessage: "FACT_AGENT_JINA_ENABLED=false",
    };
  }
  // Url-encode the upstream URL so Jina sees it as a single argument.
  const target = `${JINA_BASE_URL}${encodeURI(url)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      // Hint Jina to return plain markdown rather than HTML.
      Accept: "text/markdown, text/plain",
      // Skip the cache-control headers Jina sometimes adds (we manage
      // our own caching at the brand_fact_scrape level).
      "X-No-Cache": "true",
    };
    if (process.env.JINA_API_KEY) {
      headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
    }
    const res = await fetch(target, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        markdown: "",
        resolvedUrl: url,
        durationMs: Date.now() - start,
        errorKind: "non_2xx",
        errorMessage: `Jina returned HTTP ${res.status}`,
      };
    }
    // Stream the body so a runaway response can't OOM us.
    const reader = res.body?.getReader();
    if (!reader) {
      return {
        ok: false,
        markdown: "",
        resolvedUrl: url,
        durationMs: Date.now() - start,
        errorKind: "empty_body",
      };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > JINA_MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const markdown = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    if (markdown.trim().length < 100) {
      return {
        ok: false,
        markdown: "",
        resolvedUrl: url,
        durationMs: Date.now() - start,
        errorKind: "empty_body",
        errorMessage: `Jina returned only ${markdown.trim().length} chars`,
      };
    }
    return {
      ok: true,
      markdown,
      // Jina exposes the resolved URL via the `x-resolved-url` header
      // when it followed redirects.
      resolvedUrl: res.headers.get("x-resolved-url") ?? url,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const isTimeout =
      (err as Error).name === "AbortError" ||
      ((err as Error).message ?? "").toLowerCase().includes("aborted");
    return {
      ok: false,
      markdown: "",
      resolvedUrl: url,
      durationMs: Date.now() - start,
      errorKind: isTimeout ? "timeout" : "fetch_failed",
      errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience: log fall-back success/failure for telemetry. The
 *  caller decides what to do with the result. */
export async function fetchViaJinaWithLog(url: string, runId: string): Promise<JinaResult> {
  const result = await fetchViaJina(url);
  if (result.ok) {
    logger.info(
      { runId, url, durationMs: result.durationMs, bytes: result.markdown.length },
      "jinaFallback: succeeded",
    );
  } else {
    logger.info(
      { runId, url, durationMs: result.durationMs, errorKind: result.errorKind },
      "jinaFallback: failed",
    );
  }
  return result;
}
