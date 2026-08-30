// Direct, no-HTTP tests for server/services/factSheetStream.ts (phase
// B7-16 service extraction). HTTP/SSE-level behavior for the stream route
// is already covered by tests/unit/factSheetSseStream.test.ts; this file
// proves the extracted cursor/mapping logic itself, without an Express app,
// request, response, or open socket.

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  listScrapePagesForRun: vi.fn(),
  listFactsByRunIdSince: vi.fn(),
  listFactScrapeLogsForRun: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: storageMock }));

const {
  parseLastEventId,
  getNewFactSheetPages,
  getNewFactSheetFacts,
  getFactSheetSourceUpdateEvents,
} = await import("../../server/services/factSheetStream");

beforeEach(() => {
  for (const stub of Object.values(storageMock)) stub.mockReset();
});

describe("parseLastEventId", () => {
  it("returns empty cursors for undefined input", () => {
    expect(parseLastEventId(undefined)).toEqual({ lastPageId: "", lastFactId: "" });
  });

  it("splits 'page:fact' into both halves", () => {
    expect(parseLastEventId("p-5:f-10")).toEqual({ lastPageId: "p-5", lastFactId: "f-10" });
  });

  it("defaults the missing half to empty when only one side is given", () => {
    expect(parseLastEventId("p-5")).toEqual({ lastPageId: "p-5", lastFactId: "" });
  });
});

describe("getNewFactSheetPages", () => {
  it("emits only pages newer than the cursor and advances it", async () => {
    storageMock.listScrapePagesForRun.mockResolvedValue([
      { id: "p-3", url: "https://a", status: "ok", factCount: 1 },
      { id: "p-7", url: "https://b", status: "ok", factCount: 0 },
    ]);
    const result = await getNewFactSheetPages("run-1", "p-5");
    expect(result.events.map((e) => e.id)).toEqual(["p-7"]);
    expect(result.lastPageId).toBe("p-7");
  });

  it("emits every page when the cursor is empty", async () => {
    storageMock.listScrapePagesForRun.mockResolvedValue([
      { id: "p-1", url: "https://a", status: "ok" },
      { id: "p-2", url: "https://b", status: "ok" },
    ]);
    const result = await getNewFactSheetPages("run-1", "");
    expect(result.events).toHaveLength(2);
    expect(result.lastPageId).toBe("p-2");
  });
});

describe("getNewFactSheetFacts", () => {
  it("passes the cursor to storage and maps new rows", async () => {
    storageMock.listFactsByRunIdSince.mockResolvedValue([
      { id: "f-1", domain: "biz", subcategory: "name", factKey: "k", factValue: "v" },
    ]);
    const result = await getNewFactSheetFacts("run-1", "f-10");
    expect(storageMock.listFactsByRunIdSince).toHaveBeenCalledWith("run-1", "f-10", 100);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("f-1");
    expect(result.lastFactId).toBe("f-1");
  });

  it("passes null (not empty string) to storage when the cursor is empty", async () => {
    storageMock.listFactsByRunIdSince.mockResolvedValue([]);
    await getNewFactSheetFacts("run-1", "");
    expect(storageMock.listFactsByRunIdSince).toHaveBeenCalledWith("run-1", null, 100);
  });
});

describe("getFactSheetSourceUpdateEvents", () => {
  it("maps db source names to emit names and statuses, keeping only the latest per source", async () => {
    storageMock.listFactScrapeLogsForRun.mockResolvedValue([
      {
        source: "user_enrich",
        status: "done",
        factCount: 2,
        errorKind: null,
        createdAt: new Date("2025-01-01T00:00:00Z"),
      },
      {
        source: "search_llm",
        status: "failed",
        factCount: 0,
        errorKind: "llm_error",
        createdAt: new Date("2025-01-01T00:00:01Z"),
      },
    ]);
    const events = await getFactSheetSourceUpdateEvents("run-1");
    expect(events).toEqual([
      { source: "userEnrich", status: "done", facts: 2, errorKind: null },
      { source: "searchLlm", status: "failed", facts: 0, errorKind: "llm_error" },
    ]);
  });

  it("omits sources with no log row and maps any non-done/failed status to in_progress", async () => {
    storageMock.listFactScrapeLogsForRun.mockResolvedValue([
      {
        source: "static_pages",
        status: "pending",
        factCount: 0,
        errorKind: null,
        createdAt: new Date(),
      },
    ]);
    const events = await getFactSheetSourceUpdateEvents("run-1");
    expect(events).toEqual([
      { source: "staticPages", status: "in_progress", facts: 0, errorKind: null },
    ]);
  });
});
