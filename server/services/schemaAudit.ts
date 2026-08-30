// Schema.org / JSON-LD auditing for server/routes/geoSignals.ts.
//
// Extracted verbatim from server/routes/geoSignals.ts (B7-14 service-layer
// split). No Express types, no req/res - functions take explicit
// parameters and either return plain data or throw.
//
// Schema audit measures per-type field completeness, not hardcoded
// presence flags. Results cached in schema_audits with a 7-day TTL.

import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../db";
import { schemaAudits } from "@shared/schema";
import { logger } from "../lib/logger";
import { parseJsonLdFromHtml } from "../lib/jsonLdExtract";
import { PAGE_FETCH_TIMEOUT_MS } from "../lib/factAgent/v2/vercelBudget";

const SCHEMA_FIELD_REQUIREMENTS: Record<string, { required: string[]; recommended: string[] }> = {
  Article: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "articleBody", "publisher", "image"],
  },
  NewsArticle: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "image", "publisher"],
  },
  BlogPosting: {
    required: ["headline", "author", "datePublished"],
    recommended: ["dateModified", "articleBody", "publisher"],
  },
  FAQPage: { required: ["mainEntity"], recommended: [] },
  HowTo: {
    required: ["name", "step"],
    recommended: ["totalTime", "tool", "supply"],
  },
  Recipe: {
    required: ["name", "recipeIngredient", "recipeInstructions"],
    recommended: ["cookTime", "prepTime", "image", "nutrition"],
  },
  Event: {
    required: ["name", "startDate", "location"],
    recommended: ["endDate", "performer", "offers"],
  },
  VideoObject: {
    required: ["name", "uploadDate", "thumbnailUrl"],
    recommended: ["description", "duration", "contentUrl"],
  },
  Organization: {
    required: ["name"],
    recommended: ["logo", "url", "sameAs", "contactPoint"],
  },
  LocalBusiness: {
    required: ["name", "address"],
    recommended: ["telephone", "openingHours", "geo"],
  },
  Person: {
    required: ["name"],
    recommended: ["jobTitle", "worksFor", "sameAs", "image"],
  },
  BreadcrumbList: { required: ["itemListElement"], recommended: [] },
  WebPage: {
    required: ["name"],
    recommended: ["description", "lastReviewed", "speakable"],
  },
  Product: {
    required: ["name", "offers"],
    recommended: ["description", "brand", "aggregateRating", "image"],
  },
};

function isFieldPopulated(node: Record<string, unknown>, field: string): boolean {
  const v = node[field];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function measureSchemaCompleteness(
  instances: object[],
  required: string[],
  recommended: string[],
): { completeness: number; populatedFields: string[]; missingFields: string[] } {
  const all = [...required, ...recommended];
  if (all.length === 0) {
    return { completeness: instances.length > 0 ? 1 : 0, populatedFields: [], missingFields: [] };
  }
  let bestCompleteness = 0;
  let bestPopulated: string[] = [];
  let bestMissing: string[] = all.slice();
  for (const inst of instances) {
    const rec = inst as Record<string, unknown>;
    const populated = all.filter((f) => isFieldPopulated(rec, f));
    const missing = all.filter((f) => !isFieldPopulated(rec, f));
    const c = populated.length / all.length;
    if (c >= bestCompleteness) {
      bestCompleteness = c;
      bestPopulated = populated;
      bestMissing = missing;
    }
  }
  return {
    completeness: bestCompleteness,
    populatedFields: bestPopulated,
    missingFields: bestMissing,
  };
}

export function normaliseUrl(raw: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  // Lowercase host, strip default port, strip fragment, drop trailing
  // slash on the path. This means `Example.com/page#a`, `example.com/page`,
  // and `example.com/page/` all hash to the same cache key - previously
  // they didn't, so the cache hit-rate was much lower than it should be
  // and the Schema Lab → Authority signal lookup missed even when the
  // audit had run successfully on a near-identical URL.
  try {
    const u = new URL(withScheme);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === "http:" && u.port === "80") ||
      (u.protocol === "https:" && u.port === "443")
    ) {
      u.port = "";
    }
    let str = u.toString();
    // Strip the trailing slash that URL serialisation always appends
    // when there's no path component beyond `/`, then re-add for the
    // empty-path case so `https://x.com` and `https://x.com/` agree.
    if (str.endsWith("/") && u.pathname.length > 1) str = str.slice(0, -1);
    return str;
  } catch {
    return withScheme;
  }
}

