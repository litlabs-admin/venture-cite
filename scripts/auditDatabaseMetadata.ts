import { logger } from "../server/lib/logger";

const REQUIRED_CONFIRMATION = "venturecite-read-only";

async function main(): Promise<void> {
  if (process.env.CONFIRM_DATABASE_METADATA_AUDIT !== REQUIRED_CONFIRMATION) {
    throw new Error(
      "Set CONFIRM_DATABASE_METADATA_AUDIT=venturecite-read-only before the metadata audit.",
    );
  }

  process.env.NODE_ENV = "production";
  const { pool } = await import("../server/db");
  const client = await pool.connect();

  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");

    const role = await client.query<{
      current_user: string;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `SELECT current_user, role.rolsuper, role.rolbypassrls
       FROM pg_roles AS role
       WHERE role.rolname = current_user`,
    );
    const tables = await client.query<{
      rls_enabled: number;
      rls_forced: number;
      tables: number;
    }>(
      `SELECT
         count(*)::int AS tables,
         count(*) FILTER (WHERE relation.relrowsecurity)::int AS rls_enabled,
         count(*) FILTER (WHERE relation.relforcerowsecurity)::int AS rls_forced
       FROM pg_class AS relation
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public' AND relation.relkind = 'r'`,
    );
    const policies = await client.query<{ policies: number }>(
      `SELECT count(*)::int AS policies
       FROM pg_policies
       WHERE schemaname = 'public'`,
    );

    logger.info(
      {
        role: role.rows[0],
        tables: tables.rows[0],
        policies: policies.rows[0],
      },
      "database metadata audit complete",
    );
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "database metadata audit failed");
  process.exitCode = 1;
});
