import fs from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  brandCapabilityEvents,
  brandGoals,
  businessResultEvents,
  workAwardEvents,
  workOutcomeReviews,
  workTaskEvidence,
  workTaskEvents,
  workTasks,
} from "../../shared/schema/work";

const migrationPath = path.resolve(process.cwd(), "migrations/0131_work_domain.sql");

const workTables = {
  brand_goals: brandGoals,
  work_tasks: workTasks,
  work_task_evidence: workTaskEvidence,
  work_task_events: workTaskEvents,
  work_award_events: workAwardEvents,
  brand_capability_events: brandCapabilityEvents,
  business_result_events: businessResultEvents,
  work_outcome_reviews: workOutcomeReviews,
} as const;

function readMigration(): string {
  return fs.readFileSync(migrationPath, "utf8");
}

function normalizeSql(source: string): string {
  return source
    .replace(/^\s*--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tableBody(sql: string, table: string): string {
  const marker = `create table if not exists public.${table} (`;
  const start = sql.indexOf(marker);
  expect(start, `missing ${marker}`).toBeGreaterThanOrEqual(0);

  let depth = 1;
  const bodyStart = start + marker.length;
  for (let cursor = bodyStart; cursor < sql.length; cursor += 1) {
    if (sql[cursor] === "(") depth += 1;
    if (sql[cursor] === ")") depth -= 1;
    if (depth === 0) return sql.slice(bodyStart, cursor);
  }

  throw new Error(`unclosed definition for ${table}`);
}

function splitTopLevelItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let item = "";

  for (const character of body) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      items.push(item.trim());
      item = "";
      continue;
    }
    item += character;
  }
  if (item.trim()) items.push(item.trim());
  return items;
}

function migratedColumnNames(sql: string, table: string): string[] {
  return splitTopLevelItems(tableBody(sql, table))
    .filter((item) => !item.startsWith("constraint "))
    .map((item) => item.split(/\s+/, 1)[0])
    .sort();
}

function declaredColumnNames(table: (typeof workTables)[keyof typeof workTables]): string[] {
  return Object.values(getTableColumns(table))
    .map((column) => column.name)
    .sort();
}

function declaredConstraintNames(table: (typeof workTables)[keyof typeof workTables]): string[] {
  const config = getTableConfig(table);
  const explicitlyNamedForeignKeys = new Set([
    "work_tasks_goal_brand_fk",
    "work_task_evidence_task_scope_fk",
    "work_task_events_task_scope_fk",
    "work_award_events_task_scope_fk",
    "work_award_events_reversal_reference_fk",
    "brand_capability_events_task_scope_fk",
    "work_outcome_reviews_task_scope_fk",
    "work_outcome_reviews_business_result_scope_fk",
  ]);
  return [
    ...config.uniqueConstraints.map((constraint) => constraint.name),
    ...config.foreignKeys
      .map((foreignKey) => foreignKey.getName())
      .filter((name) => explicitlyNamedForeignKeys.has(name)),
    ...config.checks.map((check) => check.name),
  ].sort();
}

function policyBody(sql: string, policyName: string): string {
  const marker = `create policy ${policyName} `;
  const start = sql.indexOf(marker);
  expect(start, `missing ${marker}`).toBeGreaterThanOrEqual(0);
  const nextPolicy = sql.indexOf("create policy ", start + marker.length);
  return sql.slice(start, nextPolicy === -1 ? sql.length : nextPolicy);
}

