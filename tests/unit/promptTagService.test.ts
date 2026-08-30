// Direct, no-HTTP tests for server/services/promptTags.ts.
// See promptPortfolioService.test.ts for why these exist.

import { beforeEach, describe, expect, it, vi } from "vitest";

const BRAND_ID = "brand-1";
const BRAND = { id: BRAND_ID, name: "Acme" } as any;

const storageStubs = vi.hoisted(() => ({
  getPromptTagsByBrandId: vi.fn(),
  getPromptTagCounts: vi.fn(),
  createPromptTag: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const { createPromptTag, listPromptTagsWithCounts } =
  await import("../../server/services/promptTags");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPromptTag", () => {
  it("refuses a case-insensitive duplicate name", async () => {
    storageStubs.getPromptTagsByBrandId.mockResolvedValue([{ id: "t1", name: "Growth" }]);
    const result = await createPromptTag(BRAND, "growth", null);
    expect(result).toEqual({ outcome: "duplicate" });
    expect(storageStubs.createPromptTag).not.toHaveBeenCalled();
  });

  it("creates the tag when the name is unique", async () => {
    storageStubs.getPromptTagsByBrandId.mockResolvedValue([]);
    const created = { id: "t2", brandId: BRAND_ID, name: "BOFU", color: "#fff" };
    storageStubs.createPromptTag.mockResolvedValue(created);
    const result = await createPromptTag(BRAND, "BOFU", "#fff");
    expect(result).toEqual({ outcome: "created", data: created });
    expect(storageStubs.createPromptTag).toHaveBeenCalledWith({
      brandId: BRAND_ID,
      name: "BOFU",
      color: "#fff",
    });
  });
});

describe("listPromptTagsWithCounts", () => {
  it("joins each tag with its promptCount, defaulting to zero when uncounted", async () => {
    storageStubs.getPromptTagsByBrandId.mockResolvedValue([
      { id: "t1", name: "Growth" },
      { id: "t2", name: "BOFU" },
    ]);
    storageStubs.getPromptTagCounts.mockResolvedValue({ t1: 3 });
    const data = await listPromptTagsWithCounts(BRAND);
    expect(data).toEqual([
      { id: "t1", name: "Growth", promptCount: 3 },
      { id: "t2", name: "BOFU", promptCount: 0 },
    ]);
  });
});
