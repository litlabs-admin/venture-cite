// Business logic for the tracked-prompt portfolio: generation, reset,
// suggestion acceptance, manual creation, editing, and archival.
//
// Extracted verbatim from server/routes/prompts.ts as part of the B6b
// service-layer split. Every function here enforces the same invariant -
// the tracked set never exceeds TRACKED_PROMPTS_CAP and never drops to zero -
// so it belongs in one module rather than being split per-route.
//
// No Express types. Callers (route handlers) resolve `brand` via
// requireBrand first and pass it in.

import { storage } from "../storage";
import { generateBrandPrompts } from "../lib/promptGenerator";
import { TRACKED_PROMPTS_CAP } from "@shared/constants";
import type { Brand, BrandPrompt } from "@shared/schema";

export type GenerateInitialPromptsResult =
  | { outcome: "already_tracked" }
  | { outcome: "upstream_error"; error: string }
  | { outcome: "ok"; data: BrandPrompt[] };

// Seed the initial 10 tracked prompts for a brand. Refuses if tracked
// prompts already exist - callers must use /reset for a destructive redo.
export async function generateInitialPrompts(brand: Brand): Promise<GenerateInitialPromptsResult> {
  const existing = await storage.getBrandPromptsByBrandId(brand.id, { status: "tracked" });
  if (existing.length > 0) {
    return { outcome: "already_tracked" };
  }

  const { saved, error } = await generateBrandPrompts(brand);
  if (error || saved.length === 0) {
    return {
      outcome: "upstream_error",
      error: error || "AI returned no usable prompts. Please try again.",
    };
  }

  return { outcome: "ok", data: saved };
}

export type ResetTrackedPromptsResult =
  { outcome: "upstream_error"; error: string } | { outcome: "ok"; data: BrandPrompt[] };

// Reset: archive every tracked prompt + suggestion, then seed a fresh 10.
export async function resetTrackedPrompts(brand: Brand): Promise<ResetTrackedPromptsResult> {
  await storage.archiveBrandPrompts(brand.id);
  await storage.archiveSuggestedPrompts(brand.id);
  const { saved, error } = await generateBrandPrompts(brand);
  if (error || saved.length === 0) {
    return { outcome: "upstream_error", error: error || "AI returned no usable prompts." };
  }
  return { outcome: "ok", data: saved };
}

// Accept a suggestion. Two modes:
//   * Add: tracked count is below the cap -> promote without archiving
//     anything. `replaceTrackedId` is null.
//   * Replace: tracked count is at the cap -> caller must pass the id of
//     a tracked prompt to archive in the new prompt's place.
export type AcceptSuggestionResult =
  | { outcome: "not_found" }
  | { outcome: "replace_target_not_found" }
  | { outcome: "tracked_set_full"; trackedCount: number; cap: number }
  | { outcome: "replaced" }
  | { outcome: "added" };

export async function acceptPromptSuggestion(
  brand: Brand,
  suggestionId: string,
  replaceTrackedId: string | null,
): Promise<AcceptSuggestionResult> {
  const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
  const suggestion = all.find((p) => p.id === suggestionId && p.status === "suggested");
  if (!suggestion) {
    return { outcome: "not_found" };
  }

  const trackedCount = all.filter((p) => p.status === "tracked").length;

  if (replaceTrackedId) {
    // Replace path - must point at a real tracked prompt on this brand.
    const tracked = all.find((p) => p.id === replaceTrackedId && p.status === "tracked");
    if (!tracked) {
      return { outcome: "replace_target_not_found" };
    }
    await storage.promoteSuggestionToTracked(suggestion.id, tracked.id);
    return { outcome: "replaced" };
  }

  // Add path - only valid when there's an open slot.
  if (trackedCount >= TRACKED_PROMPTS_CAP) {
    return { outcome: "tracked_set_full", trackedCount, cap: TRACKED_PROMPTS_CAP };
  }
  await storage.promoteSuggestionToTracked(suggestion.id, null);
  return { outcome: "added" };
}

export type CreateTrackedPromptResult =
  | { outcome: "tracked_set_full"; trackedCount: number; cap: number }
  | { outcome: "duplicate" }
  | { outcome: "created"; data: BrandPrompt };

