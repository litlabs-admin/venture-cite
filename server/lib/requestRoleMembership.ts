export const REQUEST_ROLE_MEMBERSHIP_CONFIRMATION = "venturecite-production";

const restrictedRoles = [
  "venturecite_request",
  "venturecite_content_request",
  "venturecite_outbox_worker",
] as const;
const roleIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

type RoleAttributes = {
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
  rolinherit: boolean;
};

type RestrictedRoleAttributes = RoleAttributes & { rolname: string };

type Membership = {
  role_name: string;
  member_name: string;
  grantor_name: string;
  inherit_option: boolean;
  set_option: boolean;
  admin_option: boolean;
};

type DatabaseIdentity = {
  database_name: string;
  system_identifier: string;
};

type DirectRoleAttributes = {
  direct_role_name: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
  has_request_admin: boolean;
  has_content_request_admin: boolean;
  has_outbox_worker_admin: boolean;
};

export type RequestRoleMembershipClient = {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export type RequestRoleMembershipMode = "dry-run" | "apply";

export type RequestRoleMembershipResult = {
  mode: RequestRoleMembershipMode;
  changed: boolean;
};

export function validateRuntimeRoleName(value: string): string {
  if (!roleIdentifierPattern.test(value)) {
    throw new Error("DATABASE_RUNTIME_ROLE_NAME must be a valid PostgreSQL identifier");
  }
  return value;
}

function quoteRoleIdentifier(roleName: string): string {
  return `"${roleName}"`;
}

function assertRuntimeRole(rows: RoleAttributes[]): void {
  const role = rows[0];
  if (
    !role ||
    !role.rolcanlogin ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreaterole ||
    role.rolcreatedb ||
    role.rolreplication ||
    role.rolinherit
  ) {
    throw new Error("The runtime database role has unsafe attributes");
  }
}

function assertRestrictedRoles(rows: RestrictedRoleAttributes[]): void {
  if (
    rows.length !== restrictedRoles.length ||
    rows.some(
      (role) =>
        !restrictedRoles.includes(role.rolname as (typeof restrictedRoles)[number]) ||
        role.rolcanlogin ||
        role.rolsuper ||
        role.rolbypassrls ||
        role.rolcreaterole ||
        role.rolcreatedb ||
        role.rolreplication ||
        role.rolinherit,
    )
  ) {
    throw new Error("A restricted request role has unsafe attributes");
  }
}

function assertDirectRole(rows: DirectRoleAttributes[]): string {
  const role = rows[0];
  if (
    !role ||
    !role.direct_role_name ||
    (!role.rolsuper &&
      (!role.rolcreaterole ||
        !role.has_request_admin ||
        !role.has_content_request_admin ||
        !role.has_outbox_worker_admin))
  ) {
    throw new Error("The direct database role cannot administer restricted role grants");
  }
  return role.direct_role_name;
}

function assertAuditedMembership(
  rows: Membership[],
  runtimeRoleName: string,
  directRoleName: string,
): void {
  if (runtimeRoleName === directRoleName) {
    throw new Error("The runtime role must differ from the direct database role");
  }

  const directCounts = new Map<string, number>();
  const directSelfGrantCounts = new Map<string, number>();
  const runtimeCounts = new Map<string, number>();
  for (const membership of rows) {
    if (!restrictedRoles.includes(membership.role_name as (typeof restrictedRoles)[number])) {
      throw new Error("The runtime role has an unexpected membership");
    }

    if (membership.member_name === directRoleName) {
      if (membership.grantor_name === directRoleName) {
        if (membership.inherit_option || !membership.set_option || membership.admin_option) {
          throw new Error("The restricted role membership does not match the release policy");
        }
        directSelfGrantCounts.set(
          membership.role_name,
          (directSelfGrantCounts.get(membership.role_name) ?? 0) + 1,
        );
      } else {
        if (membership.inherit_option || membership.set_option || !membership.admin_option) {
          throw new Error("The restricted role membership does not match the release policy");
        }
        directCounts.set(membership.role_name, (directCounts.get(membership.role_name) ?? 0) + 1);
      }
      continue;
    }

    if (membership.member_name === runtimeRoleName) {
      if (membership.inherit_option || !membership.set_option || membership.admin_option) {
        throw new Error("The runtime role has an unexpected membership");
      }
      runtimeCounts.set(membership.role_name, (runtimeCounts.get(membership.role_name) ?? 0) + 1);
      continue;
    }

    throw new Error("The runtime role has an unexpected membership");
  }

  if (
    restrictedRoles.some(
      (roleName) =>
        directCounts.get(roleName) !== 1 ||
        (directSelfGrantCounts.get(roleName) ?? 0) > 1 ||
        (runtimeCounts.get(roleName) ?? 0) > 1,
    )
  ) {
    throw new Error("The restricted role membership does not match the release policy");
  }
}

function assertExactMembership(
  rows: Membership[],
  runtimeRoleName: string,
  directRoleName: string,
): void {
  assertAuditedMembership(rows, runtimeRoleName, directRoleName);
  if (
    rows.length < restrictedRoles.length * 2 ||
    rows.length > restrictedRoles.length * 3 ||
    restrictedRoles.some(
      (roleName) =>
        rows.some(
          (membership) =>
            membership.role_name === roleName && membership.member_name === runtimeRoleName,
        ) === false,
    )
  ) {
    throw new Error("The restricted role membership does not match the release policy");
  }
}

async function withReadOnlyTransaction<T>(
  client: RequestRoleMembershipClient,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN READ ONLY");
  try {
    const result = await work();
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verifyRuntimeConnection({
  runtime,
  runtimeRoleName,
}: {
  runtime: RequestRoleMembershipClient;
  runtimeRoleName: string;
}): Promise<DatabaseIdentity> {
  return withReadOnlyTransaction(runtime, async () => {
    const result = await runtime.query<{
      current_user: string;
      database_name: string;
      system_identifier: string;
    }>(
      "SELECT current_user, current_database() AS database_name, (pg_control_system()).system_identifier::text AS system_identifier",
    );
    if (result.rows[0]?.current_user !== runtimeRoleName) {
      throw new Error("DATABASE_URL does not connect as DATABASE_RUNTIME_ROLE_NAME");
    }
    const identity = result.rows[0];
    if (!identity?.database_name || !identity.system_identifier) {
      throw new Error("The runtime database identity is unavailable");
    }
    return identity;
  });
}

async function verifyDatabaseIdentity({
  direct,
  runtimeIdentity,
}: {
  direct: RequestRoleMembershipClient;
  runtimeIdentity: DatabaseIdentity;
}): Promise<void> {
  const result = await direct.query<DatabaseIdentity>(
    "SELECT current_database() AS database_name, (pg_control_system()).system_identifier::text AS system_identifier",
  );
  const directIdentity = result.rows[0];
  if (
    !directIdentity?.database_name ||
    !directIdentity.system_identifier ||
    directIdentity.database_name !== runtimeIdentity.database_name ||
    directIdentity.system_identifier !== runtimeIdentity.system_identifier
  ) {
    throw new Error("DATABASE_URL and DATABASE_DIRECT_URL target different databases");
  }
}

async function verifyRoles({
  direct,
  runtimeRoleName,
}: {
  direct: RequestRoleMembershipClient;
  runtimeRoleName: string;
}): Promise<string> {
  const server = await direct.query<{ server_version_num: string }>("SHOW server_version_num");
  if (Number(server.rows[0]?.server_version_num) < 170000) {
    throw new Error("PostgreSQL 17 or later is required for request role membership");
  }
  const directRole = await direct.query<DirectRoleAttributes>(
    `SELECT current_user AS direct_role_name, role.rolsuper, role.rolcreaterole,
      EXISTS (SELECT 1 FROM pg_auth_members AS membership JOIN pg_roles AS granted ON granted.oid = membership.roleid WHERE membership.member = role.oid AND granted.rolname = 'venturecite_request' AND membership.admin_option) AS has_request_admin,
      EXISTS (SELECT 1 FROM pg_auth_members AS membership JOIN pg_roles AS granted ON granted.oid = membership.roleid WHERE membership.member = role.oid AND granted.rolname = 'venturecite_content_request' AND membership.admin_option) AS has_content_request_admin,
      EXISTS (SELECT 1 FROM pg_auth_members AS membership JOIN pg_roles AS granted ON granted.oid = membership.roleid WHERE membership.member = role.oid AND granted.rolname = 'venturecite_outbox_worker' AND membership.admin_option) AS has_outbox_worker_admin
     FROM pg_roles AS role WHERE role.rolname = current_user`,
  );
  const directRoleName = assertDirectRole(directRole.rows);
  const runtimeRole = await direct.query<RoleAttributes>(
    "SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolinherit FROM pg_roles WHERE rolname = $1",
    [runtimeRoleName],
  );
  assertRuntimeRole(runtimeRole.rows);

  const roles = await direct.query<RestrictedRoleAttributes>(
    "SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolinherit FROM pg_roles WHERE rolname = ANY($1)",
    [restrictedRoles],
  );
  assertRestrictedRoles(roles.rows);
  return directRoleName;
}

async function verifyMembership({
  direct,
  runtimeRoleName,
  directRoleName,
}: {
  direct: RequestRoleMembershipClient;
  runtimeRoleName: string;
  directRoleName: string;
}): Promise<void> {
  const memberships = await direct.query<Membership>(
    `SELECT granted.rolname AS role_name, member.rolname AS member_name, grantor.rolname AS grantor_name, membership.inherit_option, membership.set_option, membership.admin_option
     FROM pg_auth_members AS membership
     JOIN pg_roles AS granted ON granted.oid = membership.roleid
     JOIN pg_roles AS member ON member.oid = membership.member
     JOIN pg_roles AS grantor ON grantor.oid = membership.grantor
     WHERE granted.rolname = ANY($1) OR member.rolname = ANY($1) OR member.rolname = $2
     ORDER BY granted.rolname, member.rolname`,
    [restrictedRoles, runtimeRoleName],
  );
  assertExactMembership(memberships.rows, runtimeRoleName, directRoleName);
}

async function auditMembership({
  direct,
  runtimeRoleName,
  directRoleName,
}: {
  direct: RequestRoleMembershipClient;
  runtimeRoleName: string;
  directRoleName: string;
}): Promise<void> {
  const memberships = await direct.query<Membership>(
    `SELECT granted.rolname AS role_name, member.rolname AS member_name, grantor.rolname AS grantor_name, membership.inherit_option, membership.set_option, membership.admin_option
     FROM pg_auth_members AS membership
     JOIN pg_roles AS granted ON granted.oid = membership.roleid
     JOIN pg_roles AS member ON member.oid = membership.member
     JOIN pg_roles AS grantor ON grantor.oid = membership.grantor
     WHERE granted.rolname = ANY($1) OR member.rolname = ANY($1) OR member.rolname = $2
     ORDER BY granted.rolname, member.rolname`,
    [restrictedRoles, runtimeRoleName],
  );
  assertAuditedMembership(memberships.rows, runtimeRoleName, directRoleName);
}

export async function runRequestRoleMembership({
  confirmation,
  direct,
  mode,
  runtime,
  runtimeRoleName: rawRuntimeRoleName,
}: {
  confirmation?: string;
  direct: RequestRoleMembershipClient;
  mode: RequestRoleMembershipMode;
  runtime: RequestRoleMembershipClient;
  runtimeRoleName: string;
}): Promise<RequestRoleMembershipResult> {
  if (mode === "apply" && confirmation !== REQUEST_ROLE_MEMBERSHIP_CONFIRMATION) {
    throw new Error("Production request role membership requires confirmation");
  }
  const runtimeRoleName = validateRuntimeRoleName(rawRuntimeRoleName);
  const runtimeIdentity = await verifyRuntimeConnection({ runtime, runtimeRoleName });

  if (mode === "dry-run") {
    await withReadOnlyTransaction(direct, async () => {
      await verifyDatabaseIdentity({ direct, runtimeIdentity });
      const directRoleName = await verifyRoles({ direct, runtimeRoleName });
      await auditMembership({ direct, runtimeRoleName, directRoleName });
    });
    return { mode, changed: false };
  }

  await direct.query("BEGIN");
  try {
    await verifyDatabaseIdentity({ direct, runtimeIdentity });
    const directRoleName = await verifyRoles({ direct, runtimeRoleName });
    await auditMembership({ direct, runtimeRoleName, directRoleName });
    await direct.query(
      `GRANT venturecite_request, venturecite_content_request, venturecite_outbox_worker TO ${quoteRoleIdentifier(runtimeRoleName)} WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`,
    );
    await verifyMembership({ direct, runtimeRoleName, directRoleName });
    await direct.query("COMMIT");
  } catch (error) {
    await direct.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return { mode, changed: true };
}
