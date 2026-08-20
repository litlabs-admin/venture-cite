import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
const B = "7575e62f-454b-4656-b5c6-a0a112c2d4d6";
const DEADLINE = Date.now() + 9 * 60 * 1000;
for (;;) {
  const r = (await db.execute(sql`
    SELECT status, total_checks, total_cited, progress_pct
    FROM citation_runs WHERE brand_id=${B} ORDER BY started_at DESC LIMIT 1`)) as {
    rows: { status: string; total_checks: number; total_cited: number; progress_pct: number }[];
  };
  const s = r.rows[0];
  console.log(new Date().toISOString().slice(11, 19), JSON.stringify(s));
  if (s && s.status !== "running") { console.log("RUN_FINISHED"); process.exit(0); }
  if (Date.now() > DEADLINE) { console.log("STILL_RUNNING"); process.exit(0); }
  await new Promise((r) => setTimeout(r, 40_000));
}
