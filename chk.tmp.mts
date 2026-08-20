import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
const B = "7575e62f-454b-4656-b5c6-a0a112c2d4d6";
const n = async (l: string, s: any) => {
  try { const r = (await db.execute(s)) as { rows: { n: number }[] }; console.log(`  ${l.padEnd(22)} ${r.rows[0]?.n ?? 0}`); }
  catch (e) { console.log(`  ${l.padEnd(22)} ERR ${(e as Error).message.slice(0, 55)}`); }
};
console.log("Venture PR dashboard @", new Date().toISOString());
await n("fact sheet", sql`SELECT count(*)::int n FROM brand_fact_sheet WHERE brand_id=${B}`);
await n("prompts", sql`SELECT count(*)::int n FROM brand_prompts WHERE brand_id=${B}`);
await n("citation runs", sql`SELECT count(*)::int n FROM citation_runs WHERE brand_id=${B}`);
await n("citations", sql`SELECT count(*)::int n FROM citations WHERE brand_id=${B}`);
await n("competitors", sql`SELECT count(*)::int n FROM competitors WHERE brand_id=${B}`);
await n("mentions", sql`SELECT count(*)::int n FROM brand_mentions WHERE brand_id=${B}`);
await n("perception runs", sql`SELECT count(*)::int n FROM brand_perception_runs WHERE brand_id=${B}`);
await n("fact scrape runs", sql`SELECT count(*)::int n FROM brand_fact_scrape_runs WHERE brand_id=${B}`);
const l = (await db.execute(sql`SELECT value_json FROM system_state WHERE key=${"brand_jobs:" + B}`)) as { rows: unknown[] };
console.log("  ledger:", JSON.stringify(l.rows));
