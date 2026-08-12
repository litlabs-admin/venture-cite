import { redditPublicFetch } from "../redditFetch";
import { passesBrandPresenceGate } from "../brandPresenceGate";
import { acquireOrWait } from "../rateLimitBuckets";
import type { MentionPlatform } from "../canonicalUrl";

export type RedditScanInput = {
  query: string;
  variations: string[];
  brandId: string;
  sinceUnix?: number;
};

export type RedditMention = {
  platform: MentionPlatform;
  sourceUrl: string;
  sourceTitle: string;
  mentionContext: string;
  authorUsername?: string;
  mentionedAt?: Date;
  mentionLocation: "post" | "comment";
  matchedVariation: string;
  matchedField: "title" | "selftext" | "body" | "comment";
  engagementInputs: { ups: number; comments: number };
};

interface RedditPostData {
  id: string;
  title: string;
  selftext?: string;
  permalink: string;
  author: string;
  ups: number;
  num_comments: number;
  created_utc?: number;
  over_18?: boolean;
  removed_by_category?: string | null;
  subreddit?: string;
}

interface RedditCommentData {
  id: string;
  body?: string;
  author?: string;
  permalink?: string;
  ups?: number;
  created_utc?: number;
  replies?: RedditListing | string;
}

interface RedditChild {
  kind: string;
  data: RedditPostData | RedditCommentData;
}

interface RedditListing {
  kind: "Listing";
  data: { children: RedditChild[] };
}

function collectComments(listing: RedditListing): RedditCommentData[] {
  const results: RedditCommentData[] = [];
  const queue: RedditChild[] = [...(listing.data?.children ?? [])];
  while (queue.length > 0) {
    const child = queue.shift()!;
    if (child.kind === "more") continue;
    if (child.kind !== "t1") continue;
    const c = child.data as RedditCommentData;
    results.push(c);
    if (c.replies && typeof c.replies === "object" && c.replies.kind === "Listing") {
      for (const nested of c.replies.data?.children ?? []) {
        queue.push(nested);
      }
    }
  }
  return results;
}

// Minimal Atom/RSS parser tailored to Reddit's /search.rss output.
// Reddit returns <entry> elements with title, link, author, updated, content.
// We extract title + permalink + summary text and run the gate on title+summary.
type RssItem = {
  title: string;
  permalink: string; // https://www.reddit.com/r/.../comments/<id>/...
  summaryText: string; // HTML-stripped body excerpt
  author?: string;
  updated?: Date;
};

function parseRedditRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .trim();
    const linkHref = block.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
    const author = block.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/)?.[1]?.trim();
    const updatedStr = block.match(/<updated>([^<]+)<\/updated>/)?.[1];
    const contentRaw = block.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? "";
    const summaryText = contentRaw
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!linkHref || !title) continue;
    items.push({
      title,
      permalink: linkHref,
      summaryText,
      author,
      updated: updatedStr ? new Date(updatedStr) : undefined,
    });
  }
  return items;
}

/**
 * Scan Reddit for brand mentions.
 *
 * Two execution modes, both unauthenticated:
 *   1. Public JSON - /search.json against www.reddit.com. Comment-tree
 *      expansion is SKIPPED (it would burn the unauth quota).
 *   2. RSS fallback (when public JSON returns 403/429) - /search.rss.
 *      Lower fidelity: no engagement scores, no NSFW flag, no comments.
 *
 * THERE IS NO OAUTH PATH - it was removed deliberately. This scanner is
 * unauthenticated by design and carries no Reddit credentials.
 *
 * KNOWN LIMITATION: Reddit currently 403s unauthenticated traffic on BOTH
 * of these endpoints. Measured 2026-07-30 across every tracked brand;
 * source_health's last successful Reddit scan is 2026-05-27. When that
 * happens this returns `failed`, not an empty list - the caller records a
 * source failure, because an empty list would read as "nothing was said
 * about this brand", which is a different and false claim.
 */
export async function scanRedditSource(
  input: RedditScanInput,
): Promise<{ mentions: RedditMention[]; failed?: string }> {
  // First scan (no sinceUnix): cast a wide net with t=year.
  // Subsequent scans (sinceUnix set): only look at the last week to keep
  // requests fast and results fresh.
  const t = input.sinceUnix === undefined ? "year" : "week";

  try {
    // The public path manages its own rate-limit acquires per variation call.
    return await scanViaPublic(input, t);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { mentions: [], failed: `reddit error: ${message}` };
  }
}

// ─── Public path: /search.json with RSS fallback ─────────────────────────────

/**
 * Public-path scan: one field-scoped query per name variation.
 *
 * Why per-variation: Reddit's public /search.json rejects long Lucene queries
 * with HTTP 414 (URI Too Long). One variation per call -
 * `(title:"Samsung" OR selftext:"Samsung")` - stays well under the limit
 * while preserving field-scoping (more precise than unscoped phrase search).
 *
 * Strategy: try variations in order. STOP at the first variation that returns
 * any mentions (no point spending more requests if we already have data).
 * Cap total accumulated mentions at MAX_PUBLIC_MENTIONS as a safety net.
 * Only report failure if EVERY variation's JSON+RSS path failed.
 */