describe("work domain migration", () => {
  it("creates every first-release work table with normalized SQL", () => {
    const sql = normalizeSql(readMigration());

    for (const table of Object.keys(workTables)) {
      expect(sql).toContain(`create table if not exists public.${table} (`);
    }
  });

  it("keeps every Drizzle work column in the SQL migration", () => {
    const sql = normalizeSql(readMigration());

    for (const [table, declaration] of Object.entries(workTables)) {
      expect(migratedColumnNames(sql, table)).toEqual(declaredColumnNames(declaration));
      expect(getTableName(declaration)).toBe(table);
    }
  });

  it("declares the scope keys and task child foreign keys", () => {
    const sql = normalizeSql(readMigration());

    for (const [table, declaration] of Object.entries(workTables)) {
      for (const constraint of declaredConstraintNames(declaration)) {
        expect(sql, `${table} is missing ${constraint}`).toContain(`constraint ${constraint}`);
      }
    }

    expect(sql).toContain(
      "constraint work_tasks_goal_brand_fk foreign key (goal_id, brand_id, user_id) references public.brand_goals(id, brand_id, user_id)",
    );
    expect(sql).toContain(
      "constraint work_task_evidence_task_scope_fk foreign key (task_id, brand_id, user_id, task_version) references public.work_tasks(id, brand_id, user_id, task_version) on delete cascade",
    );
    expect(sql).toContain(
      "constraint work_award_events_reversal_reference_fk foreign key (reversal_reference, brand_id, user_id, task_id, task_version) references public.work_award_events(id, brand_id, user_id, task_id, task_version)",
    );
    expect(sql).toContain(
      "constraint work_outcome_reviews_business_result_scope_fk foreign key (business_result_event_id, brand_id, user_id) references public.business_result_events(id, brand_id, user_id)",
    );
    expect(sql).toContain(
      "create unique index if not exists work_award_events_reversal_reference_uq on public.work_award_events (reversal_reference) where reversal_reference is not null",
    );
  });

  it("contains ownership indexes, domain checks, and signed award rules", () => {
    const sql = normalizeSql(readMigration());

    for (const index of [
      "brand_goals_brand_id_idx",
      "work_tasks_brand_state_updated_idx",
      "work_task_evidence_brand_task_role_idx",
      "work_task_events_brand_created_idx",
      "work_award_events_brand_occurred_idx",
      "work_award_events_reversal_reference_uq",
      "brand_capability_events_brand_created_idx",
      "work_outcome_reviews_brand_created_idx",
      "business_result_events_brand_occurred_idx",
    ]) {
      expect(sql).toContain(index);
    }

    for (const check of [
      "work_tasks_state_check",
      "work_task_evidence_role_check",
      "work_task_events_prior_state_check",
      "work_award_events_points_check",
      "work_award_events_reversal_reference_check",
      "brand_capability_events_task_version_required_check",
    ]) {
      expect(sql).toContain(check);
    }

    const capabilityDefinition = tableBody(sql, "brand_capability_events");
    expect(capabilityDefinition).toContain(
      "constraint brand_capability_events_task_version_required_check check ( (task_id is null and task_version is null) or (task_id is not null and task_version is not null) )",
    );
    expect(sql).toContain("prior_state is null or prior_state in (");
    expect(sql).toContain("award_status = 'awarded' and points > 0 and reversal_reference is null");
    expect(sql).toContain(
      "award_status = 'reversed' and points < 0 and reversal_reference is not null",
    );
    expect(sql).toContain(
      "award_status = 'adjustment' and points <> 0 and reversal_reference is null",
    );
    expect(sql).toContain(
      "constraint brand_capability_events_brand_event_key_uq unique (brand_id, event_key)",
    );
    expect(sql).toContain(
      "constraint business_result_events_brand_event_key_uq unique (brand_id, event_key)",
    );
    expect(sql).toContain("where conname = 'work_award_events_award_key_uq'");
  });

  it("enables ownership RLS and gives immutable evidence no update grant", () => {
    const sql = normalizeSql(readMigration());

    for (const table of Object.keys(workTables)) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    const policies = [
      ["brand_goals", "select"],
      ["brand_goals", "insert"],
      ["brand_goals", "update"],
      ["work_tasks", "select"],
      ["work_tasks", "insert"],
      ["work_tasks", "update"],
      ["work_task_evidence", "select"],
      ["work_task_evidence", "insert"],
      ["work_task_events", "select"],
      ["work_task_events", "insert"],
      ["work_award_events", "select"],
      ["work_award_events", "insert"],
      ["brand_capability_events", "select"],
      ["brand_capability_events", "insert"],
      ["work_outcome_reviews", "select"],
      ["work_outcome_reviews", "insert"],
      ["work_outcome_reviews", "update"],
      ["business_result_events", "select"],
      ["business_result_events", "insert"],
      ["business_result_events", "update"],
    ] as const;

    for (const [table, operation] of policies) {
      const policyName = `${table}_request_${operation}`;
      expect(sql).toContain(
        `create policy ${policyName} on public.${table} for ${operation} to venturecite_request`,
      );
      const body = policyBody(sql, policyName);
      expect(body).toContain(
        "user_id = nullif((select current_setting('venturecite.user_id', true)), '')",
      );
      expect(body).toMatch(
        /(?:brands|brand)\.user_id = nullif\(\(select current_setting\('venturecite\.user_id', true\)\), ''\)/,
      );
      expect(body).toMatch(/(?:brands|brand)\.deleted_at is null/);
    }

    expect(sql).toContain(
      "brands.user_id = nullif((select current_setting('venturecite.user_id', true)), '')",
    );
    expect(sql).toContain("brands.deleted_at is null");
    expect(sql).toContain(
      "grant select, insert on table public.work_task_evidence, public.work_task_events, public.work_award_events, public.brand_capability_events to venturecite_request",
    );
    expect(sql).not.toMatch(/grant select, insert, update on table[^;]*public\.work_task_evidence/);
  });

  it("constrains outcome reviews to one per task version and cycle", () => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0135_work_outcome_review_unique.sql"),
      "utf8",
    );
    expect(sql).toMatch(/work_outcome_reviews_task_cycle_key/);
    expect(sql).toMatch(/task_id,\s*task_version,\s*cycle_key/);
  });

  it("records the actor who accepted a fact", () => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0136_brand_fact_sheet_accepted_by.sql"),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS accepted_by/i);
    expect(sql).toMatch(/REFERENCES public\.users\s*\(id\)\s*ON DELETE SET NULL/i);
  });

  it("records a per-observation outcome", () => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0137_geo_rankings_outcome.sql"),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS outcome/i);
    expect(sql).toMatch(/'successful'/);
    expect(sql).toMatch(/'unavailable'/);
    expect(sql).toMatch(/'failed'/);
  });

  it("records the ranking that confirmed a repair", () => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "migrations/0138_hallucination_resolved_ranking.sql"),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS resolved_ranking_id/i);
  });
});
