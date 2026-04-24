// Universal brand/competitor detection.
//
// Every surface that answers "is this entity mentioned in this text" goes
// through detectBrandAndCompetitors() — AI response citation checks, Reddit
// mention scanning, listicle analysis, Wikipedia scans, hallucination
// re-verification. One function, one set of rules.
//
// The matcher is deliberately simple: whole-word regex against a list of
// user-editable name variations, with a few corrections for real-world
// cases (possessives, diacritics, URL-boundary domains, ambiguous short
// names). Rank/relevance scoring stays in the LLM analyzer — this matcher
// only answers the yes/no presence question.
//
// See docs/superpowers/specs/2026-04-25-universal-citation-detection-design.md
// for design rationale and accuracy targets.

export type MatchResult = {
  matched: boolean;
  hitVariants: string[]; // which variant strings fired (for transparency)
  positions: number[]; // character offsets of first hit per variant
};

export type TrackedEntity = {
  id: string;
  name: string;
  nameVariations?: string[] | null;
  website?: string | null;
  domain?: string | null;
};

export type DetectionResult = {
  brand: MatchResult;
  competitors: Array<{
    competitorId: string;
    competitorName: string;
    result: MatchResult;
  }>;
};

// ─── Normalization helpers ────────────────────────────────────────────────

// Fold accents so "Nestlé" also matches "Nestle".
function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Strip legal suffixes so "Notion Labs, Inc." collapses to "Notion Labs".
const COMPANY_SUFFIX_RE =
  /\b(inc|inc\.|llc|ltd|ltd\.|co|co\.|corp|corporation|company|gmbh|s\.?a\.?|plc|pty|limited|holdings|group)\b/gi;

function stripLegalSuffixes(name: string): string {
  return name.replace(COMPANY_SUFFIX_RE, "").replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
}

// Extract a bare domain from a URL or host string. Returns lowercased form.
function extractDomain(websiteOrDomain: string): string | null {
  const raw = websiteOrDomain.trim().toLowerCase();
  if (!raw) return null;
  try {
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname;
    return host.replace(/^www\./, "") || null;
  } catch {
    // Not a valid URL — treat the raw string as a domain if it contains a dot
    if (raw.includes(".") && !/\s/.test(raw)) {
      return raw.replace(/^www\./, "");
    }
    return null;
  }
}

