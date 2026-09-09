import { isLoopbackHost } from "../tests/helpers/destructiveDatabaseTest";

function assertLocalUrl(url: string, variableName: string): void {
  const host = new URL(url).hostname;
  if (!isLoopbackHost(url)) {
    throw new Error(
      `Refusing to run against a non-local database (host: ${host}). ` +
        `${variableName} must point at a loopback host. ` +
        "Load .env.local-browser, or set DATABASE_URL to the local Supabase instance.",
    );
  }
}

export function assertLocalDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Refusing to run.");
  }
  assertLocalUrl(url, "DATABASE_URL");

  // `scripts/migrate.ts` swaps DATABASE_URL for DATABASE_DIRECT_URL before
  // importing server/db, so a production DATABASE_DIRECT_URL would bypass a
  // check that only looked at DATABASE_URL. Check it too when it's set.
  const directUrl = process.env.DATABASE_DIRECT_URL;
  if (directUrl) {
    assertLocalUrl(directUrl, "DATABASE_DIRECT_URL");
  }
}

if (process.argv[1]?.endsWith("assert-local-db.ts")) {
  assertLocalDatabase(process.env.DATABASE_URL);
  console.log("DATABASE_URL is local. Safe to proceed.");
}