// Create one prompt by hand. Subject to the same tracked cap as
// accept-suggestion - the cap is a product rule about how many prompts a
// weekly run covers, not a property of where the prompt came from.
export async function createTrackedPrompt(
  brand: Brand,
  text: string,
): Promise<CreateTrackedPromptResult> {
  const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
  const tracked = all.filter((p) => p.status === "tracked");
  if (tracked.length >= TRACKED_PROMPTS_CAP) {
    return { outcome: "tracked_set_full", trackedCount: tracked.length, cap: TRACKED_PROMPTS_CAP };
  }
  // Case-insensitive duplicate guard: two identical prompts would double
  // the weekly run cost and split one prompt's results across two rows.
  const dupe = tracked.find((p) => p.prompt.trim().toLowerCase() === text.toLowerCase());
  if (dupe) {
    return { outcome: "duplicate" };
  }
  const maxIndex = await storage.getMaxBrandPromptOrderIndex(brand.id);
  const created = await storage.createBrandPrompt({
    brandId: brand.id,
    prompt: text,
    status: "tracked",
    isActive: 1,
    orderIndex: maxIndex + 1,
  });
  return { outcome: "created", data: created };
}

export type UpdateTrackedPromptInput = {
  promptId: string;
  text?: string;
  status?: "tracked" | "archived";
};

export type UpdateTrackedPromptResult =
  | { outcome: "not_found" }
  | { outcome: "must_keep_one_tracked" }
  | { outcome: "tracked_set_full"; trackedCount: number; cap: number }
  | { outcome: "ok"; data: BrandPrompt };

// Inline-edit the text of a tracked prompt, or flip it between tracked and
// archived (the row's ON toggle).
export async function updateTrackedPrompt(
  brand: Brand,
  input: UpdateTrackedPromptInput,
): Promise<UpdateTrackedPromptResult> {
  const hasText = typeof input.text === "string";
  const newText = hasText ? (input.text as string) : "";
  const rawStatus = input.status;
  const hasStatus = rawStatus === "tracked" || rawStatus === "archived";

  const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
  // A status change has to reach archived rows too - that is the whole
  // point of switching one back on - so only the text edit is
  // tracked-only.
  const row = all.find(
    (p) =>
      p.id === input.promptId && (hasStatus ? p.status !== "suggested" : p.status === "tracked"),
  );
  if (!row) return { outcome: "not_found" };

  let updated = row;
  if (hasText) {
    updated = (await storage.updateBrandPromptText(row.id, newText)) ?? updated;
  }
  if (hasStatus && rawStatus !== row.status) {
    const trackedCount = all.filter((p) => p.status === "tracked").length;
    // Same two invariants the other write paths enforce: never leave a
    // brand with zero tracked prompts, never exceed the cap.
    if (rawStatus === "archived" && trackedCount <= 1) {
      return { outcome: "must_keep_one_tracked" };
    }
    if (rawStatus === "tracked" && trackedCount >= TRACKED_PROMPTS_CAP) {
      return { outcome: "tracked_set_full", trackedCount, cap: TRACKED_PROMPTS_CAP };
    }
    updated =
      (await storage.setBrandPromptStatus(row.id, rawStatus as "tracked" | "archived")) ?? updated;
  }
  return { outcome: "ok", data: updated };
}

export type ArchiveTrackedPromptResult =
  { outcome: "not_found" } | { outcome: "must_keep_one_tracked" } | { outcome: "archived" };

// Archive a tracked prompt (drops it from weekly checks).
export async function archiveTrackedPrompt(
  brand: Brand,
  promptId: string,
): Promise<ArchiveTrackedPromptResult> {
  const all = await storage.getBrandPromptsByBrandId(brand.id, { status: "all" });
  const row = all.find((p) => p.id === promptId && p.status === "tracked");
  if (!row) return { outcome: "not_found" };
  const trackedCount = all.filter((p) => p.status === "tracked").length;
  if (trackedCount <= 1) {
    return { outcome: "must_keep_one_tracked" };
  }
  await storage.archiveBrandPrompt(row.id);
  return { outcome: "archived" };
}
