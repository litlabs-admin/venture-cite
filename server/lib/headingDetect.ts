// Heading detection - pulled out of server/lib/geoSignalsScoring.ts so it can
// be reused by server/lib/pageContentAnalysis.ts without pulling in that
// file's `openai` singleton import (geoSignalsScoring.ts -> routesShared.ts
// -> ownership.ts -> db.ts, which throws at import time when DATABASE_URL
// isn't set - exactly what a "pure, framework-free" analyser must avoid).
// geoSignalsScoring.ts re-exports this name for backwards compatibility;
// this file is the single source of truth.

export function detectHeadings(content: string): {
  count: number;
  hasHierarchy: boolean;
  headings: Array<{ level: number; text: string }>;
} {
  if (!content) return { count: 0, hasHierarchy: false, headings: [] };
  const headings: Array<{ level: number; text: string }> = [];

  const mdRe = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(content)) !== null) {
    headings.push({ level: m[1].length, text: m[2].trim() });
  }

  const htmlRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  while ((m = htmlRe.exec(content)) !== null) {
    const level = parseInt(m[1], 10);
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    headings.push({ level, text });
  }

  const levels = new Set(headings.map((h) => h.level));
  const hasHierarchy = levels.has(2) && levels.has(3);
  return { count: headings.length, hasHierarchy, headings };
}
