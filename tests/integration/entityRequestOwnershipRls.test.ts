// tests/integration/entityRequestOwnershipRls.test.ts
//
// Proves that requireCompetitor (server/lib/ownership.ts) - the one
// loadEntityThroughBrand read migrated in this change - is actually enforced
// by Postgres RLS through venturecite_entity_request, not just by the
// application's own join predicate.
//
// tests/integration/rlsDefenceInDepth.test.ts already proves migration
// 0124's nine policies are individually correct, connecting directly as
// venturecite_entity_request over a synthetic runtime role. This file proves
// something narrower and more load-bearing: that the *application's own
// connection*, running the *application's own code path*
// (ownership.requireCompetitor), now goes through that role and that role's
// policy - via the confirmEntityReadThroughRls step added alongside this
// change - rather than relying solely on the ownership.ts join. It uses the
// real `db` pool the app uses (like ownershipTenantIsolation.test.ts), which
// only works because migration 0125 already granted that connection's role
// SET on venturecite_entity_request.
//
// dotenv must load before the server/db import, same reason
// ownershipTenantIsolation.test.ts gives: DATABASE_URL must be set before the
// pool initializes. Global setup intentionally doesn't load dotenv.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfDatabase = databaseTest.kind === "ready" ? describe : describe.skip;

if (databaseTest.kind === "ready") {
  const { db } = await import("../../server/db");
  const ownership = await import("../../server/lib/ownership");
  const { OwnershipError } = ownership;

  const userAId = randomUUID();
  const userBId = randomUUID();
  const brandAId = randomUUID();
  const brandBId = randomUUID();
  const competitorAId = randomUUID();
  const competitorBId = randomUUID();

  async function cleanup() {
    // users -> brands -> competitors cascades (declared onDelete: "cascade"
    // in shared/schema), so deleting the two seeded users removes everything.
    await db.delete(schema.users).where(eq(schema.users.id, userAId));
    await db.delete(schema.users).where(eq(schema.users.id, userBId));
  }

  describeIfDatabase("entity-request RLS on the requireCompetitor read path", () => {
    beforeAll(async () => {
      await cleanup();
      await db.insert(schema.users).values([
        { id: userAId, email: `entity-owner-a-${userAId}@example.test`, onboardingState: {} },
        { id: userBId, email: `entity-owner-b-${userBId}@example.test`, onboardingState: {} },
      ] as never);
      await db.insert(schema.brands).values([
        {
          id: brandAId,
          userId: userAId,
          name: "Brand A",
          companyName: "Company A",
          industry: "Software",
        },
        {
          id: brandBId,
          userId: userBId,
          name: "Brand B",
          companyName: "Company B",
          industry: "Software",
        },
      ]);
      await db.insert(schema.competitors).values([
        { id: competitorAId, brandId: brandAId, name: "Acme", domain: "acme.test" },
        { id: competitorBId, brandId: brandBId, name: "Globex", domain: "globex.test" },
      ]);
    }, 30_000);

    afterAll(async () => {
      await cleanup();
    });

    it("lets the owner read their own competitor", async () => {
      const row = await ownership.requireCompetitor(competitorAId, userAId);
      expect(row.id).toBe(competitorAId);
    });

    it("gives a non-owner a 404, not the row, for another tenant's competitor", async () => {
      await expect(ownership.requireCompetitor(competitorBId, userAId)).rejects.toMatchObject({
        status: 404,
      });
      await expect(ownership.requireCompetitor(competitorBId, userAId)).rejects.toBeInstanceOf(
        OwnershipError,
      );
    });

    // This is the test that actually distinguishes "RLS enforces it" from
    // "the application join enforces it": drive venturecite_entity_request
    // directly, the way confirmEntityReadThroughRls does internally, and
    // withhold the piece ownership.ts always supplies - the tenant GUC - to
    // show the policy (not the application) is what is doing the denying.
    it("denies the entity role's own read of an owned row when the tenant GUC is missing", async () => {
      const seen = await db.transaction(async (transaction) => {
        await transaction.execute(sql`set local role venturecite_entity_request`);
        // Deliberately no `select set_config('venturecite.user_id', ...)`.
        const rows = await transaction
          .select({ id: schema.competitors.id })
          .from(schema.competitors)
          .where(eq(schema.competitors.id, competitorAId));
        return rows;
      });
      expect(seen).toEqual([]);
    });

    it("denies the entity role's read of a row when the GUC names a different tenant", async () => {
      const seen = await db.transaction(async (transaction) => {
        await transaction.execute(sql`set local role venturecite_entity_request`);
        await transaction.execute(sql`select set_config('venturecite.user_id', ${userBId}, true)`);
        const rows = await transaction
          .select({ id: schema.competitors.id })
          .from(schema.competitors)
          .where(eq(schema.competitors.id, competitorAId));
        return rows;
      });
      expect(seen).toEqual([]);
    });

    it("fails loudly, not silently, when the entity role attempts a write it was never granted", async () => {
      // The role is SELECT-only on its nine-table slice (migration 0124's
      // self-check enforces this at migration time). Proving it here, on
      // the real application connection, is the "must fail loudly in a
      // test, not silently fall back to the bypassing connection" guardrail
      // from this change's brief: nothing in ownership.ts or
      // restrictedRequestTransaction.ts catches or downgrades this error.
      await expect(
        db.transaction(async (transaction) => {
          await transaction.execute(sql`set local role venturecite_entity_request`);
          await transaction.execute(
            sql`select set_config('venturecite.user_id', ${userAId}, true)`,
          );
          await transaction.execute(
            sql`update public.competitors set name = 'hijacked' where id = ${competitorAId}`,
          );
        }),
      ).rejects.toMatchObject({ cause: { code: "42501" } });

      const unchanged = await db
        .select({ name: schema.competitors.name })
        .from(schema.competitors)
        .where(eq(schema.competitors.id, competitorAId));
      expect(unchanged).toEqual([{ name: "Acme" }]);
    });
  });
} else {
  describe.skip("entity-request RLS on the requireCompetitor read path", () => {
    it("requires TEST_DATABASE_URL", () => {});
  });
}
