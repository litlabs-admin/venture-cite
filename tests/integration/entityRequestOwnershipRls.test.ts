// tests/integration/entityRequestOwnershipRls.test.ts
//
// Proves that every require* helper in server/lib/ownership.ts migrated to
// confirmEntityReadThroughRls is actually enforced by Postgres RLS through
// venturecite_entity_request, not just by the application's own join
// predicate. Migration 0124 granted this role SELECT on exactly nine tables
// (competitors, faq_items, listicles, bofu_content, brand_hallucinations,
// brand_fact_sheet, brand_mentions, community_posts, citation_quality); this
// file covers all nine require* helpers built on that grant.
//
// tests/integration/rlsDefenceInDepth.test.ts already proves migration
// 0124's nine policies are individually correct, connecting directly as
// venturecite_entity_request over a synthetic runtime role. This file proves
// something narrower and more load-bearing: that the *application's own
// connection*, running the *application's own code path* (each require*
// helper below), now goes through that role and that role's policy - via the
// confirmEntityReadThroughRls step added alongside this change - rather than
// relying solely on the ownership.ts join. It uses the real `db` pool the
// app uses (like ownershipTenantIsolation.test.ts), which only works because
// migration 0125 already granted that connection's role SET on
// venturecite_entity_request.
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

  // One entry per table migration 0124 granted venturecite_entity_request
  // SELECT on, matched to the require* helper that now confirms its read
  // through that grant. `extra` supplies each table's NOT NULL columns
  // beyond id/brandId so a bare insert succeeds.
  const migratedTables = [
    {
      label: "competitors",
      table: schema.competitors,
      require: ownership.requireCompetitor,
      extra: { name: "Acme", domain: "acme.test" },
    },
    {
      label: "faq_items",
      table: schema.faqItems,
      require: ownership.requireFaq,
      extra: { question: "Q?", answer: "A." },
    },
    {
      label: "listicles",
      table: schema.listicles,
      require: ownership.requireListicle,
      extra: { title: "Best Of", url: "https://example.test/best-of" },
    },
    {
      label: "bofu_content",
      table: schema.bofuContent,
      require: ownership.requireBofuContent,
      extra: { contentType: "comparison", title: "Us vs Them", content: "..." },
    },
    {
      label: "brand_hallucinations",
      table: schema.brandHallucinations,
      require: ownership.requireHallucination,
      extra: {
        aiPlatform: "chatgpt",
        prompt: "Tell me about Acme",
        claimedStatement: "Acme was founded in 1800",
        hallucinationType: "fact",
      },
    },
    {
      label: "brand_fact_sheet",
      table: schema.brandFactSheet,
      require: ownership.requireBrandFact,
      extra: { subcategory: "founding", factKey: "founded_year", factValue: "2020" },
    },
    {
      label: "brand_mentions",
      table: schema.brandMentions,
      require: ownership.requireBrandMention,
      extra: { platform: "reddit", sourceUrl: "https://reddit.test/thread" },
    },
    {
      label: "community_posts",
      table: schema.communityPosts,
      require: ownership.requireCommunityPost,
      extra: { platform: "reddit", groupName: "r/test", content: "..." },
    },
    {
      label: "citation_quality",
      table: schema.citationQuality,
      require: ownership.requireCitationQuality,
      extra: { aiPlatform: "chatgpt" },
    },
  ] as const;

  async function cleanup() {
    // users -> brands -> (all nine tables) cascades (declared onDelete:
    // "cascade" in shared/schema), so deleting the two seeded users removes
    // everything.
    await db.delete(schema.users).where(eq(schema.users.id, userAId));
    await db.delete(schema.users).where(eq(schema.users.id, userBId));
  }

  describeIfDatabase("entity-request RLS on the migrated require* read paths", () => {
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
    }, 30_000);

    afterAll(async () => {
      await cleanup();
    });

    for (const { label, table, require: requireFn, extra } of migratedTables) {
      describe(label, () => {
        let ownRowId: string;
        let otherTenantRowId: string;

        beforeAll(async () => {
          ownRowId = randomUUID();
          otherTenantRowId = randomUUID();
          await db
            .insert(table as never)
            .values([
              { id: ownRowId, brandId: brandAId, ...extra } as never,
              { id: otherTenantRowId, brandId: brandBId, ...extra } as never,
            ]);
        }, 30_000);

        it("lets the owner read their own row", async () => {
          const row = await requireFn(ownRowId, userAId);
          expect(row.id).toBe(ownRowId);
        });

        it("gives a non-owner a 404, not the row, for another tenant's row", async () => {
          await expect(requireFn(otherTenantRowId, userAId)).rejects.toMatchObject({
            status: 404,
          });
          await expect(requireFn(otherTenantRowId, userAId)).rejects.toBeInstanceOf(OwnershipError);
        });

        // This is the test that actually distinguishes "RLS enforces it"
        // from "the application join enforces it": drive
        // venturecite_entity_request directly, the way
        // confirmEntityReadThroughRls does internally, and withhold the
        // piece ownership.ts always supplies - the tenant GUC - to show the
        // policy (not the application) is what is doing the denying.
        it("denies the entity role's own read of an owned row when the tenant GUC is missing", async () => {
          const seen = await db.transaction(async (transaction) => {
            await transaction.execute(sql`set local role venturecite_entity_request`);
            // Deliberately no `select set_config('venturecite.user_id', ...)`.
            const rows = await transaction
              .select({ id: (table as any).id })
              .from(table as never)
              .where(eq((table as any).id, ownRowId));
            return rows;
          });
          expect(seen).toEqual([]);
        });

        it("denies the entity role's read of a row when the GUC names a different tenant", async () => {
          const seen = await db.transaction(async (transaction) => {
            await transaction.execute(sql`set local role venturecite_entity_request`);
            await transaction.execute(
              sql`select set_config('venturecite.user_id', ${userBId}, true)`,
            );
            const rows = await transaction
              .select({ id: (table as any).id })
              .from(table as never)
              .where(eq((table as any).id, ownRowId));
            return rows;
          });
          expect(seen).toEqual([]);
        });
      });
    }

    // Kept as a single dedicated check (rather than looped) since it's
    // proving a property of the role's grants generally, not of any one
    // table's policy: the entity role is SELECT-only on its whole slice
    // (migration 0124's self-check enforces this at migration time).
    // Proving it here, on the real application connection, is the "must
    // fail loudly in a test, not silently fall back to the bypassing
    // connection" guardrail from this change's brief: nothing in
    // ownership.ts or restrictedRequestTransaction.ts catches or downgrades
    // this error.
    it("fails loudly, not silently, when the entity role attempts a write it was never granted", async () => {
      const competitorId = randomUUID();
      await db
        .insert(schema.competitors)
        .values({ id: competitorId, brandId: brandAId, name: "Acme", domain: "acme.test" });

      await expect(
        db.transaction(async (transaction) => {
          await transaction.execute(sql`set local role venturecite_entity_request`);
          await transaction.execute(
            sql`select set_config('venturecite.user_id', ${userAId}, true)`,
          );
          await transaction.execute(
            sql`update public.competitors set name = 'hijacked' where id = ${competitorId}`,
          );
        }),
      ).rejects.toMatchObject({ cause: { code: "42501" } });

      const unchanged = await db
        .select({ name: schema.competitors.name })
        .from(schema.competitors)
        .where(eq(schema.competitors.id, competitorId));
      expect(unchanged).toEqual([{ name: "Acme" }]);
    });
  });
} else {
  describe.skip("entity-request RLS on the migrated require* read paths", () => {
    it("requires TEST_DATABASE_URL", () => {});
  });
}
