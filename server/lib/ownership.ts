import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";

// Thrown by the require* helpers when an entity can't be found OR when the
// caller doesn't own it. Handlers catch this and convert to 401/404.
export class OwnershipError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireUser(req: Request): { id: string; isAdmin?: number; accessTier?: string; email?: string } {
  const user = (req as any).user;
  if (!user) throw new OwnershipError(401, "Not authenticated");
  return user;
}

// Every entity in the system is owned by a user either directly (brands,
// citations) or through a brand (everything else). These helpers run one query
// that joins the entity to its owning brand where necessary and returns the
// row only if the requesting user owns it. On any miss — 404, never 403 — to
// avoid leaking whether the id exists.

export async function requireBrand(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.brands)
    .where(and(eq(schema.brands.id, id), eq(schema.brands.userId, userId)))
    .limit(1);
  if (!row) throw new OwnershipError(404, "Brand not found");
  return row;
}

async function loadEntityThroughBrand(
  table: any,
  id: string,
  userId: string,
  notFoundLabel: string,
): Promise<any> {
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  if (!row) throw new OwnershipError(404, notFoundLabel);
  const brandId = (row as any).brandId;
  if (!brandId) throw new OwnershipError(404, notFoundLabel);
  const [brand] = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.userId, userId)))
    .limit(1);
  if (!brand) throw new OwnershipError(404, notFoundLabel);
  return row;
}

export async function requireArticle(id: string, userId: string): Promise<typeof schema.articles.$inferSelect> {
  return loadEntityThroughBrand(schema.articles, id, userId, "Article not found");
}

export async function requireCompetitor(id: string, userId: string): Promise<typeof schema.competitors.$inferSelect> {
  return loadEntityThroughBrand(schema.competitors, id, userId, "Competitor not found");
}

export async function requireFaq(id: string, userId: string): Promise<typeof schema.faqItems.$inferSelect> {
  return loadEntityThroughBrand(schema.faqItems, id, userId, "FAQ not found");
}

export async function requireListicle(id: string, userId: string): Promise<typeof schema.listicles.$inferSelect> {
  return loadEntityThroughBrand(schema.listicles, id, userId, "Listicle not found");
}

export async function requireBofuContent(id: string, userId: string): Promise<typeof schema.bofuContent.$inferSelect> {
  return loadEntityThroughBrand(schema.bofuContent, id, userId, "BOFU content not found");
}

export async function requireHallucination(id: string, userId: string): Promise<typeof schema.brandHallucinations.$inferSelect> {
  return loadEntityThroughBrand(schema.brandHallucinations, id, userId, "Hallucination not found");
}

export async function requireBrandFact(id: string, userId: string): Promise<typeof schema.brandFactSheet.$inferSelect> {
  return loadEntityThroughBrand(schema.brandFactSheet, id, userId, "Brand fact not found");
}

export async function requireBrandMention(id: string, userId: string): Promise<typeof schema.brandMentions.$inferSelect> {
  return loadEntityThroughBrand(schema.brandMentions, id, userId, "Brand mention not found");
}

export async function requireAiSource(id: string, userId: string): Promise<typeof schema.aiSources.$inferSelect> {
  return loadEntityThroughBrand(schema.aiSources, id, userId, "AI source not found");
}

export async function requirePromptTest(id: string, userId: string): Promise<typeof schema.promptTestRuns.$inferSelect> {
  return loadEntityThroughBrand(schema.promptTestRuns, id, userId, "Prompt test not found");
}

export async function requireAgentTask(id: string, userId: string): Promise<typeof schema.agentTasks.$inferSelect> {
  return loadEntityThroughBrand(schema.agentTasks, id, userId, "Agent task not found");
}

export async function requireOutreachCampaign(id: string, userId: string): Promise<typeof schema.outreachCampaigns.$inferSelect> {
  return loadEntityThroughBrand(schema.outreachCampaigns, id, userId, "Outreach campaign not found");
}

export async function requireAutomationRule(id: string, userId: string): Promise<typeof schema.automationRules.$inferSelect> {
  return loadEntityThroughBrand(schema.automationRules, id, userId, "Automation rule not found");
}

export async function requirePublicationTarget(id: string, userId: string): Promise<typeof schema.publicationTargets.$inferSelect> {
  return loadEntityThroughBrand(schema.publicationTargets, id, userId, "Publication target not found");
}

export async function requireOutreachEmail(id: string, userId: string): Promise<typeof schema.outreachEmails.$inferSelect> {
  return loadEntityThroughBrand(schema.outreachEmails, id, userId, "Outreach email not found");
}

export async function requireCommunityPost(id: string, userId: string): Promise<typeof schema.communityPosts.$inferSelect> {
  return loadEntityThroughBrand(schema.communityPosts, id, userId, "Community post not found");
}

export async function requirePromptPortfolio(id: string, userId: string): Promise<typeof schema.promptPortfolio.$inferSelect> {
  return loadEntityThroughBrand(schema.promptPortfolio, id, userId, "Prompt not found");
}

export async function requireCitationQuality(id: string, userId: string): Promise<typeof schema.citationQuality.$inferSelect> {
  return loadEntityThroughBrand(schema.citationQuality, id, userId, "Citation quality entry not found");
}

export async function requireKeywordResearch(id: string, userId: string): Promise<typeof schema.keywordResearch.$inferSelect> {
  return loadEntityThroughBrand(schema.keywordResearch, id, userId, "Keyword research not found");
}

export async function requireAlertSetting(id: string, userId: string): Promise<typeof schema.alertSettings.$inferSelect> {
  return loadEntityThroughBrand(schema.alertSettings, id, userId, "Alert setting not found");
}

// Citations are user-owned directly via citations.userId.
export async function requireCitation(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.citations)
    .where(and(eq(schema.citations.id, id), eq(schema.citations.userId, userId)))
    .limit(1);
  if (!row) throw new OwnershipError(404, "Citation not found");
  return row;
}

// Returns the set of brand ids owned by the user. Use this to filter global
// list queries down to user-owned rows when the storage method doesn't
// accept a brandId filter. O(one query per request), cache per-request if
// perf matters.
export async function getUserBrandIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(eq(schema.brands.userId, userId));
  return new Set(rows.map((r) => r.id));
}

// Utility to pluck a whitelisted set of fields from an untrusted body. Never
// spread req.body straight into a storage call — use this.
export function pickFields<T extends Record<string, any>>(
  body: unknown,
  allowed: readonly (keyof T)[],
): Partial<T> {
  if (!body || typeof body !== "object") return {};
  const out: Partial<T> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      (out as any)[key] = (body as any)[key];
    }
  }
  return out;
}

// Send OwnershipError as the right HTTP response. Call from a route catch.
export function sendOwnershipError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof OwnershipError) {
    res.status(err.status).json({ success: false, error: err.message });
    return true;
  }
  return false;
}
