import { sql } from "drizzle-orm";
import type { RequestActor } from "../../lib/requestActor";
import type { RequestRepositoryTransaction } from "../../data/requestRepositoryTransaction";
import type {
  WorkEvidenceAuthorizationInput,
  WorkEvidenceAuthorizer,
  WorkEvidenceReaderResult,
  WorkEvidenceReaders,
} from "./repository";

/**
 * Creates readers for evidence that already exists in an authoritative domain table.
 * Submitted work evidence is deliberately excluded from every query in this module.
 */
export function createWorkEvidenceReaders(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
): WorkEvidenceReaders {
  return {
    source: (input) => readSource(transaction, actor, input),
    measurement: (input) => readMeasurement(transaction, actor, input),
    content_change: (input) => readContentChange(transaction, actor, input),
    artifact: async () => "owned_unusable",
    fault_repair: async () => "owned_unusable",
    authored_work: async () => "owned_unusable",
    confirmation: async () => "owned_unusable",
    decision: async () => "owned_unusable",
    experiment: async () => "owned_unusable",
  };
}

/**
 * Creates the production authorizer used when a repository does not receive a test adapter.
 * Human confirmations use the current actor and do not authorize confirmation references.
 */
export function createDatabaseWorkEvidenceAuthorizer(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
): WorkEvidenceAuthorizer {
  const readers = createWorkEvidenceReaders(transaction, actor);
  return async (input) => {
    if (input.actor.userId !== actor.userId) return "not_found";

    if (input.verification.kind === "system_check") {
      if (!containsSystemCheckReference(input, input.verification.checkId)) {
        return "invalid_evidence";
      }
      const systemCheck = await readSystemCheck(transaction, actor, input);
      if (systemCheck === "not_found") return "not_found";
      if (systemCheck === "owned_unusable") return "invalid_evidence";
    } else if (input.verification.confirmedByUserId !== actor.userId) {
      return "invalid_evidence";
    }

    for (const reference of input.evidence) {
      if (reference.kind === "confirmation") continue;
      const result = await readReference(readers, input, reference);
      if (result !== "owned_usable") {
        return result === "not_found" ? "not_found" : "invalid_evidence";
      }
    }
    return "authorized";
  };
}

async function readSource(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  input: Parameters<WorkEvidenceReaders["source"]>[0],
): Promise<WorkEvidenceReaderResult> {
  const { reference } = input;
  if (!reference.factId || !reference.scrapePageId || !reference.canonicalUrl) {
    return "owned_unusable";
  }

  const identity = await transaction.execute(sql`
    select 1
    from public.brands brand
    inner join public.brand_fact_sheet fact
      on fact.brand_id = brand.id
    inner join public.brand_fact_scrape_pages page
      on page.id = ${reference.scrapePageId}
     and page.run_id = fact.run_id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and fact.id = ${reference.factId}
  `);
  if (identity.rows.length === 0) return "not_found";

  const checkCondition = reference.checkId
    ? sql`and (run.id = ${reference.checkId} or page.id = ${reference.checkId})`
    : sql``;

  const usable = await transaction.execute(sql`
    select 1
    from public.brands brand
    inner join public.brand_fact_sheet fact
      on fact.brand_id = brand.id
    inner join public.brand_fact_scrape_runs run
      on run.id = fact.run_id
     and run.brand_id = brand.id
    inner join public.brand_fact_scrape_pages page
      on page.id = ${reference.scrapePageId}
     and page.run_id = run.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and fact.id = ${reference.factId}
      and fact.source_url = ${reference.sourceUrl}
      and fact.accepted_at is not null
      and fact.dismissed_at is null
      and fact.is_active = 1
      and run.status in ('completed', 'succeeded')
      and run.completed_at is not null
      and page.status in ('completed', 'succeeded', 'success')
      and page.fetched_at is not null
      and page.status_code between 200 and 299
      and page.canonical_url = ${reference.canonicalUrl}
      and page.fetched_at = ${reference.retrievedAt}
      ${checkCondition}
  `);
  return usable.rows.length > 0 ? "owned_usable" : "owned_unusable";
}

async function readMeasurement(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  input: Parameters<WorkEvidenceReaders["measurement"]>[0],
): Promise<WorkEvidenceReaderResult> {
  const { reference } = input;
  if (!reference.geoRankingId || !reference.citationRunId || !reference.brandPromptId) {
    return "owned_unusable";
  }

  const identity = await transaction.execute(sql`
    select 1
    from public.brands brand
    inner join public.citation_runs run
      on run.brand_id = brand.id
    inner join public.geo_rankings ranking
      on ranking.run_id = run.id
     and ranking.brand_id = brand.id
    inner join public.brand_prompts prompt
      on prompt.id = ranking.brand_prompt_id
     and prompt.brand_id = brand.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and run.id = ${reference.citationRunId}
      and ranking.id = ${reference.geoRankingId}
      and prompt.id = ${reference.brandPromptId}
  `);
  if (identity.rows.length === 0) return "not_found";

  const generationCondition = reference.promptGenerationId
    ? sql`and prompt.generation_id = ${reference.promptGenerationId}
          and exists (
            select 1 from public.prompt_generations generation
            where generation.id = ${reference.promptGenerationId}
              and generation.brand_id = brand.id
          )`
    : sql``;
  const usable = await transaction.execute(sql`
    select 1
    from public.brands brand
    inner join public.citation_runs run
      on run.brand_id = brand.id
    inner join public.geo_rankings ranking
      on ranking.run_id = run.id
     and ranking.brand_id = brand.id
    inner join public.brand_prompts prompt
      on prompt.id = ranking.brand_prompt_id
     and prompt.brand_id = brand.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and run.id = ${reference.citationRunId}
      and ranking.id = ${reference.geoRankingId}
      and prompt.id = ${reference.brandPromptId}
      and ${reference.measurementId} in (ranking.id, run.id)
      and run.status = 'succeeded'
      and run.completed_at is not null
      and ranking.checked_at is not null
      and ranking.ai_platform = ${reference.provider}
      ${generationCondition}
  `);
  return usable.rows.length > 0 ? "owned_usable" : "owned_unusable";
}

