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
    const responseColumnsMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0103_content_request_response_columns.sql"),
      "utf8",
    );
    await ownerPool.query(foundationMigration);
    await ownerPool.query(contentMigration);
    await ownerPool.query(contentMigration);
    await ownerPool.query(responseColumnsMigration);
    await ownerPool.query(responseColumnsMigration);

    await ownerPool.query(
      `create role "${runtimeRole}" with
        login password '${runtimePassword}' noinherit nosuperuser nocreatedb
        nocreaterole noreplication nobypassrls`,
    );
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
          "brands",
          "content_generation_jobs",
          "distributions",
          "keyword_research",
        ],
      ],
    );

    expect(result.rows).toEqual([
      { relname: "article_revisions", relrowsecurity: true },
      { relname: "articles", relrowsecurity: true },
      { relname: "brands", relrowsecurity: true },
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
    }
  });

  it("denies every request write even for owned content", async () => {
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.articles set title = 'Changed' where id = ${articleAId}`,
        );
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(sql`
          insert into public.article_revisions (article_id, content, source, created_by)
          values (${articleAId}, 'Edited', 'manual_edit', ${userAId})
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`update public.distributions set metadata = '{}' where article_id = ${articleAId}`,
        );
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      forUser(userAId, async (transaction) => {
        await transaction.execute(
          sql`delete from public.keyword_research where id = ${keywordAId}`,
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
        select platform_post_id from public.distributions where article_id = ${articleAId}
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
