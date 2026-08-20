import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
const B = "7575e62f-454b-4656-b5c6-a0a112c2d4d6";
const DEADLINE = Date.now() + 9 * 60 * 1000;
for (;;) {
  const r = (await db.execute(sql`
    SELECT (SELECT count(*)::int FROM brand_prompts WHERE brand_id=${B}) AS prompts,
           (SELECT count(*)::int FROM citation_runs WHERE brand_id=${B}) AS runs,
           (SELECT count(*)::int FROM competitors WHERE brand_id=${B}) AS competitors,
           (SELECT count(*)::int FROM brand_perception_runs WHERE brand_id=${B}) AS perception`)) as {
    rows: { prompts: number; runs: number; competitors: number; perception: number }[];
  };
  const s = r.rows[0];
  console.log(new Date().toISOString(), JSON.stringify(s));
  if (s.prompts > 0 && s.runs > 0 && s.competitors > 0 && s.perception > 0) {
    console.log("ALL_POPULATED");
    process.exit(0);
  }
  if (Date.now() > DEADLINE) { console.log("STILL_RUNNING"); process.exit(0); }
  await new Promise((r) => setTimeout(r, 45_000));
}
