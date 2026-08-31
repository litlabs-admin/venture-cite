/**
 * Refuses `drizzle-kit push` unless DATABASE_URL is demonstrably local.
 *
 * `drizzle-kit push` diffs shared/schema.ts against whatever DATABASE_URL
 * resolves to and applies the DDL to close the gap, including DROPs. In a
 * developer shell DATABASE_URL is usually production, and migrations/ (not
 * shared/schema.ts) is the source of truth here, so the diff can be wrong in
 * ways that destroy real objects. There is no automated caller of this
 * command; the only guard against a mistake is this check running before the
 * push, which is why `npm run db:push` is wired through this script instead
 * of calling drizzle-kit directly.
 *
 * The loopback check mirrors tests/helpers/destructiveDatabaseTest.ts, which
 * exists for the identical reason on the test side.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isLoopbackHost } from "../tests/helpers/destructiveDatabaseTest";

export function assertLocalDrizzlePushTarget(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL, ensure the database is provisioned");
  }
  if (!isLoopbackHost(databaseUrl)) {
    throw new Error(
      "drizzle-kit push refused: DATABASE_URL is not a loopback host. " +
        "This command applies destructive DDL straight to whatever DATABASE_URL " +
        "points at, and migrations/ (not shared/schema.ts) is this repo's source " +
        "of truth. Point DATABASE_URL at a local database, or use `npm run " +
        "db:migrate` against a real migration file instead.",
    );
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  try {
    assertLocalDrizzlePushTarget(process.env.DATABASE_URL);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const result = spawnSync("npx", ["drizzle-kit", "push"], {
    stdio: "inherit",
    shell: true,
  });
  process.exit(result.status ?? 1);
}
