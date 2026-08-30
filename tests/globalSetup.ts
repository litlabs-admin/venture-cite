// Make every local-database run start able to SET ROLE.
//
// Migration 0112 grants each managed role to the migrating user WITH SET TRUE,
// and server/outbox/outboxRepository.ts depends on it: every claim runs
// `set local role venturecite_outbox_worker`. Several integration suites have
// to revoke that grant in their beforeAll, because migration 0096 refuses to
// replay while any extra membership exists. They restore it in teardown, so an
// ordinary run is symmetric.
//
// A run that is interrupted - Ctrl-C, a crash, a killed container - stops
// before that teardown and leaves the database without the grant. Because the
// ledger already lists 0112 as applied, nothing replays it, and every later
// run fails with SQLSTATE 42501, "permission denied to set role", in whichever
// file happens to need SET ROLE first. The symptom points nowhere near the
// cause, and `npm run db:assert-migrations` still reports every migration
// applied, because it compares the ledger rather than the objects.
//
// Repairing it once per run, before any file loads, means a developer never
// has to work that out. It runs only against an approved local Supabase
// target, and is a no-op everywhere else.

import { Pool } from "pg";
import { restoreManagedRoleSelfGrants } from "./integration/localRoleCleanup";

function isApprovedLocalTarget(url: string | undefined): url is string {
  if (!url || process.env.LOCAL_SUPABASE_TEST !== "1") return false;
  try {
    const parsed = new URL(url);
    const database = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").toLowerCase();
    const host = parsed.hostname.toLowerCase();
    // Same shape tests/helpers/destructiveDatabaseTest.ts approves: the local
    // Supabase port, on loopback, against the default database.
    return (
      (host === "127.0.0.1" || host === "localhost") &&
      parsed.port === "55322" &&
      database === "postgres"
    );
  } catch {
    return false;
  }
}

export async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!isApprovedLocalTarget(url)) return;

  const pool = new Pool({ connectionString: url, max: 1, ssl: false });
  try {
    await restoreManagedRoleSelfGrants(pool);
  } catch (error) {
    // Never fail the run here. If the roles do not exist yet - a database that
    // has not been migrated - the suites that need them skip or fail on their
    // own terms, with a better message than this file could give.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`globalSetup: could not restore managed role self-grants: ${message}`);
  } finally {
    await pool.end();
  }
}
