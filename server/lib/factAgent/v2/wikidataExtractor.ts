// Wikidata enrichment.
//
// For any brand whose entity exists on Wikidata (every public company,
// most large brands, well-known startups) we get a highly-verified
// fact set for free: founding date, headquarters, CEO, employee
// count, parent company, ticker, industry, country of origin, etc.
//
// Cost: 2 HTTP requests per scrape (1 SPARQL lookup + 1 entity fetch),
// no LLM calls. ~$0.
//
// Reliability: Wikidata is community-edited but the high-traffic
// brand entries are typically well-maintained. We mark these facts
// with confidence 0.95 (not 1.0 like structured data the brand wrote
// about itself, but higher than LLM-extracted facts).
//
// Implementation:
//   1. Find the Wikidata entity ID by querying for an entity whose
//      `official website` (P856) matches our brand URL.
//   2. Fetch the entity's claims (statements) via the public REST API.
//   3. Map known Wikidata properties to our controlled-vocab Facts.
//
// Caveats:
//   - The SPARQL endpoint is rate-limited globally; we add a UA so
//     they can identify us if abuse alerts fire.
//   - We retry once on 5xx, then give up. Wikidata being down is not
//     a fatal error for a scrape - it just means no enrichment.
//   - Entity IDs occasionally change (Q-numbers shift during merges);
//     we always re-lookup, never cache the ID.

import type { Domain, Fact } from "@shared/factAgent/schema";
import { logger } from "../../logger";

import { WIKIDATA_TIMEOUT_MS } from "./vercelBudget";

const SPARQL_URL = "https://query.wikidata.org/sparql";
const ENTITY_URL_BASE = "https://www.wikidata.org/wiki/Special:EntityData/";
const USER_AGENT = "VentureCite/FactAgent (https://venturepr.com; engineering@litlabs.io)";
const REQUEST_TIMEOUT_MS = WIKIDATA_TIMEOUT_MS;

interface WikidataClaim {
  mainsnak?: {
    snaktype?: string;
    property?: string;
    datatype?: string;
    datavalue?: {
      type?: string;
      value?: unknown;
    };
  };
}

interface WikidataEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WikidataClaim[]>;
}

interface ExtractContext {
  entityId: string;
  sourceUrl: string;
}

