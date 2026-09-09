const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertLocalDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Refusing to run.");
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run against a non-local database (host: ${host}). ` +
        "Load .env.local-browser, or set DATABASE_URL to the local Supabase instance.",
    );
  }
}

if (process.argv[1]?.endsWith("assert-local-db.ts")) {
  assertLocalDatabase(process.env.DATABASE_URL);
  console.log("DATABASE_URL is local. Safe to proceed.");
}
