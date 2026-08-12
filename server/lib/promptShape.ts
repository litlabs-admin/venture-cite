// Deterministic guard on the SHAPE of a generated citation prompt.
//
// Measured data (15 prompts x 6 AI platforms) shows the shape of the prompt
// decides whether the assistant answers with a NAMED VENDOR LIST (citable) or
// an essay about a concept (never citable - no vendors are named). A listicle
// trigger - lowercase, no question mark, opens with best/top/leading/compare,
// a broad plural category noun, then a use-case qualifier - reliably produced
// vendor lists. Narrow abstract qualifiers (security guardrails, compliance
// standards) made the model explain instead of list. This is the enforcement;
// the system prompt only *asks* for the shape.
//
// Decision on casing: competitor names legitimately carry capitals (e.g.
// "Cognigy vs Kore.ai"), so we NORMALISE to lowercase at persist time instead
// of rejecting on uppercase. `has_uppercase` is kept in the type for API
// completeness but is never returned by this function.

export type ShapeFailure =
  | "question_form"
  | "first_person"
  | "too_long"
  | "too_short"
  | "no_opener"
  | "no_category_noun"
  | "has_uppercase"
  | "abstract_qualifier";

const QUESTION_WORDS = new Set([
  "what",
  "how",
  "why",
  "which",
  "when",
  "where",
  "who",
  "is",
  "are",
  "do",
  "does",
  "should",
  "can",
  "will",
]);

const FIRST_PERSON_WORDS = new Set([
  "i",
  "me",
  "my",
  "mine",
  "our",
  "ours",
  "we",
  "us",
  "your",
  "you",
]);

// Longest-first so "best alternatives to" and "compare leading" are matched
// before their single-word prefixes ("best", "compare").
const OPENERS = [
  "best alternatives to",
  "top rated",
  "compare leading",
  "best",
  "top",
  "leading",
  "compare",
];

const CATEGORY_NOUNS = [
  "platforms",
  "tools",
  "software",
  "solutions",
  "agents",
  "vendors",
  "providers",
  "companies",
  "systems",
  "services",
  "apps",
  "suites",
  // "alternatives" is itself a vendor-list trigger - "best alternatives for
  // scaling it support with voice ai" needs no other category noun to make
  // the assistant answer with named products. Without this the rule rejects
  // a measured, working prompt.
  "alternatives",
];

const ABSTRACT_QUALIFIERS = [
  "security guardrails",
  "compliance standards",
  "data handling",
  "governance",
  "ethics",
  "privacy policy",
  "regulations",
];

// Strip everything except letters and digits, then lowercase. Used as the
// lookup key so "Kore.ai" and "kore ai" (model splits the dot into a space)
// both hash to "koreai".
function stripKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Undo the lowercase normalisation for proper nouns and the "24/7" numeral.
//
// The generator asks the model for all-lowercase prompts, then lowercases
// again at persist time. That destroys competitor names ("PolyAI" ->
// "polyai") and numeric expressions ("24/7" -> "24 7", since the model can
// only emit plain lowercase words). This restores the canonical written form
// after lowercasing, so the prompt sent to the AI platforms still reads like
// a real query.
//
// The model sometimes splits a proper noun across words ("Kore.ai" ->
// "kore ai"), so this checks candidate spans of 1, 2 and 3 consecutive words
// against the stripped-lowercase key before falling back to a shorter span.
export function restoreProperNouns(prompt: string, properNouns: string[]): string {
  const lookup = new Map<string, string>();
  for (const name of properNouns) {
    const key = stripKey(name);
    if (key) lookup.set(key, name);
  }
  // "24/7" is not a competitor name, but it is destroyed the same way
  // ("24/7" -> "24 7") and every brand can plausibly use it.
  lookup.set(stripKey("24/7"), "24/7");

  // Split into alternating word / separator tokens so the original spacing
  // is preserved exactly, and only the word tokens are ever replaced.
  const tokens = prompt.split(/(\s+)/);
  const wordIndexes: number[] = [];
  tokens.forEach((t, i) => {
    if (t.trim().length > 0) wordIndexes.push(i);
  });

  for (let start = 0; start < wordIndexes.length; start += 1) {
    let matched = false;
    for (let span = 3; span >= 1; span -= 1) {
      if (start + span > wordIndexes.length) continue;
      const idxs = wordIndexes.slice(start, start + span);
      const joined = idxs.map((i) => tokens[i]).join(" ");
      const key = stripKey(joined);
      const canonical = key ? lookup.get(key) : undefined;
      if (canonical) {
        // Replace the first matched token with the canonical spelling and
        // drop the rest of the span (plus its inter-word separators) so the
        // multi-word match collapses into one restored name.
        tokens[idxs[0]] = canonical;
        for (let j = 1; j < idxs.length; j += 1) {
          tokens[idxs[j]] = "";
          // Also remove the separator token between this word and the
          // previous one in the span.
          tokens[idxs[j] - 1] = "";
        }
        matched = true;
        start += span - 1;
        break;
      }
    }
    if (!matched) continue;
  }

  return tokens.join("");
}

export function checkPromptShape(prompt: string): ShapeFailure | null {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.includes("?")) return "question_form";

  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "too_short";

  if (QUESTION_WORDS.has(words[0])) return "question_form";

  if (words.some((w) => FIRST_PERSON_WORDS.has(w.replace(/[^a-z']/g, "")))) return "first_person";

  if (words.length < 5) return "too_short";
  if (words.length > 12) return "too_long";

  const startsWithOpener = OPENERS.some((o) => lower.startsWith(o + " "));
  if (!startsWithOpener) return "no_opener";

  const hasCategoryNoun = CATEGORY_NOUNS.some((n) => words.includes(n));
  if (!hasCategoryNoun) return "no_category_noun";

  const matchedQualifier = ABSTRACT_QUALIFIERS.find((q) => lower.includes(q));
  if (matchedQualifier) {
    const firstHalfWords = words.slice(0, Math.ceil(words.length / 2));
    const categoryInFirstHalf = CATEGORY_NOUNS.some((n) => firstHalfWords.includes(n));

    // A category noun early in the prompt only "binds" the qualifier if the
    // qualifier reads as a modifier of the category/market (e.g. "... tools
    // meeting strict enterprise compliance standards"). If the qualifier is
    // introduced as a bolted-on feature via "with"/"in" (e.g. "agents WITH
    // built IN security guardrails"), it is still a bare abstract concept
    // with nothing tying it to a product category - measured 0-yield example.
    const qualifierIndex = words.findIndex(
      (_, i) =>
        words.slice(i, i + matchedQualifier.split(" ").length).join(" ") === matchedQualifier,
    );
    const precedingWord = qualifierIndex > 0 ? words[qualifierIndex - 1] : "";
    const boltedOn = precedingWord === "with" || precedingWord === "in";

    if (!categoryInFirstHalf || boltedOn) return "abstract_qualifier";
  }

  return null;
}
