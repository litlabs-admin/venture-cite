import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";
import {
  LOCAL_TEST_ROLE_PREFIXES,
  ROLE_MIGRATION_LOCK_KEY,
  removePrefixedRoles,
  removeRoleIfExists,
  restoreManagedRoleSelfGrants,
  revokeManagedRoleMemberships,
} from "./localRoleCleanup";

// Covers migrations/0124_rls_defence_in_depth.sql: RLS for job_leases (no
// policy needed - not tenant data) and the nine loadEntityThroughBrand
// tables named in .audit/B7/B7-01-tenant-isolation-tests.md that had RLS
// enabled with zero policies since 0081_enable_rls_all_public_tables.sql.
//
// These policies are dormant on the application's current owner-equivalent
// connection (see the migration's own header comment) - this file proves
// the policies are *correct*, by connecting as venturecite_entity_request
// directly, the same way tests/integration/contentRequestRls.test.ts proves
// the already-migrated content slice. It does not claim the routes that
// still call server/lib/ownership.ts are protected by RLS today.

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfLocal =
  databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1"
    ? describe
    : describe.skip;

const CONTENT_REQUEST_TABLES = [
  { table: "competitors", policy: "competitors_entity_request_select" },
  { table: "faq_items", policy: "faq_items_entity_request_select" },
  { table: "listicles", policy: "listicles_entity_request_select" },
  { table: "bofu_content", policy: "bofu_content_entity_request_select" },
  { table: "brand_hallucinations", policy: "brand_hallucinations_entity_request_select" },
  { table: "brand_fact_sheet", policy: "brand_fact_sheet_entity_request_select" },
  { table: "brand_mentions", policy: "brand_mentions_entity_request_select" },
  { table: "community_posts", policy: "community_posts_entity_request_select" },
  { table: "citation_quality", policy: "citation_quality_entity_request_select" },
] as const;

// One row of seed data per table, keyed by brand so ownership is the only
// variable. Columns are the table's NOT NULL columns with no default.
const SEED_INSERTS: Record<string, (brandId: string, rowId: string) => [string, unknown[]]> = {
  competitors: (brandId, rowId) => [
    `insert into public.competitors (id, brand_id, name, domain) values ($1, $2, 'Acme', 'acme.test')`,
    [rowId, brandId],
  ],
  faq_items: (brandId, rowId) => [
    `insert into public.faq_items (id, brand_id, question, answer) values ($1, $2, 'Q', 'A')`,
    [rowId, brandId],
  ],
  listicles: (brandId, rowId) => [
    `insert into public.listicles (id, brand_id, title, url) values ($1, $2, 'Best of', 'https://example.test')`,
    [rowId, brandId],
  ],
  bofu_content: (brandId, rowId) => [
    `insert into public.bofu_content (id, brand_id, content_type, title, content) values ($1, $2, 'comparison', 'T', 'C')`,
    [rowId, brandId],
  ],
  brand_hallucinations: (brandId, rowId) => [
    `insert into public.brand_hallucinations (id, brand_id, ai_platform, prompt, claimed_statement, hallucination_type)
     values ($1, $2, 'chatgpt', 'p', 'claim', 'fabricated_fact')`,
    [rowId, brandId],
  ],
  brand_fact_sheet: (brandId, rowId) => [
    `insert into public.brand_fact_sheet (id, brand_id, subcategory, fact_key, fact_value)
     values ($1, $2, 'founding', 'founded_year', '2020')`,
    [rowId, brandId],
  ],
  brand_mentions: (brandId, rowId) => [
    `insert into public.brand_mentions (id, brand_id, platform, source_url) values ($1, $2, 'chatgpt', 'https://example.test')`,
    [rowId, brandId],
  ],
  community_posts: (brandId, rowId) => [
    `insert into public.community_posts (id, brand_id, platform, group_name, content)
     values ($1, $2, 'reddit', 'r/test', 'body')`,
    [rowId, brandId],
  ],
  citation_quality: (brandId, rowId) => [
    `insert into public.citation_quality (id, brand_id, ai_platform) values ($1, $2, 'chatgpt')`,
    [rowId, brandId],
  ],
};

