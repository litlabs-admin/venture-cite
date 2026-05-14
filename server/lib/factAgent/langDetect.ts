// Spec 2 §4.2 Phase 2 step 4: cheap language detection. Two paths:
//   1. <html lang="..."> attribute — authoritative, return the 2-letter
//      language portion (drops region: en-US -> en).
//   2. Unicode-script heuristic on first 1000 chars of stripped text —
//      picks the dominant script and maps it to a representative language.
//
// We don't ship a real language detector (CLD / franc) because the only
// downstream use is "is this page in one of plan.expectedLanguages". A
// false positive on cross-script pages (German with Cyrillic loanwords)
// is harmless — the page still extracts.

export function detectLanguage(html: string): string {
  const attr = /<html[^>]*\blang\s*=\s*["']?([A-Za-z-]{2,})/i.exec(html);
  if (attr && attr[1]) {
    return attr[1].toLowerCase().split("-")[0];
  }
  const text = stripToText(html).slice(0, 1000);
  if (!text.trim()) return "und";
  return scriptHeuristic(text);
}

function stripToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scriptHeuristic(s: string): string {
  let han = 0,
    hira = 0,
    kata = 0,
    hangul = 0,
    cyr = 0,
    ar = 0,
    heb = 0,
    latin = 0,
    total = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80 && /[A-Za-z]/.test(ch)) {
      latin++;
      total++;
      continue;
    }
    if (code >= 0x4e00 && code <= 0x9fff) {
      han++;
      total++;
      continue;
    }
    if (code >= 0x3040 && code <= 0x309f) {
      hira++;
      total++;
      continue;
    }
    if (code >= 0x30a0 && code <= 0x30ff) {
      kata++;
      total++;
      continue;
    }
    if (code >= 0xac00 && code <= 0xd7af) {
      hangul++;
      total++;
      continue;
    }
    if (code >= 0x0400 && code <= 0x04ff) {
      cyr++;
      total++;
      continue;
    }
    if (code >= 0x0600 && code <= 0x06ff) {
      ar++;
      total++;
      continue;
    }
    if (code >= 0x0590 && code <= 0x05ff) {
      heb++;
      total++;
      continue;
    }
  }
  if (total === 0) return "und";
  const buckets: Array<[string, number]> = [
    ["latin", latin],
    ["han", han],
    ["hira+kata", hira + kata],
    ["hangul", hangul],
    ["cyrillic", cyr],
    ["arabic", ar],
    ["hebrew", heb],
  ];
  buckets.sort((a, b) => b[1] - a[1]);
  const [winner, count] = buckets[0];
  if (count / total < 0.4) return "und";
  switch (winner) {
    case "latin":
      return "en";
    case "han":
      return "zh";
    case "hira+kata":
      return "ja";
    case "hangul":
      return "ko";
    case "cyrillic":
      return "ru";
    case "arabic":
      return "ar";
    case "hebrew":
      return "he";
    default:
      return "und";
  }
}
