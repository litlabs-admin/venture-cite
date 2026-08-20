import { and, desc, eq } from "drizzle-orm";
import { keywordResearch, type KeywordResearch, type InsertKeywordResearch } from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

const contentRequestKeywordColumns = {
  id: keywordResearch.id,
  brandId: keywordResearch.brandId,
  keyword: keywordResearch.keyword,
  searchVolume: keywordResearch.searchVolume,
  difficulty: keywordResearch.difficulty,
  opportunityScore: keywordResearch.opportunityScore,
  aiCitationPotential: keywordResearch.aiCitationPotential,
  intent: keywordResearch.intent,
  category: keywordResearch.category,
  competitorGap: keywordResearch.competitorGap,
  suggestedContentType: keywordResearch.suggestedContentType,
  relatedKeywords: keywordResearch.relatedKeywords,
  status: keywordResearch.status,
  provenance: keywordResearch.provenance,
  contentGenerated: keywordResearch.contentGenerated,
  articleId: keywordResearch.articleId,
  discoveredAt: keywordResearch.discoveredAt,
  updatedAt: keywordResearch.updatedAt,
};

export type ContentRequestKeyword = Pick<
  KeywordResearch,
  keyof typeof contentRequestKeywordColumns
>;

export type ContentRequestKeywordRepository = {
  list(
    brandId: string,
    filters?: { status?: string; category?: string },
  ): Promise<ContentRequestKeyword[]>;
  listTopOpportunities(brandId: string, limit?: number): Promise<ContentRequestKeyword[]>;
  get(id: string): Promise<ContentRequestKeyword | undefined>;
  update(id: string, patch: ContentRequestKeywordPatch): Promise<ContentRequestKeyword | undefined>;
  delete(id: string): Promise<boolean>;
};

export type ContentRequestKeywordPatch = Partial<
  Pick<
    InsertKeywordResearch,
    | "keyword"
    | "searchVolume"
    | "difficulty"
    | "opportunityScore"
    | "aiCitationPotential"
    | "intent"
    | "category"
    | "competitorGap"
    | "suggestedContentType"
    | "relatedKeywords"
    | "status"
    | "contentGenerated"
  >
>;

export function createContentRequestKeywordRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): ContentRequestKeywordRepository {
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
    list(brandId: string, filters = {}): Promise<ContentRequestKeyword[]> {
      const conditions = [eq(keywordResearch.brandId, brandId)];
      if (filters.status) conditions.push(eq(keywordResearch.status, filters.status));
      if (filters.category) conditions.push(eq(keywordResearch.category, filters.category));
      return run((transaction) =>
        transaction
          .select(contentRequestKeywordColumns)
          .from(keywordResearch)
          .where(and(...conditions)),
      );
    },

    listTopOpportunities(brandId: string, limit = 10): Promise<ContentRequestKeyword[]> {
      return run((transaction) =>
        transaction
          .select(contentRequestKeywordColumns)
          .from(keywordResearch)
          .where(
            and(eq(keywordResearch.brandId, brandId), eq(keywordResearch.status, "discovered")),
          )
          .orderBy(desc(keywordResearch.opportunityScore))
          .limit(limit),
      );
    },

    get(id: string): Promise<ContentRequestKeyword | undefined> {
      return run(async (transaction) => {
        const [keyword] = await transaction
          .select(contentRequestKeywordColumns)
          .from(keywordResearch)
          .where(eq(keywordResearch.id, id))
          .limit(1);
        return keyword;
      });
    },

    update(
      id: string,
      patch: ContentRequestKeywordPatch,
    ): Promise<ContentRequestKeyword | undefined> {
      return run(async (transaction) => {
        const [updated] = await transaction
          .update(keywordResearch)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(keywordResearch.id, id))
          .returning(contentRequestKeywordColumns);
        return updated;
      });
    },

    delete(id: string): Promise<boolean> {
      return run(async (transaction) => {
        const deleted = await transaction
          .delete(keywordResearch)
          .where(eq(keywordResearch.id, id))
          .returning({ id: keywordResearch.id });
        return deleted.length > 0;
      });
    },
  };
}