function isDomainLike(variant: string): boolean {
  return !/\s/.test(variant) && variant.includes(".");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Ambiguity gate ───────────────────────────────────────────────────────

// Variants here (or any ≤3-char variant) must appear near a signal word
// before we treat them as a hit. Keeps short/common-word brand names from
// false-positiving on every generic mention.
const AMBIGUOUS_WORDS = new Set([
  "apple",
  "target",
  "square",
  "stripe",
  "amazon",
  "meta",
  "twitter",
  "pinterest",
  "snap",
  "discord",
  "notion",
  "chrome",
  "mint",
  "slack",
  "dropbox",
  "oracle",
  "shell",
  "mars",
  "coach",
  "gap",
  "hermes",
  "shopify",
  "patch",
  "block",
  "ring",
  "nest",
  "echo",
  "basecamp",
  "venture",
  "match",
  "core",
  "pulse",
  "flow",
  "wave",
  "bolt",
  "spark",
  "launch",
]);

const SIGNAL_WORD_RE =
  /\b(platform|platforms|company|companies|app|apps|service|tool|tools|product|products|startup|startups|brand|brands|software|website|site|founder|founders|launched|acquired|acquisition|announced|subscribe|subscription|saas|ceo|cfo|coo|cto|headquartered|founded|developer|ipo|shares|stock|investors|labs|inc|corp|team)\b/i;

const SIGNAL_WINDOW = 60; // chars around the match to scan for a signal word

function isAmbiguous(variant: string): boolean {
  const norm = variant.toLowerCase().trim();
  if (norm.length <= 3) return true;
  return AMBIGUOUS_WORDS.has(norm);
}

// ─── Variant compilation ──────────────────────────────────────────────────

type CompiledVariant = {
  original: string; // as stored by the user (preserves casing)
  display: string; // lowercased + trimmed
  regex: RegExp;
  ambiguous: boolean;
  isDomain: boolean;
};

function compileNameVariant(variant: string): CompiledVariant | null {
  const display = variant.trim().toLowerCase();
  if (!display) return null;
  const folded = foldDiacritics(display);

  if (isDomainLike(folded)) {
    const escaped = escapeRegex(folded);
    // Domain match: must sit on URL-boundary characters on both sides so
    // notion.so matches inside docs.notion.so/abc but not inside anotion.so.store.
    // Allow `.` on the left boundary so a subdomain chain like
    // "docs.notion.so" still matches the variant "notion.so". The right
    // side intentionally excludes `.` so "anotion.so.store" doesn't match.
    const pattern = `(?:^|[\\s/:<>"'.])(?:www\\.)?${escaped}(?=[/\\s?#:<>"']|$)`;
    return {
      original: variant,
      display,
      regex: new RegExp(pattern, "gi"),
      ambiguous: false,
      isDomain: true,
    };
  }

  // Name variant — whole-word + possessive-tolerant. Internal whitespace
  // becomes \s+ so "Notion Labs" also matches "Notion  Labs" / "Notion\nLabs".
  const parts = folded.split(/\s+/).filter(Boolean).map(escapeRegex);
  if (parts.length === 0) return null;
  const body = parts.join("\\s+");
  const pattern = `\\b${body}(?:[''’]s)?\\b`;
  return {
    original: variant,
    display,
    regex: new RegExp(pattern, "gi"),
    ambiguous: isAmbiguous(display),
    isDomain: false,
  };
}

// Build the full variant set for an entity: user-supplied variations +
// the name itself + normalized name + diacritic-folded forms + domain.
function buildCompiledVariants(entity: TrackedEntity): CompiledVariant[] {
  const seen = new Set<string>();
  const compiled: CompiledVariant[] = [];

  const add = (v: string) => {
    const norm = v.trim().toLowerCase();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    const c = compileNameVariant(v);
    if (c) compiled.push(c);
  };

  // 1) Primary name + stripped/folded variants
  add(entity.name);
  const stripped = stripLegalSuffixes(entity.name);
  if (stripped && stripped.toLowerCase() !== entity.name.toLowerCase()) add(stripped);
  const foldedName = foldDiacritics(entity.name);
  if (foldedName.toLowerCase() !== entity.name.toLowerCase()) add(foldedName);

  // 2) User-supplied variations
  for (const v of entity.nameVariations ?? []) {
    if (typeof v === "string" && v.trim()) add(v);
  }

  // 3) Domain
  const domainSource = entity.domain ?? entity.website ?? null;
  if (domainSource) {
    const domain = extractDomain(domainSource);
    if (domain) add(domain);
  }

  return compiled;
}

// ─── Matching ─────────────────────────────────────────────────────────────

function hasSignalNearby(text: string, matchStart: number, matchEnd: number): boolean {
  const lo = Math.max(0, matchStart - SIGNAL_WINDOW);
  const hi = Math.min(text.length, matchEnd + SIGNAL_WINDOW);
  // Exclude the match itself from the window (the variant can't be its own signal).
  const before = text.slice(lo, matchStart);
  const after = text.slice(matchEnd, hi);
  return SIGNAL_WORD_RE.test(before) || SIGNAL_WORD_RE.test(after);
}

function runVariant(text: string, foldedText: string, v: CompiledVariant): number[] {
  const positions: number[] = [];
  // Reset regex state (all our patterns are /g).
  v.regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = v.regex.exec(foldedText)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (v.ambiguous && !hasSignalNearby(text, start, end)) {
      // No signal nearby — skip this hit. Move past it to avoid infinite loops
      // on zero-width matches.
      if (v.regex.lastIndex === start) v.regex.lastIndex = start + 1;
      continue;
    }
    positions.push(start);
    if (v.regex.lastIndex === start) v.regex.lastIndex = start + 1;
  }
  return positions;
}

// Public: compile once, match against text. Use when iterating many texts
// for the same entity (re-check loop).
export function matchEntityCompiled(text: string, compiled: CompiledVariant[]): MatchResult {
  if (!text || compiled.length === 0) {
    return { matched: false, hitVariants: [], positions: [] };
  }
  const foldedText = foldDiacritics(text);
  const hitVariants: string[] = [];
  const positions: number[] = [];
  for (const v of compiled) {
    const hits = runVariant(text, foldedText, v);
    if (hits.length > 0) {
      hitVariants.push(v.original);
      positions.push(hits[0]);
    }
  }
  return { matched: hitVariants.length > 0, hitVariants, positions };
}

// Convenience: one-off match for a single entity.
export function matchEntity(text: string, entity: TrackedEntity): MatchResult {
  const compiled = buildCompiledVariants(entity);
  return matchEntityCompiled(text, compiled);
}

// The main entry point. Detects the brand and every tracked competitor in
// one pass over `text`. Compile costs are paid once per entity per call.
export function detectBrandAndCompetitors(
  text: string,
  brand: TrackedEntity,
  competitors: TrackedEntity[],
): DetectionResult {
  const brandCompiled = buildCompiledVariants(brand);
  const brandResult = matchEntityCompiled(text, brandCompiled);

  const competitorResults = competitors.map((c) => {
    const compiled = buildCompiledVariants(c);
    const result = matchEntityCompiled(text, compiled);
    return { competitorId: c.id, competitorName: c.name, result };
  });

  return { brand: brandResult, competitors: competitorResults };
}

// Exported for tests/debug: lets a caller see the compiled patterns for
// an entity without running matching.
export function compileEntityPatterns(entity: TrackedEntity): CompiledVariant[] {
  return buildCompiledVariants(entity);
}

// Re-export helpers used by callers that want consistency with the matcher.
export { foldDiacritics, stripLegalSuffixes, extractDomain };
