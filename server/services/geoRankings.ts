// GEO ranking business logic extracted from server/routes/articles.ts
// (phase B7-15). Pure functions: explicit parameters in, plain data out or
// throws. No Express types, no req/res.

import { storage } from "../storage";

export async function createGeoRankingObservation(params: {
  articleId: string;
  brandId: string | null;
  aiPlatform: unknown;
  prompt: unknown;
  rank: unknown;
  isCited: unknown;
  citationContext: unknown;
}) {
  const { articleId, brandId, aiPlatform, prompt, rank, isCited, citationContext } = params;
  return storage.createGeoRanking({
    articleId,
    brandId,
    aiPlatform,
    prompt,
    rank: rank ?? null,
    isCited: isCited ? 1 : 0,
    citationContext: citationContext ?? null,
  } as any);
}

export async function listGeoRankingsForArticle(articleId: string) {
  return storage.getGeoRankings(articleId);
}

async function articleIdsOwnedByBrands(brandIds: Set<string>): Promise<Set<string>> {
  const allArticles = await storage.getArticles();
  return new Set(allArticles.filter((a) => a.brandId && brandIds.has(a.brandId)).map((a) => a.id));
}

// No articleId filter: return rankings only for articles the caller owns.
export async function listGeoRankingsForOwner(brandIds: Set<string>) {
  const articleIds = await articleIdsOwnedByBrands(brandIds);
  const allRankings = await storage.getGeoRankings();
  return allRankings.filter((r: any) => r.articleId && articleIds.has(r.articleId));
}

export async function listGeoRankingsByPlatformForOwner(platform: string, brandIds: Set<string>) {
  const articleIds = await articleIdsOwnedByBrands(brandIds);
  const all = await storage.getGeoRankingsByPlatform(platform);
  return all.filter((r: any) => r.articleId && articleIds.has(r.articleId));
}
