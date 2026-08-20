import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

// Polls until Damien has a brand, then exits so the population step can run.
const EMAIL = "damienwoods7@gmail.com";
const DEADLINE = Date.now() + 9 * 60 * 1000;

async function look() {
  const r = (await db.execute(sql`
    SELECT b.id, b.name, b.website, b.created_at
    FROM brands b JOIN users u ON u.id = b.user_id
    WHERE u.email = ${EMAIL} AND b.deleted_at IS NULL
    ORDER BY b.created_at DESC LIMIT 1`)) as {
    rows: { id: string; name: string; website: string }[];
  };
  return r.rows[0] ?? null;
}

for (;;) {
  const b = await look();
  if (b) {
    console.log("BRAND_FOUND " + JSON.stringify(b));
    process.exit(0);
  }
  if (Date.now() > DEADLINE) {
    console.log("NO_BRAND_YET");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 45_000));
}
