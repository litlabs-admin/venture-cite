// pipeline.ts. runSessionPipeline(sessionId, domain) - wires the producers
// together in the order the spec's event table requires. Spec:
// docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
//
// A producer that throws becomes a `step_error` event instead of failing the
// whole run - the UI shows that section as unavailable, per
// shared/onboarding/session.ts's stepErrorSchema comment. The run only ends
// in `status: "failed"` when readSite or analyzeBrand fails, because nothing
// useful can be shown without a site or a profile: there is no probe without
// a profile, and readiness/insight both need the fetched page.
import { logger } from "../lib/logger";
import { appendEvent, setStatus } from "./store";
import { readSite } from "./site";
import { analyzeBrand, writeLoadingLines } from "./analyze";
import { readReadiness } from "./readiness";
import { runFirstRead } from "./firstRead";
import { buildInsight } from "./insight";
import { PROBE_PROMPT_COUNT } from "@shared/onboarding/session";
import type { SessionEvent, Profile, Readiness } from "@shared/onboarding/session";

type StepErrorStep = Extract<SessionEvent, { type: "step_error" }>["data"]["step"];

async function emit(sessionId: string, event: SessionEvent): Promise<void> {
  try {
    await appendEvent(sessionId, event);
  } catch (err) {
    logger.error({ err, sessionId, eventType: event.type }, "onboarding pipeline: emit failed");
  }
}

async function emitStepError(sessionId: string, step: StepErrorStep, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : "Step failed";
  logger.warn({ err, sessionId, step }, "onboarding pipeline: step failed");
  await emit(sessionId, { type: "step_error", data: { step, message: message.slice(0, 300) } });
}

export async function runSessionPipeline(sessionId: string, domain: string): Promise<void> {
  let site: Awaited<ReturnType<typeof readSite>>;
  try {
    site = await readSite(domain);
  } catch (err) {
    await emitStepError(sessionId, "site", err);
    await setStatus(sessionId, "failed");
    return;
  }
  await emit(sessionId, { type: "site", data: site.site });

  let profile: Profile | undefined;
  let readiness: Readiness | undefined;

  const loadingLinesPromise = writeLoadingLines({ domain, pageText: site.pageText })
    .then((lines) => emit(sessionId, { type: "loading_lines", data: { lines } }))
    .catch((err) => emitStepError(sessionId, "site", err));

  const analyzePromise = analyzeBrand({ domain, pageText: site.pageText })
    .then(async (result) => {
      profile = result.profile;
      await emit(sessionId, { type: "profile", data: result.profile });
      await emit(sessionId, { type: "competitors", data: result.competitors });
      await emit(sessionId, { type: "topics", data: { topics: result.topics } });
      return result;
    })
    .catch((err) => {
      // Nothing downstream (probe, insight) can run without a profile.
      throw err;
    });

  const readinessPromise = readReadiness({ domain, html: site.html })
    .then(async (result) => {
      readiness = result;
      await emit(sessionId, { type: "readiness", data: result });
    })
    .catch((err) => emitStepError(sessionId, "readiness", err));

  const analyzeResult = await analyzePromise.catch((err) => {
    emitStepError(sessionId, "profile", err);
    return null;
  });
  await Promise.all([loadingLinesPromise, readinessPromise]);

  if (!analyzeResult) {
    await setStatus(sessionId, "failed");
    return;
  }

  const firstReadPromise = (async () => {
    if (!profile) return;
    const prompts = analyzeResult.topics.flatMap((t) => t.prompts).slice(0, PROBE_PROMPT_COUNT);
    if (prompts.length === 0) return;
    try {
      const { probe, sources } = await runFirstRead({
        domain,
        profile,
        competitors: analyzeResult.competitors,
        prompts,
      });
      await emit(sessionId, { type: "probe", data: probe });
      await emit(sessionId, { type: "sources", data: { sources } });
    } catch (err) {
      await emitStepError(sessionId, "probe", err);
    }
  })();

  const insightPromise = (async () => {
    if (!profile || !readiness) return;
    try {
      const insight = await buildInsight({ domain, profile, readiness, pageText: site.pageText });
      await emit(sessionId, { type: "insight", data: insight });
    } catch (err) {
      await emitStepError(sessionId, "insight", err);
    }
  })();

  await Promise.all([firstReadPromise, insightPromise]);

  await emit(sessionId, { type: "done", data: {} });
  await setStatus(sessionId, "done");
}
