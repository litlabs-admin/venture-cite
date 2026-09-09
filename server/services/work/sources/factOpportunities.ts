import type { RequestActor } from "../../../lib/requestActor";
import type {
  CompletionRule,
  WorkOpportunity,
  WorkOpportunitySource,
  TriggerEvidenceReference,
} from "../../../domains/work/opportunities";
import type { BrandId } from "../../../domains/work/types";

/** The reader joins fact, scrape page, and scrape run rows for this projection. */
export type FactOpportunityRecord = {
  id: string;
  brandId: BrandId;
  domain: string;
  subcategory: string;
  factKey: string;
  factValue: string;
  /** The reader derives this value from the fact taxonomy and metadata. */
  essential?: boolean;
  source?: string;
  metadata?: unknown;
  acceptedAt: string | null;
  dismissedAt: string | null;
  isActive: boolean | number;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  scrapePageId: string | null;
  retrievedAt: string | null;
  sourceExcerpt: string | null;
};

export type FactOpportunityReader = (input: {
  actor: RequestActor;
  brandId: BrandId;
}) => Promise<readonly FactOpportunityRecord[]>;

const FACT_COMPLETION_RULE: CompletionRule = {
  required: ["source", "confirmation"],
};

const ESSENTIAL_FACT_KEYS = new Set([
  "identity.name",
  "identity.description",
  "identity.industry",
  "identity.website",
  "offerings.productCategory",
  "offerings.primaryProduct",
  "offerings.primaryService",
  "positioning.valueProposition",
  "positioning.targetAudience",
  "positioning.differentiator",
]);

export function createFactOpportunitySource({
  readFacts,
}: {
  readFacts: FactOpportunityReader;
}): WorkOpportunitySource {
  return {
    sourceKey: "facts",
    async collect({ actor, brandId }) {
      const records = (await readFacts({ actor, brandId })).filter(
        (record) => record.brandId === brandId,
      );
      const active = records.filter(
        (record) =>
          isEssential(record) &&
          (record.isActive === true || record.isActive === 1) &&
          record.dismissedAt === null,
      );
      const opportunities: WorkOpportunity[] = [];

      const byTuple = new Map<string, FactOpportunityRecord[]>();
      for (const record of active) {
        if (record.acceptedAt !== null) continue;
        const groupKey = factTuple(record);
        const group = byTuple.get(groupKey) ?? [];
        group.push(record);
        byTuple.set(groupKey, group);
      }

      const conflictKeys = new Set<string>();
      for (const [groupKey, group] of byTuple) {
        const hasUserFact = group.some(
          (record) => record.source === "user" || record.source === "user_manual",
        );
        const hasScrapedFact = group.some((record) => record.source === "scraped");
        if (hasUserFact && hasScrapedFact) {
          conflictKeys.add(groupKey);
          opportunities.push(toConflictOpportunity(group, groupKey));
        }
      }

      for (const record of active) {
        if (record.acceptedAt !== null || conflictKeys.has(factTuple(record))) continue;
        opportunities.push(toFactOpportunity(record));
      }

      return opportunities.sort((left, right) => left.taskKey.localeCompare(right.taskKey));
    },
  };
}

function isEssential(record: FactOpportunityRecord): boolean {
  if (typeof record.essential === "boolean") return record.essential;
  if (isRecord(record.metadata) && typeof record.metadata.essential === "boolean") {
    return record.metadata.essential;
  }
  return ESSENTIAL_FACT_KEYS.has(`${record.domain}.${record.factKey}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function factTuple(record: FactOpportunityRecord): string {
  return [record.domain, record.subcategory, record.factKey].join("\u0000");
}

function encodedFactTuple(record: FactOpportunityRecord): string {
  return [record.domain, record.subcategory, record.factKey]
    .map((value) => encodeURIComponent(value.trim()))
    .join(":");
}

function toFactOpportunity(record: FactOpportunityRecord): WorkOpportunity {
  const hasSource =
    record.sourceUrl !== null &&
    record.canonicalUrl !== null &&
    record.scrapePageId !== null &&
    record.retrievedAt !== null &&
    record.sourceExcerpt !== null;
  const source = hasSource
    ? sourceEvidence(record, "Authoritative source for the essential fact.")
    : undefined;
  const evidence: TriggerEvidenceReference[] = source ? [source] : [internalFactTrigger(record)];

  return {
    taskKey: `facts:${record.id}`,
    taskType: "approve_essential_brand_facts",
    ruleVersion: 1,
    title: hasSource
      ? "Review the essential fact source"
      : "Add a source and confirm the essential fact",
    reason: hasSource
      ? "An active essential fact needs source review and confirmation."
      : "Add an authoritative source before confirming this essential fact.",
    completionRule: FACT_COMPLETION_RULE,
    evidence,
  };
}

function toConflictOpportunity(records: FactOpportunityRecord[], tuple: string): WorkOpportunity {
  const sorted = [...records].sort((left, right) => left.id.localeCompare(right.id));
  const first = sorted[0];
  if (!first) throw new Error("A fact conflict group must contain a record");
  const evidence: TriggerEvidenceReference[] = sorted.flatMap(
    (record): TriggerEvidenceReference[] => {
      const source = sourceEvidence(record, "Authoritative source for the conflicting fact.");
      return source ? [source] : [internalFactTrigger(record)];
    },
  );
  return {
    taskKey: `facts:conflict:${encodedFactTuple(first)}`,
    taskType: "approve_essential_brand_facts",
    ruleVersion: 1,
    title: "Review conflicting essential fact sources",
    reason: "Conflicting sources require human review before a definitive claim is recorded.",
    completionRule: { ...FACT_COMPLETION_RULE, conflictKey: tuple },
    evidence,
  };
}

function sourceEvidence(
  record: FactOpportunityRecord,
  label: string,
): Extract<TriggerEvidenceReference, { kind: "source" }> | undefined {
  if (
    record.sourceUrl === null ||
    record.canonicalUrl === null ||
    record.scrapePageId === null ||
    record.retrievedAt === null ||
    record.sourceExcerpt === null
  ) {
    return undefined;
  }
  return {
    kind: "source",
    label,
    sourceUrl: record.sourceUrl,
    canonicalUrl: record.canonicalUrl,
    factId: record.id,
    scrapePageId: record.scrapePageId,
    retrievedAt: record.retrievedAt,
    excerpt: record.sourceExcerpt,
  };
}

function internalFactTrigger(
  record: FactOpportunityRecord,
): Extract<TriggerEvidenceReference, { kind: "artifact" }> {
  return {
    kind: "artifact",
    label: "Internal fact record requiring a source.",
    artifactId: `fact-record:${record.id}`,
    version: 1,
    coverage: record.id,
    duplicateCheck: record.id,
  };
}
