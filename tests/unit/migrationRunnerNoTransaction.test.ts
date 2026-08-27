import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  connect: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  lockClient: {
    query: vi.fn(),
    release: vi.fn(),
  },
  migrationClient: {
    query: vi.fn(),
    release: vi.fn(),
  },
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("fs", () => ({
  promises: {
    readdir: stubs.readdir,
    readFile: stubs.readFile,
  },
}));

vi.mock("../../server/db", () => ({
  pool: {
    connect: stubs.connect,
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: stubs.logger,
}));

import { applyMigrations, isNoTransactionMigration } from "../../server/lib/migrationRunner";

function prepareMigrationRun(sqlText: string): void {
  stubs.readdir.mockResolvedValue(["0001_example.sql"]);
  stubs.readFile.mockResolvedValue(sqlText);
  stubs.lockClient.query.mockResolvedValue({ rows: [] });
  stubs.migrationClient.query.mockResolvedValue({ rows: [] });
  stubs.connect
    .mockResolvedValueOnce(stubs.lockClient)
    .mockResolvedValueOnce(stubs.migrationClient);
}

function migrationQueryTexts(): string[] {
  return stubs.migrationClient.query.mock.calls.map(([query]) => String(query));
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_CUSTOM_ORM_PREVIEW", "false");
  stubs.connect.mockReset();
  stubs.readdir.mockReset();
  stubs.readFile.mockReset();
  stubs.lockClient.query.mockReset();
  stubs.lockClient.release.mockReset();
  stubs.migrationClient.query.mockReset();
  stubs.migrationClient.release.mockReset();
  stubs.logger.error.mockReset();
  stubs.logger.info.mockReset();
  stubs.logger.warn.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isNoTransactionMigration", () => {
  it.each([
    {
      name: "matches a pragma on its own line",
      sqlText: "-- migrate:no-transaction\nSELECT 1;\n",
      expected: true,
    },
    {
      name: "matches whitespace around a pragma with CRLF line endings",
      sqlText: "\t-- migrate:no-transaction  \r\nSELECT 1;\r\n",
      expected: true,
    },
    {
      name: "does not match a pragma phrase after other line content",
      sqlText: "SELECT '-- migrate:no-transaction';\n",
      expected: false,
    },
    {
      name: "does not match a pragma phrase in a longer comment",
      sqlText: "-- this migration is not migrate:no-transaction safe\n",
      expected: false,
    },
    {
      name: "does not match a file without the pragma",
      sqlText: "SELECT 1;\n",
      expected: false,
    },
  ])("$name", ({ sqlText, expected }) => {
    expect(isNoTransactionMigration(sqlText)).toBe(expected);
  });
});

describe("applyMigrations", () => {
  it("does not open or commit a transaction for a pragma migration", async () => {
    const sqlText =
      "-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY example_idx ON example (id);\n";
    prepareMigrationRun(sqlText);

    await applyMigrations({ ledgerMode: "application-only" });

    const queryTexts = migrationQueryTexts();
    expect(queryTexts).toContain(sqlText);
    expect(queryTexts).not.toContain("BEGIN");
    expect(queryTexts).not.toContain("COMMIT");
    expect(queryTexts.some((query) => query.includes("INSERT INTO public.schema_migrations"))).toBe(
      true,
    );
  });

  it("opens and commits a transaction for a normal migration", async () => {
    prepareMigrationRun("CREATE INDEX example_idx ON example (id);\n");

    await applyMigrations({ ledgerMode: "application-only" });

    expect(migrationQueryTexts()).toContain("BEGIN");
    expect(migrationQueryTexts()).toContain("COMMIT");
  });

  it("does not roll back or write the ledger when a pragma migration fails", async () => {
    const sqlText =
      "-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY example_idx ON example (id);\n";
    const failure = new Error("migration SQL failed");
    prepareMigrationRun(sqlText);
    stubs.migrationClient.query.mockImplementation((query: unknown) => {
      if (query === sqlText) return Promise.reject(failure);
      return Promise.resolve({ rows: [] });
    });

    await expect(applyMigrations({ ledgerMode: "application-only" })).rejects.toBe(failure);

    expect(migrationQueryTexts()).toEqual([sqlText]);
  });
});
