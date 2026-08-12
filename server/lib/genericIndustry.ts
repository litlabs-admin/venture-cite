// A brand's `industry` string is not decoration - it is fed to the fact
// extractor as a hint, to competitor discovery as the market definition, and
// to the prompt generator as the category to write questions in. A top-level
// sector word ("Technology") tells all three nothing, and worse, anchors them:
// a brand selling enterprise AI voice agents that was labelled "Technology"
// got suppliers back as competitors and off-category prompts.
//
// This list is the gate. A generic label is never propagated as a hint, and
// the fact-sheet write-back is allowed to overwrite one (see
// factAgent/v2/brandProfileWriteback.ts) - unlike a specific label, which is
// treated as deliberate and left alone.
const GENERIC_INDUSTRIES = new Set([
  "general",
  "technology",
  "tech",
  "software",
  "saas",
  "ai",
  "artificial intelligence",
  "machine learning",
  "b2b",
  "b2c",
  "internet",
  "computer software",
  "information technology",
  "it",
  "business",
  "business services",
  "professional services",
  "consumer",
  "e-commerce",
  "ecommerce",
  "retail",
  "marketing",
  "media",
  "finance",
  "financial services",
  "fintech",
  "healthcare",
  "health",
  "education",
  "other",
  "unknown",
  "n/a",
  "none",
]);

export function isGenericIndustry(value: string | null | undefined): boolean {
  if (!value) return true;
  return GENERIC_INDUSTRIES.has(value.trim().toLowerCase());
}
