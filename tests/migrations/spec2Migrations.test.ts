// Spec 2 §9 bullet 1: migrations 0058 + 0059 + 0060 apply cleanly,
// are idempotent on re-apply, and §9 bullet 4 backfill creates user-typed
// rows in brand_fact_sheet.
//
// This test connects to TEST_DATABASE_URL (a real Postgres instance) and
// applies the migrations against an isolated schema. Skip when the env var
// is unset so unit-test runs aren't blocked.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = `spec2_test_${Date.now()}`;
const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

const describeIfDb = url ? describe : describe.skip;

describeIfDb("Spec 2 migrations", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await pool.query(`SET search_path TO ${SCHEMA}, public`);

    // Seed minimal pre-existing tables that the spec 2 migrations reference.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        description TEXT,
        target_audience TEXT,
        brand_voice TEXT,
        products TEXT[],
        key_values TEXT[],
        unique_selling_points TEXT[]
      );
      CREATE TABLE IF NOT EXISTS brand_fact_sheet (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id VARCHAR NOT NULL,
        fact_category TEXT,
        fact_key TEXT NOT NULL,
        fact_value TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        source_url TEXT,
        last_verified TIMESTAMP
      );
    `);

    // Seed a brand with onboarding-style answers that should be backfilled
    // as source='user' rows.
    await pool.query(`
      INSERT INTO brands (id, description, target_audience, brand_voice, products, key_values, unique_selling_points)
      VALUES (
        '99999999-9999-4999-8999-999999999999',
        'We build CRMs for plumbers.',
        'Independent plumbing contractors',
        'Direct and pragmatic',
        ARRAY['ACME CRM','ACME Mobile']::text[],
        ARRAY['Customer first','Iterate fast']::text[],
        ARRAY['Built by plumbers','Phone support']::text[]
      )
    `);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
      await pool.end();
    }
  });

  async function applyMigration(name: string) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
    await pool.query(sql);
  }

  it("applies 0058 → 0059 → 0060 forward, columns + indexes exist", async () => {
    await applyMigration("0058_brand_fact_scrape_runs.sql");
    await applyMigration("0059_brand_fact_sheet_v2.sql");
    await applyMigration("0060_brand_fact_scrape_caps.sql");

    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [SCHEMA],
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toContain("brand_fact_scrape_runs");
    expect(names).toContain("brand_fact_scrape_pages");
    expect(names).toContain("brand_monthly_cost_caps");

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'brand_fact_sheet'`,
      [SCHEMA],
    );
    const colNames = cols.rows.map((r) => r.column_name);
    for (const expected of [
      "domain",
      "subcategory",
      "value_type",
      "value_payload",
      "confidence",
      "source_excerpt",
      "dismissed_at",
      "accepted_at",
      "run_id",
    ]) {
      expect(colNames).toContain(expected);
    }
    expect(colNames).not.toContain("fact_category"); // renamed

    const brandCols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'brands' AND column_name = 'fact_scrape_enabled'`,
      [SCHEMA],
    );
    expect(brandCols.rows.length).toBe(1);
  });

  it("re-applies all three migrations idempotently", async () => {
    await applyMigration("0058_brand_fact_scrape_runs.sql");
    await applyMigration("0059_brand_fact_sheet_v2.sql");
    await applyMigration("0060_brand_fact_scrape_caps.sql");
    // No error thrown.
  });

  it("backfills user-typed onboarding answers as source='user' rows", async () => {
    const rows = await pool.query(
      `SELECT domain, subcategory, fact_key, source, value_type
       FROM brand_fact_sheet
       WHERE brand_id = '99999999-9999-4999-8999-999999999999'`,
    );

    const find = (d: string, s: string) =>
      rows.rows.find((r) => r.domain === d && r.subcategory === s && r.source === "user");

    expect(find("identity", "description")).toBeDefined();
    expect(find("positioning", "target_audience")).toBeDefined();
    expect(find("positioning", "brand_voice")).toBeDefined();

    const products = find("offerings", "products");
    expect(products).toBeDefined();
    expect(products.value_type).toBe("array");

    const keyValues = find("positioning", "key_values");
    expect(keyValues).toBeDefined();
    expect(keyValues.value_type).toBe("array");

    const usp = find("positioning", "unique_selling_points");
    expect(usp).toBeDefined();
    expect(usp.value_type).toBe("array");
  });
});
