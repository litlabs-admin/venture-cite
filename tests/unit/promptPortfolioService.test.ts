// Direct, no-HTTP tests for server/services/promptPortfolio.ts.
//
// These call the extracted service functions directly - proof the B6b
// extraction from server/routes/prompts.ts is genuinely decoupled from
// Express (no req/res, no app, no supertest-style handle() call).
//
// HTTP-level behavior for these same endpoints is unchanged and still
// covered by tests/unit/reDetectAllCooldown.test.ts's route-mounting
// pattern for the file overall; this file exists to prove the service
// layer itself, not to duplicate that coverage.

import { beforeEach, describe, expect, it, vi } from "vitest";

const BRAND_ID = "brand-1";
const BRAND = { id: BRAND_ID, name: "Acme" } as any;

const storageStubs = vi.hoisted(() => ({
  getBrandPromptsByBrandId: vi.fn(),
  archiveBrandPrompts: vi.fn(),
  archiveSuggestedPrompts: vi.fn(),
  promoteSuggestionToTracked: vi.fn(),
  getMaxBrandPromptOrderIndex: vi.fn(),
  createBrandPrompt: vi.fn(),
  updateBrandPromptText: vi.fn(),
  setBrandPromptStatus: vi.fn(),
  archiveBrandPrompt: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const generateBrandPromptsMock = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/promptGenerator", () => ({
  generateBrandPrompts: generateBrandPromptsMock,
}));

const {
  generateInitialPrompts,
  resetTrackedPrompts,
  acceptPromptSuggestion,
  createTrackedPrompt,
  updateTrackedPrompt,
  archiveTrackedPrompt,
} = await import("../../server/services/promptPortfolio");

function prompt(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    brandId: BRAND_ID,
    prompt: "what is acme",
    status: "tracked",
    orderIndex: 0,
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateInitialPrompts", () => {
  it("refuses when tracked prompts already exist", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([prompt()]);
    const result = await generateInitialPrompts(BRAND);
    expect(result).toEqual({ outcome: "already_tracked" });
    expect(generateBrandPromptsMock).not.toHaveBeenCalled();
  });

  it("surfaces an upstream error when generation fails", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    generateBrandPromptsMock.mockResolvedValue({ saved: [], error: "boom" });
    const result = await generateInitialPrompts(BRAND);
    expect(result).toEqual({ outcome: "upstream_error", error: "boom" });
  });

  it("returns the saved prompts on success", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    const saved = [prompt()];
    generateBrandPromptsMock.mockResolvedValue({ saved });
    const result = await generateInitialPrompts(BRAND);
    expect(result).toEqual({ outcome: "ok", data: saved });
  });
});

describe("resetTrackedPrompts", () => {
  it("archives both sets before regenerating", async () => {
    generateBrandPromptsMock.mockResolvedValue({ saved: [prompt()] });
    await resetTrackedPrompts(BRAND);
    expect(storageStubs.archiveBrandPrompts).toHaveBeenCalledWith(BRAND_ID);
    expect(storageStubs.archiveSuggestedPrompts).toHaveBeenCalledWith(BRAND_ID);
  });

  it("surfaces an upstream error when regeneration fails", async () => {
    generateBrandPromptsMock.mockResolvedValue({ saved: [], error: "no key" });
    const result = await resetTrackedPrompts(BRAND);
    expect(result).toEqual({ outcome: "upstream_error", error: "no key" });
  });
});

