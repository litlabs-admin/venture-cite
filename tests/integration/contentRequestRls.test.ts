import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "@shared/schema";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";
import {
  REQUEST_ROLE_MEMBERSHIP_CONFIRMATION,
  runRequestRoleMembership,
} from "../../server/lib/requestRoleMembership";
import {
  LOCAL_TEST_ROLE_PREFIXES,
  ROLE_MIGRATION_LOCK_KEY,
  removePrefixedRoles,
  removeRoleIfExists,
  revokeManagedRoleMemberships,
} from "./localRoleCleanup";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfLocal =
  databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1"
    ? describe
    : describe.skip;
describeIfLocal("content request database RLS", () => {
  const userAId = randomUUID();
  const userBId = randomUUID();
  const brandAId = randomUUID();
  const brandBId = randomUUID();
  const articleAId = randomUUID();
  const articleBId = randomUUID();
  const keywordAId = randomUUID();
  const keywordBId = randomUUID();
  const brandPromptAId = randomUUID();
  const brandPromptBId = randomUUID();
  const citationRunAId = randomUUID();
  const citationRunBId = randomUUID();
  const jobAId = randomUUID();
  const jobBId = randomUUID();
  const runtimeRole = `venturecite_content_rls_${process.pid}_${Date.now()}`;
  const runtimePassword = "local-test-only-password";
  let ownerPool: Pool;
  let requestPool: Pool;
  let lockClient: PoolClient;
  let ownerLockAcquired = false;

  beforeAll(async () => {
    ownerPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2, ssl: false });
    lockClient = await ownerPool.connect();
    await lockClient.query("select pg_advisory_lock($1, $2)", ROLE_MIGRATION_LOCK_KEY);
    ownerLockAcquired = true;
    await removePrefixedRoles(lockClient, LOCAL_TEST_ROLE_PREFIXES);
    await revokeManagedRoleMemberships(lockClient);
    const foundationMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0096_request_rls_foundation.sql"),
      "utf8",
    );
    const contentMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0097_request_rls_content.sql"),
      "utf8",
    );
    const brandDeletionPreviewMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0114_request_brand_deletion_preview.sql"),
      "utf8",
    );
    const responseColumnsMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0103_content_request_response_columns.sql"),
      "utf8",
    );
    const articleWritesMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0104_content_request_article_writes.sql"),
      "utf8",
    );
    const distributionKeywordWritesMigration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "migrations/0105_content_request_distribution_keyword_writes.sql",
      ),
      "utf8",
    );
    const generationCommandsMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0106_content_request_generation_commands.sql"),
      "utf8",
    );
    const articleResponseColumnsMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0107_content_request_article_response_columns.sql"),
      "utf8",
    );
    const distributionProviderStateMigration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "migrations/0108_content_request_distribution_provider_state.sql",
      ),
      "utf8",
    );
    const quotaPeriodMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0109_content_generation_quota_period.sql"),
      "utf8",
    );
    await ownerPool.query(foundationMigration);
    // The local database may already include 0114 after a full migration reset.
    // Revoke its later grants before replaying the historical 0097 audit.
    await ownerPool.query(
      "revoke all privileges on public.brand_prompts, public.citation_runs from venturecite_content_request",
    );
    await ownerPool.query(contentMigration);
    await ownerPool.query(contentMigration);
    await ownerPool.query(brandDeletionPreviewMigration);
    await ownerPool.query(brandDeletionPreviewMigration);
    await ownerPool.query(responseColumnsMigration);
    await ownerPool.query(responseColumnsMigration);
    await ownerPool.query(articleWritesMigration);
    await ownerPool.query(articleWritesMigration);
    await ownerPool.query(distributionKeywordWritesMigration);
    await ownerPool.query(distributionKeywordWritesMigration);
    await ownerPool.query(generationCommandsMigration);
    await ownerPool.query(generationCommandsMigration);
    await ownerPool.query(articleResponseColumnsMigration);
    await ownerPool.query(articleResponseColumnsMigration);
    await ownerPool.query(distributionProviderStateMigration);
    await ownerPool.query(distributionProviderStateMigration);
    await ownerPool.query(quotaPeriodMigration);
    await ownerPool.query(quotaPeriodMigration);

    await ownerPool.query(
      `create role "${runtimeRole}" with
        login password '${runtimePassword}' noinherit nosuperuser nocreatedb
        nocreaterole noreplication nobypassrls`,
    );
    // The production direct role receives these admin grants in the controlled
    // release step. The local Supabase fixture must model that state explicitly.
    //
    // The grantee is read first and interpolated as a literal identifier.
    // PostgreSQL 17.6 segfaults on `grant <role> to current_user` (signal 11,
    // verified 2026-08-28 against the Supabase local image), which took the whole
    // server into recovery mode and made every test in this file unrunnable.
    // The grant is also skipped when the membership already carries admin option,
    // which is the normal local state because this session created the roles.
    const managedRequestRoles = [
      "venturecite_request",
      "venturecite_content_request",
      "venturecite_outbox_worker",
    ];
    const heldWithAdmin = await ownerPool.query<{ rolname: string }>(
      `select r.rolname
         from pg_auth_members a
         join pg_roles r on r.oid = a.roleid
         join pg_roles m on m.oid = a.member
        where m.rolname = current_user
          and a.admin_option
          and r.rolname = any($1::text[])`,
      [managedRequestRoles],
    );
    const alreadyHeld = new Set(heldWithAdmin.rows.map((row) => row.rolname));
    const rolesToGrant = managedRequestRoles.filter((role) => !alreadyHeld.has(role));
    if (rolesToGrant.length > 0) {
      const granteeResult = await ownerPool.query<{ grantee: string }>(
        "select current_user as grantee",
      );
      const grantee = granteeResult.rows[0].grantee;
      await ownerPool.query(
        `grant ${rolesToGrant.join(", ")} to "${grantee}" with inherit false, set false, admin true`,
      );
    }
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for local RLS tests");
    const requestDatabaseUrl = new URL(testDatabaseUrl);
    requestDatabaseUrl.username = runtimeRole;
    requestDatabaseUrl.password = runtimePassword;
    requestPool = new Pool({ connectionString: requestDatabaseUrl.toString(), max: 1, ssl: false });
    await expect(
      runRequestRoleMembership({
        mode: "apply",
        confirmation: REQUEST_ROLE_MEMBERSHIP_CONFIRMATION,
        runtime: requestPool,
        direct: ownerPool,
        runtimeRoleName: runtimeRole,
      }),
    ).resolves.toEqual({ mode: "apply", changed: true });

    await ownerPool.query(
      `insert into public.users (id, email, first_name, access_tier)
       values ($1, $2, 'User A', 'free'), ($3, $4, 'User B', 'free')`,
      [userAId, `${userAId}@example.test`, userBId, `${userBId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.brands (id, user_id, name, company_name, industry)
       values ($1, $2, 'Brand A', 'Company A', 'Software'),
              ($3, $4, 'Brand B', 'Company B', 'Software')`,
      [brandAId, userAId, brandBId, userBId],
    );
    await ownerPool.query(
      `insert into public.articles (id, brand_id, title, content)
       values ($1, $2, 'Article A', 'Content A'), ($3, $4, 'Article B', 'Content B')`,
      [articleAId, brandAId, articleBId, brandBId],
    );
    await ownerPool.query(
      `insert into public.article_revisions (article_id, content, source, created_by)
       values ($1, 'Revision A', 'generated', 'system'),
              ($2, 'Revision B', 'generated', 'system')`,
      [articleAId, articleBId],
    );
    await ownerPool.query(
      `insert into public.distributions (article_id, platform, platform_post_id, metadata)
       values ($1, 'LinkedIn', 'provider-a', '{"content":"A"}'::jsonb),
              ($2, 'LinkedIn', 'provider-b', '{"content":"B"}'::jsonb)`,
      [articleAId, articleBId],
    );
    await ownerPool.query(
      `insert into public.keyword_research (id, brand_id, keyword)
       values ($1, $2, 'keyword-a'), ($3, $4, 'keyword-b')`,
      [keywordAId, brandAId, keywordBId, brandBId],
    );
    await ownerPool.query(
      `insert into public.brand_prompts (id, brand_id, prompt)
       values ($1, $2, 'prompt-a'), ($3, $4, 'prompt-b')`,
      [brandPromptAId, brandAId, brandPromptBId, brandBId],
    );
    await ownerPool.query(
      `insert into public.citation_runs (id, brand_id)
       values ($1, $2), ($3, $4)`,
      [citationRunAId, brandAId, citationRunBId, brandBId],
    );
    await ownerPool.query(
      `insert into public.content_generation_jobs
        (id, user_id, brand_id, article_id, request_payload, openai_response_id)
       values ($1, $2, $3, $4, '{}'::jsonb, 'provider-a'),
              ($5, $6, $7, $8, '{}'::jsonb, 'provider-b')`,
      [jobAId, userAId, brandAId, articleAId, jobBId, userBId, brandBId, articleBId],
    );
  }, 60_000);

  afterAll(async () => {
    try {
      if (requestPool) await requestPool.end();
    } finally {
      if (ownerPool) {
        try {
          await ownerPool.query(`delete from public.users where id = any($1::varchar[])`, [
            [userAId, userBId],
          ]);
          const runtimeRoleExists = await ownerPool.query(
            "select 1 from pg_roles where rolname = $1",
            [runtimeRole],
          );
          if (runtimeRoleExists.rowCount === 1) {
            await removeRoleIfExists(ownerPool, runtimeRole);
          }
        } finally {
          try {
            if (ownerLockAcquired) {
              await lockClient
                ?.query("select pg_advisory_unlock($1, $2)", ROLE_MIGRATION_LOCK_KEY)
                .catch(() => undefined);
            }
          } finally {
            lockClient?.release();
            await ownerPool.end();
          }
        }
      }
    }
  });

  it("enables RLS for every content slice table", async () => {
    const result = await ownerPool.query<{ relname: string; relrowsecurity: boolean }>(
      `select relation.relname, relation.relrowsecurity
       from pg_class as relation
       join pg_namespace as namespace on namespace.oid = relation.relnamespace
       where namespace.nspname = 'public'
         and relation.relname = any($1::text[])
       order by relation.relname`,
      [
        [
          "article_revisions",
          "articles",
          "brand_prompts",
          "brands",
          "citation_runs",
          "content_generation_jobs",
          "distributions",
          "keyword_research",
        ],
      ],
    );

    expect(result.rows).toEqual([
      { relname: "article_revisions", relrowsecurity: true },
      { relname: "articles", relrowsecurity: true },
      { relname: "brand_prompts", relrowsecurity: true },
      { relname: "brands", relrowsecurity: true },
      { relname: "citation_runs", relrowsecurity: true },
      { relname: "content_generation_jobs", relrowsecurity: true },
      { relname: "distributions", relrowsecurity: true },
      { relname: "keyword_research", relrowsecurity: true },
    ]);
  });

  async function forUser<T>(
    userId: string,
    work: (transaction: ReturnType<typeof drizzle>) => Promise<T>,
  ) {
    const database = drizzle(requestPool, { schema });
    return database.transaction(async (transaction) => {
      await transaction.execute(sql`set local role venturecite_content_request`);
      await transaction.execute(sql`select set_config('venturecite.user_id', ${userId}, true)`);
      return work(transaction);
    });
  }

  it("shows user A only its content rows", async () => {
    const result = await forUser(userAId, async (transaction) => {
      const articles = await transaction.execute<{ id: string }>(
        sql`select id from public.articles order by id`,
      );
      const revisions = await transaction.execute<{ article_id: string }>(
        sql`select article_id from public.article_revisions order by article_id`,
      );
      const distributions = await transaction.execute<{ article_id: string }>(
        sql`select article_id from public.distributions order by article_id`,
      );
      const keywords = await transaction.execute<{ id: string }>(
        sql`select id from public.keyword_research order by id`,
      );
      const jobs = await transaction.execute<{ id: string }>(
        sql`select id from public.content_generation_jobs order by id`,
      );
      return {
        articles: articles.rows,
        revisions: revisions.rows,
        distributions: distributions.rows,
        keywords: keywords.rows,
        jobs: jobs.rows,
      };
    });

    expect(result).toEqual({
      articles: [{ id: articleAId }],
      revisions: [{ article_id: articleAId }],
      distributions: [{ article_id: articleAId }],
      keywords: [{ id: keywordAId }],
      jobs: [{ id: jobAId }],
    });
  });

  it("shows user B only its content rows", async () => {
    const result = await forUser(userBId, async (transaction) => {
      const articles = await transaction.execute<{ id: string }>(
        sql`select id from public.articles`,
      );
      const revisions = await transaction.execute<{ article_id: string }>(
        sql`select article_id from public.article_revisions`,
      );
      const distributions = await transaction.execute<{ article_id: string }>(
        sql`select article_id from public.distributions`,
      );
      const keywords = await transaction.execute<{ id: string }>(
        sql`select id from public.keyword_research`,
      );
      const jobs = await transaction.execute<{ id: string }>(
        sql`select id from public.content_generation_jobs`,
      );
      return {
        articles: articles.rows,
        revisions: revisions.rows,
        distributions: distributions.rows,
        keywords: keywords.rows,
        jobs: jobs.rows,
      };
    });

    expect(result).toEqual({
      articles: [{ id: articleBId }],
      revisions: [{ article_id: articleBId }],
      distributions: [{ article_id: articleBId }],
      keywords: [{ id: keywordBId }],
      jobs: [{ id: jobBId }],
    });
  });

  it("keeps durable content facades bound to their original actors", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const facadeA = contentData.forActor(createRequestActor(userAId));
    const facadeB = contentData.forActor(createRequestActor(userBId));

    expect((await facadeA.articles.list()).map((article) => article.id)).toEqual([articleAId]);
    expect((await facadeB.articles.list()).map((article) => article.id)).toEqual([articleBId]);
    expect((await facadeA.articles.list()).map((article) => article.id)).toEqual([articleAId]);
  });

  it("scopes brand deletion previews to the request actor", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestBrandRepository } =
      await import("../../server/data/requestBrandRepository");
    const database = drizzle(requestPool, { schema });
    const repositoryA = createRequestBrandRepository({
      actor: createRequestActor(userAId),
      database,
    });
    const repositoryB = createRequestBrandRepository({
      actor: createRequestActor(userBId),
      database,
    });

    await expect(repositoryA.deletionPreview(brandAId)).resolves.toEqual({
      articles: 1,
      prompts: 1,
      citationRuns: 1,
    });
    await expect(repositoryA.deletionPreview(brandBId)).resolves.toBeUndefined();
    await expect(repositoryB.deletionPreview(randomUUID())).resolves.toBeUndefined();
  });

  it("returns no content when the restricted role has no actor context", async () => {
    const client = await requestPool.connect();
    try {
      await client.query("begin");
      await client.query("set local role venturecite_content_request");
      const articles = await client.query("select id from public.articles");
      const revisions = await client.query("select id from public.article_revisions");
      const distributions = await client.query("select id from public.distributions");
      const keywords = await client.query("select id from public.keyword_research");
      const jobs = await client.query("select id from public.content_generation_jobs");
      expect(articles.rows).toEqual([]);
      expect(revisions.rows).toEqual([]);
      expect(distributions.rows).toEqual([]);
      expect(keywords.rows).toEqual([]);
      expect(jobs.rows).toEqual([]);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("rejects active content role members", async () => {
    const contentMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0097_request_rls_content.sql"),
      "utf8",
    );

    await expect(ownerPool.query(contentMigration)).rejects.toMatchObject({
      code: "P0001",
      message: expect.stringContaining("unexpected role memberships"),
    });
  });

  it("rejects content role privileges outside the content slice", async () => {
    const contentMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0097_request_rls_content.sql"),
      "utf8",
    );
    const articleWritesMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0104_content_request_article_writes.sql"),
      "utf8",
    );

    await ownerPool.query(`revoke venturecite_content_request from "${runtimeRole}"`);
    try {
      await ownerPool.query("grant select (id) on public.analytics to venturecite_content_request");
      await expect(ownerPool.query(contentMigration)).rejects.toMatchObject({
        code: "P0001",
        message: expect.stringContaining("column privileges outside the content slice"),
      });
    } finally {
      await ownerPool.query(
        "revoke select (id) on public.analytics from venturecite_content_request",
      );
      await ownerPool.query(`grant venturecite_content_request to "${runtimeRole}"`);
      await ownerPool.query(articleWritesMigration);
      await ownerPool.query(articleWritesMigration);
    }
  });

  it("allows owned article and revision writes while denying cross-user and protected fields", async () => {
    const createdArticle = await forUser(userAId, async (transaction) => {
      const inserted = await transaction.execute<{ id: string }>(sql`
        insert into public.articles (brand_id, title, content, status)
        values (${brandAId}, 'Created', 'Created content', 'draft')
        returning id
      `);
      const createdArticleId = inserted.rows[0]?.id;
      if (!createdArticleId) throw new Error("Expected the article insert to return an ID");
      await transaction.execute(sql`
        update public.articles set title = 'Changed' where id = ${createdArticleId}
      `);
      await transaction.execute(sql`
        insert into public.article_revisions (article_id, content, source, created_by)
        values (${createdArticleId}, 'Edited', 'manual_edit', ${userAId})
      `);
      return createdArticleId;
    });

    const crossUserUpdate = await forUser(userBId, async (transaction) =>
      transaction.execute(sql`
        update public.articles set title = 'Cross-user' where id = ${createdArticle}
        returning id
      `),
    );
    expect(crossUserUpdate.rows).toEqual([]);

    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.articles set citation_count = 99 where id = ${createdArticle}`,
        );
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.article_revisions set created_at = now() where article_id = ${createdArticle}`,
        );
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(
      forUser(userBId, async (transaction) => {
        await transaction.execute(sql`
          insert into public.article_revisions (article_id, content, source, created_by)
          values (${createdArticle}, 'Cross-user', 'manual_edit', ${userBId})
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await ownerPool.query("delete from public.articles where id = $1", [createdArticle]);
  });

  it("supports optimistic article updates and atomic revision restores", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));

    const restored = await actorA.revisions.restore(articleAId, "missing-revision", 0);
    expect(restored).toEqual({ kind: "not_found" });

    const revisionRows = await ownerPool.query<{ id: string }>(
      "select id from public.article_revisions where article_id = $1 order by created_at limit 1",
      [articleAId],
    );
    const revisionId = revisionRows.rows[0]?.id;
    if (!revisionId) throw new Error("Expected a seed revision");

    const restoreResult = await actorA.revisions.restore(articleAId, revisionId, 0);
    expect(restoreResult.kind).toBe("restored");
    if (restoreResult.kind === "restored") {
      expect(restoreResult.article.content).toBe("Revision A");
      expect(restoreResult.revision.source).toBe("manual_edit");
      expect(restoreResult.revision.createdBy).toBe(userAId);
    }

    const conflict = await actorA.revisions.restore(articleAId, revisionId, 0);
    expect(conflict.kind).toBe("conflict");

    const actorB = contentData.forActor(createRequestActor(userBId));
    await expect(actorB.articles.update(articleAId, { title: "Hidden" })).resolves.toBeUndefined();
    await expect(actorB.revisions.restore(articleAId, revisionId)).resolves.toEqual({
      kind: "not_found",
    });

    const beforeRollback = await ownerPool.query<{ content: string }>(
      "select content from public.articles where id = $1",
      [articleAId],
    );
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          update public.articles set content = 'Should roll back' where id = ${articleAId}
        `);
        await transaction.execute(sql`
          insert into public.article_revisions (article_id, content, source, created_by)
          values (${articleAId}, 'Broken', 'invalid_source', ${userAId})
        `);
      }),
    ).rejects.toBeDefined();
    const afterRollback = await ownerPool.query<{ content: string }>(
      "select content from public.articles where id = $1",
      [articleAId],
    );
    expect(afterRollback.rows[0]?.content).toBe(beforeRollback.rows[0]?.content);
  });

  it("binds distribution and keyword writes to the actor and rolls back batches", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    const batchPlatform = `Batch-${randomUUID()}`;

    await expect(
      actorA.distributions.createMany([
        { articleId: articleAId, platform: batchPlatform, status: "pending" },
        { articleId: articleBId, platform: batchPlatform, status: "pending" },
      ]),
    ).rejects.toBeDefined();
    const rolledBack = await ownerPool.query(
      "select id from public.distributions where platform = $1",
      [batchPlatform],
    );
    expect(rolledBack.rows).toEqual([]);

    const [distribution] = await actorA.distributions.createMany([
      { articleId: articleAId, platform: `Owned-${randomUUID()}`, status: "pending" },
    ]);
    const updatedDistribution = await actorA.distributions.update(distribution.id, {
      status: "success",
      metadata: { content: "edited" },
    });
    expect(updatedDistribution?.status).toBe("success");

    const updatedKeyword = await actorA.keywords.update(keywordAId, { category: "owned" });
    expect(updatedKeyword?.category).toBe("owned");
    const actorB = contentData.forActor(createRequestActor(userBId));
    await expect(
      actorB.keywords.update(keywordAId, { category: "cross-user" }),
    ).resolves.toBeUndefined();

    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.distributions set platform_post_id = 'owned-provider' where id = ${distribution.id}`,
        );
      }),
    ).resolves.toBeUndefined();
    const ownedProviderState = await ownerPool.query<{ platform_post_id: string | null }>(
      "select platform_post_id from public.distributions where id = $1",
      [distribution.id],
    );
    expect(ownedProviderState.rows).toEqual([{ platform_post_id: "owned-provider" }]);
    await forUser(userAId, async (transaction) => {
      await transaction.execute(
        sql`update public.distributions set platform_post_id = 'foreign-attempt' where article_id = ${articleBId}`,
      );
    });
    const foreignProviderState = await ownerPool.query<{ platform_post_id: string | null }>(
      "select platform_post_id from public.distributions where article_id = $1",
      [articleBId],
    );
    expect(foreignProviderState.rows).toEqual([{ platform_post_id: "provider-b" }]);
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          insert into public.distributions
            (article_id, platform, status, platform_post_id)
          values (${articleAId}, 'Forbidden provider field', 'pending', 'forbidden')
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.keyword_research set brand_id = ${brandBId} where id = ${keywordAId}`,
        );
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await ownerPool.query("delete from public.distributions where id = $1", [distribution.id]);
  });

  it("keeps unrelated request writes denied", async () => {
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.distributions set article_id = ${articleBId} where article_id = ${articleAId}`,
        );
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.keyword_research set provenance = 'forbidden' where id = ${keywordAId}`,
        );
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          insert into public.content_generation_jobs
            (user_id, brand_id, article_id, request_payload)
          values (${userAId}, ${brandAId}, ${articleAId}, '{}'::jsonb)
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("denies worker fields and permits distribution response fields", async () => {
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          select openai_response_id from public.content_generation_jobs where id = ${jobAId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          select advance_token from public.content_generation_jobs where id = ${jobAId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          select stream_buffer from public.content_generation_jobs where id = ${jobAId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    const distribution = await forUser(userAId, async (transaction) =>
      transaction.execute(sql`
        select platform_post_id from public.distributions
         where article_id = ${articleAId}
         order by platform_post_id
      `),
    );
    expect(distribution.rows).toEqual([{ platform_post_id: "provider-a" }]);

    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          update public.content_generation_jobs set status = 'succeeded' where id = ${jobAId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("atomically reserves quota, creates one job, and rejects a duplicate request", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const input = {
      articleId: draft.id,
      brandId: brandAId,
      requestPayload: { keywords: "atomic", industry: "Software", type: "article" },
      keywords: ["atomic"],
      industry: "Software",
      contentType: "article",
      targetCustomers: null,
      geography: null,
      contentStyle: "b2c" as const,
    };

    const [first, second] = await Promise.all([
      actorA.jobs.enqueueGeneration(input),
      actorA.jobs.enqueueGeneration(input),
    ]);
    const results = [first, second];
    const created = results.find((result) => result.kind === "created");
    const duplicate = results.find((result) => result.kind === "conflict");
    expect(created?.kind).toBe("created");
    expect(duplicate).toEqual({ kind: "conflict", status: "generating" });
    if (created?.kind !== "created") throw new Error("Expected a created job");

    const state = await ownerPool.query<{
      used: number;
      job_count: string;
      article_status: string;
      article_job_id: string;
    }>(
      `select users.articles_used_this_month as used,
              (select count(*)::text from public.content_generation_jobs where article_id = $2) as job_count,
              articles.status as article_status, articles.job_id as article_job_id
       from public.users join public.articles on articles.id = $2
       where users.id = $1`,
      [userAId, draft.id],
    );
    expect(state.rows).toEqual([
      { used: 1, job_count: "1", article_status: "generating", article_job_id: created.jobId },
    ]);

    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
  });

  it("rolls back the request boundary when quota is exhausted", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    await ownerPool.query("update public.users set articles_used_this_month = 5 where id = $1", [
      userAId,
    ]);
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const result = await actorA.jobs.enqueueGeneration({
      articleId: draft.id,
      brandId: brandAId,
      requestPayload: { keywords: "quota", industry: "Software" },
      keywords: ["quota"],
      industry: "Software",
      contentType: "article",
      targetCustomers: null,
      geography: null,
      contentStyle: "b2c",
    });
    expect(result).toEqual({ kind: "quota", cap: 5 });
    const unchanged = await ownerPool.query<{ status: string; job_id: string | null }>(
      "select status, job_id from public.articles where id = $1",
      [draft.id],
    );
    expect(unchanged.rows).toEqual([{ status: "draft", job_id: null }]);
    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
  });

  it("denies generated articles for the Pro tier", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    await ownerPool.query(
      "update public.users set access_tier = 'pro', articles_used_this_month = 0 where id = $1",
      [userAId],
    );
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const result = await actorA.jobs.enqueueGeneration({
      articleId: draft.id,
      brandId: brandAId,
      requestPayload: { keywords: "pro", industry: "Software" },
      keywords: ["pro"],
      industry: "Software",
      contentType: "article",
      targetCustomers: null,
      geography: null,
      contentStyle: "b2c",
    });
    expect(result).toEqual({ kind: "quota", cap: schema.usageLimits.pro.articlesPerMonth });
    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query("update public.users set access_tier = 'free' where id = $1", [userAId]);
  });

  it("serializes enqueue against a brand soft-delete", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const input = {
      articleId: draft.id,
      brandId: brandAId,
      requestPayload: { keywords: "brand race", industry: "Software" },
      keywords: ["brand race"],
      industry: "Software",
      contentType: "article",
      targetCustomers: null,
      geography: null,
      contentStyle: "b2c" as const,
    };
    const [result] = await Promise.all([
      actorA.jobs.enqueueGeneration(input),
      ownerPool.query(
        "update public.brands set deleted_at = now(), deletion_scheduled_for = now() where id = $1",
        [brandAId],
      ),
    ]);
    expect(["created", "not_found"]).toContain(result.kind);
    const state = await ownerPool.query<{ status: string; job_id: string | null }>(
      "select status, job_id from public.articles where id = $1",
      [draft.id],
    );
    if (result.kind === "not_found") {
      expect(state.rows).toEqual([{ status: "draft", job_id: null }]);
    } else {
      expect(state.rows).toEqual([{ status: "generating", job_id: result.jobId }]);
    }
    await ownerPool.query(
      "update public.brands set deleted_at = null, deletion_scheduled_for = null where id = $1",
      [brandAId],
    );
    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
  });

  it("cancels once, refunds once, and protects a newer article job", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    const actorB = contentData.forActor(createRequestActor(userBId));
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const created = await actorA.jobs.enqueueGeneration({
      articleId: draft.id,
      brandId: brandAId,
      requestPayload: { keywords: "cancel", industry: "Software" },
      keywords: ["cancel"],
      industry: "Software",
      contentType: "article",
      targetCustomers: null,
      geography: null,
      contentStyle: "b2c",
    });
    if (created.kind !== "created") throw new Error("Expected a created job");

    expect(await actorB.jobs.cancel(created.jobId)).toEqual({ kind: "not_found" });
    expect(await actorA.jobs.cancel(created.jobId)).toEqual({
      kind: "cancelled",
      status: "cancelled",
    });
    expect(await actorA.jobs.cancel(created.jobId)).toEqual({
      kind: "already_terminal",
      status: "cancelled",
    });

    const afterCancel = await ownerPool.query<{
      used: number;
      status: string;
      job_id: string | null;
    }>(
      `select users.articles_used_this_month as used, articles.status, articles.job_id
       from public.users join public.articles on articles.id = $2 where users.id = $1`,
      [userAId, draft.id],
    );
    expect(afterCancel.rows).toEqual([{ used: 0, status: "draft", job_id: null }]);

    const newer = await ownerPool.query<{ id: string }>(
      `insert into public.content_generation_jobs
         (user_id, brand_id, article_id, request_payload, status)
       values ($1, $2, $3, '{}'::jsonb, 'running') returning id`,
      [userAId, brandAId, draft.id],
    );
    await ownerPool.query(
      "update public.articles set status = 'generating', job_id = $2 where id = $1",
      [draft.id, newer.rows[0]?.id],
    );
    const old = await ownerPool.query<{ id: string }>(
      `insert into public.content_generation_jobs
         (user_id, brand_id, article_id, request_payload, status)
       values ($1, $2, $3, '{}'::jsonb, 'running') returning id`,
      [userAId, brandAId, draft.id],
    );
    await ownerPool.query("update public.articles set job_id = $2 where id = $1", [
      draft.id,
      newer.rows[0]?.id,
    ]);
    expect(await actorA.jobs.cancel(old.rows[0]?.id ?? "")).toEqual({
      kind: "cancelled",
      status: "cancelled",
    });
    const protectedArticle = await ownerPool.query<{ status: string; job_id: string }>(
      "select status, job_id from public.articles where id = $1",
      [draft.id],
    );
    expect(protectedArticle.rows).toEqual([{ status: "generating", job_id: newer.rows[0]?.id }]);

    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
  });

  it("does not refund a cancellation for a job before the usage reset", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    await ownerPool.query(
      "update public.users set articles_used_this_month = 1, usage_reset_date = now() where id = $1",
      [userAId],
    );
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const oldJob = await ownerPool.query<{ id: string }>(
      `insert into public.content_generation_jobs
         (user_id, brand_id, article_id, request_payload, status, created_at)
       values ($1, $2, $3, '{}'::jsonb, 'running', now() - interval '2 months') returning id`,
      [userAId, brandAId, draft.id],
    );
    const oldJobId = oldJob.rows[0]?.id;
    if (!oldJobId) throw new Error("Expected an old job");
    await ownerPool.query(
      "update public.content_generation_jobs set quota_reservation_period = null where id = $1",
      [oldJobId],
    );
    await ownerPool.query(
      "update public.articles set status = 'generating', job_id = $2 where id = $1",
      [draft.id, oldJobId],
    );

    expect(await actorA.jobs.cancel(oldJobId)).toEqual({
      kind: "cancelled",
      status: "cancelled",
    });
    const afterCancel = await ownerPool.query<{
      used: number;
      refunded_at: Date | null;
      article_status: string;
      article_job_id: string | null;
    }>(
      `select users.articles_used_this_month as used,
              jobs.refunded_at,
              articles.status as article_status,
              articles.job_id as article_job_id
       from public.users
       join public.content_generation_jobs as jobs on jobs.id = $2
       join public.articles as articles on articles.id = $3
       where users.id = $1`,
      [userAId, oldJobId, draft.id],
    );
    expect(afterCancel.rows).toEqual([
      { used: 1, refunded_at: null, article_status: "draft", article_job_id: null },
    ]);

    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query(
      "update public.users set articles_used_this_month = 0, usage_reset_date = null where id = $1",
      [userAId],
    );
  });

  it("does not refund a reservation after the usage period changes", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    await ownerPool.query(
      "update public.users set articles_used_this_month = 0, usage_reset_date = now() where id = $1",
      [userAId],
    );
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const created = await actorA.jobs.enqueueGeneration({
      articleId: draft.id,
      brandId: brandAId,
      requestPayload: { keywords: "period", industry: "Software" },
      keywords: ["period"],
      industry: "Software",
      contentType: "article",
      targetCustomers: null,
      geography: null,
      contentStyle: "b2c",
    });
    if (created.kind !== "created") throw new Error("Expected a created job");

    const reservation = await ownerPool.query<{ recorded: boolean }>(
      `select quota_reservation_period is not null as recorded
         from public.content_generation_jobs where id = $1`,
      [created.jobId],
    );
    expect(reservation.rows).toEqual([{ recorded: true }]);

    await ownerPool.query(
      "update public.users set usage_reset_date = now() + interval '1 month' where id = $1",
      [userAId],
    );
    expect(await actorA.jobs.cancel(created.jobId)).toEqual({
      kind: "cancelled",
      status: "cancelled",
    });
    const afterCancel = await ownerPool.query<{ used: number; refundedAt: Date | null }>(
      `select users.articles_used_this_month as used, jobs.refunded_at as "refundedAt"
         from public.users
         join public.content_generation_jobs as jobs on jobs.id = $2
        where users.id = $1`,
      [userAId, created.jobId],
    );
    expect(afterCancel.rows).toEqual([{ used: 1, refundedAt: null }]);

    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query(
      "update public.users set articles_used_this_month = 0, usage_reset_date = null where id = $1",
      [userAId],
    );
  });

  it("serializes a worker terminal transition against cancellation", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createContentRequestData } = await import("../../server/data/contentRequestData");
    const contentData = createContentRequestData(drizzle(requestPool, { schema }));
    const actorA = contentData.forActor(createRequestActor(userAId));
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
    const draft = await actorA.articles.createDraft({ brandId: brandAId });
    const created = await actorA.jobs.enqueueGeneration({
      articleId: draft.id,
      brandId: brandAId,
      requestPayload: { keywords: "terminal race", industry: "Software" },
      keywords: ["terminal race"],
      industry: "Software",
      contentType: "article",
      targetCustomers: null,
      geography: null,
      contentStyle: "b2c",
    });
    if (created.kind !== "created") throw new Error("Expected a created job");
    const workerToken = `worker-race-${randomUUID()}`;
    await ownerPool.query(
      "update public.content_generation_jobs set status = 'running', advance_token = $2 where id = $1",
      [created.jobId, workerToken],
    );

    const workerTerminal = async (): Promise<boolean> => {
      const client = await ownerPool.connect();
      try {
        await client.query("begin");
        const terminal = await client.query(
          `update public.content_generation_jobs
              set status = 'succeeded', completed_at = now(),
                  advance_token = null, advance_lease_expires_at = null
            where id = $1 and status = 'running' and advance_token = $2
            returning article_id`,
          [created.jobId, workerToken],
        );
        if (terminal.rowCount === 1) {
          await client.query(
            `update public.articles
                set status = 'ready', job_id = null, content = 'Worker content',
                    title = 'Worker title', updated_at = now()
              where id = $1 and job_id = $2`,
            [draft.id, created.jobId],
          );
        }
        await client.query("commit");
        return terminal.rowCount === 1;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    };

    const [workerWon, cancelResult] = await Promise.all([
      workerTerminal(),
      actorA.jobs.cancel(created.jobId),
    ]);
    expect(["cancelled", "already_terminal"]).toContain(cancelResult.kind);
    const finalState = await ownerPool.query<{ job_status: string; article_status: string }>(
      `select jobs.status as job_status, articles.status as article_status
         from public.content_generation_jobs as jobs
         join public.articles as articles on articles.id = $2
        where jobs.id = $1`,
      [created.jobId, draft.id],
    );
    if (workerWon) {
      expect(cancelResult).toEqual({ kind: "already_terminal", status: "succeeded" });
      expect(finalState.rows).toEqual([{ job_status: "succeeded", article_status: "ready" }]);
    } else {
      expect(cancelResult).toEqual({ kind: "cancelled", status: "cancelled" });
      expect(finalState.rows).toEqual([{ job_status: "cancelled", article_status: "draft" }]);
    }
    await ownerPool.query("delete from public.articles where id = $1", [draft.id]);
    await ownerPool.query("update public.users set articles_used_this_month = 0 where id = $1", [
      userAId,
    ]);
  });

  it("does not expose request commands to the runtime role without the request role", async () => {
    await expect(
      requestPool.query("select * from private.request_cancel_content_generation($1)", [jobAId]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("hides all content after its brand is soft-deleted", async () => {
    await ownerPool.query("update public.brands set deleted_at = now() where id = $1", [brandAId]);

    const result = await forUser(userAId, async (transaction) => {
      const articles = await transaction.execute(sql`select id from public.articles`);
      const revisions = await transaction.execute(sql`select id from public.article_revisions`);
      const distributions = await transaction.execute(sql`select id from public.distributions`);
      const keywords = await transaction.execute(sql`select id from public.keyword_research`);
      const jobs = await transaction.execute(sql`select id from public.content_generation_jobs`);
      return {
        articles: articles.rows,
        revisions: revisions.rows,
        distributions: distributions.rows,
        keywords: keywords.rows,
        jobs: jobs.rows,
      };
    });

    expect(result).toEqual({
      articles: [],
      revisions: [],
      distributions: [],
      keywords: [],
      jobs: [],
    });
  });

  it("keeps worker-owner access to job fields", async () => {
    const result = await ownerPool.query<{ openai_response_id: string }>(
      `update public.content_generation_jobs
       set openai_response_id = 'worker-provider-id'
       where id = $1
       returning openai_response_id`,
      [jobAId],
    );
    expect(result.rows).toEqual([{ openai_response_id: "worker-provider-id" }]);
  });
});
