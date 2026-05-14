// Single canonical Zod schema for v2 fact extraction.
// Bump CURRENT_SCHEMA_VERSION when the shape changes meaningfully (added or
// renamed fields, changed types). The bump:
//   - busts the search-LLM cache (`...:v<N>`)
//   - tags new brand_fact_sheet rows with the new version
//   - surfaces a "needs review" badge in the UI for rows still on the old version
import { z } from "zod";

export const CURRENT_SCHEMA_VERSION = 1 as const;

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

export const FactSchema = z.object({
  domain: z.enum(DOMAINS),
  subcategory: z.string().min(1).max(64),
  factKey: z.string().min(1).max(64),
  factValue: z.string().min(1).max(2000),
  valueType: z.enum(VALUE_TYPES),
  valuePayload: z.record(z.unknown()).nullable().optional(),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().max(200).default(""),
  sourceUrl: z.string().url().optional(),
});
export type Fact = z.infer<typeof FactSchema>;

export const FactsResponseSchema = z.object({
  facts: z.array(FactSchema),
});
export type FactsResponse = z.infer<typeof FactsResponseSchema>;
