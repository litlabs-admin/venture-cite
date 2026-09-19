// firstRead.ts — the anonymous onboarding "first read" probe: a handful of
// real prompts run against a couple of engines, with brand/competitor
// mentions and cited sources parsed out of the raw answers. No judge LLM
// call (skipJudge: true) - this is a cheap, fast preview, not a full
// citation run. Spec: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
//
// Reuses:
//  - runPlatformCitationCheck (server/citationChecker.ts) for the actual
//    engine calls.
//  - detectBrandAndCompetitors / matchEntity (server/lib/brandMatcher.ts),
//    the same whole-word/possessive-tolerant matcher every other citation
//    surface in the app uses, instead of writing a second mention detector.
//  - classifySourceType (server/citationChecker.ts) for source kind.
import { runPlatformCitationCheck, classifySourceType } from "../citationChecker";
import { detectBrandAndCompetitors } from "../lib/brandMatcher";
import { PROBE_ENGINES, PROBE_PROMPT_COUNT } from "@shared/onboarding/session";
import type { Engine, ProbeResult, Source } from "@shared/onboarding/session";
import type { RunFirstRead } from "./contracts";

/**
 * Overall wall-clock budget for the whole probe batch. Every call starts in
 * parallel, so bounding each individual call at this value also bounds the
 * batch: nothing runs past ~25s from the start of runFirstRead.
 */
const PROBE_TIMEOUT_MS = 25_000;
const SNIPPET_LENGTH = 200;
const TOP_SOURCE_COUNT = 6;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("onboarding probe timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Gemini's grounding returns redirect URLs on this host instead of the page it
// read, so the host says nothing about where the answer came from.
const REDIRECT_HOSTS = new Set(["vertexaisearch.cloud.google.com"]);

/** Plain text for the snippet: engines answer in Markdown, the UI shows it as prose. */
export function toPlainSnippet(markdown: string, max: number): string {
  const plain = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/[*_`~]+/g, "") // emphasis, code, strike
    .replace(/^\s{0,3}(#{1,6}\s+|[-+*]\s+|\d+\.\s+|>\s?)/gm, "") // headings, list markers, quotes
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, max);
}

function registrableDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const runFirstRead: RunFirstRead = async ({ domain, profile, competitors, prompts }) => {
  const probePrompts = prompts.slice(0, PROBE_PROMPT_COUNT);
  const website = `https://${domain}`;
  const ownDomain = registrableDomain(website);

  type Attempt = { prompt: string; engine: Engine };
  const attempts: Attempt[] = [];
  for (const prompt of probePrompts) {
    for (const engine of PROBE_ENGINES) {
      attempts.push({ prompt, engine });
    }
  }

  const settled = await Promise.allSettled(
    attempts.map((attempt) =>
      withTimeout(
        runPlatformCitationCheck(
          attempt.engine,
          attempt.prompt,
          null,
          profile.name,
          [],
          website,
          undefined,
          { skipJudge: true },
        ),
        PROBE_TIMEOUT_MS,
      ),
    ),
  );

  const results: ProbeResult[] = [];
  const sourceCounts = new Map<string, { count: number; kindVotes: Map<string, number> }>();
  const promptsWithSuccess = new Set<string>();

  const competitorEntities = competitors.shown.map((c) => ({
    id: c.domain || c.name,
    name: c.name,
    domain: c.domain,
  }));

  for (let i = 0; i < attempts.length; i++) {
    const outcome = settled[i];
    const attempt = attempts[i];
    if (outcome.status !== "fulfilled") continue;
    const call = outcome.value;
    // citationChecker returns a soft failure (e.g. missing OPENROUTER_API_KEY,
    // unknown platform) as a normal resolved value with `error` set rather
    // than a throw. Treat it the same as a dropped/timed-out call.
    if (call.error) continue;

    const responseText = call.responseText ?? "";
    const detection = detectBrandAndCompetitors(
      responseText,
      { id: "brand", name: profile.name },
      competitorEntities,
    );

    // Order of first appearance across brand + competitors together. This is
    // the same "rank = first-appearance order" idiom the spec defines for
    // `mentioned`, applied to the brand's own rank too, since
    // runPlatformCitationCheck's own `rank` is always null under
    // skipJudge:true (the judge that would normally compute it never runs).
    const appearances: { key: "brand" | string; position: number }[] = [];
    if (detection.brand.matched) {
      appearances.push({ key: "brand", position: detection.brand.positions[0] });
    }
    for (const comp of detection.competitors) {
      if (comp.result.matched) {
        appearances.push({ key: comp.competitorId, position: comp.result.positions[0] });
      }
    }
    appearances.sort((a, b) => a.position - b.position);
    const rankOf = new Map(appearances.map((a, idx) => [a.key, idx + 1]));

    const mentioned = detection.competitors
      .filter((c) => c.result.matched)
      .map((c) => {
        const source = competitors.shown.find(
          (s) => s.name === c.competitorName || s.domain === c.competitorId,
        );
        return {
          name: c.competitorName,
          domain: source?.domain ?? null,
          rank: rankOf.get(c.competitorId) ?? appearances.length + 1,
        };
      })
      .sort((a, b) => a.rank - b.rank);

    results.push({
      prompt: attempt.prompt,
      engine: attempt.engine,
      brandCited: detection.brand.matched,
      brandRank: detection.brand.matched ? (rankOf.get("brand") ?? null) : null,
      mentioned,
      snippet: toPlainSnippet(responseText, SNIPPET_LENGTH),
    });
    promptsWithSuccess.add(attempt.prompt);

    for (const url of call.structuredCitations ?? []) {
      const host = registrableDomain(url);
      if (!host || host === ownDomain || REDIRECT_HOSTS.has(host)) continue;
      const kind = classifySourceType(url);
      const entry = sourceCounts.get(host) ?? { count: 0, kindVotes: new Map<string, number>() };
      entry.count += 1;
      entry.kindVotes.set(kind ?? "web", (entry.kindVotes.get(kind ?? "web") ?? 0) + 1);
      sourceCounts.set(host, entry);
    }
  }

  if (results.length === 0) {
    throw new Error("onboarding first-read probe: every engine call failed or timed out");
  }

  const KIND_MAP: Record<string, Source["kind"]> = {
    community: "social",
    reference: "editorial",
    video: "other",
    web: "other",
  };

  const sources: Source[] = Array.from(sourceCounts.entries())
    .map(([sourceDomain, { count, kindVotes }]) => {
      let bestKind = "web";
      let bestVotes = -1;
      for (const [kind, votes] of kindVotes) {
        if (votes > bestVotes) {
          bestKind = kind;
          bestVotes = votes;
        }
      }
      return { domain: sourceDomain, kind: KIND_MAP[bestKind] ?? "other", count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_SOURCE_COUNT);

  const probe = {
    results,
    promptsTested: promptsWithSuccess.size,
    brandAppearances: results.filter((r) => r.brandCited).length,
    competitorAppearances: results.filter((r) => r.mentioned.length > 0).length,
  };

  return { probe, sources };
};
