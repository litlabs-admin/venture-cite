import { isFailedCheck } from "@shared/citationFailure";
import type { BrandPromptView, PromptAnswerView, PromptResultView } from "../data/promptResults";

// THE ONE RULE THIS FILE EXISTS TO ENFORCE.
//
// A failed provider call is NOT a model that declined to mention the brand.
// It is an ABSENT OBSERVATION. It is listed as its own row - hiding it would
// be its own lie, because the person would then see three answers where four
// checks ran - and it is excluded from every count this screen states.
//
// The database makes this easy to get wrong: a failed call is still a
// geo_rankings row with `is_cited = 0`, so any denominator that is
// `platforms.length` silently mixes "answered, brand absent" with "never
// answered". Across the real table that is 2,604 of 7,302 observations. Every
// denominator below is `successful.length`, and the phrase the screen prints
// says "successful answers" so the number cannot be misread later.

export type AnswerRow = {
  platform: string;
  /** True when the provider call never returned an answer. */
  failed: boolean;
  /** Meaningful only when `failed` is false. */
  isCited: boolean;
  snippet: string | null;
  checkedAt: string;
  citedUrls: string[];
};

export function toAnswerRows(result: PromptResultView | undefined): AnswerRow[] {
  if (!result) return [];
  return result.platforms
    .map((platform) => toAnswerRow(platform))
    .sort((a, b) => a.platform.localeCompare(b.platform));
}

function toAnswerRow(platform: PromptAnswerView): AnswerRow {
  const failed = isFailedCheck(platform.snippet);
  return {
    platform: platform.platform,
    failed,
    // Forced to false on a failed row rather than carried through. `is_cited`
    // is 0 on those rows anyway, but reading it would make this file look as
    // though the value meant something there.
    isCited: failed ? false : platform.isCited,
    snippet: platform.snippet,
    checkedAt: platform.checkedAt,
    citedUrls: platform.citedUrls ?? [],
  };
}

export function successfulAnswers(rows: readonly AnswerRow[]): AnswerRow[] {
  return rows.filter((row) => !row.failed);
}

export function failedAnswers(rows: readonly AnswerRow[]): AnswerRow[] {
  return rows.filter((row) => row.failed);
}

/**
 * What the screen is allowed to state about a question.
 *
 * `successful` is the ONLY denominator. `failed` is reported beside it as its
 * own figure, never folded into either side of the ratio.
 */
export type Observation = {
  observed: number;
  successful: number;
  failed: number;
  mentioned: number;
  absent: number;
};

export function observe(rows: readonly AnswerRow[]): Observation {
  const successful = successfulAnswers(rows);
  const mentioned = successful.filter((row) => row.isCited).length;
  return {
    observed: rows.length,
    successful: successful.length,
    failed: rows.length - successful.length,
    mentioned,
    absent: successful.length - mentioned,
  };
}

/** True when nothing usable was ever collected. Note that a question whose
 *  every call failed lands here too: checks ran, and not one of them produced
 *  an observation, so there is nothing to report about the answers. */
export function hasNoSuccessfulAnswer(observation: Observation): boolean {
  return observation.successful === 0;
}

/**
 * The sentence the board prints under "Observed".
 *
 * Always names the denominator in words. "3 of 4" on its own is the phrasing
 * that lets a reader assume 4 checks ran when 5 did.
 */
export function observationSentence(observation: Observation): string {
  const { absent, mentioned, successful } = observation;
  const noun = `successful answer${successful === 1 ? "" : "s"}`;
  if (absent === successful) return `Brand absent in all ${successful} ${noun}`;
  if (mentioned === successful) return `Brand mentioned in all ${successful} ${noun}`;
  return `Brand absent in ${absent} of ${successful} ${noun}`;
}

/** The excluded-failures line. Empty string when nothing failed, so the screen
 *  never prints a reassuring "0 failed" that implies failures were checked
 *  for on a run where none occurred. */
export function exclusionSentence(observation: Observation): string {
  if (observation.failed === 0) return "";
  const noun = observation.failed === 1 ? "attempt" : "attempts";
  return `${observation.failed} failed ${noun} excluded from this count`;
}

/**
 * "Approved buyer question · Comparison intent".
 *
 * The second half is dropped entirely when `category` is null. A prompt with
 * no recorded category has no intent, and printing a default would be an
 * invented classification of the user's own question.
 */
export function intentLine(prompt: BrandPromptView | undefined): string {
  const base = "Approved buyer question";
  const category = prompt?.category?.trim();
  if (!category) return base;
  return `${base} · ${category} intent`;
}

/**
 * Which question to open on.
 *
 * The one with a real diagnostic finding first (successful answers exist and
 * the brand is absent from at least one), then any with observations at all,
 * then the first tracked question. Never a question the screen cannot say
 * anything about while one it can is available.
 */
export function defaultPromptId(
  prompts: readonly BrandPromptView[],
  byPrompt: readonly PromptResultView[],
): string | undefined {
  const resultById = new Map(byPrompt.map((row) => [row.promptId, row]));
  const scored = prompts.map((prompt) => observe(toAnswerRows(resultById.get(prompt.id))));
  const absent = prompts.findIndex((_, i) => scored[i].successful > 0 && scored[i].absent > 0);
  if (absent !== -1) return prompts[absent].id;
  const measured = prompts.findIndex((_, i) => scored[i].successful > 0);
  if (measured !== -1) return prompts[measured].id;
  return prompts[0]?.id;
}

/** Every distinct URL a successful answer cited, most-cited first. Failed
 *  rows carry no URLs and are excluded here too. */
export function citedUrlsOf(rows: readonly AnswerRow[]): { url: string; platforms: string[] }[] {
  const byUrl = new Map<string, string[]>();
  for (const row of successfulAnswers(rows)) {
    for (const url of row.citedUrls) {
      const platforms = byUrl.get(url) ?? [];
      if (!platforms.includes(row.platform)) platforms.push(row.platform);
      byUrl.set(url, platforms);
    }
  }
  return Array.from(byUrl.entries())
    .map(([url, platforms]) => ({ url, platforms }))
    .sort((a, b) => b.platforms.length - a.platforms.length || a.url.localeCompare(b.url));
}

/** The path of a URL, for the board's `/services` rendering. Falls back to the
 *  whole string when it does not parse - never to an invented path. */
export function pathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * Was the brand's own site retrieved by the models that answered?
 *
 * Three outcomes, and the third is the one that matters: when NO successful
 * answer recorded any URL at all, retrieval was not measured. Rows written
 * before the run started recording cited URLs look exactly like rows where
 * nothing was retrieved, and calling that "your site was not retrieved" would
 * be a finding invented out of a missing column.
 */
export type Retrieval =
  | { kind: "not_measured" }
  | { kind: "retrieved"; count: number; successful: number }
  | { kind: "absent"; successful: number };

export function retrievalOf(rows: readonly AnswerRow[], brandDomain: string | null | undefined) {
  const successful = successfulAnswers(rows);
  const withUrls = successful.filter((row) => row.citedUrls.length > 0);
  if (withUrls.length === 0 || !brandDomain) return { kind: "not_measured" } as Retrieval;
  const domain = brandDomain.toLowerCase();
  const hits = withUrls.filter((row) =>
    row.citedUrls.some((url) => url.toLowerCase().includes(domain)),
  );
  if (hits.length === 0) return { kind: "absent", successful: successful.length } as Retrieval;
  return { kind: "retrieved", count: hits.length, successful: successful.length } as Retrieval;
}
