import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import fs from "node:fs";
import * as schema from "@shared/schema";
import { logger } from "./lib/logger";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// TLS strategy:
//
// 1. If DATABASE_CA_CERT_PATH is set, read the PEM and verify the server
//    certificate chain against it. This is the strict, recommended setup
//    for production — Supabase publishes their pooler root CA and you
//    download it once into the deploy environment.
// 2. Else if DATABASE_SSL_REJECT_UNAUTHORIZED=true, verify against Node's
//    default CA bundle (works for some hosted Postgres setups; usually
//    fails for Supabase pooler).
// 3. Else fall back to permissive TLS — the connection is still encrypted
//    in transit but the cert chain is not verified. Acceptable for dev;
//    a logger.warn reminder fires at boot in production so this doesn't
//    silently persist into a real deployment.
function buildSslConfig(): PoolConfig["ssl"] {
  const caPath = process.env.DATABASE_CA_CERT_PATH;
  if (caPath) {
    try {
      const ca = fs.readFileSync(caPath, "utf8");
      logger.info({ caPath }, "db: TLS strict — verifying chain against custom CA");
      return { ca, rejectUnauthorized: true };
    } catch (err) {
      logger.error(
        { err, caPath },
        "db: DATABASE_CA_CERT_PATH set but file unreadable — refusing to start",
      );
      throw new Error(`Cannot read DATABASE_CA_CERT_PATH at ${caPath}`);
    }
  }

  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true") {
    logger.info("db: TLS strict — verifying against Node default CA bundle");
    return { rejectUnauthorized: true };
  }

  if (process.env.NODE_ENV === "production") {
    logger.warn(
      "db: TLS chain verification disabled. Set DATABASE_CA_CERT_PATH (preferred) " +
        "or DATABASE_SSL_REJECT_UNAUTHORIZED=true to harden. Connection is still " +
        "encrypted in transit.",
    );
  }
  return { rejectUnauthorized: false };
}

// On Vercel each lambda is a fresh process, so a per-lambda pool of 1 is
// plenty — DATABASE_URL points at the Supabase transaction pooler (port
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