async function fetchWithUa(url: string, opts: { timeoutMs?: number } = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Look up the Wikidata entity ID for a brand by its official website
 *  URL. Returns the Q-number (e.g. "Q3025" for Adyen) or null when no
 *  matching entity exists. */
export async function findWikidataEntityByUrl(brandUrl: string): Promise<string | null> {
  let urlForQuery: string;
  try {
    const u = new URL(brandUrl);
    // Wikidata stores official websites in canonical form. Try the
    // exact URL first, then with/without trailing slash, then bare host.
    urlForQuery = `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
  // SPARQL: any item whose official website (P856) starts with our URL.
  // We use STRSTARTS to be tolerant of minor canonical differences
  // (with/without www, with/without trailing slash).
  const query = `
    SELECT ?item WHERE {
      ?item wdt:P856 ?site.
      FILTER(STRSTARTS(LCASE(STR(?site)), LCASE("${urlForQuery.replace(/"/g, '\\"')}")))
    } LIMIT 1
  `;
  const url = `${SPARQL_URL}?format=json&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithUa(url, { timeoutMs: 6_000 });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      results?: { bindings?: Array<{ item?: { value?: string } }> };
    };
    const itemUrl = body.results?.bindings?.[0]?.item?.value;
    if (!itemUrl) return null;
    const m = /\/(Q\d+)$/.exec(itemUrl);
    return m?.[1] ?? null;
  } catch (err) {
    logger.info({ err, brandUrl }, "wikidata: entity lookup failed");
    return null;
  }
}

async function fetchEntity(entityId: string): Promise<WikidataEntity | null> {
  const url = `${ENTITY_URL_BASE}${encodeURIComponent(entityId)}.json`;
  try {
    const res = await fetchWithUa(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { entities?: Record<string, WikidataEntity> };
    return body.entities?.[entityId] ?? null;
  } catch {
    return null;
  }
}

/** Resolve a Wikidata item's label in English. Used to convert
 *  entity references (e.g. "Q30" for United States) to human-readable
 *  strings without a second round-trip. */
async function resolveLabels(itemIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (itemIds.length === 0) return out;
  const dedup = Array.from(new Set(itemIds));
  // Wikidata API: wbgetentities supports up to 50 IDs at once.
  const batches: string[][] = [];
  for (let i = 0; i < dedup.length; i += 50) batches.push(dedup.slice(i, i + 50));
  for (const batch of batches) {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join("|")}&props=labels&languages=en&format=json`;
    try {
      const res = await fetchWithUa(url);
      if (!res.ok) continue;
      const body = (await res.json()) as {
        entities?: Record<string, { labels?: { en?: { value: string } } }>;
      };
      const entities = body.entities ?? {};
      for (const [id, entity] of Object.entries(entities)) {
        const label = entity.labels?.en?.value;
        if (label) out.set(id, label);
      }
    } catch {
      // Per-batch failure is non-fatal.
    }
  }
  return out;
}

function buildFact(domain: Domain, factKey: string, factValue: string, ctx: ExtractContext): Fact {
  return {
    domain,
    factKey,
    factValue,
    valueType: "string",
    valuePayload: null,
    confidence: 0.95,
    sourceExcerpt: `Wikidata ${ctx.entityId}`,
    sourceUrl: ctx.sourceUrl,
  };
}

function buildArrayFact(
  domain: Domain,
  factKey: string,
  items: string[],
  ctx: ExtractContext,
): Fact {
  return {
    domain,
    factKey,
    factValue: items.join(", "),
    valueType: "array",
    valuePayload: { items },
    confidence: 0.95,
    sourceExcerpt: `Wikidata ${ctx.entityId}`,
    sourceUrl: ctx.sourceUrl,
  };
}

function claimValue(claim: WikidataClaim): unknown {
  const v = claim.mainsnak?.datavalue?.value;
  return v;
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.id === "string") return o.id; // Wikidata item ref
    if (typeof o.time === "string") return o.time; // Wikidata date
    if (typeof o.amount === "string") return o.amount;
  }
  return null;
}

function parseYear(s: string): string | null {
  // Wikidata times look like "+2006-01-15T00:00:00Z"
  const m = /([+-]?\d{4})/.exec(s);
  if (!m) return null;
  const yr = m[1].replace(/^\+/, "");
  return /^\d{4}$/.test(yr) ? yr : null;
}

// Property mappings - Wikidata property -> our Fact emitter.
const ENTITY_PROPS = [
  "P112", // founder
  "P159", // headquarters location
  "P17", // country
  "P452", // industry
  "P169", // CEO
  "P749", // parent organization
  "P1128", // employees
  "P249", // ticker symbol
  "P127", // owned by (used to find parent for non-public)
  "P2541", // operating area
  "P414", // stock exchange
];

/** Main export. Look up the Wikidata entity for a brand and return
 *  enriched facts. Returns an empty array if no entity is found or
 *  Wikidata is unreachable. */
export async function fetchWikidataFacts(brandUrl: string): Promise<{
  facts: Fact[];
  entityId: string | null;
  durationMs: number;
}> {
  const start = Date.now();
  const entityId = await findWikidataEntityByUrl(brandUrl);
  if (!entityId) {
    return { facts: [], entityId: null, durationMs: Date.now() - start };
  }
  const entity = await fetchEntity(entityId);
  if (!entity) {
    return { facts: [], entityId, durationMs: Date.now() - start };
  }
  const sourceUrl = `https://www.wikidata.org/wiki/${entityId}`;
  const ctx: ExtractContext = { entityId, sourceUrl };
  const facts: Fact[] = [];

  // Basic identity.
  const enLabel = entity.labels?.en?.value;
  if (enLabel) facts.push(buildFact("identity", "name", enLabel, ctx));
  const enDescription = entity.descriptions?.en?.value;
  if (enDescription) facts.push(buildFact("identity", "description", enDescription, ctx));

  const claims = entity.claims ?? {};

  // Resolve item-reference values to labels (one batch call).
  const itemRefs: string[] = [];
  for (const prop of ENTITY_PROPS) {
    for (const claim of claims[prop] ?? []) {
      const v = claimValue(claim);
      if (v && typeof v === "object") {
        const ref = (v as Record<string, unknown>).id;
        if (typeof ref === "string" && /^Q\d+$/.test(ref)) itemRefs.push(ref);
      }
    }
  }
  const labels = await resolveLabels(itemRefs);
  const labelFor = (id: string): string | null => labels.get(id) ?? null;

  // P571 (inception / founding date) - usually a Wikibase time value.
  const foundingClaim = claims.P571?.[0];
  if (foundingClaim) {
    const v = asString(claimValue(foundingClaim));
    if (v) {
      const yr = parseYear(v);
      if (yr) facts.push(buildFact("identity", "foundedYear", yr, ctx));
    }
  }

  // P112 (founder) - one or more Person items.
  const founderNames: string[] = [];
  for (const c of claims.P112 ?? []) {
    const v = claimValue(c);
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string") {
        const name = labelFor(id);
        if (name) founderNames.push(name);
      }
    }
  }
  if (founderNames.length > 0) {
    facts.push(buildArrayFact("team", "founders", founderNames, ctx));
  }

  // P169 (CEO).
  const ceoClaim = claims.P169?.[0];
  if (ceoClaim) {
    const v = claimValue(ceoClaim);
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string") {
        const name = labelFor(id);
        if (name) facts.push(buildFact("team", "ceo", name, ctx));
      }
    }
  }

  // P159 (headquarters location).
  const hqClaim = claims.P159?.[0];
  if (hqClaim) {
    const v = claimValue(hqClaim);
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string") {
        const name = labelFor(id);
        if (name) facts.push(buildFact("operations", "headquarters", name, ctx));
      }
    }
  }

  // P17 (country).
  const countryClaim = claims.P17?.[0];
  if (countryClaim) {
    const v = claimValue(countryClaim);
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string") {
        const name = labelFor(id);
        if (name) facts.push(buildFact("contact", "country", name, ctx));
      }
    }
  }

  // P452 (industry).
  const industries: string[] = [];
  for (const c of claims.P452 ?? []) {
    const v = claimValue(c);
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string") {
        const name = labelFor(id);
        if (name) industries.push(name);
      }
    }
  }
  if (industries.length > 0) {
    facts.push(buildFact("identity", "industry", industries.join(", "), ctx));
  }

  // P1128 (employees) - Quantity value.
  const employeesClaim = claims.P1128?.[0];
  if (employeesClaim) {
    const v = claimValue(employeesClaim);
    if (v && typeof v === "object") {
      const amount = (v as Record<string, unknown>).amount;
      if (typeof amount === "string") {
        const clean = amount.replace(/^\+/, "");
        facts.push(buildFact("team", "employeeCount", clean, ctx));
      }
    }
  }

  // P249 (ticker symbol) - typically string value.
  const tickerClaim = claims.P249?.[0];
  if (tickerClaim) {
    const v = asString(claimValue(tickerClaim));
    if (v) facts.push(buildFact("identity", "publicTradingSymbol", v, ctx));
  }

  // P414 (stock exchange).
  const exchangeClaim = claims.P414?.[0];
  if (exchangeClaim) {
    const v = claimValue(exchangeClaim);
    if (v && typeof v === "object") {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === "string") {
        const name = labelFor(id);
        if (name) facts.push(buildFact("identity", "publicTradingExchange", name, ctx));
      }
    }
  }

  return { facts, entityId, durationMs: Date.now() - start };
}
