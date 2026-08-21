import { and, eq, isNull, sql } from "drizzle-orm";
import { brands, type Brand, type InsertBrand } from "@shared/schema";
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
  createdAt: brands.createdAt,
  updatedAt: brands.updatedAt,
};

export type RequestBrand = Pick<Brand, keyof typeof requestBrandColumns>;

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
  create(brand: RequestBrandCreate): Promise<RequestBrand>;
  update(id: string, patch: RequestBrandPatch): Promise<RequestBrand | undefined>;
  updateIfVersion(
    id: string,
    expectedVersion: number,
    patch: RequestBrandPatch,
  ): Promise<RequestBrand | undefined>;
};

export function createRequestBrandRepository({
  actor,
  database,
}: {
  actor: RequestActor;
  database: typeof db;
}): RequestBrandRepository {
  const run = <T>(
    operation: (transaction: RequestRepositoryTransaction) => Promise<T>,
  ): Promise<T> =>
    database.transaction(async (transaction) => {
      await setRestrictedRequestContext({ actor, role: "venturecite_request", transaction });
      return operation(transaction);
    });

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

    create(brand: RequestBrandCreate): Promise<RequestBrand> {
      return run(async (transaction) => {
        const values = [
          { column: "user_id", value: actor.userId },
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
          .where(and(eq(brands.id, id), isNull(brands.deletedAt)))
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
            and(eq(brands.id, id), eq(brands.version, expectedVersion), isNull(brands.deletedAt)),
          )
          .returning(requestBrandColumns);
        return updated;
      });
    },
  };
}
