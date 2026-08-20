import { describe, expect, it } from "vitest";
import {
  REQUEST_ROLE_MEMBERSHIP_CONFIRMATION,
  runRequestRoleMembership,
  validateRuntimeRoleName,
  type RequestRoleMembershipClient,
} from "../../server/lib/requestRoleMembership";

type Query = { text: string; values?: readonly unknown[] };

type AuditedMembership = {
  role_name: string;
  member_name: string;
  inherit_option: boolean;
  set_option: boolean;
  admin_option: boolean;
};

const safeRuntimeRole = {
  rolcanlogin: true,
  rolsuper: false,
  rolbypassrls: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  rolinherit: false,
};
const safeDirectRole = {
  direct_role_name: "postgres",
  rolsuper: true,
  rolcreaterole: false,
  has_request_admin: false,
  has_content_request_admin: false,
  has_outbox_worker_admin: false,
};
const safeRestrictedRoles = [
  { rolname: "venturecite_request", ...safeRuntimeRole, rolcanlogin: false },
  { rolname: "venturecite_content_request", ...safeRuntimeRole, rolcanlogin: false },
  { rolname: "venturecite_outbox_worker", ...safeRuntimeRole, rolcanlogin: false },
];
const creatorMemberships = safeRestrictedRoles.map(({ rolname }) => ({
  role_name: rolname,
  member_name: "postgres",
  inherit_option: false,
  set_option: false,
  admin_option: true,
}));

function createClient(rows: unknown[][]): RequestRoleMembershipClient & { queries: Query[] } {
  const queries: Query[] = [];
  return {
    queries,
    async query<T>(text: string, values?: readonly unknown[]) {
      queries.push({ text, values });
      if (text.startsWith("SELECT current_database()")) {
        return {
          rows: [{ database_name: "venturecite", system_identifier: "cluster-1" }] as T[],
        };
      }
      if (text.startsWith("SELECT current_user")) {
        const row = (rows.shift() ?? [])[0] as Record<string, unknown> | undefined;
        return {
          rows: [
            {
              ...row,
              database_name: row?.database_name ?? "venturecite",
              system_identifier: row?.system_identifier ?? "cluster-1",
            },
          ] as T[],
        };
      }
      return {
        rows: (text.startsWith("SELECT") || text.startsWith("SHOW")
          ? (rows.shift() ?? [])
          : []) as T[],
      };
    },
  };
}

