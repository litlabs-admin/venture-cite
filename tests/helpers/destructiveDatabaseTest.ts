type DatabaseTestEnvironment = {
  ALLOW_REMOTE_TEST_DATABASE?: string;
  DATABASE_URL?: string;
  LOCAL_SUPABASE_TEST?: string;
  TEST_DATABASE_URL?: string;
};

export type DestructiveDatabaseTestState = { kind: "ready" } | { kind: "skip" };

function databaseTarget(url: string): string {
  const parsed = new URL(url);
  const hostName = normalizedHost(parsed.hostname);
  const port = parsed.port || "5432";
  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").toLowerCase();
  return `${hostName}:${port}/${databaseName}`;
}

function normalizedHost(hostName: string): string {
  const lowerHost = hostName.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost === "::1" ||
    lowerHost === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(lowerHost)
  ) {
    return "loopback";
  }
  return lowerHost;
}

function isTestDatabaseUrl(url: string): boolean {
  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").toLowerCase();
  const hostName = parsed.hostname.toLowerCase();

  return (
    /(?:^|[_-])test(?:[_-]|$)/.test(databaseName) &&
    !hostName.includes("prod") &&
    !hostName.includes("production")
  );
}

function isLoopbackHost(url: string): boolean {
  return normalizedHost(new URL(url).hostname) === "loopback";
}

function isLocalSupabaseTestUrl(url: string): boolean {
  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").toLowerCase();
  const hostName = parsed.hostname.toLowerCase();
  const isLocalSupabaseHost = hostName === "127.0.0.1" || hostName === "localhost";

  return isLocalSupabaseHost && parsed.port === "55322" && databaseName === "postgres";
}

export function configureDestructiveDatabaseTest(
  env: DatabaseTestEnvironment,
): DestructiveDatabaseTestState {
  const testDatabaseUrl = env.TEST_DATABASE_URL;
  const normalDatabaseUrl = env.DATABASE_URL;
  const hasApprovedLocalSupabaseTarget =
    env.LOCAL_SUPABASE_TEST === "1" &&
    testDatabaseUrl !== undefined &&
    isLocalSupabaseTestUrl(testDatabaseUrl);

  if (!testDatabaseUrl) {
    delete env.DATABASE_URL;
    return { kind: "skip" };
  }

  if (normalDatabaseUrl && databaseTarget(normalDatabaseUrl) === databaseTarget(testDatabaseUrl)) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  }

  if (!isTestDatabaseUrl(testDatabaseUrl) && !hasApprovedLocalSupabaseTarget) {
    throw new Error("TEST_DATABASE_URL must name a test database");
  }

  if (!isLoopbackHost(testDatabaseUrl) && env.ALLOW_REMOTE_TEST_DATABASE !== "1") {
    throw new Error(
      "TEST_DATABASE_URL must use a loopback host unless ALLOW_REMOTE_TEST_DATABASE is 1",
    );
  }

  env.DATABASE_URL = testDatabaseUrl;
  return { kind: "ready" };
}