async function readContentChange(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  input: Parameters<WorkEvidenceReaders["content_change"]>[0],
): Promise<WorkEvidenceReaderResult> {
  const { reference } = input;
  const normalizedUrl = normalizeUrl(reference.pageUrl);
  if (!normalizedUrl) return "owned_unusable";

  const identity = await transaction.execute(sql`
    select 1
    from public.brands brand
    inner join public.bofu_content content
      on content.brand_id = brand.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and content.id = ${reference.changeId}
  `);
  if (identity.rows.length === 0) return "not_found";

  const usable = await transaction.execute(sql`
    select 1
    from public.brands brand
    inner join public.bofu_content content
      on content.brand_id = brand.id
    inner join public.tracked_content_urls tracked
      on tracked.brand_id = content.brand_id
     and tracked.source_type = 'bofu'
     and tracked.source_id = content.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and content.id = ${reference.changeId}
      and content.status = 'published'
      and content.published_url is not null
      and content.published_at = ${reference.publishedAt}
      and regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(content.published_url), '^https?://', ''),
            '^www\\.',
            ''
          ),
          '[?#].*$',
          ''
        ),
        '/+$',
        ''
      ) = ${normalizedUrl}
      and tracked.normalized_url = ${normalizedUrl}
  `);
  return usable.rows.length > 0 ? "owned_usable" : "owned_unusable";
}

async function readSystemCheck(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  input: WorkEvidenceAuthorizationInput,
): Promise<WorkEvidenceReaderResult> {
  if (input.verification.kind !== "system_check") return "owned_usable";
  const checkId = input.verification.checkId;
  const result = await transaction.execute(sql`
    select 1
    from public.brands brand
    inner join public.brand_fact_sheet fact
      on fact.brand_id = brand.id
    inner join public.brand_fact_scrape_runs run
      on run.brand_id = brand.id
    inner join public.brand_fact_scrape_pages page
      on page.run_id = run.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and fact.run_id = run.id
      and (fact.id = ${checkId} or run.id = ${checkId} or page.id = ${checkId})
      and run.status in ('completed', 'succeeded')
      and run.completed_at is not null
      and page.status in ('completed', 'succeeded', 'success')
      and page.fetched_at is not null
      and page.status_code between 200 and 299
    union all
    select 1
    from public.brands brand
    inner join public.citation_runs run
      on run.brand_id = brand.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and run.id = ${checkId}
      and run.status = 'succeeded'
      and run.completed_at is not null
    union all
    select 1
    from public.brands brand
    inner join public.geo_rankings ranking
      on ranking.brand_id = brand.id
    inner join public.citation_runs run
      on run.id = ranking.run_id
     and run.brand_id = brand.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and ranking.id = ${checkId}
      and run.status = 'succeeded'
      and run.completed_at is not null
      and ranking.checked_at is not null
    union all
    select 1
    from public.brands brand
    inner join public.bofu_content content
      on content.brand_id = brand.id
    inner join public.tracked_content_urls tracked
      on tracked.brand_id = content.brand_id
     and tracked.source_type = 'bofu'
     and tracked.source_id = content.id
    where brand.id = ${input.brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and content.id = ${checkId}
      and content.status = 'published'
      and content.published_url is not null
      and content.published_at is not null
  `);
  return result.rows.length > 0 ? "owned_usable" : "not_found";
}

function containsSystemCheckReference(
  input: WorkEvidenceAuthorizationInput,
  checkId: string,
): boolean {
  return input.evidence.some((reference) => {
    switch (reference.kind) {
      case "source":
        return (
          reference.checkId === checkId ||
          reference.factId === checkId ||
          reference.scrapePageId === checkId
        );
      case "measurement":
        return (
          reference.geoRankingId === checkId ||
          reference.citationRunId === checkId ||
          reference.brandPromptId === checkId ||
          reference.promptGenerationId === checkId
        );
      case "content_change":
        return reference.changeId === checkId;
      default:
        return false;
    }
  });
}

async function readReference(
  readers: WorkEvidenceReaders,
  input: WorkEvidenceAuthorizationInput,
  reference: WorkEvidenceAuthorizationInput["evidence"][number],
): Promise<WorkEvidenceReaderResult> {
  const context = {
    actor: input.actor,
    brandId: input.brandId,
    taskId: input.taskId,
    taskVersion: input.taskVersion,
  };
  switch (reference.kind) {
    case "source":
      return readers.source({ ...context, reference });
    case "artifact":
      return readers.artifact({ ...context, reference });
    case "measurement":
      return readers.measurement({ ...context, reference });
    case "fault_repair":
      return readers.fault_repair({ ...context, reference });
    case "content_change":
      return readers.content_change({ ...context, reference });
    case "authored_work":
      return readers.authored_work({ ...context, reference });
    case "confirmation":
      return readers.confirmation({ ...context, reference });
    case "decision":
      return readers.decision({ ...context, reference });
    case "experiment":
      return readers.experiment({ ...context, reference });
  }
}

function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`.toLowerCase();
  } catch {
    return undefined;
  }
}