describe("request role membership", () => {
  it("accepts a PostgreSQL identifier without exposing its value", () => {
    expect(validateRuntimeRoleName("venturecite_runtime")).toBe("venturecite_runtime");
    expect(() => validateRuntimeRoleName("bad role; drop table users")).toThrow(
      "DATABASE_RUNTIME_ROLE_NAME must be a valid PostgreSQL identifier",
    );
  });

  it("audits both connections without granting roles in dry-run mode", async () => {
    const runtime = createClient([[{ current_user: "venturecite_runtime" }]]);
    const direct = createClient([
      [{ server_version_num: "170000" }],
      [safeDirectRole],
      [safeRuntimeRole],
      safeRestrictedRoles,
      creatorMemberships,
    ]);

    await expect(
      runRequestRoleMembership({
        mode: "dry-run",
        runtimeRoleName: "venturecite_runtime",
        runtime,
        direct,
      }),
    ).resolves.toEqual({ mode: "dry-run", changed: false });

    expect(runtime.queries.map((query) => query.text)).toEqual([
      "BEGIN READ ONLY",
      expect.stringContaining("SELECT current_user, current_database()"),
      "ROLLBACK",
    ]);
    expect(direct.queries.map((query) => query.text)).toEqual([
      "BEGIN READ ONLY",
      expect.stringContaining("SELECT current_database()"),
      "SHOW server_version_num",
      expect.stringContaining("FROM pg_roles AS role WHERE role.rolname = current_user"),
      "SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolinherit FROM pg_roles WHERE rolname = $1",
      "SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolinherit FROM pg_roles WHERE rolname = ANY($1)",
      expect.stringContaining("WHERE granted.rolname = ANY($1)"),
      "ROLLBACK",
    ]);
    expect(
      direct.queries.find((query) => query.text.includes("FROM pg_auth_members"))?.text,
    ).not.toContain("ANY($2)");
  });

  it("grants only the fixed restricted roles with SET and no inheritance or admin", async () => {
    const runtime = createClient([[{ current_user: "venturecite_runtime" }]]);
    const direct = createClient([
      [{ server_version_num: "170000" }],
      [safeDirectRole],
      [safeRuntimeRole],
      safeRestrictedRoles,
      creatorMemberships,
      [
        ...creatorMemberships,
        {
          role_name: "venturecite_request",
          member_name: "venturecite_runtime",
          inherit_option: false,
          set_option: true,
          admin_option: false,
        },
        {
          role_name: "venturecite_content_request",
          member_name: "venturecite_runtime",
          inherit_option: false,
          set_option: true,
          admin_option: false,
        },
        {
          role_name: "venturecite_outbox_worker",
          member_name: "venturecite_runtime",
          inherit_option: false,
          set_option: true,
          admin_option: false,
        },
      ],
    ]);

    await expect(
      runRequestRoleMembership({
        mode: "apply",
        confirmation: REQUEST_ROLE_MEMBERSHIP_CONFIRMATION,
        runtimeRoleName: "venturecite_runtime",
        runtime,
        direct,
      }),
    ).resolves.toEqual({ mode: "apply", changed: true });

    expect(direct.queries.map((query) => query.text)).toContain(
      'GRANT venturecite_request, venturecite_content_request, venturecite_outbox_worker TO "venturecite_runtime" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE',
    );
  });

  it("rejects an unconfirmed apply without opening a database transaction", async () => {
    const runtime = createClient([]);
    const direct = createClient([]);

    await expect(
      runRequestRoleMembership({
        mode: "apply",
        runtimeRoleName: "venturecite_runtime",
        runtime,
        direct,
      }),
    ).rejects.toThrow("Production request role membership requires confirmation");

    expect(runtime.queries).toEqual([]);
    expect(direct.queries).toEqual([]);
  });

  it("rejects identity mismatch and unsafe runtime memberships", async () => {
    const direct = createClient([]);
    await expect(
      runRequestRoleMembership({
        mode: "dry-run",
        runtimeRoleName: "venturecite_runtime",
        runtime: createClient([[{ current_user: "other_runtime" }]]),
        direct,
      }),
    ).rejects.toThrow("DATABASE_URL does not connect as DATABASE_RUNTIME_ROLE_NAME");

    const unsafeDirect = createClient([
      [{ server_version_num: "170000" }],
      [safeDirectRole],
      [safeRuntimeRole],
      safeRestrictedRoles,
      [
        ...creatorMemberships,
        {
          role_name: "unexpected_role",
          member_name: "venturecite_runtime",
          inherit_option: false,
          set_option: true,
          admin_option: false,
        },
      ],
    ]);
    await expect(
      runRequestRoleMembership({
        mode: "dry-run",
        runtimeRoleName: "venturecite_runtime",
        runtime: createClient([[{ current_user: "venturecite_runtime" }]]),
        direct: unsafeDirect,
      }),
    ).rejects.toThrow("The runtime role has an unexpected membership");
  });

  it("rejects a restricted role granted to any runtime other than the configured runtime", async () => {
    const direct = createClient([
      [{ server_version_num: "170000" }],
      [safeDirectRole],
      [safeRuntimeRole],
      safeRestrictedRoles,
      [
        ...creatorMemberships,
        {
          role_name: "venturecite_request",
          member_name: "unexpected_runtime",
          inherit_option: false,
          set_option: true,
          admin_option: false,
        } satisfies AuditedMembership,
      ],
    ]);

    await expect(
      runRequestRoleMembership({
        mode: "dry-run",
        runtimeRoleName: "venturecite_runtime",
        runtime: createClient([[{ current_user: "venturecite_runtime" }]]),
        direct,
      }),
    ).rejects.toThrow("The runtime role has an unexpected membership");
  });

  it("rejects unsupported PostgreSQL versions and unsafe role attributes", async () => {
    await expect(
      runRequestRoleMembership({
        mode: "dry-run",
        runtimeRoleName: "venturecite_runtime",
        runtime: createClient([[{ current_user: "venturecite_runtime" }]]),
        direct: createClient([[{ server_version_num: "160000" }]]),
      }),
    ).rejects.toThrow("PostgreSQL 17 or later is required for request role membership");

    const unsafeRuntime = { ...safeRuntimeRole, rolinherit: true };
    await expect(
      runRequestRoleMembership({
        mode: "dry-run",
        runtimeRoleName: "venturecite_runtime",
        runtime: createClient([[{ current_user: "venturecite_runtime" }]]),
        direct: createClient([
          [{ server_version_num: "170000" }],
          [safeDirectRole],
          [unsafeRuntime],
        ]),
      }),
    ).rejects.toThrow("The runtime database role has unsafe attributes");
  });

  it("fails dry-run when rollback fails", async () => {
    const runtime: RequestRoleMembershipClient = {
      async query<T>(text: string) {
        if (text === "ROLLBACK") throw new Error("rollback failed");
        return {
          rows: (text.startsWith("SELECT current_user")
            ? [
                {
                  current_user: "venturecite_runtime",
                  database_name: "venturecite",
                  system_identifier: "cluster-1",
                },
              ]
            : []) as T[],
        };
      },
    };
    await expect(
      runRequestRoleMembership({
        mode: "dry-run",
        runtimeRoleName: "venturecite_runtime",
        runtime,
        direct: createClient([]),
      }),
    ).rejects.toThrow("rollback failed");
  });

  it("rolls back an apply when the grant fails", async () => {
    const queries: string[] = [];
    const direct: RequestRoleMembershipClient = {
      async query<T>(text: string) {
        queries.push(text);
        if (text.startsWith("GRANT")) throw new Error("grant failed");
        if (text.startsWith("SELECT current_database()"))
          return {
            rows: [{ database_name: "venturecite", system_identifier: "cluster-1" }] as T[],
          };
        if (text === "SHOW server_version_num")
          return { rows: [{ server_version_num: "170000" }] as T[] };
        if (text.includes("FROM pg_roles AS role")) return { rows: [safeDirectRole] as T[] };
        if (text.includes("WHERE rolname = $1")) return { rows: [safeRuntimeRole] as T[] };
        if (text.includes("WHERE rolname = ANY($1)")) return { rows: safeRestrictedRoles as T[] };
        if (text.includes("FROM pg_auth_members")) return { rows: creatorMemberships as T[] };
        return { rows: [] };
      },
    };
    await expect(
      runRequestRoleMembership({
        mode: "apply",
        confirmation: REQUEST_ROLE_MEMBERSHIP_CONFIRMATION,
        runtimeRoleName: "venturecite_runtime",
        runtime: createClient([[{ current_user: "venturecite_runtime" }]]),
        direct,
      }),
    ).rejects.toThrow("grant failed");
    expect(queries).toContain("ROLLBACK");
  });

  it("rolls back without committing when post-grant verification fails", async () => {
    const queries: string[] = [];
    const direct: RequestRoleMembershipClient = {
      async query<T>(text: string) {
        queries.push(text);
        if (text.startsWith("SELECT current_database()"))
          return {
            rows: [{ database_name: "venturecite", system_identifier: "cluster-1" }] as T[],
          };
        if (text === "SHOW server_version_num")
          return { rows: [{ server_version_num: "170000" }] as T[] };
        if (text.includes("FROM pg_roles AS role")) return { rows: [safeDirectRole] as T[] };
        if (text.includes("WHERE rolname = $1")) return { rows: [safeRuntimeRole] as T[] };
        if (text.includes("WHERE rolname = ANY($1)")) return { rows: safeRestrictedRoles as T[] };
        if (text.includes("FROM pg_auth_members")) return { rows: creatorMemberships as T[] };
        return { rows: [] };
      },
    };

    await expect(
      runRequestRoleMembership({
        mode: "apply",
        confirmation: REQUEST_ROLE_MEMBERSHIP_CONFIRMATION,
        runtimeRoleName: "venturecite_runtime",
        runtime: createClient([[{ current_user: "venturecite_runtime" }]]),
        direct,
      }),
    ).rejects.toThrow("The restricted role membership does not match the release policy");

    expect(queries.some((query) => query.startsWith("GRANT"))).toBe(true);
    expect(queries).toContain("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
  });
});
