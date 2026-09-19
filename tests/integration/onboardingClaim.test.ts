// Integration test: exercises claimOnboardingSession against a real Postgres.
//
// WHY THIS FILE EXISTS. tests/unit/onboardingClaim.test.ts mocks
// server/db, server/storage, and server/lib/usageLimit entirely, so it
// proves the call shape and the not-found/idempotency branching, but never
// sends real SQL: the atomic claim guard's WHERE clause, the brand quota's
// FOR UPDATE lock, and the FK relationships between onboarding_sessions,
// brands, competitors, brand_prompts, and geo_rankings are never evaluated
// against a real database. Only a real database can prove those hold.
//
// HOW TO RUN
//   npx supabase start
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
//   LOCAL_SUPABASE_TEST=1 npx vitest run tests/integration/onboardingClaim.test.ts
//
// Without TEST_DATABASE_URL the file skips, so CI and ordinary `npm test`
// runs are unaffected. Per CLAUDE.md standing rules, this file is written
// but deliberately NOT run here - the owner runs the database suite
// separately.
//
// ISOLATION CONTRACT. Every row this file creates carries FIXTURE_PREFIX in
// its primary key (or, for onboarding_sessions, is looked up by an id this
// file generated). Assertions scope to those ids and cleanup deletes only
// those ids, so the file is safe to run against a database that holds other
// data.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

// The claim kicks off runOnboardingAutopilot via waitUntil once it succeeds.
// That pipeline makes real LLM/HTTP calls - out of scope for this test, which
// only asserts on what claim itself writes. vi.mock is hoisted to the top of
// the file, so the stub must come from vi.hoisted, not a variable declared
// inside the `ready` branch below (that raised "autopilotStub is not defined").
const { autopilotStub } = vi.hoisted(() => ({
  autopilotStub: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../server/lib/onboardingAutopilot", () => ({
  runOnboardingAutopilot: autopilotStub,
}));
vi.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => {
    if (p && typeof (p as Promise<unknown>).then === "function") {
      (p as Promise<unknown>).catch(() => {});
    }
  },
}));

const databaseTest = configureDestructiveDatabaseTest(process.env);

