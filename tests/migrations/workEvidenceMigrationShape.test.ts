import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(process.cwd(), "migrations/0127_work_evidence_readers_rls.sql");

function migrationSql(): string {
  return fs
    .readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("work evidence reader migration", () => {
  it("grants only the evidence reader columns and no write privilege", () => {
    const sql = migrationSql();
    const grants = [
      "brands to venturecite_request",
      "brand_fact_sheet to venturecite_request",
      "brand_fact_scrape_runs to venturecite_request",
      "brand_fact_scrape_pages to venturecite_request",
      "citation_runs to venturecite_request",
      "geo_rankings to venturecite_request",
      "brand_prompts to venturecite_request",
      "prompt_generations to venturecite_request",
      "bofu_content to venturecite_request",
      "tracked_content_urls to venturecite_request",
    ];

    for (const grant of grants) {
      expect(sql).toContain(`grant select (`);
      expect(sql).toContain(grant);
    }

    expect(sql).toContain("revoke insert, update, delete, truncate, references, trigger on table");
    expect(sql).not.toMatch(/grant (select, )?(insert|update|delete)[^;]*venturecite_request/);
  });

  it("enables RLS and defines active owner policies for every source table", () => {
    const sql = migrationSql();
    const tables = [
      "brands",
      "brand_fact_sheet",
      "brand_fact_scrape_runs",
      "brand_fact_scrape_pages",
      "citation_runs",
      "geo_rankings",
      "brand_prompts",
      "prompt_generations",
      "bofu_content",
      "tracked_content_urls",
    ];

    for (const table of tables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("current_setting('app.user_id', true)");
    expect(sql).toContain("current_setting('venturecite.user_id', true)");
    expect(sql).toContain("brand.deleted_at is null");
    expect(sql).toContain("to venturecite_request");
    expect(sql).toContain("for select");
  });
});
