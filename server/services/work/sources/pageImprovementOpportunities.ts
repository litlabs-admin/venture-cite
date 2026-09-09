import type { RequestActor } from "../../../lib/requestActor";
import type {
  CompletionRule,
  WorkOpportunity,
  WorkOpportunitySource,
} from "../../../domains/work/opportunities";
import type { BrandId } from "../../../domains/work/types";

export type PageImprovementOpportunityRecord = {
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

export type PageImprovementOpportunityReader = (input: {
  actor: RequestActor;
  brandId: BrandId;
}) => Promise<readonly PageImprovementOpportunityRecord[]>;

const PAGE_IMPROVEMENT_COMPLETION_RULE: CompletionRule = {
  required: ["content_change", "confirmation"],
};

export function createPageImprovementOpportunitySource({
  readPages,
}: {
  readPages: PageImprovementOpportunityReader;
}): WorkOpportunitySource {
  return {
    sourceKey: "content",
    async collect({ actor, brandId }) {
      const opportunities = (await readPages({ actor, brandId }))
        .filter((record) => record.brandId === brandId)
        .flatMap(toPageImprovementOpportunities);

      return opportunities.sort((left, right) => left.taskKey.localeCompare(right.taskKey));
    },
  };
}

function toPageImprovementOpportunities(
  record: PageImprovementOpportunityRecord,
): WorkOpportunity[] {
  const buyerNeed = record.targetIntent ?? record.primaryKeyword;
  if (
    record.status !== null &&
    record.status !== "published" &&
    buyerNeed !== null &&
    buyerNeed.trim().length > 0
  ) {
    return [
      {
        taskKey: `content:bofu:${record.id}`,
        taskType: "improve_page_for_buyer_need",
        ruleVersion: 1,
        title: "Improve the page for a buyer need",
        reason: `The unpublished ${record.contentType} page "${record.title}" carries the buyer need "${buyerNeed}".`,
        completionRule: PAGE_IMPROVEMENT_COMPLETION_RULE,
        evidence: [
          {
            kind: "artifact",
            label: "Unpublished BOFU content with a documented buyer need.",
            artifactId: `bofu:${record.id}`,
            version: 1,
            coverage: buyerNeed,
            duplicateCheck: record.id,
          },
        ],
      },
    ];
  }
  return [];
}
