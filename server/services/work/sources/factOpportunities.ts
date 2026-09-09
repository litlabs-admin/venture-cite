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
          opportunities.push(toConflictOpportunity(group));
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

/**
 * The identity two fact rows must share to be the same fact, and therefore to
 * be a conflict when their values disagree.
 *
 * Domain and key only. `subcategory` used to be part of this and it broke
 * conflict detection twice over: it is free text that differs by case
 * ("Description" against "description"), and real rows carry the same
 * subcategory for different keys. Including it split one fact into several
 * groups, so two sources disagreeing about one fact were never seen as
 * disagreeing and were raised as two unrelated tasks instead of one conflict.
 *
 * `ESSENTIAL_FACT_KEYS` is keyed on domain and key for the same reason.
 */
function factTuple(record: FactOpportunityRecord): string {
  return [record.domain.trim().toLowerCase(), record.factKey.trim()].join("\u0000");
}

/**
 * The human-readable name of the fact a task is about.
 *
 * Derived from `factKey`, NOT from `subcategory`. Subcategory looks like the
 * display label and is not trustworthy: real rows carry subcategory
 * "description" for facts whose factKey is `industry` and `name`, so labelling
 * by it produces several different tasks that all read the same. `factKey` is
 * the taxonomy's actual identity - `ESSENTIAL_FACT_KEYS` above is keyed on it -
 * so it is what distinguishes one fact task from another.
 */
function factLabel(record: FactOpportunityRecord): string {
  const key = record.factKey.trim();
  if (key.length === 0) return record.subcategory.trim() || "this fact";
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The same identity as `factTuple`, in a form safe to store and to put in a
 *  task key. Must stay in step with `factTuple` or a conflict group and its
 *  task key would describe different things. */
function encodedFactTuple(record: FactOpportunityRecord): string {
  return [record.domain.trim().toLowerCase(), record.factKey.trim()]
    .map((value) => encodeURIComponent(value))
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
    // Name the fact. A brand has up to a dozen of these at once, and a list
    // of identically titled rows cannot be read or chosen between - the
    // subcategory ("Brand name", "Value proposition") is the taxonomy's own
    // human-readable label, so it is what the user already recognises.
    title: hasSource
      ? `Review the source for ${factLabel(record)}`
      : `Add a source for ${factLabel(record)}`,
    reason: hasSource
      ? "An active essential fact needs source review and confirmation."
      : "Add an authoritative source before confirming this essential fact.",
    completionRule: FACT_COMPLETION_RULE,
    evidence,
  };
}

function toConflictOpportunity(records: FactOpportunityRecord[]): WorkOpportunity {
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
    title: `Review conflicting sources for ${factLabel(first)}`,
    reason: "Conflicting sources require human review before a definitive claim is recorded.",
    // `tuple` is the in-memory grouping key and joins its parts with U+0000,
    // which is a good separator precisely because it cannot occur in a fact
    // value - but Postgres rejects a NUL byte in text and jsonb, so writing it
    // into the persisted completion rule failed the whole reconcile for any
    // brand that had a fact conflict. The persisted key uses the same encoding
    // as the task key instead, which is NUL-free and equally unambiguous.
    completionRule: { ...FACT_COMPLETION_RULE, conflictKey: encodedFactTuple(first) },
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
