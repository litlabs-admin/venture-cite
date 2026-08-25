import { and, eq, isNull, sql } from "drizzle-orm";
import {
  articles,
  brandPrompts,
  brands,
  citationRuns,
  type Brand,
  type InsertBrand,
} from "@shared/schema";
import type { db } from "../db";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";
import { setRestrictedRequestContext } from "./restrictedRequestTransaction";

const requestBrandColumns = {
  id: brands.id,
  userId: brands.userId,
  name: brands.name,
  companyName: brands.companyName,
  industry: brands.industry,
  factScrapeEnabled: brands.factScrapeEnabled,
  description: brands.description,
  website: brands.website,
  tone: brands.tone,
  targetAudience: brands.targetAudience,
  products: brands.products,
  keyValues: brands.keyValues,
  uniqueSellingPoints: brands.uniqueSellingPoints,
  brandVoice: brands.brandVoice,
  sampleContent: brands.sampleContent,
  nameVariations: brands.nameVariations,
  logoUrl: brands.logoUrl,
  autoCitationSchedule: brands.autoCitationSchedule,
  autoCitationDay: brands.autoCitationDay,
  autoCitationHour: brands.autoCitationHour,
  autoCitationActive: brands.autoCitationActive,
  version: brands.version,
  monitorMentions: brands.monitorMentions,
  deletedAt: brands.deletedAt,
  createdAt: brands.createdAt,
  updatedAt: brands.updatedAt,
};

const requestBrandSoftDeleteColumns = {
  ...requestBrandColumns,
  deletionScheduledFor: brands.deletionScheduledFor,
};

export type RequestBrand = Pick<Brand, keyof typeof requestBrandColumns>;
export type RequestBrandSoftDeleted = Pick<Brand, keyof typeof requestBrandSoftDeleteColumns>;

export type RequestBrandDeletionPreview = {
  articles: number;
  prompts: number;
  citationRuns: number;
};

const requestBrandInsertColumns = [
  ["name", "name"],
  ["company_name", "companyName"],
  ["industry", "industry"],
  ["fact_scrape_enabled", "factScrapeEnabled"],
  ["description", "description"],
  ["website", "website"],
  ["tone", "tone"],
  ["target_audience", "targetAudience"],
  ["products", "products"],
  ["key_values", "keyValues"],
  ["unique_selling_points", "uniqueSellingPoints"],
  ["brand_voice", "brandVoice"],
  ["sample_content", "sampleContent"],
  ["name_variations", "nameVariations"],
  ["logo_url", "logoUrl"],
] as const;

export type RequestBrandCreate = Pick<
  InsertBrand,
  | "name"
  | "companyName"
  | "industry"
  | "factScrapeEnabled"
  | "description"
  | "website"
  | "tone"
  | "targetAudience"
  | "products"
  | "keyValues"
  | "uniqueSellingPoints"
  | "brandVoice"
  | "sampleContent"
  | "nameVariations"
  | "logoUrl"
>;

export type RequestBrandPatch = Partial<
  Pick<
    InsertBrand,
    | "name"
    | "companyName"
    | "industry"
    | "factScrapeEnabled"
    | "description"
    | "website"
    | "tone"
    | "targetAudience"
    | "products"
    | "keyValues"
    | "uniqueSellingPoints"
    | "brandVoice"
    | "sampleContent"
    | "nameVariations"
    | "logoUrl"
    | "autoCitationSchedule"
    | "autoCitationDay"
    | "autoCitationHour"
    | "autoCitationActive"
    | "monitorMentions"
  >
>;

export type RequestBrandRepository = {
  list(): Promise<RequestBrand[]>;
  get(id: string): Promise<RequestBrand | undefined>;
  deletionPreview(id: string): Promise<RequestBrandDeletionPreview | undefined>;
  create(brand: RequestBrandCreate): Promise<RequestBrand>;
  createWithQuota(brand: RequestBrandCreate, maxBrands: number): Promise<RequestBrand>;
  softDelete(id: string, graceDays?: number): Promise<RequestBrandSoftDeleted | undefined>;
  update(id: string, patch: RequestBrandPatch): Promise<RequestBrand | undefined>;
  updateIfVersion(
    id: string,
    expectedVersion: number,
    patch: RequestBrandPatch,
  ): Promise<RequestBrand | undefined>;
};

export class RequestBrandQuotaError extends Error {
  readonly cap: number;

  constructor(cap: number) {
    super(`Brand limit reached. Your plan allows ${cap} active brands.`);
    this.name = "RequestBrandQuotaError";
    this.cap = cap;
  }
}

