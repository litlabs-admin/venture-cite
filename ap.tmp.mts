import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
const B = "7575e62f-454b-4656-b5c6-a0a112c2d4d6";
const r = (await db.execute(sql`
  SELECT name, autopilot_status, autopilot_step, autopilot_error, updated_at
  FROM brands WHERE id=${B}`)) as { rows: unknown[] };
console.log("autopilot:", JSON.stringify(r.rows, null, 1));