const MAX_PUBLIC_MENTIONS = 100;

async function scanViaPublic(
  input: RedditScanInput,
  t: string,
): Promise<{ mentions: RedditMention[]; failed?: string }> {
  const variations = input.variations.length > 0 ? input.variations : [input.query];

  const seen = new Map<string, RedditMention>();
  const failures: string[] = [];

  for (const variation of variations) {
    if (seen.size >= MAX_PUBLIC_MENTIONS) break;

    const acquired = await acquireOrWait("reddit", input.brandId, 30_000);
    if (!acquired) {
      failures.push(`rate-limited on "${variation}"`);
      continue;
    }

    // Field-scoped Lucene query for one variation. Short enough to avoid 414.
    // sort=relevance matches Reddit's web-search default and surfaces older
    // posts that brand monitors care about. sort=new excludes anything older
    // than a few hours/days for low-volume brands.
    const q = `(title:"${variation}" OR selftext:"${variation}")`;
    const jsonPath = `/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=${t}&limit=25&restrict_sr=false`;
    const jsonRes = await redditPublicFetch(jsonPath);

    let foundForThisVariation = 0;

    if (jsonRes.ok) {
      const json = (await jsonRes.json().catch(() => null)) as RedditListing | null;
      if (json && json.data?.children) {
        for (const child of json.data.children) {
          if (seen.size >= MAX_PUBLIC_MENTIONS) break;
          if (child.kind !== "t3") continue;
          const data = child.data as RedditPostData;
          if (data.over_18 === true) continue;
          if (data.removed_by_category) continue;
          if (data.author === "[deleted]" || data.author === "[removed]") continue;
          if (data.selftext === "[removed]" || data.selftext === "[deleted]") continue;
          const gate = passesBrandPresenceGate(
            { title: data.title, selftext: data.selftext ?? "" },
            input.variations,
          );
          if (!gate.matched) continue;
          const url = `https://reddit.com${data.permalink}`;
          if (seen.has(url)) continue;
          seen.set(url, {
            platform: "reddit" as MentionPlatform,
            sourceUrl: url,
            sourceTitle: data.title.slice(0, 500),
            mentionContext: data.selftext?.slice(0, 2000) ?? "",
            authorUsername: data.author,
            mentionedAt: data.created_utc ? new Date(data.created_utc * 1000) : undefined,
            mentionLocation: "post",
            matchedVariation: gate.matchedVariation,
            matchedField: gate.matchedField,
            engagementInputs: { ups: data.ups || 0, comments: data.num_comments || 0 },
          });
          foundForThisVariation++;
        }
        // JSON succeeded for this variation. If it produced mentions, stop here.
        if (foundForThisVariation > 0) break;
        continue; // JSON ran but matched nothing - try next variation, skip RSS.
      }
    }

    // JSON failed (non-OK or unparseable) - try RSS fallback for this variation.
    const rssPath = `/search.rss?q=${encodeURIComponent(q)}&sort=relevance&t=${t}`;
    const rssRes = await redditPublicFetch(rssPath);
    if (!rssRes.ok) {
      failures.push(`${jsonRes.status}/${rssRes.status} on "${variation}"`);
      continue;
    }
    const xml = await rssRes.text();
    const items = parseRedditRss(xml);
    for (const item of items) {
      if (seen.size >= MAX_PUBLIC_MENTIONS) break;
      const gate = passesBrandPresenceGate(
        { title: item.title, selftext: item.summaryText },
        input.variations,
      );
      if (!gate.matched) continue;
      if (seen.has(item.permalink)) continue;
      seen.set(item.permalink, {
        platform: "reddit" as MentionPlatform,
        sourceUrl: item.permalink,
        sourceTitle: item.title.slice(0, 500),
        mentionContext: item.summaryText.slice(0, 2000),
        authorUsername: item.author,
        mentionedAt: item.updated,
        mentionLocation: "post",
        matchedVariation: gate.matchedVariation,
        matchedField: gate.matchedField,
        engagementInputs: { ups: 0, comments: 0 },
      });
      foundForThisVariation++;
    }
    if (foundForThisVariation > 0) break;
  }

  const mentions = Array.from(seen.values());

  // Only surface failure if NO mentions were found AND every variation failed.
  if (mentions.length === 0 && failures.length === variations.length) {
    return {
      mentions: [],
      // Report what happened, not why. Reddit answers some hosts and
      // refuses others: it returns 403/429 to local and datacenter IPs that
      // it rate-limits, while the deployed environment gets served normally.
      // Naming a universal cause here put a false explanation in front of
      // the user on the one environment where the source works.
      failed: `reddit: ${failures[0] ?? "all variation queries failed"} (public JSON and RSS both refused this request)`,
    };
  }

  return { mentions };
}
