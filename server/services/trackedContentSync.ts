// Tracked-content-URL sync, extracted from server/routes/contentTypes.ts
// (phase B7-13). Shared by the BOFU and FAQ PATCH handlers, both of which
// keep tracked_content_urls in sync with their own publishedUrl column.

import { storage } from "../storage";
import { normalizeUrl } from "../lib/trackedContentMatcher";

// Keep tracked_content_urls in sync with bofu_content and faq_items.
// publishedUrl. Called from PATCH handlers; defensive against partial inputs.
export async function syncTrackedContentUrl(
  sourceType: "bofu" | "faq",
  sourceId: string,
  brandId: string,
  publishedUrl: string | null | undefined,
): Promise<void> {
  if (publishedUrl && typeof publishedUrl === "string" && publishedUrl.trim()) {
    const normalized = normalizeUrl(publishedUrl);
    if (!normalized) return; // unparseable; leave the row unchanged
    await storage.upsertTrackedContentUrl({
      brandId,
      sourceType,
      sourceId,
      url: publishedUrl.trim(),
      normalizedUrl: normalized,
    });
  } else if (publishedUrl === null || publishedUrl === "") {
    // Explicit unpublish - drop the tracking row.
    await storage.deleteTrackedContentUrlBySource(sourceType, sourceId);
  }
}
