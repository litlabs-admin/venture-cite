import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const rootMigrationDirectory = path.join(repositoryRoot, "migrations");
const supabaseMigrationDirectory = path.join(repositoryRoot, "supabase", "migrations");
const baselineCommit = "45d3d8f7e60c6fec3216ae72ad703e048695f7b1";
const baselineName = "20260416000000_pre_root_0000_baseline.sql";
const baselineHash = "2b0722c67d4de07255d20aa0d586c458daf0b5bf72edc30f6cf2d2474f783e09";
const rootMigrationDate = "20260421";
const checkOnly = process.argv.includes("--check");

function hash(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function comparisonHash(text) {
  const normalizedText = text
    .replace(/\r\n?/g, "\n")
    .replace(/^-- SHA256: [0-9a-f]{64}$/m, "-- SHA256: <platform-neutral>");
  return hash(normalizedText);
}

function fail(message) {
  throw new Error(`Supabase migration sync: ${message}`);
}

async function readRootMigrations() {
  const files = (await readdir(rootMigrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();

  if (files.length === 0) fail("no root SQL migrations exist");

  // The Supabase version is derived from ORDINAL POSITION, not from the four
  // digits embedded in the root filename.
  //
  // Why: root migration numbers are NOT unique. Numbers 0094-0100 each carry two
  // files (two branches numbered in parallel and both merged), e.g.
  // 0094_site_health_scan_history.sql and 0094_stripe_webhook_processing_claim.sql.
  //
  // The application runner is unaffected - server/lib/migrationRunner.ts keys
  // public.schema_migrations on FILENAME. Supabase keys
  // supabase_migrations.schema_migrations on VERSION, so the previous
  // number-derived scheme emitted two rows with version 20260421000094 and every
  // `supabase db reset` / `supabase start` / preview branch died with
  // "duplicate key value violates unique constraint schema_migrations_pkey".
  //
  // Ordinal position is unique by construction and monotonic in apply order:
  // migrationRunner sorts the same directory with the same `.sort()`, so version
  // order and application order agree exactly.
  //
  // This changes only the generated mirror. `migrations/` filenames - which are
  // the production ledger keys - are untouched, and production's Supabase ledger
  // holds a single snapshot row rather than per-file versions, so no deployed
  // ledger references the old version numbers.
  const migrations = await Promise.all(
    files.map(async (name, index) => ({
      destination: `${rootMigrationDate}${String(index + 1).padStart(6, "0")}_${name}`,
      source: name,
      sql: await readFile(path.join(rootMigrationDirectory, name), "utf8"),
    })),
  );

  assertUniqueDestinationVersions(migrations);
  return migrations;
}

/**
 * Guard the invariant that actually matters to Supabase: every generated file
 * must carry a distinct version prefix.
 *
 * Without this, `--check` could pass on an artifact that `supabase db reset`
 * cannot apply - which is exactly what happened before ordinal versioning.
 * Duplicate ROOT numbers remain legal (seven pairs exist and renaming them
 * would rewrite production ledger keys); duplicate generated VERSIONS never are.
 */
function assertUniqueDestinationVersions(migrations) {
  const seen = new Map();
  for (const migration of migrations) {
    const version = migration.destination.slice(0, 14);
    const previous = seen.get(version);
    if (previous) {
      fail(
        `duplicate generated version ${version}: ` +
          `${previous} and ${migration.source} would collide in ` +
          `supabase_migrations.schema_migrations`,
      );
    }
    seen.set(version, migration.source);
  }
}

function generateBaselineSql(tempDirectory) {
  const schemaPath = path.join(tempDirectory, "schema.ts");
  const outputDirectory = path.join(tempDirectory, "generated");
  const relativeSchemaPath = `./${path.relative(repositoryRoot, schemaPath).replaceAll("\\", "/")}`;
  const relativeOutputDirectory = `./${path.relative(repositoryRoot, outputDirectory).replaceAll("\\", "/")}`;
  const schema = execFileSync("git", ["show", `${baselineCommit}:shared/schema.ts`], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  if (!schema.includes('pgTable("users"')) fail(`commit ${baselineCommit} has no expected schema`);
  execFileSync(
    process.execPath,
    [
      path.join(repositoryRoot, "node_modules", "drizzle-kit", "bin.cjs"),
      "generate",
      "--dialect",
      "postgresql",
      "--schema",
      relativeSchemaPath,
      "--out",
      relativeOutputDirectory,
      "--name",
      "pre_root_0000_baseline",
      "--prefix",
      "supabase",
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );

  return readdir(outputDirectory).then(async (names) => {
    const sqlNames = names.filter((name) => name.endsWith(".sql"));
    if (sqlNames.length !== 1) fail("Drizzle did not generate one baseline SQL file");
    return readFile(path.join(outputDirectory, sqlNames[0]), "utf8");
  });
}

async function ensureFile(destination, contents) {
  if (existsSync(destination)) {
    const existingHash = comparisonHash(await readFile(destination, "utf8"));
    const expectedHash = comparisonHash(contents);
    if (existingHash !== expectedHash) {
      fail(`immutable file differs: ${path.relative(repositoryRoot, destination)}`);
    }
    return;
  }
  if (checkOnly) fail(`missing file: ${path.relative(repositoryRoot, destination)}`);
  await writeFile(destination, contents, "utf8");
}

async function main() {
  const temporaryDirectory = await mkdtemp(path.join(repositoryRoot, ".tmp-pre-root-0000-"));
  try {
    await writeFile(
      path.join(temporaryDirectory, "schema.ts"),
      execFileSync("git", ["show", `${baselineCommit}:shared/schema.ts`], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }),
    );
    const baselineSql = await generateBaselineSql(temporaryDirectory);
    if (hash(baselineSql) !== baselineHash)
      fail("generated baseline checksum differs from the approved schema artifact");

    const rootMigrations = await readRootMigrations();
    await mkdir(supabaseMigrationDirectory, { recursive: true });
    await ensureFile(path.join(supabaseMigrationDirectory, baselineName), baselineSql);
    for (const migration of rootMigrations) {
      const contents = `-- Source: migrations/${migration.source}\n-- SHA256: ${hash(migration.sql)}\n\n${migration.sql}`;
      await ensureFile(path.join(supabaseMigrationDirectory, migration.destination), contents);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
