import { z } from "zod";

const REQUEST_ROLE_NAME = "venturecite_request";

export interface DatabaseMetadataAuditClient {
  query(statement: string): Promise<{ rows: unknown[] }>;
}

const currentRoleFields = {
  is_superuser: z.boolean(),
  inherits_privileges: z.boolean(),
  can_create_roles: z.boolean(),
  can_create_databases: z.boolean(),
  can_login: z.boolean(),
  can_replicate: z.boolean(),
  bypasses_rls: z.boolean(),
  granted_role_count: z.number().int().nonnegative(),
  member_role_count: z.number().int().nonnegative(),
  admin_option_count: z.number().int().nonnegative(),
  inherit_option_count: z.number().int().nonnegative(),
  set_option_count: z.number().int().nonnegative(),
  public_has_schema_create: z.boolean(),
};

const availableRequestRoleFields = {
  request_role_exists: z.literal(true),
  can_set_request_role: z.boolean(),
  request_role_can_login: z.boolean(),
  request_role_inherits_privileges: z.boolean(),
  request_role_is_superuser: z.boolean(),
  request_role_can_create_roles: z.boolean(),
  request_role_can_create_databases: z.boolean(),
  request_role_can_replicate: z.boolean(),
  request_role_bypasses_rls: z.boolean(),
  request_role_member_count: z.number().int().nonnegative(),
  request_role_granted_role_count: z.number().int().nonnegative(),
  request_role_has_public_schema_usage: z.boolean(),
  request_role_has_public_schema_create: z.boolean(),
  request_role_unexpected_member_count: z.number().int().nonnegative(),
  request_role_admin_option_count: z.number().int().nonnegative(),
  request_role_inherit_option_count: z.number().int().nonnegative(),
  request_role_set_option_count: z.number().int().nonnegative(),
};

const unavailableRequestRoleFields = {
  request_role_exists: z.literal(false),
  can_set_request_role: z.literal(false),
  request_role_can_login: z.null(),
  request_role_inherits_privileges: z.null(),
  request_role_is_superuser: z.null(),
  request_role_can_create_roles: z.null(),
  request_role_can_create_databases: z.null(),
  request_role_can_replicate: z.null(),
  request_role_bypasses_rls: z.null(),
  request_role_member_count: z.literal(0),
  request_role_granted_role_count: z.literal(0),
  request_role_has_public_schema_usage: z.literal(false),
  request_role_has_public_schema_create: z.literal(false),
  request_role_unexpected_member_count: z.literal(0),
  request_role_admin_option_count: z.literal(0),
  request_role_inherit_option_count: z.literal(0),
  request_role_set_option_count: z.literal(0),
};

const roleRowSchema = z.discriminatedUnion("request_role_exists", [
  z.object({ ...currentRoleFields, ...availableRequestRoleFields }),
  z.object({ ...currentRoleFields, ...unavailableRequestRoleFields }),
]);

const tableRowSchema = z.object({
  table_name: z.string(),
  relation_kind: z.enum(["table", "partitioned", "foreign"]),
  owner_is_current_role: z.boolean(),
  owner_is_superuser: z.boolean(),
  owner_bypasses_rls: z.boolean(),
  rls_enabled: z.boolean(),
  rls_forced: z.boolean(),
  policy_count: z.number().int().nonnegative(),
  select_policy_count: z.number().int().nonnegative(),
  insert_policy_count: z.number().int().nonnegative(),
  update_policy_count: z.number().int().nonnegative(),
  delete_policy_count: z.number().int().nonnegative(),
  all_command_policy_count: z.number().int().nonnegative(),
  permissive_policy_count: z.number().int().nonnegative(),
  restrictive_policy_count: z.number().int().nonnegative(),
  public_policy_count: z.number().int().nonnegative(),
  request_role_policy_count: z.number().int().nonnegative(),
  other_role_policy_count: z.number().int().nonnegative(),
  table_privilege_count: z.number().int().nonnegative(),
  public_table_privilege_count: z.number().int().nonnegative(),
  current_role_table_privilege_count: z.number().int().nonnegative(),
  request_role_table_privilege_count: z.number().int().nonnegative(),
  other_role_table_privilege_count: z.number().int().nonnegative(),
  column_privilege_count: z.number().int().nonnegative(),
  public_column_privilege_count: z.number().int().nonnegative(),
  current_role_column_privilege_count: z.number().int().nonnegative(),
  request_role_column_privilege_count: z.number().int().nonnegative(),
  other_role_column_privilege_count: z.number().int().nonnegative(),
});

