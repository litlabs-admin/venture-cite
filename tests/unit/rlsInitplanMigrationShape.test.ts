import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootMigrationPath = path.resolve(
  process.cwd(),
  "migrations/0113_rls_current_setting_initplan.sql",
);
const mirrorMigrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260421000113_0113_rls_current_setting_initplan.sql",
);

describe("RLS current_setting initplan migration", () => {
  it("rewrites the 21 audited policies without changing their policy shape", () => {
    const migration = fs.readFileSync(rootMigrationPath, "utf8");
    const policyNames = [...migration.matchAll(/^ALTER POLICY (\S+)/gim)].map(([, name]) => name);

    expect(policyNames).toHaveLength(21);
    expect(new Set(policyNames).size).toBe(21);
    expect(migration).not.toContain("(select nullif(current_setting(");
    expect(migration).toContain(
      "nullif((select current_setting('venturecite.user_id', true)), '')",
    );
    expect(migration).toContain(
      "nullif((select current_setting('venturecite.outbox_user_id', true)), '')",
    );
    expect((migration.match(/nullif\(\(select current_setting\(/g) ?? []).length).toBe(29);
    expect(migration).toMatch(/ALTER POLICY users_request_update[\s\S]+WITH CHECK/);
    expect(migration).toMatch(/ALTER POLICY articles_content_request_update[\s\S]+WITH CHECK/);
    expect(migration).toMatch(/ALTER POLICY distributions_content_request_update[\s\S]+WITH CHECK/);
    expect(migration).toMatch(
      /ALTER POLICY keyword_research_content_request_update[\s\S]+WITH CHECK/,
    );
  });

  it("keeps the Supabase mirror equal to the application migration", () => {
    const migration = fs.readFileSync(rootMigrationPath, "utf8");
    const mirror = fs.readFileSync(mirrorMigrationPath, "utf8");

    expect(mirror).toContain("-- Source: migrations/0113_rls_current_setting_initplan.sql");
    expect(mirror.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(migration);
  });
});
