// Deterministic guard against a generated citation prompt naming the brand.
//
// The whole point of a citation run is to measure whether an AI assistant names
// the brand UNPROMPTED. If the question itself contains the brand's name, the
// answer is guaranteed to mention it and we score a fake citation. The prompt
// generators only *ask* the LLM not to do this - this is the enforcement.
//
// Key idea: reject any prompt that the citation matcher itself would flag. That
// makes prompt-filtering symmetric with citation-detection - a prompt passes
// iff running it cannot produce a name-based self-citation, by the exact same
// rules (including the ambiguity gate that stops common-word brands like
// "Stripe"/"Notion" from over-rejecting).

import { compileEntityPatterns, matchEntityCompiled } from "./brandMatcher";
import type { Brand } from "@shared/schema";

/**
 * Compile the brand's name surfaces once and return a predicate that answers
 * "does this text name the brand?". Reused across all prompts in a generation
 * batch so we only compile the regex set once.
 */
export function makeBrandNameFilter(brand: Brand): (text: string) => boolean {
  // Deliberately NOT including brand.products: real product arrays are polluted
  // with generic CATEGORY terms ("AR Glasses", "AI Glasses", "Accessories"),
  // which would reject legitimate category prompts and make regeneration
  // impossible for that category. Genuinely branded product forms (e.g.
  // "Beatbot Sora 10", "RayNeo X3 Pro") already contain the brand name or live
  // in nameVariations, so they're caught anyway. ponytail: if a truly-branded
  // product that doesn't contain the brand name ever needs catching, add it to
  // nameVariations, not a raw products dump.
  const variations = [brand.name, brand.companyName, ...(brand.nameVariations ?? [])].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );

  const compiled = compileEntityPatterns({
    id: brand.id,
    name: brand.companyName || brand.name,
    nameVariations: variations,
    website: brand.website,
  });

  return (text: string) => matchEntityCompiled(text, compiled).matched;
}
