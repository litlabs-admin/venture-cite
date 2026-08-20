import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
import { populateBrandDashboard } from "./server/lib/brandActivation";

const EMAIL = process.env.TARGET_EMAIL || "damienwoods7@gmail.com";

const found = (await db.execute(sql`
  SELECT b.id, b.name, b.website FROM brands b JOIN users u ON u.id = b.user_id
  WHERE u.email = ${EMAIL} AND b.deleted_at IS NULL
  ORDER BY b.created_at DESC LIMIT 1`)) as {
  rows: { id: string; name: string; website: string }[];
};
const brand = found.rows[0];
if (!brand) {
  console.log("no brand yet for", EMAIL);
  process.exit(0);
}
console.log("brand:", JSON.stringify(brand));

// The same call the hourly sweep makes. Its weekly ledger is empty for a new
// brand, so every producer runs.
const t0 = Date.now();
const { ran, skipped } = await populateBrandDashboard(brand.id);
console.log(`populate done in ${Math.round((Date.now() - t0) / 1000)}s`);
console.log("ran:", JSON.stringify(ran), "| skipped:", JSON.stringify(skipped));

const count = async (label: string, q: any) => {
  try {
    const r = (await db.execute(q)) as { rows: { n: number }[] };
    console.log(`  ${label}: ${r.rows[0]?.n ?? 0}`);
  } catch (e) {
    console.log(`  ${label}: ERR ${(e as Error).message.slice(0, 60)}`);
  }
};
console.log("dashboard contents:");
await count("prompts", sql`SELECT count(*)::int n FROM brand_prompts WHERE brand_id=${brand.id}`);
await count("citation runs", sql`SELECT count(*)::int n FROM citation_runs WHERE brand_id=${brand.id}`);
await count("citations", sql`SELECT count(*)::int n FROM citation_results WHERE brand_id=${brand.id}`);
await count("competitors", sql`SELECT count(*)::int n FROM competitors WHERE brand_id=${brand.id}`);
await count("mentions", sql`SELECT count(*)::int n FROM brand_mentions WHERE brand_id=${brand.id}`);
await count("fact sheet facts", sql`SELECT count(*)::int n FROM brand_facts WHERE brand_id=${brand.id}`);
