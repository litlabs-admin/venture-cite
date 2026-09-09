import type { RequestActor } from "../../../lib/requestActor";
import type {
  CompletionRule,
  TriggerEvidenceReference,
  WorkOpportunity,
  WorkOpportunitySource,
} from "../../../domains/work/opportunities";
import type { BrandId } from "../../../domains/work/types";

export type CommunityPostOpportunityRecord = {
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

export type ListicleOpportunityRecord = {
  id: string;
  brandId: BrandId;
  title: string;
  url: string;
  sourcePublication: string | null;
  isIncluded: number;
  outreachStatus: string;
};

export type EarnedMediaOpportunityReader<T> = (input: {
  actor: RequestActor;
  brandId: BrandId;
}) => Promise<readonly T[]>;

const EARNED_MEDIA_COMPLETION_RULE: CompletionRule = {
  required: ["authored_work", "confirmation"],
};

export function createEarnedMediaOpportunitySource({
  readCommunityPosts,
  readListicles,
}: {
  readCommunityPosts: EarnedMediaOpportunityReader<CommunityPostOpportunityRecord>;
  readListicles: EarnedMediaOpportunityReader<ListicleOpportunityRecord>;
}): WorkOpportunitySource {
  return {
    sourceKey: "earned",
    async collect({ actor, brandId }) {
      const communityOpportunities = (await readCommunityPosts({ actor, brandId }))
        .filter((record) => record.brandId === brandId)
        .filter(isQualifyingCommunityPost)
        .map(toCommunityPostOpportunity);
      const listicleOpportunities = (await readListicles({ actor, brandId }))
        .filter((record) => record.brandId === brandId)
        .filter(isQualifyingListicle)
        .map(toListicleOpportunity);

      return [...communityOpportunities, ...listicleOpportunities].sort((left, right) =>
        left.taskKey.localeCompare(right.taskKey),
      );
    },
  };
}

function isQualifyingCommunityPost(record: CommunityPostOpportunityRecord): boolean {
  return record.status === "draft" && record.content !== "" && record.groupUrl !== null;
}

function isQualifyingListicle(record: ListicleOpportunityRecord): boolean {
  return record.isIncluded === 0 && record.outreachStatus === "new";
}

function toCommunityPostOpportunity(record: CommunityPostOpportunityRecord): WorkOpportunity {
  return {
    taskKey: `earned:community:${record.id}`,
    taskType: "complete_earned_media_or_community_work",
    ruleVersion: 1,
    title: "Complete the community work",
    reason: `A draft ${record.platform} post for ${record.groupName} has content and a target group.`,
    completionRule: EARNED_MEDIA_COMPLETION_RULE,
    evidence: [
      artifactTrigger("community", record.id, "Draft community post ready for completion."),
    ],
  };
}

function toListicleOpportunity(record: ListicleOpportunityRecord): WorkOpportunity {
  return {
    taskKey: `earned:listicle:${record.id}`,
    taskType: "complete_earned_media_or_community_work",
    ruleVersion: 1,
    title: "Complete the listicle outreach",
    reason: `The listicle "${record.title}" has new outreach status and does not include the brand.`,
    completionRule: EARNED_MEDIA_COMPLETION_RULE,
    evidence: [
      artifactTrigger("listicle", record.id, "Listicle outreach is ready for completion."),
    ],
  };
}

function artifactTrigger(
  kind: "community" | "listicle",
  id: string,
  label: string,
): Extract<TriggerEvidenceReference, { kind: "artifact" }> {
  return {
    kind: "artifact",
    label,
    artifactId: `${kind}:${id}`,
    version: 1,
    coverage: id,
    duplicateCheck: id,
  };
}
