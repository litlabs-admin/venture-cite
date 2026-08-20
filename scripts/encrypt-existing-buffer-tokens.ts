// Encrypt plaintext Buffer access tokens from before at-rest encryption.
//
// The script skips values with the `enc:v1:` prefix.
//
// Usage:
//   tsx scripts/encrypt-existing-buffer-tokens.ts
//
// Prereqs: BUFFER_ENCRYPTION_KEY must be set in the env. Without it the
// script refuses to run (see server/lib/tokenCipher.ts:getKey).
//
// Back up the database before you run this script in production.
// Run a dry run against a restored copy first.
// Verify the encrypted and skipped counts before you use the result.

import "dotenv/config";
import "../server/env";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { encryptToken, isEncrypted } from "../server/lib/tokenCipher";

async function main() {
  const rows = await db
    .select({ id: users.id, token: users.bufferAccessToken })
    .from(users)
    .where(isNotNull(users.bufferAccessToken));

  let encrypted = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.token) {
      skipped += 1;
      continue;
    }
    if (isEncrypted(row.token)) {
      skipped += 1;
      continue;
    }
    const ciphertext = encryptToken(row.token);
    await db.update(users).set({ bufferAccessToken: ciphertext }).where(eq(users.id, row.id));
    encrypted += 1;
    // No PII in this log line - user id only.
    process.stdout.write(`encrypted user=${row.id}\n`);
  }

  process.stdout.write(`\nDone. encrypted=${encrypted} skipped=${skipped} total=${rows.length}\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
