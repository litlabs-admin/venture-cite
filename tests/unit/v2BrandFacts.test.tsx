// @vitest-environment happy-dom
//
// `client/src/v2/data/brandFacts.ts` - the shared read and the five explicit
// writes both board 07 (the Level 1 setup gate) and board 34 (the steady-
// state workspace) call through. This used to be a page-level test of the
// now-deleted `BrandFactsPage` (superseded by board 07 - see
// `client/src/v2/screens/b07-brand-facts/`); the accept-or-amend-or-dismiss
// gate that file asserted at the DOM level is now board 07's and board 34's
// own responsibility (`v2Board07.test.tsx`, `v2Board34.test.tsx`). What
// belongs here is the data layer itself: every hook fires exactly the write
// the person asked for, at the URL and with the body the API actually
// expects, and never on mount.

import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAddFact,
  useAmendFact,
  useApproveFact,
  useBrandFacts,
  useDismissFact,
  useRecheckFact,
  type BrandFactView,
} from "@/v2/data/brandFacts";

function fact(overrides: Partial<BrandFactView> = {}): BrandFactView {
  return {
    id: "fact-1",
    brandId: "brand-1",
    domain: "identity",
    subcategory: "Brand name",
    factKey: "name",
    factValue: "Acme PR",
    confidence: "0.9",
    sourceExcerpt: "Acme PR is a boutique agency.",
    sourceUrl: "https://acme.example/about",
    source: "scraped",
    acceptedAt: null,
    dismissedAt: null,
    lastVerified: "2026-09-08T00:00:00.000Z",
    verificationStatus: "never",
    lastVerificationAt: null,
    verificationAttempts: 0,
    userOverridden: false,
    ...overrides,
  };
}

const writes: { method: string; url: string; body: unknown }[] = [];

function stubFetch(getHandler?: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
    }
    if (getHandler && method === "GET") return getHandler();
    return new Response(JSON.stringify({ success: true, fact: fact(), data: fact() }), {
      status: 200,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  writes.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useBrandFacts", () => {
  it("reads the brand's facts from `{ success, data }` without writing anything", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: [fact()] }), { status: 200 }),
      ),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useBrandFacts("brand-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual([fact()]));
    expect(writes).toHaveLength(0);
  });

  it("is disabled with no brand id, rather than requesting an undefined URL", () => {
    const fetchMock = stubFetch();
    const { Wrapper } = wrapper();
    renderHook(() => useBrandFacts(undefined), { wrapper: Wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useApproveFact", () => {
  it("fires nothing on mount, and exactly one accept POST when called", async () => {
    stubFetch();
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useApproveFact("brand-1"), { wrapper: Wrapper });
    expect(writes).toHaveLength(0);

    await result.current.mutateAsync("fact-1");

    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].url).toContain("/api/brand-fact-sheet/facts/fact-1/accept");
    expect(writes[0].body).toEqual({ dismissOtherSide: false });
  });
});

describe("useAmendFact", () => {
  it("saves the value, then accepts it, in that order", async () => {
    stubFetch();
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAmendFact("brand-1"), { wrapper: Wrapper });

    await result.current.mutateAsync({ factId: "fact-1", factValue: "New value" });

    expect(writes).toHaveLength(2);
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toContain("/api/brand-facts/fact-1");
    expect(writes[0].body).toEqual({ factValue: "New value" });
    expect(writes[1].method).toBe("POST");
    expect(writes[1].url).toContain("/api/brand-fact-sheet/facts/fact-1/accept");
  });

  it("reports which stage failed, not a generic failure, when the accept half fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === "PATCH") return new Response(JSON.stringify({ success: true, data: {} }));
      return new Response(JSON.stringify({ success: false, error: "accept exploded" }), {
        status: 500,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAmendFact("brand-1"), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({ factId: "fact-1", factValue: "New value" }),
    ).rejects.toMatchObject({ stage: "approve" });
    // The PATCH is still in `writes` - the value WAS saved even though the
    // caller sees a rejected promise.
    expect(writes.some((write) => write.method === "PATCH")).toBe(true);
  });
});

describe("useDismissFact", () => {
  it("fires exactly one dismiss POST for the one fact named", async () => {
    stubFetch();
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useDismissFact("brand-1"), { wrapper: Wrapper });

    await result.current.mutateAsync("fact-2");

    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].url).toContain("/api/brand-fact-sheet/facts/fact-2/dismiss");
  });
});

describe("useAddFact", () => {
  it("posts the brand id alongside exactly the fields the form collected", async () => {
    stubFetch();
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAddFact("brand-1"), { wrapper: Wrapper });

    await result.current.mutateAsync({
      domain: "identity",
      subcategory: "Support email",
      factKey: "other_support_email",
      factValue: "hello@acme.example",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].url).toContain("/api/brand-facts");
    expect(writes[0].url).not.toContain("/api/brand-facts/"); // the collection, not one row
    expect(writes[0].body).toEqual({
      brandId: "brand-1",
      domain: "identity",
      subcategory: "Support email",
      factKey: "other_support_email",
      factValue: "hello@acme.example",
    });
  });
});

describe("useRecheckFact", () => {
  it("posts to the v2 recheck route and returns the outcome and the re-read fact", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(
        JSON.stringify({
          success: true,
          data: { outcome: "verified", fact: fact({ verificationStatus: "verified" }) },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useRecheckFact("brand-1"), { wrapper: Wrapper });

    const outcome = await result.current.mutateAsync("fact-1");

    expect(writes).toHaveLength(1);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].url).toContain("/api/v2/brand-facts/fact-1/recheck");
    expect(outcome.outcome).toBe("verified");
    expect(outcome.fact?.verificationStatus).toBe("verified");
  });
});
