// Business logic for brand prompt tags: the duplicate-name guard on create,
// and the tags+counts join used by the Tags column.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split.

import { storage } from "../storage";
import type { Brand } from "@shared/schema";
import type { PromptTag } from "@shared/schema";

export type CreatePromptTagResult =
  { outcome: "duplicate" } | { outcome: "created"; data: PromptTag };

export async function createPromptTag(
  brand: Brand,
  name: string,
  color: string | null,
): Promise<CreatePromptTagResult> {
  const existing = await storage.getPromptTagsByBrandId(brand.id);
  if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    return { outcome: "duplicate" };
  }
  const tag = await storage.createPromptTag({ brandId: brand.id, name, color });
  return { outcome: "created", data: tag };
}

// Bulk tags + promptCount join for the table's Tags management view.
export async function listPromptTagsWithCounts(brand: Brand) {
  const [tags, counts] = await Promise.all([
    storage.getPromptTagsByBrandId(brand.id),
    storage.getPromptTagCounts(brand.id),
  ]);
  return tags.map((t) => ({ ...t, promptCount: counts[t.id] ?? 0 }));
}
