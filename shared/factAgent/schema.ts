// Single canonical Zod schema for v2 fact extraction.
//
// Bump CURRENT_SCHEMA_VERSION when the shape changes meaningfully (added
// or renamed fields, changed types). The bump:
//   - busts the search-LLM cache (`...:v<N>`)
//   - tags new brand_fact_sheet rows with the new version
//   - surfaces a "needs review" badge in the UI for rows still on the old version
//
// v2 (2026-05-28): controlled-vocabulary factKey + provenance-preserving
// valuePayload. Rationale: in v1 the LLM was free to invent factKey
// strings, so the same fact came back as "name" on one page and
// "brandName" on the next; the partial unique index in
// `brand_fact_sheet` keyed on (brandId, domain, subcategory, factKey)
// then created duplicate rows and the UI showed the same fact 3-5 times.
// v2 pins factKey to an enum per domain, derives subcategory from
// factKey on the server (so the unique index collapses cross-page
// duplicates), and stores per-source provenance in valuePayload.sources
// so we preserve every excerpt/URL/confidence the LLM produced even when
// the canonical row holds only one factValue.
import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 2 as const;

export const DOMAINS = [
  "identity",
  "offerings",
  "positioning",
  "team",
  "operations",
  "credentials",
  "growth",
  "contact",
] as const;
export type Domain = (typeof DOMAINS)[number];

