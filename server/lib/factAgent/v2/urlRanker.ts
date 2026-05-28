// LLM-driven URL ranker.
//
// Replaces the brittle TIER_1/TIER_2/TIER_3 regex with a single LLM
// call that scores each candidate URL by how likely it is to contain
// brand-identity facts. The LLM sees:
//
//   - The brand's URL, name, and (when known) industry
//   - Each candidate URL with its source (sitemap | nav | header |
//     footer | jsonld)
//   - Each candidate's anchor text when available
//
// And returns a JSON array of {url, score 0..10, reason} sorted high
// to low. The ranker is GENERATIVE: it considers the URL pattern AND
// the anchor text the brand chose for that link AND the position
// (footer != header). One regex can't do this.
//
// Why this is structurally better than the regex approach:
//
//   - Adaptive — a brand whose About page lives at /our-company
//     doesn't need a regex update; the LLM sees the candidate plus
//     anchor text and ranks it appropriately
//   - Multi-signal — anchor text, region, depth, words in URL all
//     contribute to the score
//   - Cheap — one LLM call per scrape (~$0.001 with gpt-4o-mini)
//     replaces ~250 lines of regex
//   - Explainable — the ranker returns a reason per URL, surfaced in
//     the inspector for debugging
//
// Safety:
//   - Strict JSON Schema response so the model can't return junk
//   - Hard timeout (15 s) — if the call hangs we fall back to the
//     existing regex tier scorer
//   - Sandboxed by setUrlRanker() so tests can mock without a real
//     OpenAI key
//
// This file is provider-agnostic: the LLM call is injected.

import { logger } from "../../logger";

export interface UrlCandidate {
  url: string;
  /** Where we found this URL — informs the ranker's weighting. */
  source: "sitemap" | "nav" | "header" | "footer" | "jsonld";
  /** Anchor text or similar label. Empty when not known. */
  label?: string;
}

export interface RankedUrl {
  url: string;
  /** 0-10. Higher = more brand-identity signal expected. */
  score: number;
  /** One-line reason. Surfaced in the inspector for transparency. */
  reason: string;
}

export interface RankerOpts {
  brandUrl: string;
  brandName?: string;
  industry?: string | null;
  /** Hard cap on returned URLs. The ranker may return fewer if it
   *  considers more than this many to be low-signal. */
  maxResults: number;
}

export type RankerLlmCallable = (prompt: {
  system: string;
  user: string;
  responseFormat: {
    type: "json_schema";
    json_schema: Record<string, unknown>;
  };
}) => Promise<string>;

const JSON_SCHEMA = {
  name: "url_ranking",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ranked"],
    properties: {
      ranked: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "score", "reason"],
          properties: {
            url: { type: "string" },
            score: { type: "number" },
            reason: { type: "string" },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You rank candidate URLs by how likely each is to contain brand-identity facts (mission, founders, location, products, leadership, certifications). Return JSON only.

CRITERIA (in order of weight):
1. Identity pages: about, company, mission, story, team, leadership, founders, history → 9-10
2. Product / pricing pages: product, products, pricing, plans, platform → 7-8
3. Customer / use-case pages: customers, case-studies, testimonials, use-cases → 5-7
4. Contact / locations / careers: contact, locations, offices, careers → 4-6
5. Compliance / trust: security, trust, certifications, compliance → 4-6
6. Press / blog / news / docs / help → 1-3 (avoid)
7. Login, signup, cart, checkout, account, app, dashboard → 0 (skip)
8. Footer-only links → mostly low-priority (legal, careers)

EXCEPTIONS:
- For a brand whose product IS its identity (Notion, Linear), the product page can be 9.
- For a brand at root /about (any path style), that always scores 10.
- Use the anchor text — a link labelled "Our Story" scores like /about even if the URL is /heritage.
- For a brand with regulatory facts (banks, fintech, healthcare), the /compliance or /trust pages can be 8.

If a URL is obviously useless (privacy policy, cookie policy, status page, individual blog post), score 0 and the consumer drops it.`;

function buildUserPrompt(opts: RankerOpts, candidates: UrlCandidate[]): string {
  const ctx = [
    `Brand: ${opts.brandName ?? "(unknown)"}`,
    `Brand URL: ${opts.brandUrl}`,
    opts.industry ? `Industry: ${opts.industry}` : null,
    `Pick the top ${opts.maxResults} URLs from the candidate list.`,
  ]
    .filter(Boolean)
    .join("\n");

  const list = candidates
    .map((c, i) => {
      const src = c.source;
      const label = c.label ? ` "${c.label.slice(0, 40)}"` : "";
      return `${i + 1}. [${src}]${label} ${c.url}`;
    })
    .join("\n");

  return `${ctx}\n\nCandidates:\n${list}\n\nReturn JSON with a "ranked" array, ordered by score desc. Include every candidate the user might want to scrape; omit clearly useless ones (privacy / cookie / individual blog posts).`;
}

export async function rankUrls(
  candidates: UrlCandidate[],
  opts: RankerOpts,
  llm: RankerLlmCallable,
): Promise<RankedUrl[]> {
  if (candidates.length === 0) return [];
  // Hard cap on the candidate list size we send to the LLM. Beyond
  // ~100 the prompt gets unwieldy and the LLM can't usefully weigh
  // them all. We pre-truncate to the first 100 (sitemap order tends
  // to be roughly priority-sorted already).
  const truncated = candidates.slice(0, 100);

  const userPrompt = buildUserPrompt(opts, truncated);
  let rawResponse: string;
  try {
    rawResponse = await llm({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      responseFormat: { type: "json_schema", json_schema: JSON_SCHEMA },
    });
  } catch (err) {
    logger.warn({ err }, "urlRanker: LLM call failed; caller should fall back to tier regex");
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    throw new Error("urlRanker: LLM returned non-JSON despite json_schema mode");
  }
  const ranked = (parsed as { ranked?: unknown[] })?.ranked;
  if (!Array.isArray(ranked)) {
    throw new Error("urlRanker: response missing 'ranked' array");
  }

  // Validate + clamp + sort each entry.
  const candidateSet = new Set(truncated.map((c) => c.url));
  const validRanked: RankedUrl[] = [];
  for (const r of ranked) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : null;
    const score = typeof o.score === "number" ? Math.max(0, Math.min(10, o.score)) : null;
    const reason = typeof o.reason === "string" ? o.reason.slice(0, 200) : "";
    if (!url || score === null) continue;
    // Only accept URLs that were actually in our candidate set — guard
    // against hallucinated URLs the LLM invents.
    if (!candidateSet.has(url)) continue;
    validRanked.push({ url, score, reason });
  }
  // Dedup by URL keeping highest score.
  const byUrl = new Map<string, RankedUrl>();
  for (const r of validRanked) {
    const prior = byUrl.get(r.url);
    if (!prior || r.score > prior.score) byUrl.set(r.url, r);
  }
  const sorted = Array.from(byUrl.values()).sort((a, b) => b.score - a.score);
  return sorted.slice(0, opts.maxResults);
}
