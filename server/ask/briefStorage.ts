// Business brief persistence (business-context.md Business brief tab).
// One row per brand. `readBrief` resolves productsServices/marketsAudiences
// from `brands` (the source of truth once accepted) rather than this
// table's draft columns, so a later edit on the settings page and a later
// edit here can never silently diverge - both write the same two brand
// columns, and both read them back the same way.
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { Brand } from "@shared/schema";
import type { AskBriefSource, AskBriefView, SaveAskBriefInput } from "@shared/ask/brief";

export class BriefConflictError extends Error {}

function toSources(raw: unknown): AskBriefSource[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is AskBriefSource =>
      !!s &&
      typeof s === "object" &&
      typeof (s as AskBriefSource).url === "string" &&
      typeof (s as AskBriefSource).quote === "string",
  );
}

function hasAnyContent(brief: schema.AskBusinessBriefRow | null, brand: Brand): boolean {
  if (brand.description || brand.targetAudience) return true;
  if (!brief) return false;
  return !!(
    brief.goals ||
    brief.currentPriorities ||
    brief.peopleCapacity ||
    brief.constraints ||
    brief.draftProductsServices ||
    brief.draftMarketsAudiences
  );
}

export async function readBrief(brand: Brand): Promise<AskBriefView> {
  const [row] = await db
    .select()
    .from(schema.askBusinessBriefs)
    .where(eq(schema.askBusinessBriefs.brandId, brand.id))
    .limit(1);

  // No ask_business_briefs row yet, but the brand already carries real
  // description/targetAudience - from onboarding's own website autofill,
  // which predates this feature entirely. Treat that as an already-accepted
  // brief rather than a fresh draft: there is nothing to review, and
  // auto-generating a website draft on top of values a human already set
  // would be pure noise. A brand with neither a row nor existing content is
  // the only case that is genuinely "draft" (see readBrief's own use in
  // BusinessBriefTab.tsx's auto-generate effect).
  const status: AskBriefView["status"] = row
    ? (row.status as AskBriefView["status"])
    : brand.description || brand.targetAudience
      ? "accepted"
      : "draft";
  const accepted = status === "accepted";
  return {
    status,
    scrapeStatus: (row?.scrapeStatus as AskBriefView["scrapeStatus"]) ?? "none",
    goals: row?.goals ?? "",
    // Once accepted, `brands` is the source of truth (04-implementation-plan
    // wasn't explicit here, but 02-platform-analysis §6 is: these two fields
    // already have ~50 other read sites). Before that, the unsaved draft
    // text lives only on this row.
    productsServices: accepted
      ? (brand.description ?? "")
      : (row?.draftProductsServices ?? brand.description ?? ""),
    marketsAudiences: accepted
      ? (brand.targetAudience ?? "")
      : (row?.draftMarketsAudiences ?? brand.targetAudience ?? ""),
    currentPriorities: row?.currentPriorities ?? "",
    peopleCapacity: row?.peopleCapacity ?? "",
    constraints: row?.constraints ?? "",
    sources: toSources(row?.sources),
    brandUpdatedAt: brand.updatedAt.toISOString(),
    acceptedAt: row?.acceptedAt?.toISOString() ?? null,
    hasAnyContent: hasAnyContent(row ?? null, brand),
  };
}

// "Save brief" - the one write path for this tab (no separate "Use this
// brief" / "Dismiss" flow, see shared/ask/brief.ts's header). Accepts
// whatever is currently on the form, including an unedited website draft,
// and:
//   1. writes productsServices/marketsAudiences onto `brands` (source of
//      truth), guarded by the optimistic-concurrency token so a save here
//      can't silently overwrite an edit made on the settings page a moment
//      before;
//   2. upserts the other four fields plus status='accepted' onto
//      ask_business_briefs.
export async function saveBrief(
  brand: Brand,
  userId: string,
  input: SaveAskBriefInput,
): Promise<AskBriefView> {
  if (brand.updatedAt.toISOString() !== input.brandUpdatedAt) {
    throw new BriefConflictError(
      "This brand's profile changed elsewhere since you loaded the brief. Reload and try again.",
    );
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    const updatedBrands = await tx
      .update(schema.brands)
      .set({
        description: input.productsServices || null,
        targetAudience: input.marketsAudiences || null,
        updatedAt: now,
      })
      .where(and(eq(schema.brands.id, brand.id), eq(schema.brands.updatedAt, brand.updatedAt)))
      .returning({ id: schema.brands.id });
    if (updatedBrands.length === 0) {
      throw new BriefConflictError(
        "This brand's profile changed elsewhere since you loaded the brief. Reload and try again.",
      );
    }

    const [existing] = await tx
      .select({ id: schema.askBusinessBriefs.id, sources: schema.askBusinessBriefs.sources })
      .from(schema.askBusinessBriefs)
      .where(eq(schema.askBusinessBriefs.brandId, brand.id))
      .limit(1);

    if (existing) {
      await tx
        .update(schema.askBusinessBriefs)
        .set({
          status: "accepted",
          goals: input.goals || null,
          currentPriorities: input.currentPriorities || null,
          peopleCapacity: input.peopleCapacity || null,
          constraints: input.constraints || null,
          acceptedBy: userId,
          acceptedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.askBusinessBriefs.id, existing.id));
    } else {
      await tx.insert(schema.askBusinessBriefs).values({
        brandId: brand.id,
        status: "accepted",
        goals: input.goals || null,
        currentPriorities: input.currentPriorities || null,
        peopleCapacity: input.peopleCapacity || null,
        constraints: input.constraints || null,
        acceptedBy: userId,
        acceptedAt: now,
      });
    }
  });

  const [freshBrand] = await db
    .select()
    .from(schema.brands)
    .where(eq(schema.brands.id, brand.id))
    .limit(1);
  return readBrief(freshBrand);
}

