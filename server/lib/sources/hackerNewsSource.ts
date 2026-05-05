import { passesBrandPresenceGate } from "../brandPresenceGate";
import { acquireOrWait } from "../rateLimitBuckets";
import { canonicalizeMentionUrl } from "../canonicalUrl";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HNScanInput = {
  /** Unquoted phrase string (e.g. `"Linear" "linear app"`). Forwarded as-is
   * to the Algolia search query parameter. */
  query: string;
  /** Brand name variations to match against hit fields. */
  variations: string[];
  /** Owning brand — used as the rate-limit scope. */
  brandId: string;
  /** When set, adds `numericFilters=created_at_i>sinceUnix` to the request. */
  sinceUnix?: number;
};

export type HNMention = {
  platform: "hackernews";
  sourceUrl: string;
  sourceTitle: string;
  mentionContext: string;
  authorUsername?: string;
  mentionedAt?: Date;
  mentionLocation: "post" | "comment";
  matchedVariation: string;
  matchedField: "title" | "selftext" | "body" | "comment";
  engagementInputs: { points: number; comments: number };
};

// ---------------------------------------------------------------------------
// Algolia hit shape (subset we care about)
// ---------------------------------------------------------------------------

interface AlgoliaHit {
  objectID: string;
  /** Present on stories */
  title?: string | null;
  story_text?: string | null;
  /** Present on comments */
  comment_text?: string | null;
  story_title?: string | null;
  author?: string | null;
  created_at?: string | null;
  points?: number | null;
  num_comments?: number | null;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

// ---------------------------------------------------------------------------
// /items/:id response shape (nested comment tree)
// ---------------------------------------------------------------------------

interface HNItem {
  id: number;
  type?: string | null;
  author?: string | null;
  title?: string | null;
  text?: string | null;
  points?: number | null;
  created_at?: string | null;
  children?: HNItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maximum number of stories for which we expand the comment tree. */
const COMMENT_EXPANSION_CAP = 10;

/**
 * Walk an HNItem tree (BFS) and collect all comment nodes that have text.
 */
function collectComments(root: HNItem): HNItem[] {
  const result: HNItem[] = [];
  const queue: HNItem[] = root.children ?? [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.text) {
      result.push(node);
    }
    if (node.children && node.children.length > 0) {
      queue.push(...node.children);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/** Maximum number of variations to query individually (caps API calls). */
const MAX_VARIATIONS_PER_SCAN = 5;

export async function scanHackerNewsSource(
  input: HNScanInput,
): Promise<{ mentions: HNMention[]; failed?: string }> {
  try {
    // Variations to query: fall back to input.query if variations is empty.
    const variationsToQuery = (
      input.variations.length > 0 ? input.variations : [input.query]
    ).slice(0, MAX_VARIATIONS_PER_SCAN);

    // Compute clamped sinceUnix once (shared across variation calls).
    let numericFilter = "";
    if (input.sinceUnix !== undefined) {
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      const clamped = Math.min(input.sinceUnix, sevenDaysAgo);
      numericFilter = `&numericFilters=${encodeURIComponent(`created_at_i>${clamped}`)}`;
    }

    // Aggregate hits across variation calls, dedup by objectID.
    const hitsByObjectId = new Map<string, AlgoliaHit>();
    const failures: string[] = [];

    for (const variation of variationsToQuery) {
      // Per-variation rate-limit acquire.
      const acquired = await acquireOrWait("hackernews", input.brandId, 10_000);
      if (!acquired) {
        failures.push(`rate-limited on "${variation}"`);
        continue;
      }
      const url =
        `https://hn.algolia.com/api/v1/search_by_date` +
        `?query=${encodeURIComponent(variation)}` +
        `&tags=${encodeURIComponent("(story,comment)")}` +
        `&hitsPerPage=25` +
        numericFilter;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          failures.push(`HTTP ${res.status} on "${variation}"`);
          continue;
        }
        const data = (await res.json()) as AlgoliaResponse;
        for (const hit of data.hits ?? []) {
          if (!hitsByObjectId.has(hit.objectID)) {
            hitsByObjectId.set(hit.objectID, hit);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`fetch error on "${variation}": ${msg}`);
      }
    }

    // If every variation failed and we got zero hits, surface failure.
    if (hitsByObjectId.size === 0 && failures.length === variationsToQuery.length) {
      return {
        mentions: [],
        failed: `hackernews: ${failures[0] ?? "all variation queries failed"}`,
      };
    }

    const hits = Array.from(hitsByObjectId.values());

    // 4. Process direct search hits
    const mentions: HNMention[] = [];
    const storyHitsForExpansion: AlgoliaHit[] = [];

    for (const hit of hits) {
      const isComment = Boolean(hit.comment_text);

      let gateResult;
      if (isComment) {
        gateResult = passesBrandPresenceGate(
          {
            comment: hit.comment_text,
            title: hit.story_title,
          },
          input.variations,
        );
      } else {
        gateResult = passesBrandPresenceGate(
          {
            title: hit.title,
            selftext: hit.story_text,
          },
          input.variations,
        );
        // Collect story hits for comment-tree expansion (regardless of match result)
        if (hit.title && !hit.comment_text) {
          storyHitsForExpansion.push(hit);
        }
      }

      if (!gateResult.matched) continue;

      const rawUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const sourceUrl = canonicalizeMentionUrl("hackernews", rawUrl);

      const sourceTitle = (
        hit.title ??
        hit.story_title ??
        hit.comment_text?.slice(0, 200) ??
        ""
      ).slice(0, 500);

      const mentionContext = (hit.story_text ?? hit.comment_text ?? "").slice(0, 2000);

      const mentionedAt = hit.created_at ? new Date(hit.created_at) : undefined;

      mentions.push({
        platform: "hackernews",
        sourceUrl,
        sourceTitle,
        mentionContext,
        authorUsername: hit.author ?? undefined,
        mentionedAt,
        mentionLocation: isComment ? "comment" : "post",
        matchedVariation: gateResult.matchedVariation,
        matchedField: gateResult.matchedField,
        engagementInputs: {
          points: hit.points ?? 0,
          comments: hit.num_comments ?? 0,
        },
      });
    }

    // 5. Comment-tree expansion: fetch /items/:id for up to COMMENT_EXPANSION_CAP story hits
    const storiesForExpansion = storyHitsForExpansion.slice(0, COMMENT_EXPANSION_CAP);

    for (const storyHit of storiesForExpansion) {
      // Acquire a fresh rate-limit token per /items call
      const tokenAcquired = await acquireOrWait("hackernews", input.brandId, 5_000);
      if (!tokenAcquired) {
        // Skip comment expansion for this story without failing the whole scan
        continue;
      }

      const itemUrl = `https://hn.algolia.com/api/v1/items/${storyHit.objectID}`;
      let itemRes: Response;
      try {
        itemRes = await fetch(itemUrl);
      } catch {
        // Network error — skip this story
        continue;
      }

      if (!itemRes.ok) {
        // HTTP error — skip this story
        continue;
      }

      let itemData: HNItem;
      try {
        itemData = (await itemRes.json()) as HNItem;
      } catch {
        continue;
      }

      const parentTitle = (storyHit.title ?? "").slice(0, 500);
      const comments = collectComments(itemData);

      for (const comment of comments) {
        if (!comment.text) continue;

        const commentGate = passesBrandPresenceGate({ comment: comment.text }, input.variations);
        if (!commentGate.matched) continue;

        const commentRawUrl = `https://news.ycombinator.com/item?id=${comment.id}`;
        const commentSourceUrl = canonicalizeMentionUrl("hackernews", commentRawUrl);

        mentions.push({
          platform: "hackernews",
          sourceUrl: commentSourceUrl,
          sourceTitle: parentTitle,
          mentionContext: comment.text.slice(0, 2000),
          authorUsername: comment.author ?? undefined,
          mentionedAt: comment.created_at ? new Date(comment.created_at) : undefined,
          mentionLocation: "comment",
          matchedVariation: commentGate.matchedVariation,
          matchedField: commentGate.matchedField,
          engagementInputs: {
            points: comment.points ?? 0,
            comments: 0,
          },
        });
      }
    }

    return { mentions };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { mentions: [], failed: message };
  }
}