export const VALUE_TYPES = ["string", "number", "array"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

// ── Controlled vocabulary ─────────────────────────────────────────────
//
// One enum of allowed factKey strings per domain. The LLM is constrained
// to pick from these; if a page yields a genuinely novel concept the
// LLM puts it under `other` with a free-text refinement encoded in
// `valuePayload.otherLabel`.
//
// Curated against the four production audit sites (Adyen, Samsung,
// Notion, VenturePR) so every fact those brands actually surface has a
// home here. Resist the temptation to widen this — a single key per
// logical fact is the whole point. If a new fact recurs in the wild,
// add it here (bump CURRENT_SCHEMA_VERSION) rather than letting the LLM
// invent.
// 2026-05-28 (revised): controlled vocabulary cleaned up to eliminate
// redundant keys that caused the LLM to extract the same fact twice
// under different names. The duplicates we removed:
//
//   identity.foundedDate    — overlapped foundedYear. Kept foundedYear
//                             (more specific to brand-fact use case)
//   identity.founderNames   — overlapped team.founders. Kept team.founders
//                             (correct domain — founders ARE team)
//   identity.category       — overlapped identity.industry. Kept industry
//   operations.address      — overlapped operations.headquarters. Kept
//                             headquarters (one canonical location key)
//   operations.city,
//   operations.stateRegion,
//   operations.postalCode,
//   operations.country      — duplicated contact.* equivalents. Kept the
//                             contact.* versions since address details
//                             are part of the contact record.
//
// Also added domain-rich keys observed during the production audit:
//   identity.publicTradingExchange (Adyen → Euronext Amsterdam)
//   credentials.certifications already covered ISO standards
//   credentials.regulatoryRegistrations (Adyen → DNB, FCA, etc.)
//   offerings.subProducts (sub-brands like "Adyen Capital", "Adyen Issuing")
//   offerings.geographicAvailability
//   operations.dataCenters
//   growth.publicMetrics (processing volume, MAU, etc.)
export const ALLOWED_KEYS = {
  identity: [
    "name",
    "legalName",
    "alternateName",
    "tagline",
    "description",
    "foundedYear",
    "logoUrl",
    "website",
    "industry",
    "companyType",
    "publicTradingExchange",
    "publicTradingSymbol",
    "other",
  ],
  offerings: [
    "productLine",
    "primaryProduct",
    "primaryService",
    "productCategory",
    "subProducts",
    "keyFeatures",
    "useCases",
    "platforms",
    "integrations",
    "geographicAvailability",
    "other",
  ],
  positioning: [
    "valueProposition",
    "missionStatement",
    "visionStatement",
    "differentiator",
    "targetAudience",
    "targetGeography",
    "tone",
    "other",
  ],
  team: [
    "ceo",
    "founders",
    "executives",
    "employeeCount",
    "workCulture",
    "openRoles",
    "headquartersTeamSize",
    "other",
  ],
  operations: [
    "headquarters",
    "additionalOffices",
    "operatingRegions",
    "dataCenters",
    "userCount",
    "customerCount",
    "uptime",
    "languages",
    "other",
  ],
  credentials: [
    "certifications",
    "complianceStandards",
    "regulatoryRegistrations",
    "awards",
    "press",
    "fundingTotal",
    "fundingStage",
    "investors",
    "other",
  ],
  growth: [
    "annualRevenue",
    "revenueRange",
    "yearOverYearGrowth",
    "publicMetrics",
    "newProductLaunches",
    "majorMilestones",
    "expansionRegions",
    "other",
  ],
  contact: [
    "email",
    "supportEmail",
    "salesEmail",
    "telephone",
    "supportTelephone",
    "salesTelephone",
    "supportUrl",
    "salesUrl",
    "address",
    "city",
    "stateRegion",
    "postalCode",
    "country",
    "fax",
    "socialLinks",
    "other",
  ],
} as const satisfies Record<Domain, readonly string[]>;

export type FactKeyFor<D extends Domain> = (typeof ALLOWED_KEYS)[D][number];

/** Flat union of every `domain.factKey` pair allowed. Used for the JSON-
 *  Schema enum we send to OpenAI in strict mode. */
export const ALL_DOMAIN_KEY_PAIRS: ReadonlyArray<{ domain: Domain; factKey: string }> =
  DOMAINS.flatMap((d) =>
    (ALLOWED_KEYS[d] as readonly string[]).map((k) => ({ domain: d, factKey: k })),
  );

/** Server-side derivation: subcategory is a human-readable label
 *  determined by (domain, factKey). The LLM no longer chooses it; we
 *  compute it after extraction. Pinning subcategory + factKey together
 *  is what lets the partial unique index in `brand_fact_sheet` collapse
 *  cross-page duplicates of the same logical fact. */
const SUBCATEGORY_LABELS: Record<string, string> = {
  // identity
  "identity.name": "Brand name",
  "identity.legalName": "Legal entity name",
  "identity.alternateName": "Also known as",
  "identity.tagline": "Tagline",
  "identity.description": "Description",
  "identity.foundedYear": "Founded",
  "identity.logoUrl": "Logo",
  "identity.website": "Website",
  "identity.industry": "Industry",
  "identity.companyType": "Company type",
  "identity.publicTradingExchange": "Stock exchange",
  "identity.publicTradingSymbol": "Ticker",
  // offerings
  "offerings.productLine": "Product line",
  "offerings.primaryProduct": "Primary product",
  "offerings.primaryService": "Primary service",
  "offerings.productCategory": "Product category",
  "offerings.subProducts": "Sub-products",
  "offerings.keyFeatures": "Key features",
  "offerings.useCases": "Use cases",
  "offerings.platforms": "Platforms",
  "offerings.integrations": "Integrations",
  "offerings.geographicAvailability": "Availability",
  // positioning
  "positioning.valueProposition": "Value proposition",
  "positioning.missionStatement": "Mission",
  "positioning.visionStatement": "Vision",
  "positioning.differentiator": "Differentiator",
  "positioning.targetAudience": "Target audience",
  "positioning.targetGeography": "Target geography",
  "positioning.tone": "Tone",
  // team
  "team.ceo": "CEO",
  "team.founders": "Founders",
  "team.executives": "Executives",
  "team.employeeCount": "Employees",
  "team.workCulture": "Culture",
  "team.openRoles": "Open roles",
  "team.headquartersTeamSize": "HQ team size",
  // operations
  "operations.headquarters": "Headquarters",
  "operations.additionalOffices": "Additional offices",
  "operations.operatingRegions": "Operating regions",
  "operations.dataCenters": "Data centers",
  "operations.userCount": "Users",
  "operations.customerCount": "Customers",
  "operations.uptime": "Uptime",
  "operations.languages": "Languages",
  // credentials
  "credentials.certifications": "Certifications",
  "credentials.complianceStandards": "Compliance",
  "credentials.regulatoryRegistrations": "Regulatory registrations",
  "credentials.awards": "Awards",
  "credentials.press": "Press",
  "credentials.fundingTotal": "Funding raised",
  "credentials.fundingStage": "Funding stage",
  "credentials.investors": "Investors",
  // growth
  "growth.annualRevenue": "Annual revenue",
  "growth.revenueRange": "Revenue range",
  "growth.yearOverYearGrowth": "YoY growth",
  "growth.publicMetrics": "Public metrics",
  "growth.newProductLaunches": "Recent launches",
  "growth.majorMilestones": "Milestones",
  "growth.expansionRegions": "Expansion regions",
  // contact
  "contact.email": "Email",
  "contact.supportEmail": "Support email",
  "contact.salesEmail": "Sales email",
  "contact.telephone": "Phone",
  "contact.supportTelephone": "Support phone",
  "contact.salesTelephone": "Sales phone",
  "contact.supportUrl": "Support",
  "contact.salesUrl": "Sales",
  "contact.address": "Address",
  "contact.city": "City",
  "contact.stateRegion": "State / region",
  "contact.postalCode": "Postal code",
  "contact.country": "Country",
  "contact.fax": "Fax",
  "contact.socialLinks": "Social",
};

export function subcategoryFor(domain: Domain, factKey: string): string {
  return (
    SUBCATEGORY_LABELS[`${domain}.${factKey}`] ??
    // Fallback for `other` / future keys: title-cased factKey.
    factKey
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim()
  );
}

// ── Provenance ────────────────────────────────────────────────────────
//
// Each source entry records exactly where one page-level extraction
// observed a fact. The canonical row holds the consensus `factValue`
// at top level; `valuePayload.sources` collects every (url, excerpt,
// confidence) tuple from pages that confirmed it; `valuePayload
// .alternatives` collects values that disagreed, with their own
// sources. Caps prevent runaway JSONB bloat.
export const MAX_SOURCES_PER_FACT = 20;
export const MAX_ALTERNATIVES_PER_FACT = 10;

export const SourceEntrySchema = z.object({
  url: z.string(),
  excerpt: z.string().max(200).default(""),
  confidence: z.number().min(0).max(1),
});
export type SourceEntry = z.infer<typeof SourceEntrySchema>;

export const AlternativeEntrySchema = z.object({
  value: z.string().min(1).max(2000),
  sources: z.array(SourceEntrySchema).max(MAX_SOURCES_PER_FACT),
});
export type AlternativeEntry = z.infer<typeof AlternativeEntrySchema>;

export const ValuePayloadSchema = z
  .object({
    // Existing v1 fields — kept for back-compat. New writes don't need
    // them; legacy reads continue to work.
    n: z.number().optional(),
    items: z.array(z.string()).optional(),
    // v2 fields.
    sources: z.array(SourceEntrySchema).max(MAX_SOURCES_PER_FACT).optional(),
    alternatives: z.array(AlternativeEntrySchema).max(MAX_ALTERNATIVES_PER_FACT).optional(),
    // When factKey === "other", this carries the LLM's free-text label
    // so we still know what concept the fact represents.
    otherLabel: z.string().max(64).optional(),
  })
  .nullable()
  .optional();
export type ValuePayload = z.infer<typeof ValuePayloadSchema>;

// ── Single extracted fact (per-page LLM output) ──────────────────────
//
// Subcategory is NOT in the LLM-facing schema — it's derived from
// (domain, factKey) on the server. This is what closes the
// "same fact, different subcategory" duplicate-row bug.
export const FactSchema = z.object({
  domain: z.enum(DOMAINS),
  factKey: z.string().min(1).max(64),
  factValue: z.string().min(1).max(2000),
  valueType: z.enum(VALUE_TYPES),
  valuePayload: ValuePayloadSchema,
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(200).default(""),
  sourceUrl: z.string().url().optional(),
});
export type Fact = z.infer<typeof FactSchema>;

export const FactsResponseSchema = z.object({
  facts: z.array(FactSchema),
});
export type FactsResponse = z.infer<typeof FactsResponseSchema>;

/** Validate that a fact's (domain, factKey) pair is in the controlled
 *  vocabulary. Returns true when allowed, false otherwise. Callers use
 *  this as a post-parse guard since the Zod schema deliberately keeps
 *  factKey as `string` (the per-domain enum constraint can't be
 *  expressed cleanly in Zod across all 8 domains without a heavy union;
 *  we enforce it imperatively after parsing). */
export function isAllowedFactKey(domain: Domain, factKey: string): boolean {
  const allowed = ALLOWED_KEYS[domain] as readonly string[] | undefined;
  if (!allowed) return false;
  return allowed.includes(factKey);
}

// ── JSON Schema generation (for OpenAI strict mode) ──────────────────
//
// OpenAI's `response_format: { type: "json_schema", strict: true }`
// will REJECT any model response that doesn't validate against the
// provided JSON Schema. Generated on demand so we don't pay for the
// shape twice (once in Zod, once in JSON).
//
// We model factKey as a single string `enum` containing every
// allowed key across all domains. The (domain, factKey) compatibility
// is enforced after parsing via `isAllowedFactKey`. Inlining a per-
// domain branched schema is brittle in strict mode (OpenAI rejects
// nested oneOf with discriminator).
export function buildFactsJsonSchema(): Record<string, unknown> {
  const allKeys = Array.from(new Set(DOMAINS.flatMap((d) => ALLOWED_KEYS[d] as readonly string[])));
  // OpenAI strict-mode rules we're encoding:
  //   - `additionalProperties: false` on every object
  //   - EVERY property of every object listed in `required` (no truly
  //     optional fields; nullability is expressed via `["T", "null"]`)
  //   - String/number constraints (`maxLength`, `minimum`, etc.) are
  //     fine but the field itself must still be required+nullable
  // The previous shape used `{anyOf:[{ type:"object", ...}, {type:"null"}]}`
  // for valuePayload — strict mode rejected the inner object because
  // its optional properties weren't all in `required`. Now we always
  // emit the full object with every field present-and-nullable.
  return {
    name: "facts_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["facts"],
      properties: {
        facts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "domain",
              "factKey",
              "factValue",
              "valueType",
              "valuePayload",
              "confidence",
              "sourceExcerpt",
              "sourceUrl",
            ],
            properties: {
              domain: { type: "string", enum: [...DOMAINS] },
              factKey: { type: "string", enum: allKeys },
              factValue: { type: "string" },
              valueType: { type: "string", enum: [...VALUE_TYPES] },
              valuePayload: {
                type: ["object", "null"],
                additionalProperties: false,
                required: ["n", "items", "otherLabel"],
                properties: {
                  n: { type: ["number", "null"] },
                  items: {
                    type: ["array", "null"],
                    items: { type: "string" },
                  },
                  otherLabel: { type: ["string", "null"] },
                },
              },
              confidence: { type: "number" },
              sourceExcerpt: { type: "string" },
              sourceUrl: { type: "string" },
            },
          },
        },
      },
    },
  };
}
