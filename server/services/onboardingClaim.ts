// Claims an anonymous onboarding session into a real brand.
//
// Spec: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md,
// sections "Sign-up and claim" and "Agency accounts".
//
// The session (server/onboardingSession/store.ts) never writes to `brands` -
// this module is the only place that turns its events + answers into a real
// brand, competitors, tracked prompts, and a first citation_runs/geo_rankings
// pair. It deliberately mirrors confirmOnboardingBrand
// (server/services/onboardingActivation.ts): the brand insert runs inside
// withBrandQuota exactly like confirm's does, and best-effort side work
// (competitors, prompts, citation rows, kicking off autopilot) runs after
// that transaction commits, exactly where confirm's does.
import { waitUntil } from "@vercel/functions";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { withBrandQuota, isUsageLimitError, type Tx } from "../lib/usageLimit";
import { resolveTier, users } from "@shared/schema";
import { onboardingSessions, type OnboardingSession } from "@shared/schema/onboarding";
import {
  PENDING_SESSION_KEY,
  type Competitor,
  type Profile,
  type ProbeResult,
  type SessionAnswers,
  type SessionEvent,
} from "@shared/onboarding/session";
import { TRACKED_PROMPTS_CAP } from "@shared/constants";
import { buildCitationContext } from "../lib/citationContextFormat";
import { runOnboardingAutopilot } from "../lib/onboardingAutopilot";
import { captureAndFlush } from "../lib/sentryReport";

export type ClaimOnboardingSessionResult =
  | { kind: "not_found" }
  | { kind: "quota_exceeded"; message: string }
  | { kind: "claimed"; brandId: string };

/** Thrown inside the withBrandQuota transaction to signal "another concurrent
 *  call already finished the claim" without letting withBrandQuota treat it
 *  as a real failure (it would otherwise roll back a successful insert). */
class AlreadyClaimedSignal {
  constructor(readonly brandId: string) {}
}

/** Thrown inside the transaction when the atomic claim guard finds the
 *  session already claimed by someone else, or gone. Mapped to not_found. */
class ClaimRaceLostSignal {}

type EventDataOf<T extends SessionEvent["type"]> = Extract<SessionEvent, { type: T }>["data"];

function latestEvent<T extends SessionEvent["type"]>(
  events: SessionEvent[],
  type: T,
): EventDataOf<T> | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === type) {
      return event.data as any;
    }
  }
  return undefined;
}

function mergedProfile(profile: Profile, answers: SessionAnswers | null): Profile {
  if (!answers?.profile) return profile;
  return { ...profile, ...answers.profile };
}

function chosenCompetitors(
  answers: SessionAnswers | null,
  shown: Competitor[] | undefined,
): Array<{ name: string; domain: string }> {
  if (answers?.competitors && answers.competitors.length > 0) {
    return answers.competitors.map((c) => ({ name: c.name, domain: c.domain }));
  }
  return (shown ?? []).map((c) => ({ name: c.name, domain: c.domain }));
}

