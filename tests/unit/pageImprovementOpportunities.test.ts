import { describe, expect, it, vi } from "vitest";
import { createRequestActor, type RequestActor } from "../../server/lib/requestActor";
import type { BrandId } from "../../server/domains/work/types";
import { createPageImprovementOpportunitySource } from "../../server/services/work/sources/pageImprovementOpportunities";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-content-a" as BrandId;
const ACTOR = createRequestActor(USER_ID);

type PageImprovementRecord = {
  id: string;
  brandId: BrandId;
  contentType: string;
  title: string;
  primaryKeyword: string | null;
  targetIntent: string | null;
  status: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
};

function page(overrides: Partial<PageImprovementRecord> = {}): PageImprovementRecord {
  return {
    id: "bofu-1",
    brandId: BRAND_ID,
    contentType: "comparison",
    title: "Acme versus alternatives",
    primaryKeyword: "acme alternatives",
    targetIntent: "comparison shopping",
    status: "draft",
    publishedUrl: null,
    publishedAt: null,
    updatedAt: "2026-09-08T00:00:00.000Z",
    ...overrides,
  };
}

function sourceForPages(pages: PageImprovementRecord[]) {
  const readPages = vi.fn(
    async (input: { actor: RequestActor; brandId: BrandId }): Promise<PageImprovementRecord[]> => {
      expect(input.actor).toBe(ACTOR);
      expect(input.brandId).toBe(BRAND_ID);
      return pages;
    },
  );
  return { source: createPageImprovementOpportunitySource({ readPages }), readPages };
}

describe("page improvement work opportunities", () => {
  it("creates a task for unpublished BOFU content with a buyer need", async () => {
    const { source, readPages } = sourceForPages([
      page(),
      page({ id: "published-bofu", status: "published", publishedUrl: "https://acme.test/page" }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(readPages).toHaveBeenCalledTimes(1);
    expect(source.sourceKey).toBe("content");
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      taskKey: "content:bofu:bofu-1",
      taskType: "improve_page_for_buyer_need",
      ruleVersion: 1,
      completionRule: { required: ["content_change", "confirmation"] },
      evidence: [
        {
          kind: "artifact",
          artifactId: "bofu:bofu-1",
          version: 1,
          coverage: "comparison shopping",
          duplicateCheck: "bofu-1",
        },
      ],
    });
  });

  it("skips content without a buyer need", async () => {
    const { source } = sourceForPages([
      page({ id: "no-intent", primaryKeyword: null, targetIntent: null }),
    ]);

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(opportunities).toEqual([]);
  });

  it("keeps the task key stable across repeated reads", async () => {
    const { source } = sourceForPages([page({ targetIntent: null })]);

    const first = await source.collect({ actor: ACTOR, brandId: BRAND_ID });
    const second = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(first.map((item) => item.taskKey)).toEqual(["content:bofu:bofu-1"]);
    expect(second.map((item) => item.taskKey)).toEqual(first.map((item) => item.taskKey));
  });
});
