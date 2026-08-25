import { describe, expect, it } from "vitest";
import { runDatabaseMetadataAudit } from "../../server/lib/databaseMetadataAudit";

type QueryResult = { rows: unknown[] };

function createAuditClient(results: QueryResult[]) {
  const statements: string[] = [];
  let resultIndex = 0;

  return {
    statements,
    client: {
      async query(statement: string): Promise<QueryResult> {
        statements.push(statement);
        if (/^(BEGIN|SET LOCAL|ROLLBACK)/.test(statement)) return { rows: [] };

        const result = results[resultIndex];
        resultIndex += 1;
        if (!result) throw new Error("The test has no query result for this statement");
        return result;
      },
    },
  };
}

const roleRows = [
  {
    is_superuser: false,
    inherits_privileges: false,
    can_create_roles: false,
    can_create_databases: false,
    can_login: true,
    can_replicate: false,
    bypasses_rls: false,
    granted_role_count: 1,
    member_role_count: 0,
    admin_option_count: 0,
    inherit_option_count: 1,
    set_option_count: 1,
    public_has_schema_create: false,
    request_role_exists: true,
    can_set_request_role: true,
    request_role_can_login: false,
    request_role_inherits_privileges: false,
    request_role_is_superuser: false,
    request_role_can_create_roles: false,
    request_role_can_create_databases: false,
    request_role_can_replicate: false,
    request_role_bypasses_rls: false,
    request_role_member_count: 1,
    request_role_granted_role_count: 0,
    request_role_has_public_schema_usage: true,
    request_role_has_public_schema_create: false,
    request_role_unexpected_member_count: 0,
    request_role_admin_option_count: 0,
    request_role_inherit_option_count: 0,
    request_role_set_option_count: 1,
    secret_role_name: "must-not-leave-the-boundary",
  },
];

const tableRows = [
  {
    table_name: "brands",
    relation_kind: "table",
    owner_is_current_role: true,
    owner_is_superuser: false,
    owner_bypasses_rls: false,
    rls_enabled: true,
    rls_forced: false,
    policy_count: 4,
    select_policy_count: 1,
    insert_policy_count: 1,
    update_policy_count: 1,
    delete_policy_count: 1,
    all_command_policy_count: 0,
    permissive_policy_count: 4,
    restrictive_policy_count: 0,
    public_policy_count: 0,
    request_role_policy_count: 4,
    other_role_policy_count: 0,
    table_privilege_count: 9,
    public_table_privilege_count: 0,
    current_role_table_privilege_count: 7,
    request_role_table_privilege_count: 2,
    other_role_table_privilege_count: 0,
    column_privilege_count: 12,
    public_column_privilege_count: 0,
    current_role_column_privilege_count: 0,
    request_role_column_privilege_count: 12,
    other_role_column_privilege_count: 0,
  },
];

const viewRows = [
  {
    view_count: 3,
    ordinary_view_count: 2,
    materialized_view_count: 1,
    security_invoker_view_count: 1,
    security_definer_view_count: 1,
    security_barrier_view_count: 0,
    owner_superuser_view_count: 1,
    owner_bypass_rls_view_count: 1,
    public_selectable_view_count: 0,
    request_role_selectable_view_count: 0,
  },
];

const functionRows = [
  {
    schema_scope: "public",
    function_count: 8,
    security_definer_function_count: 2,
    owner_superuser_function_count: 3,
    owner_bypass_rls_function_count: 3,
    public_executable_function_count: 5,
    request_role_executable_function_count: 0,
    public_security_definer_function_count: 1,
    request_role_security_definer_function_count: 0,
    security_definer_without_search_path_count: 1,
  },
  {
    schema_scope: "private",
    function_count: 2,
    security_definer_function_count: 2,
    owner_superuser_function_count: 2,
    owner_bypass_rls_function_count: 2,
    public_executable_function_count: 0,
    request_role_executable_function_count: 0,
    public_security_definer_function_count: 0,
    request_role_security_definer_function_count: 0,
    security_definer_without_search_path_count: 0,
  },
];