const viewRowSchema = z.object({
  view_count: z.number().int().nonnegative(),
  ordinary_view_count: z.number().int().nonnegative(),
  materialized_view_count: z.number().int().nonnegative(),
  security_invoker_view_count: z.number().int().nonnegative(),
  security_definer_view_count: z.number().int().nonnegative(),
  security_barrier_view_count: z.number().int().nonnegative(),
  owner_superuser_view_count: z.number().int().nonnegative(),
  owner_bypass_rls_view_count: z.number().int().nonnegative(),
  public_selectable_view_count: z.number().int().nonnegative(),
  request_role_selectable_view_count: z.number().int().nonnegative(),
});

const functionRowSchema = z.object({
  schema_scope: z.enum(["public", "private"]),
  function_count: z.number().int().nonnegative(),
  security_definer_function_count: z.number().int().nonnegative(),
  owner_superuser_function_count: z.number().int().nonnegative(),
  owner_bypass_rls_function_count: z.number().int().nonnegative(),
  public_executable_function_count: z.number().int().nonnegative(),
  request_role_executable_function_count: z.number().int().nonnegative(),
  public_security_definer_function_count: z.number().int().nonnegative(),
  request_role_security_definer_function_count: z.number().int().nonnegative(),
  security_definer_without_search_path_count: z.number().int().nonnegative(),
});

const brandOwnerRowSchema = z.object({
  missing_owner_count: z.number().int().nonnegative(),
  unknown_owner_count: z.number().int().nonnegative(),
});

export type DatabaseMetadataAuditReport = Awaited<ReturnType<typeof runDatabaseMetadataAudit>>;

