import { describe, expect, it, vi } from "vitest";
import { createRequestActor, type RequestActor } from "../../server/lib/requestActor";
import type { BrandId } from "../../server/domains/work/types";
import { createEarnedMediaOpportunitySource } from "../../server/services/work/sources/earnedMediaOpportunities";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-earned-a" as BrandId;
const ACTOR = createRequestActor(USER_ID);

type CommunityPostRecord = {
  id: string;
  brandId: BrandId;
  platform: string;
  groupName: string;
  groupUrl: string | null;
  title: string | null;
  content: string;
  status: string;
  postUrl: string | null;
  postedAt: string | null;
};

type ListicleRecord = {
  id: string;
  brandId: BrandId;
  title: string;
  url: string;
  sourcePublication: string | null;
  isIncluded: number;
  outreachStatus: string;
};

function communityPost(overrides: Partial<CommunityPostRecord> = {}): CommunityPostRecord {
  return {
    id: "community-1",
    brandId: BRAND_ID,
    platform: "reddit",
    groupName: "Buyer forum",
    groupUrl: "https://reddit.test/r/buyers",
    title: "A buyer question",
    content: "A useful answer for the buyer.",
    status: "draft",
    postUrl: null,
    postedAt: null,
    ...overrides,
  };
}

function listicle(overrides: Partial<ListicleRecord> = {}): ListicleRecord {
  return {
    id: "listicle-1",
    brandId: BRAND_ID,
    title: "Best buyer tools",
    url: "https://publication.test/best-tools",
    sourcePublication: "Publication",
    isIncluded: 0,
    outreachStatus: "new",
    ...overrides,
  };
}

function sourceForEarnedMedia(communityPosts: CommunityPostRecord[], listicles: ListicleRecord[]) {
  const readCommunityPosts = vi.fn(
    async (input: { actor: RequestActor; brandId: BrandId }): Promise<CommunityPostRecord[]> => {
      expect(input.actor).toBe(ACTOR);
      expect(input.brandId).toBe(BRAND_ID);
      return communityPosts;
    },
  );
  const readListicles = vi.fn(
    async (input: { actor: RequestActor; brandId: BrandId }): Promise<ListicleRecord[]> => {
      expect(input.actor).toBe(ACTOR);
      expect(input.brandId).toBe(BRAND_ID);
      return listicles;
    },
  );
  return {
    source: createEarnedMediaOpportunitySource({ readCommunityPosts, readListicles }),
    readCommunityPosts,
    readListicles,
  };
}

describe("earned media work opportunities", () => {
  it("creates artifact-triggered tasks for qualifying community and listicle rows", async () => {
    const { source, readCommunityPosts, readListicles } = sourceForEarnedMedia(
      [communityPost()],
      [listicle()],
    );

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(readCommunityPosts).toHaveBeenCalledTimes(1);
    expect(readListicles).toHaveBeenCalledTimes(1);
    expect(source.sourceKey).toBe("earned");
    expect(opportunities).toHaveLength(2);
    expect(opportunities).toEqual([
      expect.objectContaining({
        taskKey: "earned:community:community-1",
        taskType: "complete_earned_media_or_community_work",
        completionRule: { required: ["authored_work", "confirmation"] },
        evidence: [
          expect.objectContaining({
            kind: "artifact",
            artifactId: "community:community-1",
            duplicateCheck: "community-1",
          }),
        ],
      }),
      expect.objectContaining({
        taskKey: "earned:listicle:listicle-1",
        taskType: "complete_earned_media_or_community_work",
        completionRule: { required: ["authored_work", "confirmation"] },
        evidence: [
          expect.objectContaining({
            kind: "artifact",
            artifactId: "listicle:listicle-1",
            duplicateCheck: "listicle-1",
          }),
        ],
      }),
    ]);
  });

  it("skips community and listicle rows outside the trigger predicates", async () => {
    const { source } = sourceForEarnedMedia(
      [
        communityPost({ id: "posted", status: "posted" }),
        communityPost({ id: "empty", content: "" }),
        communityPost({ id: "ungrouped", groupUrl: null }),
      ],
      [
        listicle({ id: "included", isIncluded: 1 }),
        listicle({ id: "contacted", outreachStatus: "contacted" }),
      ],
    );

    const opportunities = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(opportunities).toEqual([]);
  });

  it("keeps both task keys stable across repeated reads", async () => {
    const { source } = sourceForEarnedMedia([communityPost()], [listicle()]);

    const first = await source.collect({ actor: ACTOR, brandId: BRAND_ID });
    const second = await source.collect({ actor: ACTOR, brandId: BRAND_ID });

    expect(first.map((item) => item.taskKey)).toEqual([
      "earned:community:community-1",
      "earned:listicle:listicle-1",
    ]);
    expect(second.map((item) => item.taskKey)).toEqual(first.map((item) => item.taskKey));
  });
});
