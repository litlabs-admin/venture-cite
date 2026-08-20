import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfLocal =
  databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1"
    ? describe
    : describe.skip;

describeIfLocal("request database RLS foundation", () => {
  const userAId = randomUUID();
  const userBId = randomUUID();
  const brandAId = randomUUID();
  const brandBId = randomUUID();
  const runtimeRole = `venturecite_rls_test_${process.pid}_${Date.now()}`;
  const runtimePassword = "local-test-only-password";
  let ownerPool: Pool;
  let requestPool: Pool;

  beforeAll(async () => {
    ownerPool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 1,
      ssl: false,
    });
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0096_request_rls_foundation.sql"),
      "utf8",
    );
    await ownerPool.query(migration);
    await ownerPool.query(migration);

    await ownerPool.query(
      `create role "${runtimeRole}" with
        login
        password '${runtimePassword}'
        noinherit
        nosuperuser
        nocreatedb
        nocreaterole
        noreplication
        nobypassrls`,
    );
    await ownerPool.query(`grant venturecite_request to "${runtimeRole}"`);

    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for local RLS tests");
    const requestDatabaseUrl = new URL(testDatabaseUrl);
    requestDatabaseUrl.username = runtimeRole;
    requestDatabaseUrl.password = runtimePassword;
    requestPool = new Pool({
      connectionString: requestDatabaseUrl.toString(),
      max: 1,
      ssl: false,
    });

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
  });

  afterAll(async () => {
    if (requestPool) await requestPool.end();
    if (ownerPool) {
      await ownerPool.query(`delete from public.users where id = any($1::varchar[])`, [
        [userAId, userBId],
      ]);
      const runtimeRoleExists = await ownerPool.query("select 1 from pg_roles where rolname = $1", [
        runtimeRole,
      ]);
      if (runtimeRoleExists.rowCount === 1) {
        await ownerPool.query(`revoke venturecite_request from "${runtimeRole}"`);
        await ownerPool.query(`drop role "${runtimeRole}"`);
      }
      await ownerPool.end();
    }
  });

  it("reapplies the restricted role and policies", async () => {
    const role = await ownerPool.query<{
      rolbypassrls: boolean;
      rolcanlogin: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolinherit: boolean;
      rolreplication: boolean;
      rolsuper: boolean;
    }>(
      `select rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb,
              rolinherit, rolreplication, rolsuper
       from pg_roles
       where rolname = 'venturecite_request'`,
    );
    expect(role.rows).toEqual([
      {
        rolbypassrls: false,
        rolcanlogin: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolinherit: false,
        rolreplication: false,
        rolsuper: false,
      },
    ]);

    const policies = await ownerPool.query<{ policyname: string }>(
      `select policyname
       from pg_policies
       where schemaname = 'public'
         and tablename in ('users', 'brands')
         and policyname like '%_request_%'
       order by policyname`,
    );
    expect(policies.rows.map((row) => row.policyname)).toEqual([
      "brands_request_insert",
      "brands_request_select",
      "brands_request_update",
      "users_request_select",
      "users_request_update",
    ]);
  });

  it("rejects a request role with active members", async () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0096_request_rls_foundation.sql"),
      "utf8",
    );

    await expect(ownerPool.query(migration)).rejects.toMatchObject({ code: "P0001" });
  });

  it("rejects an admin-only request-role member", async () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0096_request_rls_foundation.sql"),
      "utf8",
    );

    await ownerPool.query(`revoke venturecite_request from "${runtimeRole}"`);
    try {
      await ownerPool.query(
        `grant venturecite_request to "${runtimeRole}"
         with admin true, inherit false, set false`,
      );
      await expect(ownerPool.query(migration)).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await ownerPool.query(`revoke venturecite_request from "${runtimeRole}"`);
      await ownerPool.query(`grant venturecite_request to "${runtimeRole}"`);
    }
  });

  it("rejects column access outside users and brands", async () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0096_request_rls_foundation.sql"),
      "utf8",
    );

    await ownerPool.query(`revoke venturecite_request from "${runtimeRole}"`);
    try {
      await ownerPool.query("grant select (id) on public.analytics to venturecite_request");
      await expect(ownerPool.query(migration)).rejects.toMatchObject({
        code: "P0001",
        message: expect.stringContaining("column privileges outside users and brands"),
      });
    } finally {
      await ownerPool.query("revoke select (id) on public.analytics from venturecite_request");
      await ownerPool.query(`grant venturecite_request to "${runtimeRole}"`);
    }
  });

  it("returns only the request user's row and brands", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const result = await requestData.forUser(createRequestActor(userAId), async (tx) => {
      const userRows = await tx.execute<{ id: string }>(
        sql`select id from public.users order by id`,
      );
      const brandRows = await tx.execute<{ id: string }>(
        sql`select id from public.brands order by id`,
      );
      return { userRows: userRows.rows, brandRows: brandRows.rows };
    });

    expect(result.userRows).toEqual([{ id: userAId }]);
    expect(result.brandRows).toEqual([{ id: brandAId }]);
  });

  it("blocks cross-user brand writes", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const affected = await requestData.forUser(createRequestActor(userAId), async (tx) => {
      const update = await tx.execute<{ id: string }>(sql`
        update public.brands
        set name = 'Changed by A'
        where id = ${brandBId}
        returning id
      `);
      return update.rowCount;
    });

    expect(affected).toBe(0);

    await expect(
      requestData.forUser(createRequestActor(userAId), async (tx) => {
        await tx.execute(sql`delete from public.brands where id = ${brandAId}`);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("allows approved brand writes for the request user", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));
    const result = await requestData.forUser(createRequestActor(userAId), async (tx) => {
      const inserted = await tx.execute<{ id: string }>(sql`
        insert into public.brands (user_id, name, company_name, industry)
        values (${userAId}, 'New brand', 'New company', 'Software')
        returning id
      `);
      const insertedId = inserted.rows[0]?.id;
      if (!insertedId) throw new Error("Brand insert returned no ID");
      const updated = await tx.execute<{ name: string }>(sql`
        update public.brands
        set name = 'Updated brand'
        where id = ${insertedId}
        returning name
      `);
      return {
        inserted: inserted.rows,
        updated: updated.rows,
      };
    });

    expect(result.inserted).toHaveLength(1);
    expect(result.updated).toEqual([{ name: "Updated brand" }]);
  });

  it("rejects a brand insert or owner change for another user", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    await expect(
      requestData.forUser(createRequestActor(userAId), async (tx) => {
        await tx.execute(sql`
          insert into public.brands (user_id, name, company_name, industry)
          values (${userBId}, 'Invalid', 'Invalid', 'Software')
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(
      requestData.forUser(createRequestActor(userAId), async (tx) => {
        await tx.execute(sql`
          update public.brands
          set autopilot_status = 'completed'
          where id = ${brandAId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(
      requestData.forUser(createRequestActor(userAId), async (tx) => {
        await tx.execute(sql`
          update public.brands
          set user_id = ${userBId}
          where id = ${brandAId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    await expect(
      requestData.forUser(createRequestActor(userAId), async (tx) => {
        await tx.execute(sql`select password_hash from public.users where id = ${userAId}`);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("allows only approved profile columns", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    await requestData.forUser(createRequestActor(userAId), async (tx) => {
      await tx.execute(sql`
        update public.users
        set first_name = 'Updated A'
        where id = ${userAId}
      `);
    });

    await expect(
      requestData.forUser(createRequestActor(userAId), async (tx) => {
        await tx.execute(sql`
          update public.users
          set access_tier = 'agency'
          where id = ${userAId}
        `);
      }),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("denies missing context and clears context after commit and rollback", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    await requestData.forUser(createRequestActor(userAId), async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`select id from public.brands`);
      expect(rows.rows).toContainEqual({ id: brandAId });
      expect(rows.rows).not.toContainEqual({ id: brandBId });
    });

    await expect(
      requestData.forUser(createRequestActor(userBId), async () => {
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const client = await requestPool.connect();
    try {
      const roleBefore = await client.query<{ reset: boolean }>(
        "select current_user = session_user as reset",
      );
      expect(roleBefore.rows).toEqual([{ reset: true }]);
      await client.query("begin");
      await client.query("set local role venturecite_request");
      const context = await client.query<{ user_id: string | null }>(
        "select nullif(current_setting('venturecite.user_id', true), '') as user_id",
      );
      const brands = await client.query<{ id: string }>("select id from public.brands");
      expect(context.rows).toEqual([{ user_id: null }]);
      expect(brands.rows).toEqual([]);
      await client.query("rollback");
      const roleAfter = await client.query<{ reset: boolean }>(
        "select current_user = session_user as reset",
      );
      expect(roleAfter.rows).toEqual([{ reset: true }]);
    } finally {
      client.release();
    }
  });
});
