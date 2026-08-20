import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
const B = "7575e62f-454b-4656-b5c6-a0a112c2d4d6";
const b = (await db.execute(sql`
  SELECT autopilot_status, autopilot_step, autopilot_error, last_auto_citation_status
  FROM brands WHERE id=${B}`)) as { rows: unknown[] };
console.log("brand:", JSON.stringify(b.rows, null, 1));
const r = (await db.execute(sql`
  SELECT status, total_checks, total_cited, progress_pct, error_message, started_at, completed_at
  FROM citation_runs WHERE brand_id=${B} ORDER BY started_at DESC LIMIT 2`)) as { rows: unknown[] };
console.log("citation runs:", JSON.stringify(r.rows, null, 1));