describeIfLocal("RLS defence-in-depth (migration 0124)", () => {
  const userAId = randomUUID();
  const userBId = randomUUID();
  const brandAId = randomUUID();
  const brandBId = randomUUID();
  const rowAIds: Record<string, string> = {};
  const rowBIds: Record<string, string> = {};
  const runtimeRole = `venturecite_rls_test_${process.pid}_${Date.now()}`;
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

    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0124_rls_defence_in_depth.sql"),
      "utf8",
    );
    await ownerPool.query(migration);
    await ownerPool.query(migration); // idempotency, exercised for real

    await ownerPool.query(
      `create role "${runtimeRole}" with
        login password '${runtimePassword}' noinherit nosuperuser nocreatedb
        nocreaterole noreplication nobypassrls`,
    );
    // Same segfault-avoidance shape as contentRequestRls.test.ts: read the
    // grantee first and interpolate it as a literal identifier rather than
    // writing `grant ... to current_user`, which crashes PostgreSQL 17.6
    // locally (see that file's beforeAll for the verified reproduction).
    const heldWithAdmin = await ownerPool.query<{ rolname: string }>(
      `select r.rolname
         from pg_auth_members a
         join pg_roles r on r.oid = a.roleid
         join pg_roles m on m.oid = a.member
        where m.rolname = current_user
          and a.admin_option
          and r.rolname = 'venturecite_entity_request'`,
    );
    if (heldWithAdmin.rowCount === 0) {
      const granteeResult = await ownerPool.query<{ grantee: string }>(
        "select current_user as grantee",
      );
      const grantee = granteeResult.rows[0].grantee;
      await ownerPool.query(
        `grant venturecite_entity_request to "${grantee}" with inherit false, set false, admin true`,
      );
    }
    await ownerPool.query(
      `grant venturecite_entity_request to "${runtimeRole}" with inherit false, set true, admin false`,
    );

    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for local RLS tests");
    const requestDatabaseUrl = new URL(testDatabaseUrl);
    requestDatabaseUrl.username = runtimeRole;
    requestDatabaseUrl.password = runtimePassword;
    requestPool = new Pool({ connectionString: requestDatabaseUrl.toString(), max: 1, ssl: false });

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

    for (const { table } of CONTENT_REQUEST_TABLES) {
      const rowAId = randomUUID();
      const rowBId = randomUUID();
      rowAIds[table] = rowAId;
      rowBIds[table] = rowBId;
      const build = SEED_INSERTS[table];
      const [sqlText, paramsA] = build(brandAId, rowAId);
      const [, paramsB] = build(brandBId, rowBId);
      await ownerPool.query(sqlText, paramsA);
      await ownerPool.query(sqlText, paramsB);
    }
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
          // Put back the self-grant beforeAll revoked, now that the replay is
          // finished. revokeManagedRoleMemberships has to strip it so 0096 can
          // be replayed, but nothing else restores it, and the next file that
          // needs SET ROLE would fail with SQLSTATE 42501.
          await restoreManagedRoleSelfGrants(ownerPool);
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

  it("enables RLS on job_leases with no policy", async () => {
    const result = await ownerPool.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class
       join pg_namespace on pg_namespace.oid = pg_class.relnamespace
       where pg_namespace.nspname = 'public' and pg_class.relname = 'job_leases'`,
    );
    expect(result.rows).toEqual([{ relrowsecurity: true }]);

    const policies = await ownerPool.query(
      `select policyname from pg_policies where schemaname = 'public' and tablename = 'job_leases'`,
    );
    expect(policies.rows).toEqual([]);
  });

  it("enables RLS with exactly one select policy on each of the nine tables", async () => {
    const result = await ownerPool.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       join pg_namespace on pg_namespace.oid = pg_class.relnamespace
       where pg_namespace.nspname = 'public'
         and relname = any($1::text[])
       order by relname`,
      [CONTENT_REQUEST_TABLES.map((t) => t.table)],
    );
    expect(result.rows).toEqual(
      [...CONTENT_REQUEST_TABLES]
        .map((t) => ({ relname: t.table, relrowsecurity: true }))
        .sort((a, b) => a.relname.localeCompare(b.relname)),
    );

    for (const { table, policy } of CONTENT_REQUEST_TABLES) {
      const policies = await ownerPool.query<{ policyname: string; cmd: string; roles: string }>(
        `select policyname, cmd, roles::text as roles
         from pg_policies where schemaname = 'public' and tablename = $1`,
        [table],
      );
      expect(policies.rows).toEqual([
        { policyname: policy, cmd: "SELECT", roles: "{venturecite_entity_request}" },
      ]);
    }
  });

  async function selectAsUser(userId: string, table: string): Promise<string[]> {
    const client = await requestPool.connect();
    try {
      await client.query("begin");
      await client.query("set local role venturecite_entity_request");
      await client.query("select set_config('venturecite.user_id', $1, true)", [userId]);
      const result = await client.query<{ id: string }>(`select id from public.${table}`);
      await client.query("rollback");
      return result.rows.map((r) => r.id);
    } finally {
      client.release();
    }
  }

  it.each(CONTENT_REQUEST_TABLES)("shows each brand only its own $table row", async ({ table }) => {
    await expect(selectAsUser(userAId, table)).resolves.toEqual([rowAIds[table]]);
    await expect(selectAsUser(userBId, table)).resolves.toEqual([rowBIds[table]]);
  });

  it.each(CONTENT_REQUEST_TABLES)(
    "returns no $table rows without an actor context",
    async ({ table }) => {
      const client = await requestPool.connect();
      try {
        await client.query("begin");
        await client.query("set local role venturecite_entity_request");
        const result = await client.query(`select id from public.${table}`);
        expect(result.rows).toEqual([]);
        await client.query("rollback");
      } finally {
        client.release();
      }
    },
  );

  it("still lets the owner-equivalent connection read every brand's rows unfiltered", async () => {
    // Proves adding these policies did not turn the security gap into an
    // outage: the application's real connection (unrestricted, RLS-exempt)
    // keeps seeing both tenants' rows exactly as before this migration.
    for (const { table } of CONTENT_REQUEST_TABLES) {
      const result = await ownerPool.query<{ id: string }>(
        `select id from public.${table} where id = any($1::varchar[]) order by id`,
        [[rowAIds[table], rowBIds[table]]],
      );
      expect(result.rows.map((r) => r.id).sort()).toEqual([rowAIds[table], rowBIds[table]].sort());
    }
  });

  it("proves each new policy is load-bearing by dropping it and watching legitimate access disappear", async () => {
    // Each table carries exactly one policy for this role. Dropping it does
    // not leak the other tenant's row - Postgres RLS fails CLOSED when a
    // table has RLS enabled and no policy matches the role/command, per the
    // 0081 default-deny design this migration follows. The observable
    // failure is that the row's own owner also loses access: proof the
    // policy, not luck, was granting that access.
    for (const { table, policy } of CONTENT_REQUEST_TABLES) {
      await ownerPool.query(`drop policy ${policy} on public.${table}`);
      let seenByOwnerAfterDrop: string[];
      try {
        seenByOwnerAfterDrop = await selectAsUser(userAId, table);
      } finally {
        // Restore immediately, even if the query above throws.
        const migration = fs.readFileSync(
          path.resolve(process.cwd(), "migrations/0124_rls_defence_in_depth.sql"),
          "utf8",
        );
        await ownerPool.query(migration);
      }
      // The actual failure this drop produces, captured for the record:
      // the row's own tenant now sees nothing, not just the other tenant's row.
      expect(
        seenByOwnerAfterDrop,
        `${table}: owner lost access once its policy was dropped`,
      ).toEqual([]);

      const seenAfterRestore = await selectAsUser(userAId, table);
      expect(seenAfterRestore).toEqual([rowAIds[table]]);
    }
  }, 60_000);
});
