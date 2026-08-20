import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
const B = "7575e62f-454b-4656-b5c6-a0a112c2d4d6";
const r = (await db.execute(sql`
  SELECT
    (SELECT autopilot_status FROM brands WHERE id=${B})                        AS autopilot,
    (SELECT last_auto_citation_status FROM brands WHERE id=${B})               AS citation_status,
    (SELECT count(*)::int FROM brand_fact_sheet      WHERE brand_id=${B})      AS facts,
    (SELECT count(*)::int FROM brand_prompts         WHERE brand_id=${B})      AS prompts,
    (SELECT count(*)::int FROM citation_runs         WHERE brand_id=${B})      AS runs,
    (SELECT count(*)::int FROM competitors           WHERE brand_id=${B})      AS competitors,
    (SELECT count(*)::int FROM brand_mentions        WHERE brand_id=${B})      AS mentions,
    (SELECT count(*)::int FROM brand_perception_runs WHERE brand_id=${B})      AS perception`)) as {
  rows: unknown[];
};
console.log(new Date().toISOString(), JSON.stringify(r.rows[0], null, 1));
const c = (await db.execute(sql`
  SELECT status, total_checks, total_cited, started_at, completed_at, progress_pct FROM citation_runs
  WHERE brand_id=${B} ORDER BY started_at DESC LIMIT 3`)) as { rows: unknown[] };
console.log("citation runs:", JSON.stringify(c.rows));
