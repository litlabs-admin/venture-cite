import { describe, expect, it, vi } from "vitest";
import { createRequestActor } from "../../server/lib/requestActor";
import {
  readFactOpportunityRecords,
  readQuestionOpportunityRecords,
} from "../../server/storage/workOpportunityStorage";
import type { RequestRepositoryTransaction } from "../../server/data/requestRepositoryTransaction";
import type { BrandId } from "../../server/domains/work/types";

const ACTOR = createRequestActor("11111111-1111-4111-8111-111111111111");
const BRAND_ID = "brand-reader-a" as BrandId;

function transactionWithRows(rows: unknown[]): RequestRepositoryTransaction {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
  } as unknown as RequestRepositoryTransaction;
}

describe("work opportunity storage readers", () => {
  it("maps actor-scoped fact rows with page provenance", async () => {
    const transaction = transactionWithRows([
      {
        id: "fact-1",
        brandId: BRAND_ID,
        domain: "identity",
        subcategory: "Description",
        factKey: "description",
        factValue: "A buyer workflow",
        source: "scraped",
        acceptedAt: new Date("2026-09-08T01:00:00.000Z"),
        dismissedAt: null,
        isActive: 1,
        sourceUrl: "https://example.test/about",
        canonicalUrl: "https://example.test/about",
        scrapePageId: "page-1",
        retrievedAt: new Date("2026-09-08T00:59:00.000Z"),
        sourceExcerpt: "A buyer workflow.",
        metadata: { essential: true },
      },
    ]);

    const rows = await readFactOpportunityRecords(transaction, ACTOR, BRAND_ID);

    expect(rows).toEqual([
      expect.objectContaining({
        id: "fact-1",
        brandId: BRAND_ID,
        source: "scraped",
        acceptedAt: "2026-09-08T01:00:00.000Z",
        retrievedAt: "2026-09-08T00:59:00.000Z",
        scrapePageId: "page-1",
      }),
    ]);
    expect(transaction.execute).toHaveBeenCalledTimes(1);
  });

  it("maps prompt rows and fails closed for an unknown status", async () => {
    const transaction = transactionWithRows([
      {
        id: "prompt-1",
        brandId: BRAND_ID,
        generationId: "generation-2",
        generationNumber: 2,
        prompt: "Which buyer problem does the product solve?",
        status: "tracked",
        paused: false,
      },
      {
        id: "prompt-2",
        brandId: BRAND_ID,
        generationId: null,
        generationNumber: null,
        prompt: "Legacy prompt",
        status: "unknown",
        paused: false,
      },
    ]);

    const rows = await readQuestionOpportunityRecords(transaction, ACTOR, BRAND_ID);

    expect(rows).toEqual([
      expect.objectContaining({
        id: "prompt-1",
        brandId: BRAND_ID,
        generationId: "generation-2",
        generationNumber: 2,
        status: "tracked",
      }),
      expect.objectContaining({ id: "prompt-2", status: "archived" }),
    ]);
    expect(transaction.execute).toHaveBeenCalledTimes(1);
  });
});
