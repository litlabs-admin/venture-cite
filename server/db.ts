import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Supabase's pooled connection endpoint (aws-0-<region>.pooler.supabase.com)
// presents a cert chain that Node's default CA bundle does not trust, so
// `rejectUnauthorized: true` fails with SELF_SIGNED_CERT_IN_CHAIN. TLS
// encryption is still enforced (connection is encrypted in transit); only
// cert-chain verification is disabled. For strict verification in the
// future, download Supabase's root CA and pass it via the `ca` option.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

process.on("SIGTERM", () => {
  pool.end().catch(() => {});
});
