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
 * Put back the self-grant migration 0112 confers, if it is not already there.
 *
 * 0112 runs `GRANT <role> TO <current_user> WITH ADMIN FALSE, INHERIT FALSE,
 * SET TRUE`, and that SET option is what lets application code run
 * `set local role venturecite_outbox_worker`. Without it Postgres answers
 * SQLSTATE 42501, "permission denied to set role".
 *
 * revokeManagedRoleMemberships has to remove that row: migration 0096 raises
 * "venturecite_request has unexpected role memberships" if any extra
 * membership exists when it is replayed, so the revoke is a precondition for
 * every suite that replays it. But none of those suites replays 0112, and the
 * ledger already lists 0112 as applied, so nothing put the row back. The suite
 * became order-dependent: whichever file ran afterwards and needed SET ROLE
 * failed with 42501, and the failure count changed between runs of identical
 * code.
 *
 * Call this from the teardown of any suite that calls
 * revokeManagedRoleMemberships, after its migration replay is finished. It
 * cannot go inside the revoke itself - that would reintroduce the membership
 * 0096 refuses.
 */
export async function restoreManagedRoleSelfGrants(connection: QueryConnection): Promise<void> {
  const present = await existingRoleNames(connection, MANAGED_ROLE_NAMES);
  if (present.size === 0) return;

  // Read the grantee and interpolate it as an identifier. Writing
  // `grant ... to current_user` directly crashes PostgreSQL 17.6 - see the
  // reproduction noted in tests/integration/rlsDefenceInDepth.test.ts.
  const granteeResult = await connection.query<{ grantee: string }>(
    "select current_user as grantee",
  );
  const grantee = granteeResult.rows[0]?.grantee;
  if (!grantee) return;

  for (const roleName of MANAGED_ROLE_NAMES) {
    if (!present.has(roleName)) continue;
    const existing = await connection.query(
      `select 1
         from pg_auth_members as membership
         join pg_roles as granted on granted.oid = membership.roleid
         join pg_roles as member on member.oid = membership.member
        where granted.rolname = $1
          and member.rolname = $2
          and membership.grantor = member.oid`,
      [roleName, grantee],
    );
    if ((existing.rowCount ?? 0) > 0) continue;
    await connection.query(
      `grant ${quoteIdentifier(roleName)} to ${quoteIdentifier(grantee)} with admin false, inherit false, set true`,
    );
  }
}

/**
 * Revoke stale managed-role grants from a restored local test database.
 *
 * This deliberately also removes migration 0112's self-grant, because 0096
 * refuses to replay while any extra membership exists. That makes the helper
 * lossy: pair every call with restoreManagedRoleSelfGrants in the caller's
 * teardown, or the rest of the run loses the ability to SET ROLE.
 *
 * Call this only after the destructive database guard accepts the local target.
 */
export async function revokeManagedRoleMemberships(connection: QueryConnection): Promise<void> {
  const result = await connection.query<{
    granted_role: string;
    member_role: string;
    grantor_role: string;
  }>(
    `select granted.rolname as granted_role, member.rolname as member_role,
            grantor.rolname as grantor_role
     from pg_auth_members as membership
     join pg_roles as granted on granted.oid = membership.roleid
     join pg_roles as member on member.oid = membership.member
     join pg_roles as grantor on grantor.oid = membership.grantor
     where granted.rolname = any($1::text[])
       and (
         member.oid <> (select oid from pg_roles where rolname = current_user)
         or (
           membership.grantor = (select oid from pg_roles where rolname = current_user)
           and (membership.inherit_option or membership.set_option or not membership.admin_option)
         )
       )
     order by granted.rolname, member.rolname`,
    [MANAGED_ROLE_NAMES],
  );
  for (const membership of result.rows) {
    await connection.query(
      `revoke ${quoteIdentifier(membership.granted_role)} from ${quoteIdentifier(membership.member_role)} granted by ${quoteIdentifier(membership.grantor_role)}`,
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
