import fs from "node:fs";
import { Pool, type PoolConfig } from "pg";
import { logger } from "../server/lib/logger";
import { resolveDatabaseTlsPolicy } from "../server/lib/databaseTlsPolicy";
import {
  runRequestRoleMembership,
  type RequestRoleMembershipMode,
} from "../server/lib/requestRoleMembership";

function strictSslConfig(databaseUrl: string): PoolConfig["ssl"] {
  const policy = resolveDatabaseTlsPolicy({
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
  });
  if (policy.mode === "custom-ca") {
    try {
      return { ca: fs.readFileSync(policy.caPath, "utf8"), rejectUnauthorized: true };
    } catch {
      throw new Error("The configured database certificate is unreadable");
    }
  }
  if (policy.mode === "default-ca") return { rejectUnauthorized: true };
  throw new Error("Production database TLS requires certificate verification");
}

function getMode(value: string | undefined): RequestRoleMembershipMode {
  if (value === undefined || value === "" || value === "dry-run") return "dry-run";
  if (value === "apply") return "apply";
  throw new Error("REQUEST_ROLE_MEMBERSHIP_MODE must be dry-run or apply");
}

async function main(): Promise<void> {
  const runtimeUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DATABASE_DIRECT_URL?.trim();
  const runtimeRoleName = process.env.DATABASE_RUNTIME_ROLE_NAME?.trim();
  if (!runtimeUrl || !directUrl || !runtimeRoleName) {
    throw new Error("Request role membership configuration is incomplete");
  }

  const runtime = new Pool({
    connectionString: runtimeUrl,
    max: 1,
    ssl: strictSslConfig(runtimeUrl),
  });
  const direct = new Pool({ connectionString: directUrl, max: 1, ssl: strictSslConfig(directUrl) });
  try {
    const result = await runRequestRoleMembership({
      mode: getMode(process.env.REQUEST_ROLE_MEMBERSHIP_MODE),
      confirmation: process.env.CONFIRM_REQUEST_ROLE_MEMBERSHIP,
      runtime,
      direct,
      runtimeRoleName,
    });
    logger.info({ mode: result.mode, changed: result.changed }, "request role membership complete");
  } finally {
    await Promise.all([runtime.end(), direct.end()]);
  }
}

main().catch(() => {
  logger.error("request role membership failed");
  process.exitCode = 1;
});
