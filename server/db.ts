import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig, types as pgTypes } from "pg";
import fs from "node:fs";
import * as schema from "@shared/schema";
import { logger } from "./lib/logger";
import { resolveDatabaseTlsPolicy } from "./lib/databaseTlsPolicy";

// Force `TIMESTAMP WITHOUT TIME ZONE` (oid 1114) to be parsed as UTC, not as
// the Node process's local time. Without this, a DB value of "2026-05-05
// 12:00:00" (which our app writes as `now()` - i.e. UTC) would be parsed by
// pg as 12:00 in the server's local zone, producing a Date object that's
// hours off. Result on the client: relative timestamps like "6 hours ago"
// for events that just happened. Setting this once at boot fixes every
// table that uses `timestamp()` without `{ withTimezone: true }`.
pgTypes.setTypeParser(1114, (val: string) => (val === null ? null : new Date(val + "Z")));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

function buildSslConfig(): PoolConfig["ssl"] {
  const policy = resolveDatabaseTlsPolicy(process.env);
  if (policy.mode === "custom-ca") {
    try {
      const ca = fs.readFileSync(policy.caPath, "utf8");
      logger.info("db: TLS strict - verifying chain against custom CA");
      return { ca, rejectUnauthorized: true };
    } catch {
      logger.error("db: DATABASE_CA_CERT_PATH set but file unreadable - refusing to start");
      throw new Error("Cannot read DATABASE_CA_CERT_PATH");
    }
  }

  if (policy.mode === "default-ca") {
    logger.info("db: TLS strict - verifying against Node default CA bundle");
    return { rejectUnauthorized: true };
  }

  if (policy.mode === "no-tls") {
    logger.info("db: TLS disabled for a non-production loopback database");
    return false;
  }

  return { rejectUnauthorized: false };
}

// On Vercel each lambda is a fresh process, so a per-lambda pool of 1 is
// plenty - DATABASE_URL points at the Supabase transaction pooler (port
// 6543) which fans out to a shared backend pool. Locally we run a single
// long-lived process and want a normal-sized pool.
const isServerless = !!process.env.VERCEL;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: isServerless ? 1 : 10,
  idleTimeoutMillis: isServerless ? 5_000 : 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: buildSslConfig(),
});

export const db = drizzle(pool, { schema });

process.on("SIGTERM", () => {
  pool.end().catch(() => {});
});
