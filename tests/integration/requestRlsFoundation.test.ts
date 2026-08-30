import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "@shared/schema";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";
import {
  LOCAL_TEST_ROLE_PREFIXES,
  ROLE_MIGRATION_LOCK_KEY,
  removePrefixedRoles,
  removeRoleIfExists,
  restoreManagedRoleSelfGrants,
  revokeManagedRoleMemberships,
} from "./localRoleCleanup";

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
  const deletedBrandId = randomUUID();
  const runtimeRole = `venturecite_rls_test_${process.pid}_${Date.now()}`;
  const runtimePassword = "local-test-only-password";
  let ownerPool: Pool;
  let requestPool: Pool;
  let lockClient: PoolClient;

  async function withRestrictedSql<T>(
    userId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await requestPool.connect();
    try {
      await client.query("begin");
      await client.query("set local role venturecite_request");
      await client.query("select set_config('venturecite.user_id', $1, true)", [userId]);
      return await work(client);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  }

  beforeAll(async () => {
    ownerPool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 2,
      ssl: false,
    });
    lockClient = await ownerPool.connect();
    await lockClient.query("select pg_advisory_lock($1, $2)", ROLE_MIGRATION_LOCK_KEY);
    await removePrefixedRoles(lockClient, LOCAL_TEST_ROLE_PREFIXES);
    await revokeManagedRoleMemberships(lockClient);
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0096_request_rls_foundation.sql"),
      "utf8",
    );
    await ownerPool.query(migration);
    await ownerPool.query(migration);
    const profileTimestampMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0101_request_user_profile_timestamp.sql"),
      "utf8",
    );
    await ownerPool.query(profileTimestampMigration);
    await ownerPool.query(profileTimestampMigration);
    const brandSoftDeleteMigration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0110_request_brand_soft_delete.sql"),
      "utf8",
    );
    await ownerPool.query(brandSoftDeleteMigration);
    await ownerPool.query(brandSoftDeleteMigration);

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
    await ownerPool.query(`grant venturecite_request to "${runtimeRole}"`);

    await ownerPool.query(
      `insert into public.users (id, email, first_name, access_tier)
       values ($1, $2, 'User A', 'free'), ($3, $4, 'User B', 'free')`,
      [userAId, `${userAId}@example.test`, userBId, `${userBId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.brands (id, user_id, name, company_name, industry)
       values ($1, $2, 'Brand A', 'Company A', 'Software'),
              ($3, $4, 'Brand B', 'Company B', 'Software'),
              ($5, $2, 'Deleted brand', 'Deleted company', 'Software')`,
      [brandAId, userAId, brandBId, userBId, deletedBrandId],
    );
    await ownerPool.query("update public.brands set deleted_at = now() where id = $1", [
      deletedBrandId,
    ]);
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
          await lockClient
            ?.query("select pg_advisory_unlock($1, $2)", ROLE_MIGRATION_LOCK_KEY)
            .catch(() => undefined);
          lockClient?.release();
          await ownerPool.end();
        }
      }
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
    // brands_entity_request_select (migrations/0124_rls_defence_in_depth.sql)
    // reads brands from a second, unrelated restricted role
    // (venturecite_entity_request) that mirrors this one's ownership check
    // for a different table set. It genuinely matches this query's
    // "%_request_%" filter and belongs in this exhaustive list.
    expect(policies.rows.map((row) => row.policyname)).toEqual([
      "brands_entity_request_select",
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

  it("returns only the request user's active data", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facade = requestData.forActor(createRequestActor(userAId));
    const result = {
      user: await facade.users.get(),
      brands: await facade.brands.list(),
    };

    expect(result.user?.id).toBe(userAId);
    expect(result.brands.map((brand) => brand.id)).toContain(brandAId);
    expect(result.brands.map((brand) => brand.id)).not.toContain(brandBId);
    expect(result.brands.map((brand) => brand.id)).not.toContain(deletedBrandId);
  });

  it("scopes user and brand repositories to the request user", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facade = requestData.forActor(createRequestActor(userAId));
    const result = {
      user: await facade.users.get(),
      visibleBrands: await facade.brands.list(),
      hiddenBrand: await facade.brands.get(brandBId),
      deletedBrand: await facade.brands.get(deletedBrandId),
      changedBrand: await facade.brands.update(brandBId, { name: "Changed by A" }),
      changedDeletedBrand: await facade.brands.update(deletedBrandId, {
        name: "Changed deleted brand",
      }),
      createdBrand: await facade.brands.create({
        name: "Repository brand",
        companyName: "Repository company",
        industry: "Software",
      }),
    };

    expect(result.user?.id).toBe(userAId);
    expect(result.visibleBrands.map((brand) => brand.id)).toContain(brandAId);
    expect(result.visibleBrands.map((brand) => brand.id)).not.toContain(brandBId);
    expect(result.hiddenBrand).toBeUndefined();
    expect(result.deletedBrand).toBeUndefined();
    expect(result.changedBrand).toBeUndefined();
    expect(result.changedDeletedBrand).toBeUndefined();
    expect(result.createdBrand.userId).toBe(userAId);
  });

  it("prevents RESET ROLE, GUC forgery, and actor overrides at the request API boundary", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const boundary = requestData.forActor(createRequestActor(userAId)) as unknown as Record<
      string,
      unknown
    >;
    expect(boundary.execute).toBeUndefined();
    expect(boundary.query).toBeUndefined();
    expect(boundary.transaction).toBeUndefined();
    expect(boundary.actor).toBeUndefined();
    expect(Object.keys(boundary).sort()).toEqual(["brands", "users"]);
  });

  it("blocks cross-user brand writes", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facade = requestData.forActor(createRequestActor(userAId));
    const update = await facade.brands.update(brandBId, { name: "Changed by A" });
    const affected = update ? 1 : 0;

    expect(affected).toBe(0);

    expect(facade.brands).not.toHaveProperty("delete");

    await expect(
      withRestrictedSql(userAId, async (client) => {
        await client.query("delete from public.brands where id = $1", [brandAId]);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("allows approved brand writes for the request user", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));
    const facade = requestData.forActor(createRequestActor(userAId));
    const inserted = await facade.brands.create({
      name: "New brand",
      companyName: "New company",
      industry: "Software",
    });
    const result = {
      inserted,
      updated: await facade.brands.update(inserted.id, { name: "Updated brand" }),
    };

    expect(result.inserted.userId).toBe(userAId);
    expect(result.updated?.name).toBe("Updated brand");
  });

  it("enforces version checks for the request user's brand writes", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facade = requestData.forActor(createRequestActor(userAId));
    const result = {
      stale: await facade.brands.updateIfVersion(brandAId, 1, {
        name: "Stale write",
      }),
      updated: await facade.brands.updateIfVersion(brandAId, 0, {
        name: "Versioned write",
      }),
    };

    expect(result.stale).toBeUndefined();
    expect(result.updated?.name).toBe("Versioned write");
    expect(result.updated?.version).toBe(1);
  });

  it("rejects direct access to unapproved brand and user columns", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facade = requestData.forActor(createRequestActor(userAId));
    const brands = facade.brands as unknown as Record<string, unknown>;
    expect(brands).not.toHaveProperty("setOwner");
    expect(brands).not.toHaveProperty("setAutopilotStatus");
    expect(facade.users).not.toHaveProperty("getPasswordHash");

    await expect(
      withRestrictedSql(userAId, async (client) => {
        await client.query(
          `insert into public.brands (user_id, name, company_name, industry)
           values ($1, 'Invalid', 'Invalid', 'Software')`,
          [userBId],
        );
      }),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      withRestrictedSql(userAId, async (client) => {
        await client.query(
          "update public.brands set autopilot_status = 'completed' where id = $1",
          [brandAId],
        );
      }),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      withRestrictedSql(userAId, async (client) => {
        await client.query("update public.brands set user_id = $1 where id = $2", [
          userBId,
          brandAId,
        ]);
      }),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      withRestrictedSql(userAId, async (client) => {
        await client.query("select password_hash from public.users where id = $1", [userAId]);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("allows only approved profile columns", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facade = requestData.forActor(createRequestActor(userAId));
    await facade.users.updateProfile({ firstName: "Updated A" });
    expect(facade.users).not.toHaveProperty("setAccessTier");

    await expect(
      withRestrictedSql(userAId, async (client) => {
        await client.query("update public.users set access_tier = 'agency' where id = $1", [
          userAId,
        ]);
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps durable facades actor-bound and denies missing context", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facadeA = requestData.forActor(createRequestActor(userAId));
    const facadeB = requestData.forActor(createRequestActor(userBId));
    const firstA = await facadeA.brands.list();
    const rowsB = await facadeB.brands.list();
    const secondA = await facadeA.brands.list();
    expect(firstA.map((brand) => brand.id)).toContain(brandAId);
    expect(rowsB.map((brand) => brand.id)).toContain(brandBId);
    expect(rowsB.map((brand) => brand.id)).not.toContain(brandAId);
    expect(secondA.map((brand) => brand.id)).toContain(brandAId);
    expect(secondA.map((brand) => brand.id)).not.toContain(brandBId);

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

  it("soft-deletes only an active brand owned by the actor", async () => {
    const { createRequestActor } = await import("../../server/lib/requestActor");
    const { createRequestData } = await import("../../server/data/requestData");
    const requestData = createRequestData(drizzle(requestPool, { schema }));

    const facade = requestData.forActor(createRequestActor(userAId));
    const deleted = await facade.brands.softDelete(brandAId, 1);
    expect(deleted?.id).toBe(brandAId);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(deleted?.deletionScheduledFor).toBeInstanceOf(Date);
    expect(await facade.brands.get(brandAId)).toBeUndefined();
    expect(
      await requestData.forActor(createRequestActor(userBId)).brands.softDelete(brandAId),
    ).toBeUndefined();
  });
});
