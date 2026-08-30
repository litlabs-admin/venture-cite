// tests/integration/ownershipTenantIsolation.test.ts
// dotenv must load BEFORE the server/db import so DATABASE_URL is set when
// the pool initializes. Global setup intentionally doesn't load dotenv -
// see tests/setup.ts.
//
// Closes the gap in .audit/B6/B6b-01-mutation-auth-ownership.md: every
// existing test that touches server/lib/ownership.ts replaces it with a
// vi.mock, so the real database-querying code - where the tenant-isolation
// decision actually happens - has never been executed by any test in the
// repository. Nothing here mocks ownership.ts. Every helper below runs its
// real query against a real database, seeded with two real users and two
// real brands.
//
// Design note on "assert the status code": sendOwnershipError() in
// server/lib/ownership.ts does `res.status(err.status).json(...)` -  it
// forwards OwnershipError.status to the HTTP layer verbatim, with no
// translation in between. Asserting `err.status` here is therefore
// equivalent to asserting the HTTP status a route would send, without
// standing up the ~10 different Express route modules that call these
// helpers (articles.ts, contentTypes.ts, intelligence.ts, publications.ts,
// assistant.ts, mentions routes, ...) just to observe the same number.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
  const deletedBrandId = randomUUID();

  // One row per entity type, all owned by brand A / user A unless noted.
  // Populated in beforeAll, read by every test below.
  const ids: Record<string, string> = {};

  async function cleanup() {
    // users -> brands -> every brand-owned table cascades (all declared
    // `onDelete: "cascade"` in shared/schema/*.ts); users -> chatbot_threads
    // / citations cascades directly. Deleting the two seeded users is
    // therefore sufficient to remove everything this file inserts.
    await db.delete(schema.users).where(eq(schema.users.id, userAId));
    await db.delete(schema.users).where(eq(schema.users.id, userBId));
  }

  beforeAll(async () => {
    await cleanup();

    await db.insert(schema.users).values([
      { id: userAId, email: `owner-a-${userAId}@example.test`, onboardingState: {} },
      { id: userBId, email: `owner-b-${userBId}@example.test`, onboardingState: {} },
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
      {
        id: deletedBrandId,
        userId: userAId,
        name: "Deleted brand",
        companyName: "Deleted company",
        industry: "Software",
      },
    ] as never);
    await db
      .update(schema.brands)
      .set({ deletedAt: new Date() })
      .where(eq(schema.brands.id, deletedBrandId));

    const [article] = await db
      .insert(schema.articles)
      .values({ brandId: brandAId, title: "Owned article" } as never)
      .returning();
    ids.article = article.id;

    const [competitor] = await db
      .insert(schema.competitors)
      .values({
        brandId: brandAId,
        name: "Owned competitor",
        domain: "owned-competitor.test",
      } as never)
      .returning();
    ids.competitor = competitor.id;

    const [deletedCompetitor] = await db
      .insert(schema.competitors)
      .values({
        brandId: brandAId,
        name: "Deleted competitor",
        domain: "deleted-competitor.test",
      } as never)
      .returning();
    await db
      .update(schema.competitors)
      .set({ deletedAt: new Date() })
      .where(eq(schema.competitors.id, deletedCompetitor.id));
    ids.deletedCompetitor = deletedCompetitor.id;

    const [faq] = await db
      .insert(schema.faqItems)
      .values({ brandId: brandAId, question: "What is this?", answer: "This is a FAQ." } as never)
      .returning();
    ids.faq = faq.id;

    const [listicle] = await db
      .insert(schema.listicles)
      .values({
        brandId: brandAId,
        title: "Best of list",
        url: "https://example.test/list",
      } as never)
      .returning();
    ids.listicle = listicle.id;

    const [bofu] = await db
      .insert(schema.bofuContent)
      .values({
        brandId: brandAId,
        contentType: "comparison",
        title: "Us vs them",
        content: "BOFU content body",
      } as never)
      .returning();
    ids.bofu = bofu.id;

    const [hallucination] = await db
      .insert(schema.brandHallucinations)
      .values({
        brandId: brandAId,
        aiPlatform: "chatgpt",
        prompt: "What does Brand A do?",
        claimedStatement: "Brand A invented the wheel.",
        hallucinationType: "factual",
      } as never)
      .returning();
    ids.hallucination = hallucination.id;

    const [brandFact] = await db
      .insert(schema.brandFactSheet)
      .values({
        brandId: brandAId,
        subcategory: "products",
        factKey: "flagship_product",
        factValue: "Widget",
      } as never)
      .returning();
    ids.brandFact = brandFact.id;

    const [mention] = await db
      .insert(schema.brandMentions)
      .values({
        brandId: brandAId,
        platform: "reddit",
        sourceUrl: "https://reddit.test/post",
      } as never)
      .returning();
    ids.mention = mention.id;

    const [communityPost] = await db
      .insert(schema.communityPosts)
      .values({
        brandId: brandAId,
        platform: "reddit",
        groupName: "r/test",
        content: "Community post body",
      } as never)
      .returning();
    ids.communityPost = communityPost.id;

    const [citationQualityRow] = await db
      .insert(schema.citationQuality)
      .values({ brandId: brandAId, aiPlatform: "chatgpt" } as never)
      .returning();
    ids.citationQuality = citationQualityRow.id;

    const [keywordResearchRow] = await db
      .insert(schema.keywordResearch)
      .values({ brandId: brandAId, keyword: "best widget" } as never)
      .returning();
    ids.keywordResearch = keywordResearchRow.id;

    const [thread] = await db
      .insert(schema.chatbotThreads)
      .values({ userId: userAId, brandId: brandAId, title: "Thread A" } as never)
      .returning();
    ids.chatbotThread = thread.id;

    const [citation] = await db
      .insert(schema.citations)
      .values({ userId: userAId, source: "manual", url: "https://example.test" } as never)
      .returning();
    ids.citation = citation.id;

    const [citationRun] = await db
      .insert(schema.citationRuns)
      .values({ brandId: brandAId } as never)
      .returning();
    ids.citationRun = citationRun.id;
  }, 60_000);

  afterAll(cleanup);

  // ---------------------------------------------------------------------
  // Shared assertion for every `require*` cross-tenant case: reject with
  // OwnershipError(404) - never 403 (AGENTS.md: "Return 404 for an
  // ownership miss") - and the thrown error must carry nothing but
  // `status`: no row id, brandId, title, or other field may leak through
  // it. `message` is checked separately via the class's own accessor
  // (Error defines `message` as non-enumerable, so it never shows up in
  // Object.keys - this assertion is a real check on what a route would be
  // able to read off the error, not a tautology).
  // ---------------------------------------------------------------------
  async function expectOwnershipMiss(promise: Promise<unknown>, expectedMessage: string) {
    const err = await promise.then(
      () => {
        throw new Error("expected the promise to reject with OwnershipError");
      },
      (rejection) => rejection,
    );
    expect(err).toBeInstanceOf(OwnershipError);
    const ownershipErr = err as InstanceType<typeof OwnershipError>;
    expect(ownershipErr.status).toBe(404);
    expect(ownershipErr.status).not.toBe(403);
    expect(ownershipErr.message).toBe(expectedMessage);
    expect(Object.keys(ownershipErr)).toEqual(["status"]);
  }

  describeIfDatabase("server/lib/ownership.ts - real database, no mocks", () => {
    // -----------------------------------------------------------------
    // requirement 1 + 2 + 3: every one of the 11 entity types backed by
    // the shared `loadEntityThroughBrand` choke point, enumerated (not
    // sampled) - matches the list in
    // .audit/B6/B6b-01-mutation-auth-ownership.md section 1d.
    // -----------------------------------------------------------------
    const brandBackedEntities: Array<{
      label: string;
      require: (id: string, userId: string) => Promise<{ id: string; brandId: string }>;
      idKey: string;
      notFoundLabel: string;
    }> = [
      {
        label: "requireArticle / articles",
        require: ownership.requireArticle,
        idKey: "article",
        notFoundLabel: "Article not found",
      },
      {
        label: "requireCompetitor / competitors",
        require: ownership.requireCompetitor,
        idKey: "competitor",
        notFoundLabel: "Competitor not found",
      },
      {
        label: "requireFaq / faq_items",
        require: ownership.requireFaq,
        idKey: "faq",
        notFoundLabel: "FAQ not found",
      },
      {
        label: "requireListicle / listicles",
        require: ownership.requireListicle,
        idKey: "listicle",
        notFoundLabel: "Listicle not found",
      },
      {
        label: "requireBofuContent / bofu_content",
        require: ownership.requireBofuContent,
        idKey: "bofu",
        notFoundLabel: "BOFU content not found",
      },
      {
        label: "requireHallucination / brand_hallucinations",
        require: ownership.requireHallucination,
        idKey: "hallucination",
        notFoundLabel: "Hallucination not found",
      },
      {
        label: "requireBrandFact / brand_fact_sheet",
        require: ownership.requireBrandFact,
        idKey: "brandFact",
        notFoundLabel: "Brand fact not found",
      },
      {
        label: "requireBrandMention / brand_mentions",
        require: ownership.requireBrandMention,
        idKey: "mention",
        notFoundLabel: "Brand mention not found",
      },
      {
        label: "requireCommunityPost / community_posts",
        require: ownership.requireCommunityPost,
        idKey: "communityPost",
        notFoundLabel: "Community post not found",
      },
      {
        label: "requireCitationQuality / citation_quality",
        require: ownership.requireCitationQuality,
        idKey: "citationQuality",
        notFoundLabel: "Citation quality entry not found",
      },
      {
        label: "requireKeywordResearch / keyword_research",
        require: ownership.requireKeywordResearch,
        idKey: "keywordResearch",
        notFoundLabel: "Keyword research not found",
      },
    ];

    expect(brandBackedEntities).toHaveLength(11);

    describe.each(brandBackedEntities)(
      "$label",
      ({ require, idKey, notFoundLabel }: (typeof brandBackedEntities)[number]) => {
        it("returns the row for its owner", async () => {
          const row = await require(ids[idKey], userAId);
          expect(row.id).toBe(ids[idKey]);
          expect(row.brandId).toBe(brandAId);
        });

        it("rejects a non-owner with 404 (not 403) and leaks no row", async () => {
          await expectOwnershipMiss(require(ids[idKey], userBId), notFoundLabel);
        });
      },
    );

    // -----------------------------------------------------------------
    // requirement 1 + 2: the direct (non-loadEntityThroughBrand) helpers.
    // -----------------------------------------------------------------
    describe("requireBrand", () => {
      it("returns the row for its owner", async () => {
        const brand = await ownership.requireBrand(brandAId, userAId);
        expect(brand.id).toBe(brandAId);
      });

      it("rejects a non-owner with 404 (not 403) and leaks no row", async () => {
        await expectOwnershipMiss(ownership.requireBrand(brandAId, userBId), "Brand not found");
      });
    });

    describe("requireChatbotThread", () => {
      it("returns the row for its owner", async () => {
        const thread = await ownership.requireChatbotThread(ids.chatbotThread, userAId);
        expect(thread.id).toBe(ids.chatbotThread);
      });

      it("rejects a non-owner with 404 (not 403) and leaks no row", async () => {
        await expectOwnershipMiss(
          ownership.requireChatbotThread(ids.chatbotThread, userBId),
          "Conversation not found",
        );
      });
    });

    describe("requireCitation", () => {
      it("returns the row for its owner", async () => {
        const citation = await ownership.requireCitation(ids.citation, userAId);
        expect(citation.id).toBe(ids.citation);
      });

      it("rejects a non-owner with 404 (not 403) and leaks no row", async () => {
        await expectOwnershipMiss(
          ownership.requireCitation(ids.citation, userBId),
          "Citation not found",
        );
      });
    });

    describe("requireCitationRun", () => {
      it("returns the row for the owner of the run's brand", async () => {
        const run = await ownership.requireCitationRun(ids.citationRun, userAId);
        expect(run.id).toBe(ids.citationRun);
        expect(run.brandId).toBe(brandAId);
      });

      it("rejects a non-owner with 404 (not 403) and leaks no row", async () => {
        await expectOwnershipMiss(
          ownership.requireCitationRun(ids.citationRun, userBId),
          "Citation run not found",
        );
      });
    });

    // requireMentionOwnership never throws - it resolves the row or null.
    // Same anti-enumeration contract, different shape, so it gets its own
    // assertion rather than reusing expectOwnershipMiss.
    describe("requireMentionOwnership", () => {
      it("resolves the row for the owner of the mention's brand", async () => {
        const mention = await ownership.requireMentionOwnership(ids.mention, userAId);
        expect(mention?.id).toBe(ids.mention);
      });

      it("resolves null (never throws, never leaks the row) for a non-owner", async () => {
        const result = await ownership.requireMentionOwnership(ids.mention, userBId);
        expect(result).toBeNull();
      });
    });

    describe("requireUser", () => {
      it("returns req.user when authenticated", () => {
        const user = ownership.requireUser({ user: { id: userAId } } as never);
        expect(user.id).toBe(userAId);
      });

      it("throws 401 (not 404) when req.user is absent", () => {
        let caught: unknown;
        try {
          ownership.requireUser({} as never);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(OwnershipError);
        expect((caught as InstanceType<typeof OwnershipError>).status).toBe(401);
      });
    });

    describe("getUserBrandIds", () => {
      it("returns only the caller's own brand ids", async () => {
        const brandIds = await ownership.getUserBrandIds(userAId);
        expect(brandIds.has(brandAId)).toBe(true);
        expect(brandIds.has(brandBId)).toBe(false);
      });
    });

    // -----------------------------------------------------------------
    // requirement 4: soft-deleted rows.
    //
    // Finding (matches the out-of-scope note at the end of
    // .audit/B6/B6b-01-mutation-auth-ownership.md): NO require* helper in
    // ownership.ts filters soft-deleted rows. Of the tables these helpers
    // read, only `brands` and `competitors` even have a deletedAt column;
    // requireBrand and loadEntityThroughBrand (which backs requireCompetitor)
    // both omit any deletedAt predicate, so a soft-deleted row IS currently
    // returned to its own owner. That is a real, separate, pre-existing gap
    // this task is not authorized to fix (ownership.ts may not be modified
    // permanently) - it is documented here explicitly, with the current
    // behavior asserted, rather than skipped silently or covered by a test
    // that asserts the opposite of what the code does.
    // -----------------------------------------------------------------
    describe("soft-deleted rows (requirement 4)", () => {
      it(
        "known gap: requireCompetitor still returns a soft-deleted competitor to its owner " +
          "(loadEntityThroughBrand has no deletedAt filter)",
        async () => {
          const competitor = (await ownership.requireCompetitor(
            ids.deletedCompetitor,
            userAId,
          )) as { id: string; deletedAt: Date | null };
          expect(competitor.id).toBe(ids.deletedCompetitor);
          expect(competitor.deletedAt).not.toBeNull();
        },
      );

      it(
        "known gap: requireBrand still returns a soft-deleted brand to its owner " +
          "(requireBrand has no deletedAt filter)",
        async () => {
          const brand = (await ownership.requireBrand(deletedBrandId, userAId)) as {
            id: string;
            deletedAt: Date | null;
          };
          expect(brand.id).toBe(deletedBrandId);
          expect(brand.deletedAt).not.toBeNull();
        },
      );

      it("confirms every other helper covered above backs a table with no soft-delete column at all", () => {
        const tablesWithoutSoftDelete = [
          schema.articles,
          schema.faqItems,
          schema.listicles,
          schema.bofuContent,
          schema.brandHallucinations,
          schema.brandFactSheet,
          schema.brandMentions,
          schema.communityPosts,
          schema.citationQuality,
          schema.keywordResearch,
          schema.chatbotThreads,
          schema.citations,
          schema.citationRuns,
        ];
        for (const table of tablesWithoutSoftDelete) {
          expect("deletedAt" in table).toBe(false);
        }
      });
    });
  });
} else {
  describe.skip("server/lib/ownership.ts - real database, no mocks", () => {
    it("requires TEST_DATABASE_URL", () => {});
  });
}