const ROLE_QUERY = `
  WITH current_login_role AS (
    SELECT role.*
    FROM pg_roles AS role
    WHERE role.rolname = current_user
  ),
  request_role AS (
    SELECT role.*
    FROM pg_roles AS role
    WHERE role.rolname = '${REQUEST_ROLE_NAME}'
  )
  SELECT
    current_login_role.rolsuper AS is_superuser,
    current_login_role.rolinherit AS inherits_privileges,
    current_login_role.rolcreaterole AS can_create_roles,
    current_login_role.rolcreatedb AS can_create_databases,
    current_login_role.rolcanlogin AS can_login,
    current_login_role.rolreplication AS can_replicate,
    current_login_role.rolbypassrls AS bypasses_rls,
    (SELECT count(*)::int FROM pg_auth_members WHERE member = current_login_role.oid)
      AS granted_role_count,
    (SELECT count(*)::int FROM pg_auth_members WHERE roleid = current_login_role.oid)
      AS member_role_count,
    (SELECT count(*)::int FROM pg_auth_members
      WHERE member = current_login_role.oid AND admin_option)
      AS admin_option_count,
    (SELECT count(*)::int FROM pg_auth_members
      WHERE member = current_login_role.oid AND inherit_option)
      AS inherit_option_count,
    (SELECT count(*)::int FROM pg_auth_members
      WHERE member = current_login_role.oid AND set_option)
      AS set_option_count,
    EXISTS (
      SELECT 1
      FROM pg_namespace AS namespace
      CROSS JOIN LATERAL aclexplode(
        coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
      ) AS privilege
      WHERE namespace.nspname = 'public'
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'CREATE'
    ) AS public_has_schema_create,
    (request_role.oid IS NOT NULL) AS request_role_exists,
    COALESCE(pg_has_role(current_login_role.oid, request_role.oid, 'SET'), false)
      AS can_set_request_role,
    request_role.rolcanlogin AS request_role_can_login,
    request_role.rolinherit AS request_role_inherits_privileges,
    request_role.rolsuper AS request_role_is_superuser,
    request_role.rolcreaterole AS request_role_can_create_roles,
    request_role.rolcreatedb AS request_role_can_create_databases,
    request_role.rolreplication AS request_role_can_replicate,
    request_role.rolbypassrls AS request_role_bypasses_rls,
    COALESCE((SELECT count(*)::int FROM pg_auth_members
      WHERE roleid = request_role.oid), 0) AS request_role_member_count,
    COALESCE((SELECT count(*)::int FROM pg_auth_members
      WHERE member = request_role.oid), 0) AS request_role_granted_role_count,
    COALESCE(has_schema_privilege(request_role.oid, 'public', 'USAGE'), false)
      AS request_role_has_public_schema_usage,
    COALESCE(has_schema_privilege(request_role.oid, 'public', 'CREATE'), false)
      AS request_role_has_public_schema_create,
    COALESCE((SELECT count(*)::int FROM pg_auth_members
      WHERE roleid = request_role.oid AND member <> current_login_role.oid), 0)
      AS request_role_unexpected_member_count,
    COALESCE((SELECT count(*)::int FROM pg_auth_members
      WHERE roleid = request_role.oid AND admin_option), 0)
      AS request_role_admin_option_count,
    COALESCE((SELECT count(*)::int FROM pg_auth_members
      WHERE roleid = request_role.oid AND inherit_option), 0)
      AS request_role_inherit_option_count,
    COALESCE((SELECT count(*)::int FROM pg_auth_members
      WHERE roleid = request_role.oid AND set_option), 0)
      AS request_role_set_option_count
  FROM current_login_role
  LEFT JOIN request_role ON true
`;

