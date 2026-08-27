import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSupabaseMirror } from "../helpers/supabaseMirror";

describe("request RLS migration shape", () => {
  it("temporarily enables SET for the current application connection only", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0112_transitional_request_role_set_option.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror("0112_transitional_request_role_set_option.sql");

    expect(migration).toContain(
      "Revoke this membership option after DATABASE_URL uses venturecite_runtime.",
    );
    expect(migration).toContain("AND member_role.rolname = current_user");
    expect(migration).toContain("WHERE member_role.rolname = role_name");
    expect(migration).toContain("IF reverse_membership_count <> 0");
    expect(migration).toContain("is a member of another role");
    expect(migration).toContain(
      "EXECUTE format(\n        'GRANT %I TO %I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',",
    );
    expect(migration).not.toMatch(/TO current_user/i);
    expect(migration).toContain("IF self_grant_count = 0");
    expect(migration).toContain("safe_self_grant_count <> self_grant_count");
    expect(migration).toContain("membership_count <> original_admin_count + self_grant_count");
    expect(migration).not.toContain("WITH INHERIT FALSE, SET TRUE, ADMIN TRUE");
    expect(migration).not.toMatch(/^\s*REVOKE\b/im);
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("grants brand reads by explicit column and keeps both migration copies equal", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0096_request_rls_foundation.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror("0096_request_rls_foundation.sql");

    expect(migration).toMatch(/grant select\s*\([^)]+\)\s*on public\.brands/is);
    expect(migration).not.toMatch(/grant select on public\.brands/i);
    const selectGrant = migration.match(/grant select\s*\(([^)]+)\)\s*on public\.brands/is)?.[1];
    expect(selectGrant).toContain("id");
    expect(selectGrant).toContain("name");
    expect(selectGrant).toContain("deleted_at");
    expect(selectGrant).not.toContain("autopilot_error");
    expect(selectGrant).not.toContain("deletion_scheduled_for");
    expect(supabaseMigration).toContain("-- Source: migrations/0096_request_rls_foundation.sql");
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("keeps content request access read-only and hides deleted-brand content", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0097_request_rls_content.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror("0097_request_rls_content.sql");

    expect(migration).not.toMatch(/grant\s+(insert|update|delete)\b/i);
    expect(migration).not.toMatch(/for\s+(insert|update|delete)\b/i);
    expect(migration).toMatch(/brands_content_select[\s\S]+deleted_at is null/i);
    expect(migration).toMatch(
      /content_generation_jobs_content_request_select[\s\S]+brands\.deleted_at is null/i,
    );
    expect(migration).toMatch(/request_payload[\s\S]+error_kind/i);
    expect(migration).not.toMatch(/grant select\s*\([^)]*openai_response_id/is);
    expect(migration).not.toMatch(/grant select\s*\([^)]*advance_token/is);
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("grants the deletion preview only its foreign-key columns", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0114_request_brand_deletion_preview.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror("0114_request_brand_deletion_preview.sql");

    expect(migration).toMatch(
      /grant select \(brand_id\)\s+on public\.brand_prompts to venturecite_content_request/i,
    );
    expect(migration).toMatch(
      /grant select \(brand_id\)\s+on public\.citation_runs to venturecite_content_request/i,
    );
    expect(migration).not.toMatch(/grant select \([^)]*\bid\b[^)]*\)/i);
    expect(migration).toContain("brand_prompts_content_request_select");
    expect(migration).toContain("citation_runs_content_request_select");
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("grants only owned distribution and keyword request writes", () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "migrations/0105_content_request_distribution_keyword_writes.sql",
      ),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror(
      "0105_content_request_distribution_keyword_writes.sql",
    );

    expect(migration).toMatch(/grant insert\s*\(id, article_id, platform, status, metadata\)/i);
    expect(migration).toMatch(
      /grant select\s*\([\s\S]*platform_post_id[\s\S]*platform_url[\s\S]*error[\s\S]*\)\s*on public\.distributions/is,
    );
    expect(migration).toMatch(/grant update\s*\(status, distributed_at, metadata, error\)/i);
    expect(migration).not.toMatch(/grant\s+(?:insert|update)\s*\([^)]*platform_post_id[^)]*\)/i);
    expect(migration).toMatch(/grant update\s*\([\s\S]+updated_at\s*\)/i);
    expect(migration).toMatch(/keyword_research_content_request_update[\s\S]+deleted_at is null/i);
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("grants the article response fields used by the request repository", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0107_content_request_article_response_columns.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror(
      "0107_content_request_article_response_columns.sql",
    );

    expect(migration).toMatch(
      /grant select\s*\([\s\S]*citation_count[\s\S]*human_score[\s\S]*passes_ai_detection[\s\S]*\)\s*on public\.articles/is,
    );
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("keeps the outbox boundary actor-bound and cancellation-safe", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0098_transactional_outbox.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror("0098_transactional_outbox.sql");

    expect(migration).toContain("outbox enqueue actor is required");
    expect(migration).toContain("outbox enqueue user is required");
    expect(migration).toContain("outbox user does not match request actor");
    expect(migration).toContain("outbox brand is required for this command kind");
    expect(migration).toContain("active_role IS DISTINCT FROM required_role");
    expect(migration).toContain("status = 'dead_letter'");
    expect(migration).toContain("venturecite_outbox_worker has unexpected role memberships");
    expect(migration).toContain("venturecite_outbox_worker has unexpected schema privileges");
    expect(migration).toContain("venturecite_outbox_worker has unexpected function privileges");
    expect(migration).toContain("venturecite_outbox_worker has unexpected relation privileges");
    expect(migration).toContain("venturecite_outbox_worker has unexpected database privileges");
    expect(migration).toContain("venturecite_outbox_worker has unexpected type privileges");
    expect(migration).toContain("venturecite_outbox_worker owns unexpected database objects");
    expect(migration).toContain("worker_role_record.rolconfig IS NOT NULL");
    expect(migration).not.toContain("worker_role_record.rolpassword");
    expect(migration).toContain("roleid = worker_role_oid");
    expect(migration).toContain("member = worker_role_oid");
    expect(migration).toContain("OR NOT admin_option");
    expect(migration).toContain("privilege.is_grantable");
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("keeps generation commands actor-bound and worker fields private", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0106_content_request_generation_commands.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror("0106_content_request_generation_commands.sql");

    expect(migration).toContain("private.request_enqueue_content_generation");
    expect(migration).toContain("private.request_cancel_content_generation");
    expect(migration).toContain("private.request_cancel_content_generation_for_article");
    expect(migration).toContain("SET search_path = pg_catalog, public, private");
    expect(migration).toContain("venturecite.user_id");
    expect(migration).toContain("brands.deleted_at IS NULL");
    expect(migration).toContain("brand_row.deleted_at IS NOT NULL");
    expect(migration).toContain("locked_job.created_at >= user_row.usage_reset_date");
    expect(migration).toContain("FROM public.brands AS brands");
    expect(migration).toContain("INTO brand_row");
    expect(migration).toContain("status = 'generating'");
    expect(migration).toContain("articles_used_this_month = articles_used_this_month + 1");
    expect(migration).toContain("WHEN 'pro' THEN 0");
    expect(migration).toContain("WHEN 'agency' THEN 40");
    expect(migration.indexOf("FROM public.users AS users")).toBeLessThan(
      migration.indexOf("INTO brand_row"),
    );
    expect(migration.indexOf("INTO brand_row")).toBeLessThan(
      migration.indexOf("FROM public.articles AS articles", migration.indexOf("INTO brand_row")),
    );
    expect(migration).toContain("refunded_at");
    expect(migration).toContain("job_id = p_job_id");
    expect(migration).not.toContain("openai_response_id");
    expect(migration).not.toContain("stream_buffer");
    expect(migration).not.toMatch(
      /grant\s+(?:select|update|insert)\s+\([^)]*(?:advance_token|openai_response_id|stream_buffer)/is,
    );
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });

  it("records the quota period for safe refunds", () => {
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0109_content_generation_quota_period.sql"),
      "utf8",
    );
    const supabaseMigration = readSupabaseMirror("0109_content_generation_quota_period.sql");

    expect(migration).toContain("quota_reservation_period");
    expect(migration).toContain("content_generation_job_quota_period");
    expect(migration).toContain("IS NOT DISTINCT FROM user_row.usage_reset_date");
    expect(supabaseMigration.replace(/^-- Source:.*\r?\n-- SHA256:.*\r?\n\r?\n/, "")).toBe(
      migration,
    );
  });
});
