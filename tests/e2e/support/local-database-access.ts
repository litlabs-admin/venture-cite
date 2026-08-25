import { Pool, type PoolClient } from "pg";
import { ROLE_MIGRATION_LOCK_KEY } from "../../integration/localRoleCleanup";

const LOCAL_REQUEST_ROLES = [
  "venturecite_request",
  "venturecite_content_request",
  "venturecite_outbox_worker",
] as const;

export function localE2EOwnerDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("E2E_LOCAL_DATABASE_URL is required");
  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "55322" ||
    databaseName !== "postgres"
  ) {
    throw new Error("Local E2E requires the fixed loopback Supabase database");
  }
  return url.toString();
}

export function localE2EAdminDatabaseUrl(value: string | undefined): string {
  const url = new URL(localE2EOwnerDatabaseUrl(value));
  if (decodeURIComponent(url.username) !== "supabase_admin") {
    throw new Error("Local E2E requires the local Supabase administrator role");
  }
  return url.toString();
}

function localE2EApplicationRole(value: string | undefined): string {
  const url = new URL(localE2EOwnerDatabaseUrl(value));
  const roleName = decodeURIComponent(url.username);
  if (!roleName) throw new Error("Local E2E database URL requires a role name");
  return roleName;
}

export function localE2ESupabaseEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const value = env.E2E_LOCAL_SUPABASE_URL;
  const anonKey = env.E2E_LOCAL_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!value || !anonKey || !serviceRoleKey) {
    throw new Error("Local E2E requires the local Supabase URL and keys");
  }
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "55321" ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new Error("Local E2E requires the fixed loopback Supabase API");
  }
  return {
    SUPABASE_URL: url.toString(),
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    VITE_SUPABASE_URL: url.toString(),
    VITE_SUPABASE_ANON_KEY: anonKey,
  };
}

async function withRoleLock(
  env: NodeJS.ProcessEnv,
  work: (client: PoolClient) => Promise<void>,
): Promise<void> {
  if (env.E2E_LOCAL_FAKE_GENERATION !== "1") {
    throw new Error("Local E2E database access requires the fake provider");
  }
  const pool = new Pool({
    connectionString: localE2EAdminDatabaseUrl(env.E2E_LOCAL_ADMIN_DATABASE_URL),
    max: 1,
    ssl: false,
  });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("select pg_advisory_lock($1, $2)", ROLE_MIGRATION_LOCK_KEY);
    await work(client);
  } finally {
    if (client) {
      await client
        .query("select pg_advisory_unlock($1, $2)", ROLE_MIGRATION_LOCK_KEY)
        .catch(() => undefined);
      client.release();
    }
    await pool.end().catch(() => undefined);
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function revokeLocalE2EGrants(client: PoolClient, applicationRole: string): Promise<void> {
  for (const roleName of LOCAL_REQUEST_ROLES) {
    await client.query(
      `revoke ${quoteIdentifier(roleName)} from ${quoteIdentifier(applicationRole)} granted by current_user`,
    );
  }
}

export async function prepareLocalE2EDatabaseAccess(env: NodeJS.ProcessEnv): Promise<void> {
  const applicationRole = localE2EApplicationRole(env.E2E_LOCAL_DATABASE_URL);
  await withRoleLock(env, async (client) => {
    await revokeLocalE2EGrants(client, applicationRole);
    for (const roleName of LOCAL_REQUEST_ROLES) {
      await client.query(
        `grant ${quoteIdentifier(roleName)} to ${quoteIdentifier(applicationRole)}
         with inherit false, set true, admin false`,
      );
    }
  });
}

export async function cleanupLocalE2EDatabaseAccess(env: NodeJS.ProcessEnv): Promise<void> {
  const applicationRole = localE2EApplicationRole(env.E2E_LOCAL_DATABASE_URL);
  await withRoleLock(env, (client) => revokeLocalE2EGrants(client, applicationRole));
}
