import { sql } from "drizzle-orm";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "../data/requestRepositoryTransaction";
import type { BrandId } from "../domains/work/types";
import type { FactOpportunityRecord } from "../services/work/sources/factOpportunities";
import type { QuestionOpportunityRecord } from "../services/work/sources/questionOpportunities";
import type { PageImprovementOpportunityRecord } from "../services/work/sources/pageImprovementOpportunities";
import type {
  CommunityPostOpportunityRecord,
  ListicleOpportunityRecord,
} from "../services/work/sources/earnedMediaOpportunities";
import type {
  BaselineBrand,
  BaselineGeneration,
  BaselinePrompt,
  BaselineRanking,
  BaselineRun,
} from "../services/work/sources/baselineOpportunities";

type FactOpportunityRow = {
  id: string;
  brandId: string;
  domain: string;
  subcategory: string;
  factKey: string;
  factValue: string;
  source: string | null;
  acceptedAt: Date | string | null;
  dismissedAt: Date | string | null;
  isActive: number | boolean;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  scrapePageId: string | null;
  retrievedAt: Date | string | null;
  sourceExcerpt: string | null;
  metadata: unknown;
};

type QuestionOpportunityRow = {
  id: string;
  brandId: string;
  generationId: string | null;
  generationNumber: number | null;
  prompt: string;
  status: string;
  paused: boolean;
};

type PageImprovementOpportunityRow = {
  id: string;
  brandId: string;
  contentType: string;
  title: string;
  primaryKeyword: string | null;
  targetIntent: string | null;
  status: string | null;
  publishedUrl: string | null;
  publishedAt: Date | string | null;
  updatedAt: Date | string | null;
};

type CommunityPostOpportunityRow = {
  id: string;
  brandId: string;
  platform: string;
  groupName: string;
  groupUrl: string | null;
  title: string | null;
  content: string;
  status: string;
  postUrl: string | null;
  postedAt: Date | string | null;
};

type ListicleOpportunityRow = {
  id: string;
  brandId: string;
  title: string;
  url: string;
  sourcePublication: string | null;
  isIncluded: number;
  outreachStatus: string;
};

type BaselineBrandRow = {
  id: string;
  userId: string;
};

type BaselineGenerationRow = {
  id: string;
  brandId: string;
  generationNumber: number;
  createdAt: Date | string;
};

type BaselinePromptRow = {
  id: string;
  brandId: string;
  generationId: string | null;
  prompt: string;
  status: string;
  paused: boolean;
  region: string;
};

type BaselineRunRow = {
  id: string;
  brandId: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  status: string;
};

type BaselineRankingRow = {
  id: string;
  brandId: string | null;
  brandPromptId: string | null;
  runId: string | null;
  aiPlatform: string;
  prompt: string;
  isCited: number;
  checkedAt: Date | string;
  metadata: unknown;
};

/**
 * Read fact rows through a request transaction that already carries the actor.
 * The query keeps the brand and user predicates inside the storage boundary.
 */
export async function readFactOpportunityRecords(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: BrandId,
): Promise<readonly FactOpportunityRecord[]> {
  const result = await transaction.execute<FactOpportunityRow>(sql`
    select
      fact.id as "id",
      fact.brand_id as "brandId",
      fact.domain as "domain",
      fact.subcategory as "subcategory",
      fact.fact_key as "factKey",
      fact.fact_value as "factValue",
      fact.source as "source",
      fact.accepted_at as "acceptedAt",
      fact.dismissed_at as "dismissedAt",
      fact.is_active as "isActive",
      fact.source_url as "sourceUrl",
      page.canonical_url as "canonicalUrl",
      page.id as "scrapePageId",
      page.fetched_at as "retrievedAt",
      coalesce(fact.source_excerpt, page.excerpt) as "sourceExcerpt",
      fact.metadata as "metadata"
    from public.brands brand
    inner join public.brand_fact_sheet fact
      on fact.brand_id = brand.id
    left join lateral (
      select
        candidate.id,
        candidate.canonical_url,
        candidate.fetched_at,
        candidate.excerpt
      from public.brand_fact_scrape_pages candidate
      inner join public.brand_fact_scrape_runs run
        on run.id = candidate.run_id
       and run.brand_id = brand.id
      where candidate.run_id = fact.run_id
        and candidate.status = 'done'
        and candidate.fetched_at is not null
        and candidate.status_code between 200 and 299
        and (
          candidate.url = fact.source_url
          or candidate.canonical_url = fact.source_url
        )
        and run.status = 'completed'
        and run.completed_at is not null
      order by candidate.fetched_at desc, candidate.id
      limit 1
    ) page on true
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and fact.is_active = 1
    order by fact.domain, fact.subcategory, fact.fact_key, fact.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId,
    domain: row.domain,
    subcategory: row.subcategory,
    factKey: row.factKey,
    factValue: row.factValue,
    source: row.source ?? undefined,
    acceptedAt: isoOrNull(row.acceptedAt),
    dismissedAt: isoOrNull(row.dismissedAt),
    isActive: row.isActive,
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    scrapePageId: row.scrapePageId,
    retrievedAt: isoOrNull(row.retrievedAt),
    sourceExcerpt: row.sourceExcerpt,
    metadata: row.metadata,
  }));
}

/**
 * Read all prompt rows and their immutable generation metadata for one brand.
 * The adapter applies the tracked, paused, and non-empty runnable rules.
 */
export async function readQuestionOpportunityRecords(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: BrandId,
): Promise<readonly QuestionOpportunityRecord[]> {
  const result = await transaction.execute<QuestionOpportunityRow>(sql`
    select
      prompt.id as "id",
      prompt.brand_id as "brandId",
      prompt.generation_id as "generationId",
      generation.generation_number as "generationNumber",
      prompt.prompt as "prompt",
      prompt.status as "status",
      prompt.paused as "paused"
    from public.brands brand
    inner join public.brand_prompts prompt
      on prompt.brand_id = brand.id
    left join public.prompt_generations generation
      on generation.id = prompt.generation_id
     and generation.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
    order by generation.generation_number nulls last,
      generation.id nulls last,
      prompt.order_index,
      prompt.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId,
    generationId: row.generationId,
    generationNumber: row.generationNumber,
    prompt: row.prompt,
    status: normalizePromptStatus(row.status),
    paused: row.paused,
  }));
}