export type StoreDraftInput = {
  draftProductsServices: string | null;
  draftMarketsAudiences: string | null;
  sources: AskBriefSource[];
  scrapeStatus: "ready" | "failed";
};

// Written by server/ask/briefWebsiteDraft.ts once a scrape resolves. Never
// touches `brands` - the draft stays off the source of truth until Save
// brief runs, per the "stays separate" rule.
export async function storeWebsiteDraft(brandId: string, input: StoreDraftInput): Promise<void> {
  const [existing] = await db
    .select({ id: schema.askBusinessBriefs.id, status: schema.askBusinessBriefs.status })
    .from(schema.askBusinessBriefs)
    .where(eq(schema.askBusinessBriefs.brandId, brandId))
    .limit(1);

  // Never overwrite an already-accepted brief's draft columns with a later
  // scrape - the brief the user already saved wins.
  if (existing?.status === "accepted") return;

  if (existing) {
    await db
      .update(schema.askBusinessBriefs)
      .set({
        draftProductsServices: input.draftProductsServices,
        draftMarketsAudiences: input.draftMarketsAudiences,
        sources: input.sources,
        scrapeStatus: input.scrapeStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.askBusinessBriefs.id, existing.id));
  } else {
    await db.insert(schema.askBusinessBriefs).values({
      brandId,
      draftProductsServices: input.draftProductsServices,
      draftMarketsAudiences: input.draftMarketsAudiences,
      sources: input.sources,
      scrapeStatus: input.scrapeStatus,
    });
  }
}

export async function markScrapeRunning(brandId: string): Promise<boolean> {
  const [existing] = await db
    .select({
      id: schema.askBusinessBriefs.id,
      scrapeStatus: schema.askBusinessBriefs.scrapeStatus,
    })
    .from(schema.askBusinessBriefs)
    .where(eq(schema.askBusinessBriefs.brandId, brandId))
    .limit(1);
  if (existing?.scrapeStatus === "running") return false; // already in flight
  if (existing) {
    await db
      .update(schema.askBusinessBriefs)
      .set({ scrapeStatus: "running", updatedAt: new Date() })
      .where(eq(schema.askBusinessBriefs.id, existing.id));
  } else {
    await db.insert(schema.askBusinessBriefs).values({ brandId, scrapeStatus: "running" });
  }
  return true;
}

// Read the brief's non-brand fields for context assembly
// (server/ask/context.ts) - goals/priorities/capacity/constraints only, and
// only when status='accepted': a draft's unsaved text must never reach the
// model, matching "stays separate until you choose Save brief".
export async function readAcceptedBriefLayers(brandId: string): Promise<{
  goals: string | null;
  currentPriorities: string | null;
  peopleCapacity: string | null;
  constraints: string | null;
} | null> {
  const [row] = await db
    .select({
      status: schema.askBusinessBriefs.status,
      goals: schema.askBusinessBriefs.goals,
      currentPriorities: schema.askBusinessBriefs.currentPriorities,
      peopleCapacity: schema.askBusinessBriefs.peopleCapacity,
      constraints: schema.askBusinessBriefs.constraints,
    })
    .from(schema.askBusinessBriefs)
    .where(eq(schema.askBusinessBriefs.brandId, brandId))
    .limit(1);
  if (!row || row.status !== "accepted") return null;
  return {
    goals: row.goals,
    currentPriorities: row.currentPriorities,
    peopleCapacity: row.peopleCapacity,
    constraints: row.constraints,
  };
}
