// revokeManagedRoleMemberships and restoreManagedRoleSelfGrants must be a
// symmetric pair.
//
// The revoke has to be lossy. Migration 0096 raises "venturecite_request has
// unexpected role memberships" if any extra membership exists when it is
// replayed, so every suite that replays it strips the self-grant migration
// 0112 confers first.
//
// Nothing used to put that row back. None of those suites replays 0112, and
// the ledger already lists 0112 as applied, so the SET option stayed gone for
// the rest of the run. Any file that ran afterwards and needed
// `set local role venturecite_outbox_worker` failed with SQLSTATE 42501,
// "permission denied to set role" - the four outbox repository tests were the
// visible casualty. Because file order decides who runs first, the failure
// count changed between runs of identical code.
//
// This pins both halves. A future change that stops the revoke stripping the
// grant breaks 0096 replay; one that stops the restore putting it back breaks
// every later SET ROLE. Either regression fails here.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, type PoolClient } from "pg";
import {
  ROLE_MIGRATION_LOCK_KEY,
  restoreManagedRoleSelfGrants,
  revokeManagedRoleMemberships,
} from "./localRoleCleanup";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);
const describeIfDb = databaseTest.kind === "ready" ? describe : describe.skip;

const MANAGED_ROLES = [
  "venturecite_content_request",
  "venturecite_outbox_worker",
  "venturecite_request",
] as const;

describeIfDb("managed role self-grants survive the cleanup cycle", () => {
  let pool: Pool;
  let lockClient: PoolClient;
  let afterRevoke: string[] = [];
  let afterRestore: string[] = [];

  async function rolesCarryingSetOption(): Promise<string[]> {
    const result = await pool.query<{ rolname: string }>(
      `select granted.rolname
         from pg_auth_members as membership
         join pg_roles as granted on granted.oid = membership.roleid
         join pg_roles as member on member.oid = membership.member
        where granted.rolname = any($1::text[])
          and member.rolname = current_user
          and membership.set_option
        order by granted.rolname`,
      [MANAGED_ROLES],
    );
    return result.rows.map((row) => row.rolname);
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2, ssl: false });
    lockClient = await pool.connect();
    // The same advisory lock every role-manipulating suite takes, so this
    // cannot interleave with them.
    await lockClient.query("select pg_advisory_lock($1, $2)", ROLE_MIGRATION_LOCK_KEY);

    await revokeManagedRoleMemberships(lockClient);
    afterRevoke = await rolesCarryingSetOption();

    await restoreManagedRoleSelfGrants(lockClient);
    afterRestore = await rolesCarryingSetOption();
  });

  afterAll(async () => {
    try {
      if (lockClient) {
        await lockClient
          .query("select pg_advisory_unlock($1, $2)", ROLE_MIGRATION_LOCK_KEY)
          .catch(() => undefined);
        lockClient.release();
      }
    } finally {
      await pool?.end();
    }
  });

  it("strips the self-grant, which is what lets 0096 be replayed", () => {
    expect(afterRevoke).toEqual([]);
  });

  it("puts the self-grant back for every managed role", () => {
    expect(afterRestore).toEqual([...MANAGED_ROLES]);
  });

  // The catalogue check can pass while the grant is still unusable, so assert
  // the operation server/outbox/outboxRepository.ts actually performs.
  it("lets a transaction enter the outbox worker role", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role venturecite_outbox_worker");
      const who = await client.query<{ current_user: string }>("select current_user");
      expect(who.rows[0].current_user).toBe("venturecite_outbox_worker");
      await client.query("rollback");
    } finally {
      client.release();
    }
  });

  it("is idempotent - a second restore adds no duplicate row", async () => {
    await restoreManagedRoleSelfGrants(lockClient);
    expect(await rolesCarryingSetOption()).toEqual([...MANAGED_ROLES]);
  });
});