/**
 * Read unpublished BOFU pages with a buyer need that are not tracked yet.
 * The query excludes FAQ rows because content-change evidence reads BOFU rows.
 */
export async function readPageImprovementOpportunityRecords(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: BrandId,
): Promise<readonly PageImprovementOpportunityRecord[]> {
  const result = await transaction.execute<PageImprovementOpportunityRow>(sql`
    select
      content.id as "id",
      content.brand_id as "brandId",
      content.content_type as "contentType",
      content.title as "title",
      content.primary_keyword as "primaryKeyword",
      content.target_intent as "targetIntent",
      content.status as "status",
      content.published_url as "publishedUrl",
      content.published_at as "publishedAt",
      content.updated_at as "updatedAt"
    from public.brands brand
    inner join public.bofu_content content
      on content.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and content.status <> 'published'
      and coalesce(content.target_intent, content.primary_keyword) is not null
      and not exists (
        select 1
        from public.tracked_content_urls tracked
        where tracked.brand_id = content.brand_id
          and tracked.source_type = 'bofu'
          and tracked.source_id = content.id
      )
    order by content.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId,
    contentType: row.contentType,
    title: row.title,
    primaryKeyword: row.primaryKeyword,
    targetIntent: row.targetIntent,
    status: row.status,
    publishedUrl: row.publishedUrl,
    publishedAt: isoOrNull(row.publishedAt),
    updatedAt: isoOrNull(row.updatedAt),
  }));
}

/** Read draft community posts that have content and a target group. */
export async function readCommunityPostOpportunityRecords(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: BrandId,
): Promise<readonly CommunityPostOpportunityRecord[]> {
  const result = await transaction.execute<CommunityPostOpportunityRow>(sql`
    select
      post.id as "id",
      post.brand_id as "brandId",
      post.platform as "platform",
      post.group_name as "groupName",
      post.group_url as "groupUrl",
      post.title as "title",
      post.content as "content",
      post.status as "status",
      post.post_url as "postUrl",
      post.posted_at as "postedAt"
    from public.brands brand
    inner join public.community_posts post
      on post.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and post.status = 'draft'
      and post.content <> ''
      and post.group_url is not null
    order by post.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId,
    platform: row.platform,
    groupName: row.groupName,
    groupUrl: row.groupUrl,
    title: row.title,
    content: row.content,
    status: row.status,
    postUrl: row.postUrl,
    postedAt: isoOrNull(row.postedAt),
  }));
}