const brandOwnerRows = [
  {
    missing_owner_count: 2,
    unknown_owner_count: 3,
    private_brand_id: "must-not-leave-the-boundary",
  },
];

describe("database metadata audit", () => {
  it("returns catalog summaries and aggregate brand-owner counts", async () => {
    const { client } = createAuditClient([
      { rows: roleRows },
      { rows: tableRows },
      { rows: viewRows },
      { rows: functionRows },
      { rows: brandOwnerRows },
    ]);

    const report = await runDatabaseMetadataAudit(client);

    expect(report).toEqual({
      summary: {
        relationCount: 1,
        rlsEnabledCount: 1,
        rlsForcedCount: 0,
        ownerBypassRlsCount: 0,
        publicTableGrantCount: 0,
        publicColumnGrantCount: 0,
        requestRoleTableGrantCount: 2,
        requestRoleColumnGrantCount: 12,
        usersRlsEnabled: null,
        usersRlsForced: null,
        usersPolicyCount: null,
        brandsRlsEnabled: true,
        brandsRlsForced: false,
        brandsPolicyCount: 4,
      },
      currentRole: {
        isSuperuser: false,
        inheritsPrivileges: false,
        canCreateRoles: false,
        canCreateDatabases: false,
        canLogin: true,
        canReplicate: false,
        bypassesRls: false,
        grantedRoleCount: 1,
        memberRoleCount: 0,
        adminOptionCount: 0,
        inheritOptionCount: 1,
        setOptionCount: 1,
        publicHasSchemaCreate: false,
      },
      requestRole: {
        kind: "available",
        canSetRole: true,
        canLogin: false,
        inheritsPrivileges: false,
        isSuperuser: false,
        canCreateRoles: false,
        canCreateDatabases: false,
        canReplicate: false,
        bypassesRls: false,
        memberCount: 1,
        grantedRoleCount: 0,
        hasPublicSchemaUsage: true,
        hasPublicSchemaCreate: false,
        unexpectedMemberCount: 0,
        adminOptionCount: 0,
        inheritOptionCount: 0,
        setOptionCount: 1,
      },
      tables: [
        {
          name: "brands",
          kind: "table",
          owner: {
            isCurrentRole: true,
            isSuperuser: false,
            bypassesRls: false,
          },
          rls: { enabled: true, forced: false },
          policies: {
            total: 4,
            select: 1,
            insert: 1,
            update: 1,
            delete: 1,
            allCommands: 0,
            permissive: 4,
            restrictive: 0,
            public: 0,
            requestRole: 4,
            otherRoles: 0,
          },
          tablePrivileges: { total: 9, public: 0, currentRole: 7, requestRole: 2, otherRoles: 0 },
          columnPrivileges: {
            total: 12,
            public: 0,
            currentRole: 0,
            requestRole: 12,
            otherRoles: 0,
          },
        },
      ],
      views: {
        total: 3,
        ordinary: 2,
        materialized: 1,
        securityInvoker: 1,
        securityDefiner: 1,
        securityBarrier: 0,
        ownedBySuperuser: 1,
        ownedByRlsBypassRole: 1,
        publicSelectable: 0,
        requestRoleSelectable: 0,
      },
      functions: {
        public: {
          total: 8,
          securityDefiner: 2,
          ownedBySuperuser: 3,
          ownedByRlsBypassRole: 3,
          publicExecutable: 5,
          requestRoleExecutable: 0,
          publicSecurityDefiner: 1,
          requestRoleSecurityDefiner: 0,
          securityDefinerWithoutSearchPath: 1,
        },
        private: {
          total: 2,
          securityDefiner: 2,
          ownedBySuperuser: 2,
          ownedByRlsBypassRole: 2,
          publicExecutable: 0,
          requestRoleExecutable: 0,
          publicSecurityDefiner: 0,
          requestRoleSecurityDefiner: 0,
          securityDefinerWithoutSearchPath: 0,
        },
      },
      brandOwners: { missing: 2, unknown: 3, invalid: 5 },
    });
  });

  it("uses one read-only transaction and rolls it back", async () => {
    const { client, statements } = createAuditClient([
      { rows: roleRows },
      { rows: tableRows },
      { rows: viewRows },
      { rows: functionRows },
      { rows: brandOwnerRows },
    ]);

    await runDatabaseMetadataAudit(client);

    expect(statements.filter((statement) => statement === "BEGIN READ ONLY")).toHaveLength(1);
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("reports an unavailable request role without nullable role attributes", async () => {
    const unavailableRole = {
      ...roleRows[0],
      request_role_exists: false,
      can_set_request_role: false,
      request_role_can_login: null,
      request_role_inherits_privileges: null,
      request_role_is_superuser: null,
      request_role_can_create_roles: null,
      request_role_can_create_databases: null,
      request_role_can_replicate: null,
      request_role_bypasses_rls: null,
      request_role_member_count: 0,
      request_role_granted_role_count: 0,
      request_role_has_public_schema_usage: false,
      request_role_has_public_schema_create: false,
      request_role_unexpected_member_count: 0,
      request_role_admin_option_count: 0,
      request_role_inherit_option_count: 0,
      request_role_set_option_count: 0,
    };
    const { client } = createAuditClient([
      { rows: [unavailableRole] },
      { rows: tableRows },
      { rows: viewRows },
      { rows: functionRows },
      { rows: brandOwnerRows },
    ]);

    const report = await runDatabaseMetadataAudit(client);

    expect(report.requestRole).toEqual({ kind: "unavailable" });
  });

  it("rolls back when a metadata query fails", async () => {
    const statements: string[] = [];
    const client = {
      async query(statement: string): Promise<QueryResult> {
        statements.push(statement);
        if (statement.includes("pg_class")) throw new Error("catalog query failed");
        if (/^(BEGIN|SET LOCAL|ROLLBACK)/.test(statement)) return { rows: [] };
        return { rows: roleRows };
      },
    };

    await expect(runDatabaseMetadataAudit(client)).rejects.toThrow("catalog query failed");
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("reads no application row values", async () => {
    const { client, statements } = createAuditClient([
      { rows: roleRows },
      { rows: tableRows },
      { rows: viewRows },
      { rows: functionRows },
      { rows: brandOwnerRows },
    ]);

    const report = await runDatabaseMetadataAudit(client);
    const brandStatement = statements.find((statement) => statement.includes("public.brands"));

    expect(brandStatement).toContain("count(*) FILTER");
    expect(brandStatement).not.toMatch(/brands\.(id|name|company_name|email)\s+AS/i);
    expect(JSON.stringify(report)).not.toContain("must-not-leave-the-boundary");
  });

  it("queries every release-blocking role and relation attribute", async () => {
    const { client, statements } = createAuditClient([
      { rows: roleRows },
      { rows: tableRows },
      { rows: viewRows },
      { rows: functionRows },
      { rows: brandOwnerRows },
    ]);

    await runDatabaseMetadataAudit(client);

    const roleStatement = statements.find((statement) => statement.includes("pg_auth_members"));
    expect(roleStatement).toContain("privilege.privilege_type = 'CREATE'");
    expect(roleStatement).toContain("has_schema_privilege(request_role.oid, 'public', 'CREATE')");
    expect(roleStatement).toContain("admin_option");
    expect(roleStatement).toContain("inherit_option");
    expect(roleStatement).toContain("set_option");
    expect(roleStatement).toContain("member <> current_login_role.oid");

    const tableStatement = statements.find((statement) => statement.includes("relation.relkind"));
    expect(tableStatement).toContain("WHEN 'f' THEN 'foreign'");
    expect(tableStatement).toContain("relation.relkind IN ('r', 'p', 'f')");
  });
});