export function urlHashOf(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

// Thrown when a target URL can't be reached at all (private host, DNS
// failure, or malformed URL). The route maps this to a 400; every other
// fetch failure (timeout, 403, 404, non-HTML) is recorded as `fetchError`
// on a normal 200 response instead, because the audit still has a useful
// (all-missing) answer to give.
export class UnreachableUrlError extends Error {}

export type SchemaAuditResult = {
  url: string;
  fetched: boolean;
  fetchError?: string | null;
  fetchStatus?: number | null;
  schemas: unknown;
  additionalTypes: string[];
  totalSchemasFound: number;
  cachedAt: Date | null;
};

// Server-side schema completeness lookup for a given article's externalUrl.
// Closes the Schema Lab → Authority signal loop: reads the article's
// externalUrl, hashes it, and looks up the cached schema_audits row. Same
// key the audit endpoint writes under, so a successful audit on an
// article URL automatically lifts the Authority sub-score on the next
// analyze - no client coordination needed.
export async function resolveSchemaCompletenessForArticle(
  externalUrl: string,
  articleId?: string | null,
): Promise<number | undefined> {
  try {
    const auditUrl = normaliseUrl(externalUrl);
    const hash = urlHashOf(auditUrl);
    const cachedRows = await db
      .select()
      .from(schemaAudits)
      .where(eq(schemaAudits.urlHash, hash))
      .limit(1);
    const cached = cachedRows[0];
    if (cached?.completenessByType) {
      const map = cached.completenessByType as Record<string, number>;
      const values = Object.values(map);
      if (values.length > 0) {
        return values.reduce((a, b) => a + b, 0) / values.length;
      }
    }
    return undefined;
  } catch (lookupErr) {
    logger.info(
      { err: lookupErr, articleId },
      "geo-signals/analyze: schema-completeness lookup failed (non-fatal)",
    );
    return undefined;
  }
}

export async function runSchemaAudit(url: string, force: unknown): Promise<SchemaAuditResult> {
  const normalised = normaliseUrl(url);
  const hash = urlHashOf(normalised);

  const cachedRows = await db
    .select()
    .from(schemaAudits)
    .where(eq(schemaAudits.urlHash, hash))
    .limit(1);
  const cached = cachedRows[0];
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  // force=true bypasses the cache so the "Re-audit" button can
  // actually re-audit. Without this, the route used to return
  // the cached row for 7 days regardless of how the request was
  // triggered - turning Re-audit into a 7-day no-op.
  if (
    force !== true &&
    cached &&
    cached.fetchedAt &&
    Date.now() - new Date(cached.fetchedAt).getTime() < sevenDays
  ) {
    const payload = cached.schemas as {
      schemas: unknown;
      additionalTypes: string[];
      totalSchemasFound: number;
    };
    // 2026-05-28: the sidecar `additional_types` column was
    // dropped in migration 0080. Everything we need lives inside
    // `payload.additionalTypes` (jsonb) - fall back to [] on
    // legacy rows that pre-date the inner field.
    return {
      url: cached.url,
      fetched: true,
      schemas: payload.schemas,
      additionalTypes: payload.additionalTypes ?? [],
      totalSchemasFound: payload.totalSchemasFound ?? 0,
      cachedAt: cached.fetchedAt,
    };
  }

  let html = "";
  let fetchError: string | null = null;
  let fetchStatus: number | null = null;
  try {
    // 2026-05-28: switched from safeFetchText (bot UA
    // "VentureCite-SchemaAudit/1.0") to safeFetchTextWithLockedIp
    // (Chrome UA + Accept headers + manual redirect handling).
    // Cloudflare / Akamai / Vercel WAFs silently 403 the bot UA, so
    // legitimate audits of marketing sites were returning empty HTML
    // and rendering as "every schema missing" - the user's
    // "mimicking" symptom. The locked-IP variant also closes the
    // SSRF rebinding window for free.
    const { safeFetchTextWithLockedIp } = await import("../lib/ssrf");
    // Tier-aware: PAGE_FETCH_TIMEOUT_MS is ~6s on Hobby, 10s on
    // Pro. The previous hardcoded 15s could exhaust the entire
    // Hobby function budget before the route returned.
    const result = await safeFetchTextWithLockedIp(normalised, {
      maxBytes: 2 * 1024 * 1024,
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
    });
    fetchStatus = result.status;
    // Refuse to parse non-HTML responses. The regex wouldn't
    // match a binary body anyway, but we'd still cache an empty
    // "no schemas found" result for 7 days against a binary URL.
    const contentType = result.contentType ?? "";
    const isHtml =
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml") ||
      contentType === "";
    if (!isHtml) {
      fetchError = `Target returned non-HTML content (${contentType}).`;
    } else if (result.status >= 200 && result.status < 300) {
      html = result.text;
    } else if (result.status === 403 || result.status === 429) {
      // Bot detection / WAF. Be specific so the UI can surface this
      // rather than showing the generic "all schemas missing".
      fetchError = `Bot detection blocked the audit (HTTP ${result.status}). The site's WAF may not allow third-party schema audits.`;
    } else if (result.status === 404) {
      fetchError = "Target URL returned HTTP 404 (page not found).";
    } else {
      fetchError = `Target returned HTTP ${result.status}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch URL";
    if (/private|not allowed|resolve|Invalid URL/i.test(msg)) {
      throw new UnreachableUrlError("This URL isn't reachable (private host or invalid).");
    }
    if (/timeout|aborted/i.test(msg)) {
      fetchError = "Target site took too long to respond.";
    } else {
      fetchError = msg;
    }
  }

  const nodesByType = html ? parseJsonLdFromHtml(html) : new Map<string, object[]>();
  const schemas = Object.entries(SCHEMA_FIELD_REQUIREMENTS).map(([schemaType, spec]) => {
    const instances = nodesByType.get(schemaType) ?? [];
    const present = instances.length > 0;
    const { completeness, populatedFields, missingFields } = present
      ? measureSchemaCompleteness(instances, spec.required, spec.recommended)
      : {
          completeness: 0,
          populatedFields: [],
          missingFields: [...spec.required, ...spec.recommended],
        };
    return {
      schemaType,
      present,
      completenessPercent: Math.round(completeness * 100),
      populatedFields,
      missingFields,
      required: spec.required,
      recommended: spec.recommended,
    };
  });

  const catalogueSet = new Set(Object.keys(SCHEMA_FIELD_REQUIREMENTS));
  const additionalTypes = Array.from(nodesByType.keys()).filter((t) => !catalogueSet.has(t));
  const completenessByType: Record<string, number> = {};
  for (const s of schemas) {
    if (s.present) completenessByType[s.schemaType] = s.completenessPercent / 100;
  }
  const totalSchemasFound = nodesByType.size;
  const responsePayload: SchemaAuditResult = {
    url: normalised,
    fetched: !fetchError,
    fetchError,
    fetchStatus,
    schemas,
    additionalTypes,
    totalSchemasFound,
    cachedAt: null,
  };

  if (!fetchError) {
    try {
      // 2026-05-28: additional_types sidecar column dropped in
      // migration 0080. The same data lives inside the schemas
      // jsonb at payload.additionalTypes; no information lost.
      await db
        .insert(schemaAudits)
        .values({
          urlHash: hash,
          url: normalised,
          schemas: { schemas, additionalTypes, totalSchemasFound },
          completenessByType,
        })
        .onConflictDoUpdate({
          target: schemaAudits.urlHash,
          set: {
            url: normalised,
            schemas: { schemas, additionalTypes, totalSchemasFound },
            completenessByType,
            fetchedAt: new Date(),
          },
        });
    } catch (err) {
      logger.warn({ err }, "schema-audit: failed to upsert cache");
    }
  }

  return responsePayload;
}