const TABLE_QUERY = `
  WITH request_role AS (
    SELECT oid FROM pg_roles WHERE rolname = '${REQUEST_ROLE_NAME}'
  )
  SELECT
    relation.relname AS table_name,
    CASE relation.relkind
      WHEN 'r' THEN 'table'
      WHEN 'p' THEN 'partitioned'
      WHEN 'f' THEN 'foreign'
    END AS relation_kind,
    relation.relowner = current_user::regrole::oid AS owner_is_current_role,
    owner.rolsuper AS owner_is_superuser,
    owner.rolbypassrls AS owner_bypasses_rls,
    relation.relrowsecurity AS rls_enabled,
    relation.relforcerowsecurity AS rls_forced,
    policy_summary.policy_count,
    policy_summary.select_policy_count,
    policy_summary.insert_policy_count,
    policy_summary.update_policy_count,
    policy_summary.delete_policy_count,
    policy_summary.all_command_policy_count,
    policy_summary.permissive_policy_count,
    policy_summary.restrictive_policy_count,
    policy_summary.public_policy_count,
    policy_summary.request_role_policy_count,
    policy_summary.other_role_policy_count,
    table_grants.table_privilege_count,
    table_grants.public_table_privilege_count,
    table_grants.current_role_table_privilege_count,
    table_grants.request_role_table_privilege_count,
    table_grants.other_role_table_privilege_count,
    column_grants.column_privilege_count,
    column_grants.public_column_privilege_count,
    column_grants.current_role_column_privilege_count,
    column_grants.request_role_column_privilege_count,
    column_grants.other_role_column_privilege_count
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_roles AS owner ON owner.oid = relation.relowner
  LEFT JOIN request_role ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS policy_count,
      count(*) FILTER (WHERE policy.polcmd = 'r')::int AS select_policy_count,
      count(*) FILTER (WHERE policy.polcmd = 'a')::int AS insert_policy_count,
      count(*) FILTER (WHERE policy.polcmd = 'w')::int AS update_policy_count,
      count(*) FILTER (WHERE policy.polcmd = 'd')::int AS delete_policy_count,
      count(*) FILTER (WHERE policy.polcmd = '*')::int AS all_command_policy_count,
      count(*) FILTER (WHERE policy.polpermissive)::int AS permissive_policy_count,
      count(*) FILTER (WHERE NOT policy.polpermissive)::int AS restrictive_policy_count,
      count(*) FILTER (WHERE 0::oid = ANY(policy.polroles))::int AS public_policy_count,
      count(*) FILTER (
        WHERE request_role.oid IS NOT NULL AND request_role.oid = ANY(policy.polroles)
      )::int AS request_role_policy_count,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM unnest(policy.polroles) AS policy_role(oid)
          WHERE policy_role.oid <> 0
            AND policy_role.oid <> current_user::regrole::oid
            AND policy_role.oid IS DISTINCT FROM request_role.oid
        )
      )::int AS other_role_policy_count
    FROM pg_policy AS policy
    WHERE policy.polrelid = relation.oid
  ) AS policy_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS table_privilege_count,
      count(*) FILTER (WHERE privilege.grantee = 0)::int
        AS public_table_privilege_count,
      count(*) FILTER (WHERE privilege.grantee = current_user::regrole::oid)::int
        AS current_role_table_privilege_count,
      count(*) FILTER (WHERE privilege.grantee = request_role.oid)::int
        AS request_role_table_privilege_count,
      count(*) FILTER (
        WHERE privilege.grantee <> 0
          AND privilege.grantee <> current_user::regrole::oid
          AND privilege.grantee IS DISTINCT FROM request_role.oid
      )::int AS other_role_table_privilege_count
    FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS privilege
  ) AS table_grants ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS column_privilege_count,
      count(*) FILTER (WHERE privilege.grantee = 0)::int
        AS public_column_privilege_count,
      count(*) FILTER (WHERE privilege.grantee = current_user::regrole::oid)::int
        AS current_role_column_privilege_count,
      count(*) FILTER (WHERE privilege.grantee = request_role.oid)::int
        AS request_role_column_privilege_count,
      count(*) FILTER (
        WHERE privilege.grantee <> 0
          AND privilege.grantee <> current_user::regrole::oid
          AND privilege.grantee IS DISTINCT FROM request_role.oid
      )::int AS other_role_column_privilege_count
    FROM pg_attribute AS attribute
    CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege
    WHERE attribute.attrelid = relation.oid
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) AS column_grants ON true
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p', 'f')
  ORDER BY relation.relname
`;

const VIEW_QUERY = `
  WITH request_role AS (
    SELECT oid FROM pg_roles WHERE rolname = '${REQUEST_ROLE_NAME}'
  ),
  views AS (
    SELECT
      relation.relkind,
      owner.rolsuper AS owner_is_superuser,
      owner.rolbypassrls AS owner_bypasses_rls,
      EXISTS (
        SELECT 1 FROM unnest(coalesce(relation.reloptions, ARRAY[]::text[])) AS option(value)
        WHERE option.value IN ('security_invoker=true', 'security_invoker=on')
      ) AS is_security_invoker,
      EXISTS (
        SELECT 1 FROM unnest(coalesce(relation.reloptions, ARRAY[]::text[])) AS option(value)
        WHERE option.value IN ('security_barrier=true', 'security_barrier=on')
      ) AS is_security_barrier,
      EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS privilege
        WHERE privilege.grantee = 0 AND privilege.privilege_type = 'SELECT'
      ) AS is_public_selectable,
      EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS privilege
        WHERE privilege.grantee = request_role.oid AND privilege.privilege_type = 'SELECT'
      ) AS is_request_role_selectable
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles AS owner ON owner.oid = relation.relowner
    LEFT JOIN request_role ON true
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('v', 'm')
  )
  SELECT
    count(*)::int AS view_count,
    count(*) FILTER (WHERE relkind = 'v')::int AS ordinary_view_count,
    count(*) FILTER (WHERE relkind = 'm')::int AS materialized_view_count,
    count(*) FILTER (WHERE relkind = 'v' AND is_security_invoker)::int
      AS security_invoker_view_count,
    count(*) FILTER (WHERE relkind = 'v' AND NOT is_security_invoker)::int
      AS security_definer_view_count,
    count(*) FILTER (WHERE is_security_barrier)::int AS security_barrier_view_count,
    count(*) FILTER (WHERE owner_is_superuser)::int AS owner_superuser_view_count,
    count(*) FILTER (WHERE owner_bypasses_rls)::int AS owner_bypass_rls_view_count,
    count(*) FILTER (WHERE is_public_selectable)::int AS public_selectable_view_count,
    count(*) FILTER (WHERE is_request_role_selectable)::int
      AS request_role_selectable_view_count
  FROM views
`;