describe("acceptPromptSuggestion", () => {
  it("reports not_found when the suggestion id isn't a suggested row on this brand", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    const result = await acceptPromptSuggestion(BRAND, "missing", null);
    expect(result).toEqual({ outcome: "not_found" });
  });

  it("reports replace_target_not_found when replaceTrackedId isn't a tracked row", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([
      prompt({ id: "s1", status: "suggested" }),
    ]);
    const result = await acceptPromptSuggestion(BRAND, "s1", "not-tracked");
    expect(result).toEqual({ outcome: "replace_target_not_found" });
    expect(storageStubs.promoteSuggestionToTracked).not.toHaveBeenCalled();
  });

  it("replaces the target tracked prompt when replaceTrackedId is valid", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([
      prompt({ id: "s1", status: "suggested" }),
      prompt({ id: "t1", status: "tracked" }),
    ]);
    const result = await acceptPromptSuggestion(BRAND, "s1", "t1");
    expect(result).toEqual({ outcome: "replaced" });
    expect(storageStubs.promoteSuggestionToTracked).toHaveBeenCalledWith("s1", "t1");
  });

  it("refuses to add past the tracked cap", async () => {
    const tracked = Array.from({ length: 10 }, (_, i) =>
      prompt({ id: `t${i}`, status: "tracked" }),
    );
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([
      prompt({ id: "s1", status: "suggested" }),
      ...tracked,
    ]);
    const result = await acceptPromptSuggestion(BRAND, "s1", null);
    expect(result).toEqual({ outcome: "tracked_set_full", trackedCount: 10, cap: 10 });
  });

  it("adds the suggestion when there's an open slot", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([
      prompt({ id: "s1", status: "suggested" }),
    ]);
    const result = await acceptPromptSuggestion(BRAND, "s1", null);
    expect(result).toEqual({ outcome: "added" });
    expect(storageStubs.promoteSuggestionToTracked).toHaveBeenCalledWith("s1", null);
  });
});

describe("createTrackedPrompt", () => {
  it("refuses at the tracked cap", async () => {
    const tracked = Array.from({ length: 10 }, (_, i) => prompt({ id: `t${i}` }));
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue(tracked);
    const result = await createTrackedPrompt(BRAND, "new prompt");
    expect(result).toEqual({ outcome: "tracked_set_full", trackedCount: 10, cap: 10 });
  });

  it("rejects a case-insensitive duplicate of an existing tracked prompt", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([prompt({ prompt: "What is Acme" })]);
    const result = await createTrackedPrompt(BRAND, "what is acme");
    expect(result).toEqual({ outcome: "duplicate" });
  });

  it("creates the prompt at the next order index", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    storageStubs.getMaxBrandPromptOrderIndex.mockResolvedValue(4);
    const created = prompt({ id: "new", orderIndex: 5 });
    storageStubs.createBrandPrompt.mockResolvedValue(created);
    const result = await createTrackedPrompt(BRAND, "brand new prompt");
    expect(result).toEqual({ outcome: "created", data: created });
    expect(storageStubs.createBrandPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: BRAND_ID, prompt: "brand new prompt", orderIndex: 5 }),
    );
  });
});

describe("updateTrackedPrompt", () => {
  it("reports not_found for an unknown prompt id", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    const result = await updateTrackedPrompt(BRAND, { promptId: "missing", text: "x" });
    expect(result).toEqual({ outcome: "not_found" });
  });

  it("refuses to archive the last tracked prompt", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([prompt({ id: "p1" })]);
    const result = await updateTrackedPrompt(BRAND, { promptId: "p1", status: "archived" });
    expect(result).toEqual({ outcome: "must_keep_one_tracked" });
    expect(storageStubs.setBrandPromptStatus).not.toHaveBeenCalled();
  });

  it("updates the text of a tracked prompt", async () => {
    const row = prompt({ id: "p1" });
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([row]);
    const updated = prompt({ id: "p1", prompt: "new text" });
    storageStubs.updateBrandPromptText.mockResolvedValue(updated);
    const result = await updateTrackedPrompt(BRAND, { promptId: "p1", text: "new text" });
    expect(result).toEqual({ outcome: "ok", data: updated });
    expect(storageStubs.updateBrandPromptText).toHaveBeenCalledWith("p1", "new text");
  });
});

describe("archiveTrackedPrompt", () => {
  it("reports not_found for a non-tracked prompt id", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([]);
    const result = await archiveTrackedPrompt(BRAND, "missing");
    expect(result).toEqual({ outcome: "not_found" });
  });

  it("refuses to drop below one tracked prompt", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([prompt({ id: "p1" })]);
    const result = await archiveTrackedPrompt(BRAND, "p1");
    expect(result).toEqual({ outcome: "must_keep_one_tracked" });
    expect(storageStubs.archiveBrandPrompt).not.toHaveBeenCalled();
  });

  it("archives when another tracked prompt remains", async () => {
    storageStubs.getBrandPromptsByBrandId.mockResolvedValue([
      prompt({ id: "p1" }),
      prompt({ id: "p2" }),
    ]);
    const result = await archiveTrackedPrompt(BRAND, "p1");
    expect(result).toEqual({ outcome: "archived" });
    expect(storageStubs.archiveBrandPrompt).toHaveBeenCalledWith("p1");
  });
});
