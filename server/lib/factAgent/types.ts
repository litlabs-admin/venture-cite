// Spec 2: shared types for the fact-extraction pipeline. Imported by every
// other module under server/lib/factAgent/.

import type { BrandFactScrapeRun, BrandFactScrapePage } from "@shared/schema";

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

// Per Spec 2 §4.4: valueType is a discriminated union of string | number | array.
export type ValueType = "string" | "number" | "array";

export interface ExtractedFact {
  domain: Domain;
  subcategory: string; // snake_case, LLM-picked
  factKey: string; // snake_case
  factValue: string; // display form
  valueType: ValueType;
  valuePayload: Record<string, unknown> | null; // {n} | {items} | {alternatives}
  confidence: number; // 0..1
  sourceExcerpt: string; // ≤200 chars
  sourceUrl: string;
}

export interface PlanUrl {
  url: string;
  priority: number; // 1..10, higher = scrape sooner
  expectedDomains: Domain[]; // hint for the executor
}

export interface ScrapePlan {
  urls: PlanUrl[]; // ≤12 entries (Spec 2 §4.9)
  expectedLanguages: string[]; // ISO 639-1 codes
  notes: string;
}

export type PageErrorKind =
  | "fetch_failed"
  | "blocked"
  | "spa_empty"
  | "robots_disallowed"
  | "skipped_lang"
  | "llm_unavailable"
  | "validation_failed"
  | "all_pages_4xx"
  | "cost_cap_reached"
  | "timeout";

export interface PageOutcome {
  status: BrandFactScrapePage["status"];
  errorKind: PageErrorKind | null;
  errorMessage: string | null;
  facts: ExtractedFact[];
  bytes: number;
  statusCode: number | null;
  lang: string | null;
  llmCostCents: number;
  llmInputTokens: number;
  llmOutputTokens: number;
}

// Re-exported for the orchestrator's signature.
export type { BrandFactScrapeRun, BrandFactScrapePage };
