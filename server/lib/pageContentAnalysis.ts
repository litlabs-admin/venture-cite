// Per-page CONTENT findings — pure, framework-free analysis of a single
// page's raw HTML. No LLM, no network, no DB. Reuses the same extractors
// the rest of the codebase already trusts instead of re-parsing HTML with
// a second, drift-prone regex set:
//   - extractStructuredData (title + whitelisted meta incl. og:/twitter:)
//   - detectHeadings (markdown + HTML headings)
//   - parseJsonLdFromHtml / collectSchemaNodes (JSON-LD @type extraction)
//   - stripToBodyText (tag-stripped visible text, for the text/HTML ratio)
//
// HONESTY: this module never claims content is "JavaScript-rendered" — a
// plain HTTP fetch sees pre-JS HTML, so `thinContent`/`lowTextRatio` can
// only say "little text in the raw HTML we fetched", not diagnose the
// cause. See docs/optimize-perception-reference.md for why a true
// client-render check would need a headless renderer this repo doesn't have.

import { extractStructuredData, stripToBodyText } from "./factAgent/v2/pageExtractors";
import { detectHeadings } from "./headingDetect";
import { parseJsonLdFromHtml } from "./jsonLdExtract";

export interface PageContentFlags {
  url: string;
  metaTitleMissing: boolean;
  metaTitleTooShort: boolean;
  metaTitleTooLong: boolean;
  metaDescriptionMissing: boolean;
  metaDescriptionTooShort: boolean;
  metaDescriptionTooLong: boolean;
  ogMissing: boolean;
  headingNoH1: boolean;
  headingMultipleH1: boolean;
  headingSkippedLevel: boolean;
  jsonLdAnswerFormatMissing: boolean;
  faqContentMissing: boolean;
  thinContent: boolean;
  lowTextRatio: boolean;
  hardToRead: boolean;
  fleschScore: number | null;
}

const ANSWER_FORMAT_TYPES = new Set(["FAQPage", "HowTo", "QAPage"]);

/** Extracts a single whitelisted meta value (e.g. "description", "og:title")
 *  from extractStructuredData's flattened "key: value" text lines — avoids
 *  re-running the meta regex a second time. */
function metaValue(structuredText: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "im");
  const m = re.exec(structuredText);
  return m ? m[1].trim() : null;
}

function titleValue(structuredText: string): string | null {
  const m = /^Title:\s*(.*)$/im.exec(structuredText);
  return m ? m[1].trim() : null;
}

/** Q&A pattern detection for faqContentMissing: <dt>/<dd> pairs, "Q:"/"A:"
 *  markers, or 2+ headings ending in "?". */
function hasVisibleFaqPattern(
  html: string,
  headings: Array<{ level: number; text: string }>,
): boolean {
  if (/<dt\b[^>]*>[\s\S]*?<\/dt>\s*<dd\b/i.test(html)) return true;
  if (/\bQ\s*[:.]\s*\S/.test(html) && /\bA\s*[:.]\s*\S/.test(html)) return true;
  const questionHeadings = headings.filter((h) => h.text.trim().endsWith("?"));
  return questionHeadings.length >= 2;
}

/** Flesch Reading Ease scorer, built from scratch (no lib in this repo).
 *  score = 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
 *  Exported separately so it can be unit-tested against known-easy /
 *  known-hard text independent of the HTML-flag plumbing. */
export function fleschReadingEase(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const words = trimmed.match(/[A-Za-z']+/g) ?? [];
  if (words.length === 0) return null;

  // Sentence count: split on ./!/? followed by whitespace or end-of-string.
  // At least 1 sentence even if there's no terminal punctuation.
  const sentenceMatches = trimmed.match(/[^.!?]+[.!?]+/g);
  const sentenceCount = sentenceMatches && sentenceMatches.length > 0 ? sentenceMatches.length : 1;

  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const wordsPerSentence = words.length / sentenceCount;
  const syllablesPerWord = syllableCount / words.length;

  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  if (!Number.isFinite(score)) return null;
  return Math.round(score * 10) / 10;
}

/** Heuristic syllable counter: counts vowel-group runs, drops a trailing
 *  silent "e", and floors at 1 syllable per word. Standard textbook
 *  approximation — not phonetically perfect, but consistent and cheap. */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  let count = 0;
  let prevWasVowel = false;
  for (let i = 0; i < w.length; i++) {
    const isVowel = "aeiouy".includes(w[i]);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }
  if (w.endsWith("e") && count > 1) count--;
  return Math.max(1, count);
}

export function analysePageHtml(html: string, url: string): PageContentFlags {
  const structured = extractStructuredData(html);
  const title = titleValue(structured.text);
  const description = metaValue(structured.text, "description");
  const ogTitle = metaValue(structured.text, "og:title");
  const ogImage = metaValue(structured.text, "og:image");

  const { headings } = detectHeadings(html);
  const h1s = headings.filter((h) => h.level === 1);
  const headingNoH1 = h1s.length === 0;
  const headingMultipleH1 = h1s.length > 1;
  const headingSkippedLevel = (() => {
    const sorted = [...headings].sort((a, b) => a.level - b.level);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].level - sorted[i - 1].level > 1) return true;
    }
    return false;
  })();

  const jsonLdNodes = parseJsonLdFromHtml(html);
  const jsonLdAnswerFormatMissing = ![...ANSWER_FORMAT_TYPES].some(
    (t) => (jsonLdNodes.get(t)?.length ?? 0) > 0,
  );

  const faqContentMissing = !hasVisibleFaqPattern(html, headings);

  const bodyText = stripToBodyText(html);
  const thinContent = bodyText.length < 300;
  const lowTextRatio = html.length > 0 && bodyText.length / html.length < 0.05;

  const fleschScore = fleschReadingEase(bodyText);
  const hardToRead = fleschScore !== null && fleschScore < 50;

  return {
    url,
    metaTitleMissing: !title,
    metaTitleTooShort: !!title && title.length < 15,
    metaTitleTooLong: !!title && title.length > 60,
    metaDescriptionMissing: !description,
    metaDescriptionTooShort: !!description && description.length < 50,
    metaDescriptionTooLong: !!description && description.length > 160,
    ogMissing: !ogTitle && !ogImage,
    headingNoH1,
    headingMultipleH1,
    headingSkippedLevel,
    jsonLdAnswerFormatMissing,
    faqContentMissing,
    thinContent,
    lowTextRatio,
    hardToRead,
    fleschScore,
  };
}