const FUNCTION_QUERY = `
  WITH schema_scopes AS (
    SELECT scope FROM (VALUES ('public'), ('private')) AS configured_scope(scope)
  ),
  request_role AS (
    SELECT oid FROM pg_roles WHERE rolname = '${REQUEST_ROLE_NAME}'
  ),
  functions AS (
    SELECT
      namespace.nspname AS schema_scope,
      procedure.prosecdef AS is_security_definer,
      owner.rolsuper AS owner_is_superuser,
      owner.rolbypassrls AS owner_bypasses_rls,
      EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
        WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
      ) AS is_public_executable,
      EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
        WHERE privilege.grantee = request_role.oid AND privilege.privilege_type = 'EXECUTE'
      ) AS is_request_role_executable,
      EXISTS (
        SELECT 1
        FROM unnest(coalesce(procedure.proconfig, ARRAY[]::text[])) AS setting(value)
        WHERE setting.value LIKE 'search_path=%'
      ) AS has_explicit_search_path
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    LEFT JOIN request_role ON true
    WHERE namespace.nspname IN ('public', 'private') AND procedure.prokind IN ('f', 'p')
  )
  SELECT
    schema_scopes.scope AS schema_scope,
    count(functions.schema_scope)::int AS function_count,
    count(*) FILTER (WHERE is_security_definer)::int AS security_definer_function_count,
    count(*) FILTER (WHERE owner_is_superuser)::int AS owner_superuser_function_count,
    count(*) FILTER (WHERE owner_bypasses_rls)::int AS owner_bypass_rls_function_count,
    count(*) FILTER (WHERE is_public_executable)::int AS public_executable_function_count,
    count(*) FILTER (WHERE is_request_role_executable)::int
      AS request_role_executable_function_count,
    count(*) FILTER (WHERE is_security_definer AND is_public_executable)::int
      AS public_security_definer_function_count,
    count(*) FILTER (WHERE is_security_definer AND is_request_role_executable)::int
      AS request_role_security_definer_function_count,
    count(*) FILTER (WHERE is_security_definer AND NOT has_explicit_search_path)::int
      AS security_definer_without_search_path_count
  FROM schema_scopes
  LEFT JOIN functions ON functions.schema_scope = schema_scopes.scope
  GROUP BY schema_scopes.scope
  ORDER BY schema_scopes.scope DESC
`;

const BRAND_OWNER_QUERY = `
  SELECT
    count(*) FILTER (WHERE brands.user_id IS NULL)::int AS missing_owner_count,
    count(*) FILTER (WHERE brands.user_id IS NOT NULL AND users.id IS NULL)::int
      AS unknown_owner_count
  FROM public.brands AS brands
  LEFT JOIN public.users AS users ON users.id = brands.user_id
`;

