import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";
const r = (await db.execute(sql`
  SELECT b.id, b.name, b.website, b.created_at, b.autopilot_status,
         (SELECT count(*)::int FROM brand_prompts        WHERE brand_id=b.id) AS prompts,
         (SELECT count(*)::int FROM citation_runs        WHERE brand_id=b.id) AS runs,
         (SELECT count(*)::int FROM competitors          WHERE brand_id=b.id) AS competitors,
         (SELECT count(*)::int FROM brand_mentions       WHERE brand_id=b.id) AS mentions,
         (SELECT count(*)::int FROM brand_fact_sheet     WHERE brand_id=b.id) AS facts
  FROM brands b JOIN users u ON u.id=b.user_id
  WHERE u.email='damienwoods7@gmail.com' AND b.deleted_at IS NULL
  ORDER BY b.created_at`)) as { rows: unknown[] };
console.log("Damien's brands:", JSON.stringify(r.rows, null, 1));
