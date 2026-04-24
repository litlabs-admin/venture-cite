import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { competitorFavicons } from "@shared/schema";
import { logger } from "./logger";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeDomain(domain: string): string | null {
  if (typeof domain !== "string") return null;
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export async function getCompetitorFaviconUrl(domain: string): Promise<string | null> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return null;

  try {
    const [row] = await db
      .select()
      .from(competitorFavicons)
      .where(eq(competitorFavicons.domain, normalized))
      .limit(1);
    if (row && row.fetchedAt) {
      const age = Date.now() - new Date(row.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) return row.iconUrl;
    }
  } catch (err) {
    logger.warn({ err, domain: normalized }, "competitorFavicons: cache lookup failed");
  }

  const iconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(normalized)}&sz=64`;

  try {
    await db.execute(sql`
      INSERT INTO competitor_favicons (domain, icon_url, fetched_at)
      VALUES (${normalized}, ${iconUrl}, now())
      ON CONFLICT (domain) DO UPDATE
      SET icon_url = EXCLUDED.icon_url,
          fetched_at = now()
    `);
  } catch (err) {
    logger.warn({ err, domain: normalized }, "competitorFavicons: upsert failed");
  }

  return iconUrl;
}
