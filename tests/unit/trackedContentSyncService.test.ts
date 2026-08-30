// Direct, no-HTTP test for server/services/trackedContentSync.ts (phase
// B7-13 service extraction). Shared by the BOFU and FAQ PATCH handlers in
// server/routes/contentTypes.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  upsertTrackedContentUrl: vi.fn(),
  deleteTrackedContentUrlBySource: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    upsertTrackedContentUrl: stubs.upsertTrackedContentUrl,
    deleteTrackedContentUrlBySource: stubs.deleteTrackedContentUrlBySource,
  },
}));

const { syncTrackedContentUrl } = await import("../../server/services/trackedContentSync");

beforeEach(() => {
  stubs.upsertTrackedContentUrl.mockReset();
  stubs.deleteTrackedContentUrlBySource.mockReset();
});

describe("syncTrackedContentUrl", () => {
  it("upserts a normalized URL when one is provided", async () => {
    await syncTrackedContentUrl("bofu", "bofu-1", "brand-1", "https://Example.com/Post/");

    expect(stubs.upsertTrackedContentUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "brand-1",
        sourceType: "bofu",
        sourceId: "bofu-1",
        url: "https://Example.com/Post/",
      }),
    );
    expect(stubs.deleteTrackedContentUrlBySource).not.toHaveBeenCalled();
  });

  it("deletes the tracking row on explicit unpublish (null)", async () => {
    await syncTrackedContentUrl("faq", "faq-1", "brand-1", null);
    expect(stubs.deleteTrackedContentUrlBySource).toHaveBeenCalledWith("faq", "faq-1");
  });

  it("deletes the tracking row on explicit unpublish (empty string)", async () => {
    await syncTrackedContentUrl("faq", "faq-1", "brand-1", "");
    expect(stubs.deleteTrackedContentUrlBySource).toHaveBeenCalledWith("faq", "faq-1");
  });

  it("leaves the row untouched when publishedUrl is undefined", async () => {
    await syncTrackedContentUrl("faq", "faq-1", "brand-1", undefined);
    expect(stubs.upsertTrackedContentUrl).not.toHaveBeenCalled();
    expect(stubs.deleteTrackedContentUrlBySource).not.toHaveBeenCalled();
  });

  it("skips silently for an unparseable URL", async () => {
    await syncTrackedContentUrl("bofu", "bofu-1", "brand-1", "not a url");
    expect(stubs.upsertTrackedContentUrl).not.toHaveBeenCalled();
    expect(stubs.deleteTrackedContentUrlBySource).not.toHaveBeenCalled();
  });
});