function getOnlyRow(rows: unknown[], queryName: string): unknown {
  if (rows.length !== 1) {
    throw new Error(`The ${queryName} query returned ${rows.length} rows instead of one`);
  }
  return rows[0];
}

function mapPrivilegeSummary(row: z.infer<typeof tableRowSchema>, prefix: "table" | "column") {
  const values =
    prefix === "table"
      ? {
          total: row.table_privilege_count,
          public: row.public_table_privilege_count,
          currentRole: row.current_role_table_privilege_count,
          requestRole: row.request_role_table_privilege_count,
          otherRoles: row.other_role_table_privilege_count,
        }
      : {
          total: row.column_privilege_count,
          public: row.public_column_privilege_count,
          currentRole: row.current_role_column_privilege_count,
          requestRole: row.request_role_column_privilege_count,
          otherRoles: row.other_role_column_privilege_count,
        };
  return values;
}

function mapFunctionSummary(row: z.infer<typeof functionRowSchema>) {
  return {
    total: row.function_count,
    securityDefiner: row.security_definer_function_count,
    ownedBySuperuser: row.owner_superuser_function_count,
    ownedByRlsBypassRole: row.owner_bypass_rls_function_count,
    publicExecutable: row.public_executable_function_count,
    requestRoleExecutable: row.request_role_executable_function_count,
    publicSecurityDefiner: row.public_security_definer_function_count,
    requestRoleSecurityDefiner: row.request_role_security_definer_function_count,
    securityDefinerWithoutSearchPath: row.security_definer_without_search_path_count,
  };
}

