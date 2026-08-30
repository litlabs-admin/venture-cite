// Direct, no-HTTP tests for server/services/schemaAudit.ts.
//
// HTTP-level behavior for POST /api/geo-signals/schema-audit is covered by
// the route wiring; this file proves the extracted service functions
// (normaliseUrl, urlHashOf, resolveSchemaCompletenessForArticle,
// runSchemaAudit) work when called directly, including the
// UnreachableUrlError branch that the route maps to a 400.

import { describe, it, expect, vi, beforeEach } from "vitest";

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[],
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  insertedValues: null as Record<string, unknown> | null,
}));

function makeSelectChain(result: unknown) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function makeInsertChain() {
  const chain: any = {
    values: (v: Record<string, unknown>) => {
      dbState.insertedValues = v;
      return chain;
    },
    onConflictDoUpdate: () => Promise.resolve(undefined),
  };
  return chain;
}

dbState.selectMock.mockImplementation(() => makeSelectChain(dbState.selectQueue.shift() ?? []));
dbState.insertMock.mockImplementation(() => makeInsertChain());

vi.mock("../../server/db", () => ({
  db: { select: dbState.selectMock, insert: dbState.insertMock },
  pool: {},
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ssrfStubs = vi.hoisted(() => ({ safeFetchTextWithLockedIp: vi.fn() }));
vi.mock("../../server/lib/ssrf", () => ({
  safeFetchTextWithLockedIp: ssrfStubs.safeFetchTextWithLockedIp,
}));

function queueSelect(result: unknown) {
  dbState.selectQueue.push(result);
}

const {
  normaliseUrl,
  urlHashOf,
  resolveSchemaCompletenessForArticle,
  runSchemaAudit,
  UnreachableUrlError,
} = await import("../../server/services/schemaAudit");

beforeEach(() => {
  dbState.selectMock.mockClear();
  dbState.insertMock.mockClear();
  dbState.selectQueue.length = 0;
  dbState.insertedValues = null;
  ssrfStubs.safeFetchTextWithLockedIp.mockReset();
});

describe("normaliseUrl", () => {
  it("lowercases the host and adds a scheme", () => {
    // A bare-domain URL keeps its "/" - only a *non-root* path's trailing
    // slash is stripped (see the comment in normaliseUrl for why).
    expect(normaliseUrl("Example.com")).toBe("https://example.com/");
    expect(normaliseUrl("https://Example.com/Page/")).toBe("https://example.com/Page");
  });

  it("agrees on the same key for a fragment vs no fragment", () => {
    expect(normaliseUrl("https://example.com/page#a")).toBe(
      normaliseUrl("https://example.com/page"),
    );
  });

  it("strips the default port for the scheme", () => {
    expect(normaliseUrl("https://example.com:443/page")).toBe("https://example.com/page");
  });
});

describe("urlHashOf", () => {
  it("is deterministic and 32 hex chars", () => {
    const h1 = urlHashOf("https://example.com");
    const h2 = urlHashOf("https://example.com");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{32}$/);
  });

  it("differs for different urls", () => {
    expect(urlHashOf("https://example.com/a")).not.toBe(urlHashOf("https://example.com/b"));
  });
});

describe("resolveSchemaCompletenessForArticle", () => {
  it("averages completenessByType from the cached row", async () => {
    queueSelect([{ completenessByType: { Article: 0.5, Organization: 1 } }]);
    const result = await resolveSchemaCompletenessForArticle("https://example.com/post");
    expect(result).toBe(0.75);
  });

  it("returns undefined when there is no cached row", async () => {
    queueSelect([]);
    const result = await resolveSchemaCompletenessForArticle("https://example.com/post");
    expect(result).toBeUndefined();
  });

  it("returns undefined (never throws) when the lookup fails", async () => {
    dbState.selectMock.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const result = await resolveSchemaCompletenessForArticle("https://example.com/post");
    expect(result).toBeUndefined();
  });
});

describe("runSchemaAudit", () => {
  it("returns the cached row when fresh and force is not set", async () => {
    const fetchedAt = new Date();
    queueSelect([
      {
        url: "https://example.com",
        fetchedAt,
        schemas: {
          schemas: [{ schemaType: "Article" }],
          additionalTypes: [],
          totalSchemasFound: 1,
        },
      },
    ]);

    const result = await runSchemaAudit("example.com", false);

    expect(result.fetched).toBe(true);
    expect(result.cachedAt).toBe(fetchedAt);
    expect(ssrfStubs.safeFetchTextWithLockedIp).not.toHaveBeenCalled();
  });

  it("bypasses a fresh cache when force is true", async () => {
    queueSelect([{ url: "https://example.com", fetchedAt: new Date(), schemas: {} }]);
    ssrfStubs.safeFetchTextWithLockedIp.mockResolvedValue({
      status: 200,
      contentType: "text/html",
      text: "<html><head></head><body>no schema here</body></html>",
    });

    const result = await runSchemaAudit("example.com", true);

    expect(ssrfStubs.safeFetchTextWithLockedIp).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(true);
    expect(result.totalSchemasFound).toBe(0);
    expect(dbState.insertMock).toHaveBeenCalledTimes(1);
  });

  it("parses JSON-LD from a fresh fetch and reports schema completeness", async () => {
    queueSelect([]); // no cache
    const html = `<html><head><script type="application/ld+json">
      {"@type":"Article","headline":"h","author":"a","datePublished":"2026-01-01"}
    </script></head><body></body></html>`;
    ssrfStubs.safeFetchTextWithLockedIp.mockResolvedValue({
      status: 200,
      contentType: "text/html",
      text: html,
    });

    const result = await runSchemaAudit("example.com", false);

    const article = (result.schemas as any[]).find((s) => s.schemaType === "Article");
    expect(article.present).toBe(true);
    expect(article.completenessPercent).toBeGreaterThan(0);
    expect(result.fetchError).toBeFalsy();
  });

  it("records a fetchError (and still returns 200-shaped data) on a 404", async () => {
    queueSelect([]);
    ssrfStubs.safeFetchTextWithLockedIp.mockResolvedValue({
      status: 404,
      contentType: "text/html",
      text: "",
    });

    const result = await runSchemaAudit("example.com", false);

    expect(result.fetched).toBe(false);
    expect(result.fetchError).toMatch(/404/);
    // A failed fetch must not poison the 7-day cache.
    expect(dbState.insertMock).not.toHaveBeenCalled();
  });

  it("throws UnreachableUrlError for a private/disallowed host instead of returning data", async () => {
    queueSelect([]);
    ssrfStubs.safeFetchTextWithLockedIp.mockRejectedValue(
      new Error("private IP address is not allowed"),
    );

    await expect(runSchemaAudit("http://169.254.169.254", false)).rejects.toBeInstanceOf(
      UnreachableUrlError,
    );
  });
});