if (databaseTest.kind === "ready") {
  const { db } = await import("../../server/db");
  const { users, brands, competitors, brandPrompts, promptGenerations, citationRuns, geoRankings } =
    await import("@shared/schema");
  const { onboardingSessions } = await import("@shared/schema/onboarding");
  const { claimOnboardingSession } = await import("../../server/services/onboardingClaim");
  const { eq } = await import("drizzle-orm");

  const FIXTURE_PREFIX = "f-onboarding-claim";
  const USER_ID = `${FIXTURE_PREFIX}-user`;
  const PENDING_SESSION_KEY = "pendingOnboardingSessionId";

  async function removeFixturesForBrand(brandId: string | null | undefined) {
    if (!brandId) return;
    await db.execute(sql`DELETE FROM geo_rankings WHERE brand_id = ${brandId}`);
    await db.execute(sql`DELETE FROM citation_runs WHERE brand_id = ${brandId}`);
    await db.execute(sql`DELETE FROM brand_prompts WHERE brand_id = ${brandId}`);
    await db.execute(sql`DELETE FROM prompt_generations WHERE brand_id = ${brandId}`);
    await db.execute(sql`DELETE FROM competitors WHERE brand_id = ${brandId}`);
    await db.execute(sql`DELETE FROM brands WHERE id = ${brandId}`);
  }

  async function removeUserFixture() {
    await db.execute(sql`DELETE FROM onboarding_sessions WHERE claimed_by = ${USER_ID}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${USER_ID}`);
  }

  async function createUserFixture(onboardingState: Record<string, unknown> = {}) {
    await db.execute(sql`
      INSERT INTO users (id, email, access_tier, onboarding_state)
      VALUES (${USER_ID}, ${`${FIXTURE_PREFIX}@example.com`}, 'free', ${JSON.stringify(onboardingState)}::jsonb)
    `);
  }

  function makeSessionEvents() {
    return [
      {
        type: "profile",
        data: {
          name: "Fixture Co",
          industry: "SaaS",
          descriptor: "SaaS for widgets",
          description: "We make widgets.",
          audience: "businesses",
        },
      },
      {
        type: "competitors",
        data: {
          shown: [{ name: "Fixture Rival", domain: "fixture-rival.example", faviconUrl: "" }],
          totalFound: 1,
        },
      },
      {
        type: "topics",
        data: { topics: [{ topic: "pricing", prompts: ["best widget tool for fixtures"] }] },
      },
      {
        type: "probe",
        data: {
          results: [
            {
              prompt: "best widget tool for fixtures",
              engine: "ChatGPT",
              brandCited: true,
              brandRank: 1,
              mentioned: [{ name: "Fixture Co", domain: null, rank: 1 }],
              snippet: "Fixture Co is a great widget tool.",
            },
          ],
          promptsTested: 1,
          brandAppearances: 1,
          competitorAppearances: 0,
        },
      },
    ];
  }

  async function createSessionFixture(
    overrides: {
      domain?: string;
      answers?: Record<string, unknown> | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO onboarding_sessions (id, domain, ip_hash, status, events, answers)
      VALUES (
        ${id},
        ${overrides.domain ?? "fixture.example"},
        'fixture-ip-hash',
        'done',
        ${JSON.stringify(makeSessionEvents())}::jsonb,
        ${overrides.answers === undefined ? null : JSON.stringify(overrides.answers)}::jsonb
      )
    `);
    return id;
  }

  describe("claimOnboardingSession (integration)", () => {
    let createdBrandIds: string[] = [];

    beforeEach(async () => {
      autopilotStub.mockClear();
      createdBrandIds = [];
    });

    afterAll(async () => {
      for (const brandId of createdBrandIds) {
        await removeFixturesForBrand(brandId);
      }
      await removeUserFixture();
    });

    it("creates a brand, competitors, tracked prompts, and one citation run with one geo ranking", async () => {
      await removeUserFixture();
      await createUserFixture();
      const sessionId = await createSessionFixture();
      await db.execute(sql`
        UPDATE users SET onboarding_state = ${JSON.stringify({
          [PENDING_SESSION_KEY]: sessionId,
        })}::jsonb
        WHERE id = ${USER_ID}
      `);

      const result = await claimOnboardingSession(USER_ID, sessionId);
      expect(result.kind).toBe("claimed");
      if (result.kind !== "claimed") return;
      createdBrandIds.push(result.brandId);

      const [brand] = await db.select().from(brands).where(eq(brands.id, result.brandId));
      expect(brand?.name).toBe("Fixture Co");
      expect(brand?.relationship).toBe("own");

      const brandCompetitors = await db
        .select()
        .from(competitors)
        .where(eq(competitors.brandId, result.brandId));
      expect(brandCompetitors).toHaveLength(1);
      expect(brandCompetitors[0]?.name).toBe("Fixture Rival");

      const prompts = await db
        .select()
        .from(brandPrompts)
        .where(eq(brandPrompts.brandId, result.brandId));
      expect(prompts).toHaveLength(1);
      expect(prompts[0]?.status).toBe("tracked");

      const runs = await db
        .select()
        .from(citationRuns)
        .where(eq(citationRuns.brandId, result.brandId));
      expect(runs).toHaveLength(1);

      const rankings = await db
        .select()
        .from(geoRankings)
        .where(eq(geoRankings.brandId, result.brandId));
      expect(rankings).toHaveLength(1);
      expect(rankings[0]?.aiPlatform).toBe("ChatGPT");
      expect(rankings[0]?.isCited).toBe(1);

      // Pending session id was cleared off the user.
      const [updatedUser] = await db.select().from(users).where(eq(users.id, USER_ID));
      expect(
        (updatedUser?.onboardingState as Record<string, unknown>)?.[PENDING_SESSION_KEY],
      ).toBeUndefined();

      expect(autopilotStub).toHaveBeenCalledWith(result.brandId, USER_ID, expect.any(Object));
    });

    it("is idempotent: a second claim of the same session returns the same brandId without a new brand", async () => {
      await removeUserFixture();
      await createUserFixture();
      const sessionId = await createSessionFixture();
      await db.execute(sql`
        UPDATE users SET onboarding_state = ${JSON.stringify({
          [PENDING_SESSION_KEY]: sessionId,
        })}::jsonb
        WHERE id = ${USER_ID}
      `);

      const first = await claimOnboardingSession(USER_ID, sessionId);
      expect(first.kind).toBe("claimed");
      if (first.kind !== "claimed") return;
      createdBrandIds.push(first.brandId);

      const second = await claimOnboardingSession(USER_ID, sessionId);
      expect(second).toEqual(first);

      const allBrandsForUser = await db.select().from(brands).where(eq(brands.userId, USER_ID));
      expect(allBrandsForUser).toHaveLength(1);
    });

    it("sets agency fields when the session answers audience=client", async () => {
      await removeUserFixture();
      await createUserFixture();
      const sessionId = await createSessionFixture({
        answers: { audience: "client", agencyName: "Fixture Agency" },
      });
      await db.execute(sql`
        UPDATE users SET onboarding_state = ${JSON.stringify({
          [PENDING_SESSION_KEY]: sessionId,
        })}::jsonb
        WHERE id = ${USER_ID}
      `);

      const result = await claimOnboardingSession(USER_ID, sessionId);
      expect(result.kind).toBe("claimed");
      if (result.kind !== "claimed") return;
      createdBrandIds.push(result.brandId);

      const [brand] = await db.select().from(brands).where(eq(brands.id, result.brandId));
      expect(brand?.relationship).toBe("client");

      const [updatedUser] = await db.select().from(users).where(eq(users.id, USER_ID));
      expect(updatedUser?.accountKind).toBe("agency");
      expect(updatedUser?.agencyName).toBe("Fixture Agency");
    });

    it("returns not_found for a session belonging to a different user", async () => {
      await removeUserFixture();
      await createUserFixture();
      const sessionId = await createSessionFixture();
      // Pending key never set to this session - simulates "not this user's session".
      const result = await claimOnboardingSession(USER_ID, sessionId);
      expect(result).toEqual({ kind: "not_found" });
    });

    it("returns not_found for an expired session", async () => {
      await removeUserFixture();
      await createUserFixture();
      const sessionId = await createSessionFixture();
      await db.execute(sql`
        UPDATE onboarding_sessions SET expires_at = now() - interval '1 hour' WHERE id = ${sessionId}
      `);
      await db.execute(sql`
        UPDATE users SET onboarding_state = ${JSON.stringify({
          [PENDING_SESSION_KEY]: sessionId,
        })}::jsonb
        WHERE id = ${USER_ID}
      `);

      const result = await claimOnboardingSession(USER_ID, sessionId);
      expect(result).toEqual({ kind: "not_found" });
    });

    it("returns quota_exceeded when the user is already at their brand cap", async () => {
      await removeUserFixture();
      await createUserFixture();
      // free tier allows 1 brand - fill the quota with an unrelated brand first.
      const quotaFillerId = `${FIXTURE_PREFIX}-filler-brand`;
      await db.execute(sql`
        INSERT INTO brands (id, user_id, name, company_name, industry)
        VALUES (${quotaFillerId}, ${USER_ID}, 'Filler', 'Filler Co', 'Testing')
      `);
      createdBrandIds.push(quotaFillerId);

      const sessionId = await createSessionFixture();
      await db.execute(sql`
        UPDATE users SET onboarding_state = ${JSON.stringify({
          [PENDING_SESSION_KEY]: sessionId,
        })}::jsonb
        WHERE id = ${USER_ID}
      `);

      const result = await claimOnboardingSession(USER_ID, sessionId);
      expect(result.kind).toBe("quota_exceeded");

      // The session must not have been marked claimed by a failed attempt.
      const [session] = await db
        .select()
        .from(onboardingSessions)
        .where(eq(onboardingSessions.id, sessionId));
      expect(session?.claimedBy).toBeNull();
    });
  });
} else {
  describe.skip("claimOnboardingSession (integration) - skipped, no TEST_DATABASE_URL", () => {
    it("skipped", () => {});
  });
}