/** Read listicles that need new outreach and do not include the brand. */
export async function readListicleOpportunityRecords(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: BrandId,
): Promise<readonly ListicleOpportunityRecord[]> {
  const result = await transaction.execute<ListicleOpportunityRow>(sql`
    select
      listicle.id as "id",
      listicle.brand_id as "brandId",
      listicle.title as "title",
      listicle.url as "url",
      listicle.source_publication as "sourcePublication",
      listicle.is_included as "isIncluded",
      listicle.outreach_status as "outreachStatus"
    from public.brands brand
    inner join public.listicles listicle
      on listicle.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
      and listicle.is_included = 0
      and listicle.outreach_status = 'new'
    order by listicle.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId,
    title: row.title,
    url: row.url,
    sourcePublication: row.sourcePublication,
    isIncluded: row.isIncluded,
    outreachStatus: row.outreachStatus,
  }));
}

/**
 * Read the brand identity used by the baseline source.
 * The owner and soft-delete predicates stay inside this restricted reader.
 */
export async function readBaselineBrand(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: string,
): Promise<BaselineBrand | undefined> {
  const result = await transaction.execute<BaselineBrandRow>(sql`
    select
      brand.id as "id",
      brand.user_id as "userId"
    from public.brands brand
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
  `);
  const row = result.rows[0];
  return row ? { id: row.id, userId: row.userId } : undefined;
}

/**
 * Read all prompt generations for an owned brand.
 * The source chooses the newest generation after this scoped read.
 */
export async function readBaselinePromptGenerations(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: string,
): Promise<readonly BaselineGeneration[]> {
  const result = await transaction.execute<BaselineGenerationRow>(sql`
    select
      generation.id as "id",
      generation.brand_id as "brandId",
      generation.generation_number as "generationNumber",
      generation.created_at as "createdAt"
    from public.brands brand
    inner join public.prompt_generations generation
      on generation.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
    order by generation.created_at desc, generation.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId: row.brandId,
    generationNumber: row.generationNumber,
    createdAt: asDate(row.createdAt),
  }));
}

/**
 * Read prompts and generation links for an owned brand.
 * The source applies tracked and paused rules after the read.
 */
export async function readBaselinePrompts(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: string,
): Promise<readonly BaselinePrompt[]> {
  const result = await transaction.execute<BaselinePromptRow>(sql`
    select
      prompt.id as "id",
      prompt.brand_id as "brandId",
      prompt.generation_id as "generationId",
      prompt.prompt as "prompt",
      prompt.status as "status",
      prompt.paused as "paused",
      prompt.region as "region"
    from public.brands brand
    inner join public.brand_prompts prompt
      on prompt.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
    order by prompt.generation_id nulls last, prompt.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId: row.brandId,
    generationId: row.generationId,
    prompt: row.prompt,
    status: row.status,
    paused: row.paused,
    region: row.region,
  }));
}

/**
 * Read citation runs for an owned brand.
 * The source accepts only succeeded runs with completion dates.
 */
export async function readBaselineCitationRuns(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: string,
): Promise<readonly BaselineRun[]> {
  const result = await transaction.execute<BaselineRunRow>(sql`
    select
      run.id as "id",
      run.brand_id as "brandId",
      run.started_at as "startedAt",
      run.completed_at as "completedAt",
      run.status as "status"
    from public.brands brand
    inner join public.citation_runs run
      on run.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
    order by run.completed_at desc nulls last, run.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId: row.brandId,
    startedAt: asDate(row.startedAt),
    completedAt: row.completedAt === null ? null : asDate(row.completedAt),
    status: row.status,
  }));
}

/**
 * Read rankings for an owned run and brand.
 * The joins prevent a run or ranking from crossing the brand boundary.
 */
export async function readBaselineGeoRankings(
  transaction: RequestRepositoryTransaction,
  actor: RequestActor,
  brandId: string,
  runId: string,
): Promise<readonly BaselineRanking[]> {
  const result = await transaction.execute<BaselineRankingRow>(sql`
    select
      ranking.id as "id",
      ranking.brand_id as "brandId",
      ranking.brand_prompt_id as "brandPromptId",
      ranking.run_id as "runId",
      ranking.ai_platform as "aiPlatform",
      ranking.prompt as "prompt",
      ranking.is_cited as "isCited",
      ranking.checked_at as "checkedAt",
      ranking.metadata as "metadata"
    from public.brands brand
    inner join public.citation_runs run
      on run.id = ${runId}
     and run.brand_id = brand.id
    inner join public.geo_rankings ranking
      on ranking.run_id = run.id
     and ranking.brand_id = brand.id
    where brand.id = ${brandId}
      and brand.user_id = ${actor.userId}
      and brand.deleted_at is null
    order by ranking.checked_at, ranking.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    brandId: row.brandId,
    brandPromptId: row.brandPromptId,
    runId: row.runId,
    aiPlatform: row.aiPlatform,
    prompt: row.prompt,
    isCited: row.isCited,
    checkedAt: asDate(row.checkedAt),
    metadata: row.metadata,
  }));
}

function normalizePromptStatus(value: string): QuestionOpportunityRecord["status"] {
  if (value === "tracked" || value === "suggested" || value === "archived") return value;
  return "archived";
}

function isoOrNull(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