export function createRequestBrandRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): RequestBrandRepository {
  const runWithRole = <T>(
    role: "venturecite_request" | "venturecite_content_request",
    operation: (transaction: RequestRepositoryTransaction) => Promise<T>,
  ): Promise<T> =>
    database.transaction(async (transaction) => {
      await setRestrictedRequestContext({ actor, role, transaction });
      return operation(transaction);
    });
  const run = <T>(
    operation: (transaction: RequestRepositoryTransaction) => Promise<T>,
  ): Promise<T> => runWithRole("venturecite_request", operation);

  return {
    list(): Promise<RequestBrand[]> {
      return run((transaction) =>
        transaction.select(requestBrandColumns).from(brands).where(isNull(brands.deletedAt)),
      );
    },

    get(id: string): Promise<RequestBrand | undefined> {
      return run(async (transaction) => {
        const [brand] = await transaction
          .select(requestBrandColumns)
          .from(brands)
          .where(and(eq(brands.id, id), isNull(brands.deletedAt)))
          .limit(1);
        return brand;
      });
    },

    deletionPreview(id: string): Promise<RequestBrandDeletionPreview | undefined> {
      return runWithRole("venturecite_content_request", async (transaction) => {
        const [brand] = await transaction
          .select({ id: brands.id })
          .from(brands)
          .where(and(eq(brands.id, id), isNull(brands.deletedAt)))
          .limit(1);
        if (!brand) return undefined;

        const [articleRow] = await transaction
          .select({ n: sql<number>`count(*)::int` })
          .from(articles)
          .where(eq(articles.brandId, id));
        const [promptRow] = await transaction
          .select({ n: sql<number>`count(*)::int` })
          .from(brandPrompts)
          .where(eq(brandPrompts.brandId, id));
        const [runRow] = await transaction
          .select({ n: sql<number>`count(*)::int` })
          .from(citationRuns)
          .where(eq(citationRuns.brandId, id));

        return {
          articles: articleRow?.n ?? 0,
          prompts: promptRow?.n ?? 0,
          citationRuns: runRow?.n ?? 0,
        };
      });
    },

    create(brand: RequestBrandCreate): Promise<RequestBrand> {
      return run((transaction) => insertBrand(transaction, actor.userId, brand));
    },

    createWithQuota(brand: RequestBrandCreate, maxBrands: number): Promise<RequestBrand> {
      if (!Number.isInteger(maxBrands) || maxBrands < -1) {
        throw new Error("Brand quota must be -1 or a non-negative integer");
      }
      return run(async (transaction) => {
        await transaction.execute(sql`
          select id
          from public.users
          where id = ${actor.userId}
          for update
        `);
        if (maxBrands !== -1) {
          const countResult = await transaction.execute<{ count: number }>(sql`
            select count(id)::int as count
            from public.brands
            where user_id = ${actor.userId}
              and deleted_at is null
          `);
          const count = Number(countResult.rows[0]?.count ?? 0);
          if (count >= maxBrands) throw new RequestBrandQuotaError(maxBrands);
        }
        return insertBrand(transaction, actor.userId, brand);
      });
    },

    softDelete(id: string, graceDays = 30): Promise<RequestBrandSoftDeleted | undefined> {
      if (!Number.isInteger(graceDays) || graceDays < 1 || graceDays > 365) {
        throw new Error("Brand deletion grace period must be between 1 and 365 days");
      }
      const scheduledFor = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
      return run(async (transaction) => {
        const [deleted] = await transaction
          .update(brands)
          .set({
            deletedAt: new Date(),
            deletionScheduledFor: scheduledFor,
            updatedAt: new Date(),
            version: sql`${brands.version} + 1`,
          })
          .where(and(eq(brands.id, id), eq(brands.userId, actor.userId), isNull(brands.deletedAt)))
          .returning(requestBrandSoftDeleteColumns);
        return deleted;
      });
    },

    update(id: string, patch: RequestBrandPatch): Promise<RequestBrand | undefined> {
      return run(async (transaction) => {
        const [updated] = await transaction
          .update(brands)
          .set({
            ...patch,
            updatedAt: new Date(),
            version: sql`${brands.version} + 1`,
          })
          .where(and(eq(brands.id, id), eq(brands.userId, actor.userId), isNull(brands.deletedAt)))
          .returning(requestBrandColumns);
        return updated;
      });
    },

    updateIfVersion(
      id: string,
      expectedVersion: number,
      patch: RequestBrandPatch,
    ): Promise<RequestBrand | undefined> {
      return run(async (transaction) => {
        const [updated] = await transaction
          .update(brands)
          .set({
            ...patch,
            updatedAt: new Date(),
            version: sql`${brands.version} + 1`,
          })
          .where(
            and(
              eq(brands.id, id),
              eq(brands.userId, actor.userId),
              eq(brands.version, expectedVersion),
              isNull(brands.deletedAt),
            ),
          )
          .returning(requestBrandColumns);
        return updated;
      });
    },
  };
}

async function insertBrand(
  transaction: RequestRepositoryTransaction,
  userId: string,
  brand: RequestBrandCreate,
): Promise<RequestBrand> {
  const values = [
    { column: "user_id", value: userId },
    ...requestBrandInsertColumns.map(([column, property]) => ({
      column,
      value: property === "tone" ? (brand.tone ?? "professional") : brand[property],
    })),
  ].filter((entry) => entry.value !== undefined);
  const inserted = await transaction.execute<{ id: string }>(sql`
    insert into ${sql.identifier("public")}.${sql.identifier("brands")}
    (${sql.join(
      values.map((entry) => sql.identifier(entry.column)),
      sql`, `,
    )})
    values (${sql.join(
      // Bind every value as a parameter. Direct interpolation expands
      // array fields into SQL tuples instead of PostgreSQL arrays.
      values.map((entry) => sql.param(entry.value)),
      sql`, `,
    )})
    returning ${brands.id}
  `);
  const createdId = inserted.rows[0]?.id;
  if (!createdId) throw new Error("Brand insert returned no ID");
  const [created] = await transaction
    .select(requestBrandColumns)
    .from(brands)
    .where(and(eq(brands.id, createdId), isNull(brands.deletedAt)))
    .limit(1);
  if (!created) throw new Error("Brand insert returned no row");
  return created;
}