export async function claimOnboardingSession(
  userId: string,
  sessionId: string,
): Promise<ClaimOnboardingSessionResult> {
  const [session] = await db
    .select()
    .from(onboardingSessions)
    .where(eq(onboardingSessions.id, sessionId))
    .limit(1);

  if (!session || session.expiresAt.getTime() < Date.now()) {
    return { kind: "not_found" };
  }

  // Already claimed. Only the claiming user may see the result - claimed by
  // someone else is indistinguishable from not-found (anti-enumeration).
  if (session.claimedBy) {
    if (session.claimedBy !== userId || !session.claimedBrandId) {
      return { kind: "not_found" };
    }
    return { kind: "claimed", brandId: session.claimedBrandId };
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return { kind: "not_found" };
  }

  // Ownership: only the account this session was minted for (via
  // /api/auth/register's onboardingSessionId, mirrored onto
  // users.onboarding_state) may claim it.
  const state = (user.onboardingState ?? {}) as Record<string, unknown>;
  if (state[PENDING_SESSION_KEY] !== sessionId) {
    return { kind: "not_found" };
  }

  const profile = latestEvent(session.events, "profile");
  if (!profile) {
    // Nothing was ever produced for this session - there is no brand to
    // build. Treat the same as not-found rather than inventing data.
    return { kind: "not_found" };
  }
  const competitorsEvent = latestEvent(session.events, "competitors");
  const topicsEvent = latestEvent(session.events, "topics");
  const probeEvent = latestEvent(session.events, "probe");

  const answers = session.answers ?? null;
  const finalProfile = mergedProfile(profile, answers);
  const relationship: "own" | "client" = answers?.audience === "client" ? "client" : "own";
  const tier = resolveTier(user);

  let brand;
  try {
    brand = await withBrandQuota(userId, tier, async (tx) => {
      // Atomic claim guard: only the first caller to reach this update wins.
      // A double-click / retry that races here finds 0 rows updated and
      // falls into the re-check branch below instead of creating a second
      // brand.
      const guardResult = await tx.execute(sql`
        update public.onboarding_sessions
        set claimed_by = ${userId}, claimed_at = now()
        where id = ${sessionId} and claimed_by is null and expires_at > now()
      `);
      const guardRowCount = (guardResult as { rowCount?: number }).rowCount ?? 0;
      if (guardRowCount === 0) {
        const [existing] = await tx
          .select({
            claimedBy: onboardingSessions.claimedBy,
            claimedBrandId: onboardingSessions.claimedBrandId,
          })
          .from(onboardingSessions)
          .where(eq(onboardingSessions.id, sessionId))
          .limit(1);
        if (existing?.claimedBy === userId && existing.claimedBrandId) {
          throw new AlreadyClaimedSignal(existing.claimedBrandId);
        }
        throw new ClaimRaceLostSignal();
      }

      const insertedBrand = await insertClaimedBrand(
        tx,
        userId,
        session,
        finalProfile,
        relationship,
      );

      await tx
        .update(onboardingSessions)
        .set({ claimedBrandId: insertedBrand.id })
        .where(eq(onboardingSessions.id, sessionId));

      if (relationship === "client" && answers?.agencyName) {
        await tx
          .update(users)
          .set({ accountKind: "agency", agencyName: answers.agencyName })
          .where(eq(users.id, userId));
      }

      return insertedBrand;
    });
  } catch (err) {
    if (err instanceof AlreadyClaimedSignal) {
      return { kind: "claimed", brandId: err.brandId };
    }
    if (err instanceof ClaimRaceLostSignal) {
      return { kind: "not_found" };
    }
    if (isUsageLimitError(err)) {
      return { kind: "quota_exceeded", message: err.message };
    }
    throw err;
  }

  // Best-effort side work, same posture as confirmOnboardingBrand: none of
  // this can undo the brand that already exists, so failures are logged and
  // swallowed rather than surfaced as a claim failure.
  const competitorList = chosenCompetitors(answers, competitorsEvent?.shown);
  for (const c of competitorList) {
    try {
      await storage.createCompetitor({
        brandId: brand.id,
        name: c.name.slice(0, 200),
        domain: c.domain.slice(0, 200),
        industry: brand.industry || null,
        description: null,
        discoveredBy: "manual",
      } as any);
    } catch (err) {
      logger.warn({ err, brandId: brand.id }, "onboarding claim: competitor insert failed");
    }
  }

  if (topicsEvent) {
    try {
      await persistTrackedPrompts(
        brand.id,
        topicsEvent.topics.flatMap((t) => t.prompts),
      );
    } catch (err) {
      logger.warn({ err, brandId: brand.id }, "onboarding claim: tracked prompt insert failed");
    }
  }

  if (probeEvent) {
    try {
      await persistProbeAsCitationRun(brand.id, probeEvent.results);
    } catch (err) {
      logger.warn({ err, brandId: brand.id }, "onboarding claim: probe citation insert failed");
    }
  }

  try {
    await db
      .update(users)
      .set({
        onboardingState: sql`(COALESCE(${users.onboardingState}, '{}'::jsonb) - ${PENDING_SESSION_KEY})`,
      })
      .where(eq(users.id, userId));
  } catch (err) {
    logger.warn({ err, userId }, "onboarding claim: failed to clear pending session id");
  }

  waitUntil(
    runOnboardingAutopilot(brand.id, userId, {
      deadlineMs: Date.now() + 50_000,
    }).catch((err) => {
      captureAndFlush(err, { tags: { source: "onboardingClaim.ts:claim-kickoff" } });
    }),
  );

  return { kind: "claimed", brandId: brand.id };
}

async function insertClaimedBrand(
  tx: Tx,
  userId: string,
  session: OnboardingSession,
  profile: Profile,
  relationship: "own" | "client",
) {
  const schema = await import("@shared/schema");
  const [row] = await tx
    .insert(schema.brands)
    .values({
      userId,
      name: profile.name,
      companyName: profile.name,
      industry: profile.industry || "General",
      description: profile.description || null,
      website: `https://${session.domain}`,
      tone: "professional",
      targetAudience: profile.audience || null,
      products: [],
      keyValues: [],
      uniqueSellingPoints: [],
      brandVoice: null,
      nameVariations: [],
      logoUrl: null,
      relationship,
      autopilotStatus: "pending",
      autopilotStep: 0,
    } as any)
    .returning();
  return row;
}

async function persistTrackedPrompts(brandId: string, prompts: string[]): Promise<void> {
  const toPersist = prompts.slice(0, TRACKED_PROMPTS_CAP);
  if (toPersist.length === 0) return;
  const generation = await storage.createPromptGeneration(brandId);
  for (let i = 0; i < toPersist.length; i += 1) {
    await storage.createBrandPrompt({
      brandId,
      generationId: generation.id,
      prompt: toPersist[i],
      rationale: null,
      orderIndex: i,
      isActive: 1,
      status: "tracked",
      category: null,
      funnelStage: null,
      region: "global",
    } as any);
  }
}

async function persistProbeAsCitationRun(brandId: string, results: ProbeResult[]): Promise<void> {
  if (results.length === 0) return;
  const totalCited = results.filter((r) => r.brandCited).length;
  const citationRate = results.length > 0 ? Math.round((totalCited / results.length) * 100) : 0;

  const citationRun = await storage.createCitationRun({
    brandId,
    triggeredBy: "onboarding_probe",
    totalChecks: results.length,
    totalCited,
    citationRate,
    status: "succeeded",
    progressPct: 100,
  } as any);

  for (const result of results) {
    try {
      await storage.createGeoRanking({
        articleId: null,
        brandId,
        brandPromptId: null,
        runId: citationRun.id,
        aiPlatform: result.engine,
        prompt: result.prompt,
        rank: result.brandRank,
        isCited: result.brandCited ? 1 : 0,
        citationContext: buildCitationContext(result.snippet, result.snippet),
        citingOutletUrl: null,
        citedUrls: null,
        sourceType: null,
        authorityScore: null,
        relevanceScore: null,
        sentiment: null,
        mentionedBrands: result.mentioned.map((m) => ({ name: m.name, cited: true, rank: m.rank })),
        checkedAt: new Date(),
      } as any);
    } catch (err) {
      logger.warn(
        { err, brandId, runId: citationRun.id },
        "onboarding claim: geo ranking insert failed",
      );
    }
  }
}
