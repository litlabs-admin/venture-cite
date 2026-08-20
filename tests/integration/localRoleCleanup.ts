import type { PoolClient } from "pg";

export const ROLE_MIGRATION_LOCK_KEY = [86420, 97631] as const;

export const LOCAL_TEST_ROLE_PREFIXES = [
  "venturecite_rls_test_",
  "venturecite_content_rls_",
  "outbox_runtime_",
  "outbox_request_",
  "outbox_content_",
  "outbox_worker_",
] as const;

type QueryConnection = Pick<PoolClient, "query">;

const MANAGED_ROLE_NAMES = [
  "venturecite_request",
  "venturecite_content_request",
  "venturecite_outbox_worker",
] as const;

/**
 * Revoke stale managed-role grants from a restored local test database.
 *
 * Call this only after the destructive database guard accepts the local target.
 */
export async function revokeManagedRoleMemberships(connection: QueryConnection): Promise<void> {
  const result = await connection.query<{
    granted_role: string;
    member_role: string;
  }>(
    `select granted.rolname as granted_role, member.rolname as member_role
     from pg_auth_members as membership
     join pg_roles as granted on granted.oid = membership.roleid
     join pg_roles as member on member.oid = membership.member
     where granted.rolname = any($1::text[])
       and member.oid <> (select oid from pg_roles where rolname = current_user)
     order by granted.rolname, member.rolname`,
    [MANAGED_ROLE_NAMES],
  );
  for (const membership of result.rows) {
    await connection.query(
      `revoke ${quoteIdentifier(membership.granted_role)} from ${quoteIdentifier(membership.member_role)}`,
    );
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function existingRoleNames(
  connection: QueryConnection,
  roleNames: readonly string[],
): Promise<Set<string>> {
  if (roleNames.length === 0) return new Set();
  const result = await connection.query<{ rolname: string }>(
    "select rolname from pg_roles where rolname = any($1::text[])",
    [roleNames],
  );
  return new Set(result.rows.map((row) => row.rolname));
}

async function revokeSchemaPrivileges(
  connection: QueryConnection,
  roleName: string,
): Promise<void> {
  const schemas = await connection.query<{ nspname: string }>(
    `select nspname from pg_namespace
     where nspname not like 'pg_%' and nspname <> 'information_schema'`,
  );
  for (const schema of schemas.rows) {
    await connection.query(
      `revoke all privileges on schema ${quoteIdentifier(schema.nspname)} from ${quoteIdentifier(roleName)}`,
    );
  }
}

/**
 * Remove only roles created by the local integration suites.
 *
 * The prefix filter prevents this helper from touching a production role.
 * The membership pass removes grants in both directions before each role is dropped.
 */
export async function removePrefixedRoles(
  connection: QueryConnection,
  prefixes: readonly string[],
): Promise<void> {
  if (prefixes.length === 0) return;
  const result = await connection.query<{ rolname: string }>(
    "select rolname from pg_roles where rolname like any($1::text[]) order by rolname",
    [prefixes.map((prefix) => `${prefix}%`)],
  );
  const roleNames = result.rows.map((row) => row.rolname);
  if (roleNames.length === 0) return;

  const membershipResult = await connection.query<{
    granted_role: string;
    member_role: string;
  }>(
    `select granted.rolname as granted_role, member.rolname as member_role
     from pg_auth_members as membership
     join pg_roles as granted on granted.oid = membership.roleid
     join pg_roles as member on member.oid = membership.member
     where (granted.rolname = any($1::text[]) or member.rolname = any($1::text[]))
       and member.oid <> (select oid from pg_roles where rolname = current_user)
     order by granted.rolname, member.rolname`,
    [roleNames],
  );
  for (const membership of membershipResult.rows) {
    await connection.query(
      `revoke ${quoteIdentifier(membership.granted_role)} from ${quoteIdentifier(membership.member_role)}`,
    );
  }

  const managedRoleSet = await existingRoleNames(connection, MANAGED_ROLE_NAMES);
  for (const roleName of roleNames) {
    // Keep this check after membership cleanup. A concurrent teardown can remove a role.
    const roleSet = await existingRoleNames(connection, [roleName]);
    if (!roleSet.has(roleName)) continue;
    for (const managedRoleName of MANAGED_ROLE_NAMES) {
      if (!managedRoleSet.has(managedRoleName)) continue;
      await connection.query(
        `revoke ${quoteIdentifier(managedRoleName)} from ${quoteIdentifier(roleName)}`,
      );
    }
    await revokeSchemaPrivileges(connection, roleName);
    await connection.query(`drop role if exists ${quoteIdentifier(roleName)}`);
  }
}

/**
 * Drop one local runtime role after removing memberships that can block the drop.
 */
export async function removeRoleIfExists(
  connection: QueryConnection,
  roleName: string,
): Promise<void> {
  const roleSet = await existingRoleNames(connection, [roleName]);
  if (!roleSet.has(roleName)) return;

  const membershipResult = await connection.query<{
    granted_role: string;
    member_role: string;
  }>(
    `select granted.rolname as granted_role, member.rolname as member_role
     from pg_auth_members as membership
     join pg_roles as granted on granted.oid = membership.roleid
     join pg_roles as member on member.oid = membership.member
     where (granted.rolname = $1 or member.rolname = $1)
       and member.oid <> (select oid from pg_roles where rolname = current_user)`,
    [roleName],
  );
  for (const membership of membershipResult.rows) {
    await connection.query(
      `revoke ${quoteIdentifier(membership.granted_role)} from ${quoteIdentifier(membership.member_role)}`,
    );
  }
  await revokeSchemaPrivileges(connection, roleName);
  await connection.query(`drop role if exists ${quoteIdentifier(roleName)}`);
}
