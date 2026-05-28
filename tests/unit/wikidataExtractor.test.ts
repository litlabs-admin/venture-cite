import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock global fetch so we never hit the network.
const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { fetchWikidataFacts, findWikidataEntityByUrl } =
  await import("../../server/lib/factAgent/v2/wikidataExtractor");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("findWikidataEntityByUrl", () => {
  it("returns null for unparseable brand URLs", async () => {
    const out = await findWikidataEntityByUrl("not a url");
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when SPARQL returns no bindings", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ results: { bindings: [] } }));
    const out = await findWikidataEntityByUrl("https://nobody.com/");
    expect(out).toBeNull();
  });

  it("parses Q-number from SPARQL response", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q3025" } }] },
      }),
    );
    const out = await findWikidataEntityByUrl("https://adyen.com/");
    expect(out).toBe("Q3025");
  });

  it("returns null on SPARQL HTTP error", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("server error", { status: 503 }));
    const out = await findWikidataEntityByUrl("https://adyen.com/");
    expect(out).toBeNull();
  });

  it("returns null on network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("ECONNRESET"));
    const out = await findWikidataEntityByUrl("https://adyen.com/");
    expect(out).toBeNull();
  });
});

describe("fetchWikidataFacts", () => {
  it("returns empty facts when no entity found", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ results: { bindings: [] } }));
    const out = await fetchWikidataFacts("https://nobody.com/");
    expect(out.facts).toEqual([]);
    expect(out.entityId).toBeNull();
  });

  it("extracts core facts when entity has rich claims", async () => {
    // 1st call: SPARQL lookup
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q3025" } }] },
      }),
    );
    // 2nd call: entity fetch
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        entities: {
          Q3025: {
            id: "Q3025",
            labels: { en: { value: "Adyen" } },
            descriptions: { en: { value: "Dutch payment processor" } },
            claims: {
              P571: [{ mainsnak: { datavalue: { value: { time: "+2006-01-15T00:00:00Z" } } } }],
              P159: [{ mainsnak: { datavalue: { value: { id: "Q727" } } } }],
              P17: [{ mainsnak: { datavalue: { value: { id: "Q55" } } } }],
              P452: [{ mainsnak: { datavalue: { value: { id: "Q105731" } } } }],
              P112: [
                { mainsnak: { datavalue: { value: { id: "Q123" } } } },
                { mainsnak: { datavalue: { value: { id: "Q456" } } } },
              ],
              P249: [{ mainsnak: { datavalue: { value: "ADYEN" } } }],
              P1128: [{ mainsnak: { datavalue: { value: { amount: "+4196" } } } }],
            },
          },
        },
      }),
    );
    // 3rd call: label resolution batch (Q727, Q55, Q105731, Q123, Q456)
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        entities: {
          Q727: { labels: { en: { value: "Amsterdam" } } },
          Q55: { labels: { en: { value: "Netherlands" } } },
          Q105731: { labels: { en: { value: "payment processing" } } },
          Q123: { labels: { en: { value: "Pieter van der Does" } } },
          Q456: { labels: { en: { value: "Arnout Schuijff" } } },
        },
      }),
    );

    const out = await fetchWikidataFacts("https://adyen.com/");
    expect(out.entityId).toBe("Q3025");
    const byKey = (k: string) => out.facts.find((f) => `${f.domain}.${f.factKey}` === k);
    expect(byKey("identity.name")?.factValue).toBe("Adyen");
    expect(byKey("identity.foundedYear")?.factValue).toBe("2006");
    expect(byKey("operations.headquarters")?.factValue).toBe("Amsterdam");
    expect(byKey("contact.country")?.factValue).toBe("Netherlands");
    expect(byKey("identity.industry")?.factValue).toBe("payment processing");
    expect(byKey("identity.publicTradingSymbol")?.factValue).toBe("ADYEN");
    expect(byKey("team.employeeCount")?.factValue).toBe("4196");
    const founders = byKey("team.founders");
    expect(founders?.valueType).toBe("array");
    expect((founders?.valuePayload as { items: string[] }).items).toEqual([
      "Pieter van der Does",
      "Arnout Schuijff",
    ]);
    // All facts are 0.95 confidence (Wikidata).
    for (const f of out.facts) expect(f.confidence).toBe(0.95);
  });

  it("returns whatever was found even when entity fetch fails partially", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q3025" } }] },
      }),
    );
    fetchSpy.mockResolvedValueOnce(new Response("server error", { status: 500 }));
    const out = await fetchWikidataFacts("https://adyen.com/");
    expect(out.facts).toEqual([]);
    expect(out.entityId).toBe("Q3025");
  });
});
