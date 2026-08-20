import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

// Damien's account, end to end. Exits when the dashboard is genuinely
// populated - not when a job merely started.
const B = "7575e62f-454b-4656-b5c6-a0a112c2d4d6";
const DEADLINE = Date.now() + 9 * 60 * 1000;

for (;;) {
  const r = (await db.execute(sql`
    SELECT
      (SELECT autopilot_status FROM brands WHERE id=${B})                          AS autopilot,
      (SELECT count(*)::int FROM brand_fact_sheet     WHERE brand_id=${B})         AS facts,
      (SELECT count(*)::int FROM brand_prompts        WHERE brand_id=${B})         AS prompts,
      (SELECT count(*)::int FROM citation_runs        WHERE brand_id=${B})         AS runs,
      (SELECT count(*)::int FROM competitors          WHERE brand_id=${B})         AS competitors,
      (SELECT count(*)::int FROM brand_mentions       WHERE brand_id=${B})         AS mentions,
      (SELECT count(*)::int FROM brand_perception_runs WHERE brand_id=${B})        AS perception`)) as {
    rows: Record<string, unknown>[];
  };
  const s = r.rows[0] as any;
  console.log(new Date().toISOString().slice(11, 19), JSON.stringify(s));
  if (s.autopilot === "completed" && s.prompts > 0 && s.runs > 0) {
    console.log("COMPLETE");
    process.exit(0);
  }
  if (s.autopilot === "failed") {
    console.log("AUTOPILOT_FAILED");
    process.exit(0);
  }
  if (Date.now() > DEADLINE) {
    console.log("STILL_RUNNING");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 40_000));
}
