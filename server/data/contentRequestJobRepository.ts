import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { contentGenerationJobs, type ContentGenerationJob } from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

const contentRequestJobColumns = {
  id: contentGenerationJobs.id,
  brandId: contentGenerationJobs.brandId,
  status: contentGenerationJobs.status,
  requestPayload: contentGenerationJobs.requestPayload,
  articleId: contentGenerationJobs.articleId,
  errorMessage: contentGenerationJobs.errorMessage,
  errorKind: contentGenerationJobs.errorKind,
  createdAt: contentGenerationJobs.createdAt,
  startedAt: contentGenerationJobs.startedAt,
  completedAt: contentGenerationJobs.completedAt,
};

export type ContentRequestJob = Pick<ContentGenerationJob, keyof typeof contentRequestJobColumns>;

export type ContentRequestJobRepository = {
  get(id: string): Promise<ContentRequestJob | undefined>;
  getActive(): Promise<ContentRequestJob | undefined>;
  getRecentCompleted(since: Date): Promise<ContentRequestJob | undefined>;
  enqueueGeneration(input: ContentRequestGenerationInput): Promise<ContentRequestGenerationResult>;
  cancel(id: string): Promise<ContentRequestCancellationResult>;
  cancelForArticle(articleId: string): Promise<ContentRequestCancellationResult>;
};

export type ContentRequestGenerationInput = {
  articleId: string;
  brandId: string;
  requestPayload: Record<string, unknown>;
  keywords: string[];
  industry: string;
  contentType: string;
  targetCustomers: string | null;
  geography: string | null;
  contentStyle: "b2b" | "b2c";
};

export type ContentRequestGenerationResult =
  | { kind: "created"; jobId: string; status: "pending" }
  | { kind: "not_found" }
  | { kind: "conflict"; status: string }
  | { kind: "quota"; cap: number };

export type ContentRequestCancellationResult =
  | { kind: "cancelled"; status: "cancelled" }
  | { kind: "already_terminal"; status: string }
  | { kind: "not_found" }
  | { kind: "no_active_job"; status: string };

const generationCommandRowSchema = z.object({
  kind: z.enum(["created", "not_found", "conflict", "quota"]),
  job_id: z.string().nullable(),
  article_status: z.string().nullable(),
  quota_cap: z.number().int().nullable(),
});

const cancellationCommandRowSchema = z.object({
  kind: z.enum(["cancelled", "already_terminal", "not_found", "no_active_job"]),
  status: z.string().nullable(),
});

function firstRow(result: unknown): unknown {
  if (Array.isArray(result)) return result[0];
  if (typeof result !== "object" || result === null || !("rows" in result)) return undefined;
  const rows = result.rows;
  return Array.isArray(rows) ? rows[0] : undefined;
}

function parseGenerationCommand(result: unknown): ContentRequestGenerationResult {
  const row = generationCommandRowSchema.parse(firstRow(result));
  switch (row.kind) {
    case "created":
      if (row.job_id === null) throw new Error("Generation command returned no job");
      return { kind: "created", jobId: row.job_id, status: "pending" };
    case "conflict":
      if (row.article_status === null) throw new Error("Generation command returned no status");
      return { kind: "conflict", status: row.article_status };
    case "quota":
      if (row.quota_cap === null) throw new Error("Generation command returned no quota");
      return { kind: "quota", cap: row.quota_cap };
    case "not_found":
      return { kind: "not_found" };
  }
}

function parseCancellationCommand(result: unknown): ContentRequestCancellationResult {
  const row = cancellationCommandRowSchema.parse(firstRow(result));
  switch (row.kind) {
    case "cancelled":
      return { kind: "cancelled", status: "cancelled" };
    case "already_terminal":
      if (row.status === null) throw new Error("Cancellation command returned no status");
      return { kind: "already_terminal", status: row.status };
    case "no_active_job":
      if (row.status === null) throw new Error("Cancellation command returned no article status");
      return { kind: "no_active_job", status: row.status };
    case "not_found":
      return { kind: "not_found" };
  }
}

export function createContentRequestJobRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): ContentRequestJobRepository {
  const run = <T>(
    operation: (transaction: RequestRepositoryTransaction) => Promise<T>,
  ): Promise<T> =>
    database.transaction(async (transaction) => {
      await setRestrictedRequestContext({
        actor,
        role: "venturecite_content_request",
        transaction,
      });
      return operation(transaction);
    });

  return {
    get(id: string): Promise<ContentRequestJob | undefined> {
      return run(async (transaction) => {
        const [job] = await transaction
          .select(contentRequestJobColumns)
          .from(contentGenerationJobs)
          .where(eq(contentGenerationJobs.id, id))
          .limit(1);
        return job;
      });
    },

    getActive(): Promise<ContentRequestJob | undefined> {
      return run(async (transaction) => {
        const [job] = await transaction
          .select(contentRequestJobColumns)
          .from(contentGenerationJobs)
          .where(inArray(contentGenerationJobs.status, ["pending", "running"]))
          .orderBy(desc(contentGenerationJobs.createdAt))
          .limit(1);
        return job;
      });
    },

    getRecentCompleted(since: Date): Promise<ContentRequestJob | undefined> {
      return run(async (transaction) => {
        const [job] = await transaction
          .select(contentRequestJobColumns)
          .from(contentGenerationJobs)
          .where(
            and(
              eq(contentGenerationJobs.status, "succeeded"),
              gte(contentGenerationJobs.completedAt, since),
            ),
          )
          .orderBy(desc(contentGenerationJobs.completedAt))
          .limit(1);
        return job;
      });
    },

    enqueueGeneration(
      input: ContentRequestGenerationInput,
    ): Promise<ContentRequestGenerationResult> {
      return run(async (transaction) => {
        const keywords = sql`ARRAY[${sql.join(
          input.keywords.map((keyword) => sql`${keyword}`),
          sql`, `,
        )}]::text[]`;
        const result = await transaction.execute(sql`
          SELECT *
          FROM private.request_enqueue_content_generation(
            ${input.articleId},
            ${input.brandId},
            ${JSON.stringify(input.requestPayload)}::jsonb,
            ${keywords},
            ${input.industry},
            ${input.contentType},
            ${input.targetCustomers},
            ${input.geography},
            ${input.contentStyle}
          )
        `);
        return parseGenerationCommand(result);
      });
    },

    cancel(id: string): Promise<ContentRequestCancellationResult> {
      return run(async (transaction) => {
        const result = await transaction.execute(sql`
          SELECT * FROM private.request_cancel_content_generation(${id})
        `);
        return parseCancellationCommand(result);
      });
    },

    cancelForArticle(articleId: string): Promise<ContentRequestCancellationResult> {
      return run(async (transaction) => {
        const result = await transaction.execute(sql`
          SELECT * FROM private.request_cancel_content_generation_for_article(${articleId})
        `);
        return parseCancellationCommand(result);
      });
    },
  };
}
