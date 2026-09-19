// Function signatures for the onboarding-session producers. Each producer is a
// separate module so they can be built and tested apart; pipeline.ts wires
// them together. Spec: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
//
// Rules every producer follows:
// - Return data that passes its schema in shared/onboarding/session.ts, or throw.
//   Never return an invented or placeholder value. pipeline.ts turns a throw
//   into a `step_error` event.
// - Take no user id and write nothing to the database. Only store.ts writes.
// - Fetch the network through server/lib/ssrf.ts only.
import type {
  Competitors,
  Insight,
  Probe,
  Profile,
  Readiness,
  Site,
  Source,
  Topic,
} from "@shared/onboarding/session";

/** site.ts. Fetches the homepage once; later producers reuse the text. */
export type ReadSite = (domain: string) => Promise<{
  site: Site;
  /** Visible text plus head metadata, capped (see server/lib/pageText.ts). */
  pageText: string;
  /** Raw homepage HTML, for JSON-LD extraction. */
  html: string;
}>;

/** analyze.ts. One cheap LLM call, run in parallel with analyzeBrand. Exactly 4 lines. */
export type WriteLoadingLines = (input: { domain: string; pageText: string }) => Promise<string[]>;

/** analyze.ts. One LLM call returning profile, competitors and topics together. */
export type AnalyzeBrand = (input: { domain: string; pageText: string }) => Promise<{
  profile: Profile;
  competitors: Competitors;
  /** 5 topics, 24 prompts in total, in the listicle shape promptGenerator.ts enforces. */
  topics: Topic[];
}>;

/** readiness.ts. robots.txt per crawler, llms.txt, sitemap, JSON-LD @type values. No LLM. */
export type ReadReadiness = (input: { domain: string; html: string }) => Promise<Readiness>;

/**
 * firstRead.ts. PROBE_PROMPT_COUNT prompts on each of PROBE_ENGINES, via
 * runPlatformCitationCheck. Brand and competitor mentions come from the answer
 * text; sources come from the answers' cited URLs.
 */
export type RunFirstRead = (input: {
  domain: string;
  profile: Profile;
  competitors: Competitors;
  prompts: string[];
}) => Promise<{ probe: Probe; sources: Source[] }>;

/** insight.ts. One LLM call. Quotes the page only if the quote is in pageText verbatim. */
export type BuildInsight = (input: {
  domain: string;
  profile: Profile;
  readiness: Readiness;
  pageText: string;
}) => Promise<Insight>;