export async function runDatabaseMetadataAudit(client: DatabaseMetadataAuditClient) {
  await client.query("BEGIN READ ONLY");

  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    const roleResult = await client.query(ROLE_QUERY);
    const tableResult = await client.query(TABLE_QUERY);
    const viewResult = await client.query(VIEW_QUERY);
    const functionResult = await client.query(FUNCTION_QUERY);
    const brandOwnerResult = await client.query(BRAND_OWNER_QUERY);

    const role = roleRowSchema.parse(getOnlyRow(roleResult.rows, "role"));
    const tableRows = z.array(tableRowSchema).parse(tableResult.rows);
    const views = viewRowSchema.parse(getOnlyRow(viewResult.rows, "view"));
    const functionRows = z.array(functionRowSchema).length(2).parse(functionResult.rows);
    const publicFunctions = functionRows.find((row) => row.schema_scope === "public");
    const privateFunctions = functionRows.find((row) => row.schema_scope === "private");
    if (!publicFunctions || !privateFunctions) {
      throw new Error("The function query did not return both configured schema summaries");
    }
    const brandOwners = brandOwnerRowSchema.parse(getOnlyRow(brandOwnerResult.rows, "brand owner"));
    const usersTable = tableRows.find((table) => table.table_name === "users");
    const brandsTable = tableRows.find((table) => table.table_name === "brands");

    const requestRole = role.request_role_exists
      ? {
          kind: "available" as const,
          canSetRole: role.can_set_request_role,
          canLogin: role.request_role_can_login,
          inheritsPrivileges: role.request_role_inherits_privileges,
          isSuperuser: role.request_role_is_superuser,
          canCreateRoles: role.request_role_can_create_roles,
          canCreateDatabases: role.request_role_can_create_databases,
          canReplicate: role.request_role_can_replicate,
          bypassesRls: role.request_role_bypasses_rls,
          memberCount: role.request_role_member_count,
          grantedRoleCount: role.request_role_granted_role_count,
          hasPublicSchemaUsage: role.request_role_has_public_schema_usage,
          hasPublicSchemaCreate: role.request_role_has_public_schema_create,
          unexpectedMemberCount: role.request_role_unexpected_member_count,
          adminOptionCount: role.request_role_admin_option_count,
          inheritOptionCount: role.request_role_inherit_option_count,
          setOptionCount: role.request_role_set_option_count,
        }
      : { kind: "unavailable" as const };

    return {
      summary: {
        relationCount: tableRows.length,
        rlsEnabledCount: tableRows.filter((table) => table.rls_enabled).length,
        rlsForcedCount: tableRows.filter((table) => table.rls_forced).length,
        ownerBypassRlsCount: tableRows.filter((table) => table.owner_bypasses_rls).length,
        publicTableGrantCount: tableRows.reduce(
          (total, table) => total + table.public_table_privilege_count,
          0,
        ),
        publicColumnGrantCount: tableRows.reduce(
          (total, table) => total + table.public_column_privilege_count,
          0,
        ),
        requestRoleTableGrantCount: tableRows.reduce(
          (total, table) => total + table.request_role_table_privilege_count,
          0,
        ),
        requestRoleColumnGrantCount: tableRows.reduce(
          (total, table) => total + table.request_role_column_privilege_count,
          0,
        ),
        usersRlsEnabled: usersTable?.rls_enabled ?? null,
        usersRlsForced: usersTable?.rls_forced ?? null,
        usersPolicyCount: usersTable?.policy_count ?? null,
        brandsRlsEnabled: brandsTable?.rls_enabled ?? null,
        brandsRlsForced: brandsTable?.rls_forced ?? null,
        brandsPolicyCount: brandsTable?.policy_count ?? null,
      },
      currentRole: {
        isSuperuser: role.is_superuser,
        inheritsPrivileges: role.inherits_privileges,
        canCreateRoles: role.can_create_roles,
        canCreateDatabases: role.can_create_databases,
        canLogin: role.can_login,
        canReplicate: role.can_replicate,
        bypassesRls: role.bypasses_rls,
        grantedRoleCount: role.granted_role_count,
        memberRoleCount: role.member_role_count,
        adminOptionCount: role.admin_option_count,
        inheritOptionCount: role.inherit_option_count,
        setOptionCount: role.set_option_count,
        publicHasSchemaCreate: role.public_has_schema_create,
      },
      requestRole,
      tables: tableRows.map((table) => ({
        name: table.table_name,
        kind: table.relation_kind,
        owner: {
          isCurrentRole: table.owner_is_current_role,
          isSuperuser: table.owner_is_superuser,
          bypassesRls: table.owner_bypasses_rls,
        },
        rls: { enabled: table.rls_enabled, forced: table.rls_forced },
        policies: {
          total: table.policy_count,
          select: table.select_policy_count,
          insert: table.insert_policy_count,
          update: table.update_policy_count,
          delete: table.delete_policy_count,
          allCommands: table.all_command_policy_count,
          permissive: table.permissive_policy_count,
          restrictive: table.restrictive_policy_count,
          public: table.public_policy_count,
          requestRole: table.request_role_policy_count,
          otherRoles: table.other_role_policy_count,
        },
        tablePrivileges: mapPrivilegeSummary(table, "table"),
        columnPrivileges: mapPrivilegeSummary(table, "column"),
      })),
      views: {
        total: views.view_count,
        ordinary: views.ordinary_view_count,
        materialized: views.materialized_view_count,
        securityInvoker: views.security_invoker_view_count,
        securityDefiner: views.security_definer_view_count,
        securityBarrier: views.security_barrier_view_count,
        ownedBySuperuser: views.owner_superuser_view_count,
        ownedByRlsBypassRole: views.owner_bypass_rls_view_count,
        publicSelectable: views.public_selectable_view_count,
        requestRoleSelectable: views.request_role_selectable_view_count,
      },
      functions: {
        public: mapFunctionSummary(publicFunctions),
        private: mapFunctionSummary(privateFunctions),
      },
      brandOwners: {
        missing: brandOwners.missing_owner_count,
        unknown: brandOwners.unknown_owner_count,
        invalid: brandOwners.missing_owner_count + brandOwners.unknown_owner_count,
      },
    };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
  }
}
