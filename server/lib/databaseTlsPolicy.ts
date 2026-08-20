export type DatabaseTlsEnvironment = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  DATABASE_CA_CERT_PATH?: string;
  DATABASE_SSL_REJECT_UNAUTHORIZED?: string;
};

export type DatabaseTlsPolicy =
  | { mode: "custom-ca"; caPath: string; rejectUnauthorized: true }
  | { mode: "default-ca"; rejectUnauthorized: true }
  | { mode: "no-tls" }
  | { mode: "permissive"; rejectUnauthorized: false };

const CONNECTION_STRING_TLS_PARAMETERS = new Set([
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslnegotiation",
  "sslrootcert",
]);

function hasConnectionStringTlsParameters(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;

  try {
    const parsed = new URL(databaseUrl);
    return [...parsed.searchParams.keys()].some((key) =>
      CONNECTION_STRING_TLS_PARAMETERS.has(key.toLowerCase()),
    );
  } catch {
    return false;
  }
}

function isLoopbackDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;

  try {
    const hostName = new URL(databaseUrl).hostname.toLowerCase();
    return hostName === "localhost" || hostName === "::1" || /^127(?:\.\d{1,3}){3}$/.test(hostName);
  } catch {
    return false;
  }
}

export function resolveDatabaseTlsPolicy(env: DatabaseTlsEnvironment): DatabaseTlsPolicy {
  const caPath = env.DATABASE_CA_CERT_PATH?.trim();
  const policy: DatabaseTlsPolicy = caPath
    ? { mode: "custom-ca", caPath, rejectUnauthorized: true }
    : env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
      ? { mode: "default-ca", rejectUnauthorized: true }
      : env.NODE_ENV !== "production" && isLoopbackDatabaseUrl(env.DATABASE_URL)
        ? { mode: "no-tls" }
        : { mode: "permissive", rejectUnauthorized: false };
  const verifiesCertificates = policy.mode === "custom-ca" || policy.mode === "default-ca";

  if (env.NODE_ENV === "production" && !verifiesCertificates) {
    throw new Error(
      "Production database TLS requires certificate verification. Set DATABASE_CA_CERT_PATH or DATABASE_SSL_REJECT_UNAUTHORIZED=true.",
    );
  }

  if (verifiesCertificates && hasConnectionStringTlsParameters(env.DATABASE_URL)) {
    throw new Error(
      "DATABASE_URL must not include TLS parameters when certificate verification is configured. Remove ssl, sslmode, sslcert, sslkey, sslrootcert, and sslnegotiation.",
    );
  }

  return policy;
}
