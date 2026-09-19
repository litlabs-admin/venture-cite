import type { Probe } from "@shared/onboarding/session";

/** "1 question", "3 questions". Counts on these screens can be 1 when an engine call fails. */
export function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export type ProbeTally = {
  /** Answers that actually came back. Not promptsTested x engines: a failed call is not an answer. */
  answers: number;
  /** Answers that named the brand. */
  brandNamed: number;
  /** Answers that named at least one competitor. */
  competitorAnswers: number;
  /** Per competitor name, the number of answers that named it. */
  byCompetitor: Map<string, number>;
};

/** Every count on the First read step comes from here, so no two places can disagree. */
export function tallyProbe(probe: Probe): ProbeTally {
  const byCompetitor = new Map<string, number>();
  let brandNamed = 0;
  let competitorAnswers = 0;
  for (const result of probe.results) {
    if (result.brandCited) brandNamed += 1;
    const names = new Set(result.mentioned.map((m) => m.name));
    if (names.size > 0) competitorAnswers += 1;
    for (const name of names) byCompetitor.set(name, (byCompetitor.get(name) ?? 0) + 1);
  }
  return { answers: probe.results.length, brandNamed, competitorAnswers, byCompetitor };
}

/** The line under the First read heading. States what was measured, nothing more. */
export function competitorSummary(tally: ProbeTally): string {
  if (tally.answers === 0)
    return "No engine returned an answer, so there is nothing to compare yet.";
  if (tally.competitorAnswers === 0) {
    return "Your competitors weren't named either, so nobody owns these answers yet.";
  }
  const top = [...tally.byCompetitor.entries()].sort((a, b) => b[1] - a[1])[0];
  return `Competitors were named in ${tally.competitorAnswers} of ${plural(tally.answers, "answer")}. ${top[0]} came up most, in ${top[1]}.`;
}
