// Live: the whole fact sheet for the selected brand, grouped by domain, with
// its real accept/dismiss/amend/add/recheck actions.
//
// STALE AND "NEEDS CONFIRMATION" ARE THE SERVER'S OWN THRESHOLDS, NOT
// INVENTED ONES. `server/lib/factAgent/v2/reverifyFact.ts` reverifies a fact
// once `last_verified` is more than 30 days old (`findStaleFacts`'s cutoff)
// and marks disagreeing sources `verification_status: "drift_detected"`.
// This adapter reapplies exactly those two rules client-side rather than
// picking its own window, so "Stale" here means the same thing it means to
// the re-verification cron.

import { useMemo } from "react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { DOMAINS, type Domain } from "@shared/factAgent/schema";
import type { V2LiveResult } from "@/v2/contracts/screen";
import {
  useAddFact,
  useAmendFact,
  useApproveFact,
  useBrandFacts,
  useDismissFact,
  useRecheckFact,
  type BrandFactView,
} from "@/v2/data/brandFacts";
import type {
  Board34Category,
  Board34Data,
  Board34Fact,
  Board34FactSummary,
  Board34Status,
} from "./Screen";

const STALE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const DOMAIN_LABELS: Record<Domain, string> = {
  identity: "Identity",
  offerings: "Offerings",
  positioning: "Positioning",
  team: "Team",
  operations: "Operations",
  credentials: "Credentials & funding",
  growth: "Growth",
  contact: "Contact",
};

function isDomain(value: string): value is Domain {
  return (DOMAINS as readonly string[]).includes(value);
}

function domainLabel(value: string): string {
  return isDomain(value) ? DOMAIN_LABELS[value] : value;
}

function sourceHost(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? url.hostname : `${url.hostname}${url.pathname}`;
  } catch {
    return value;
  }
}

function isStale(fact: BrandFactView, now: number): boolean {
  if (fact.verificationStatus === "source_unreachable") return true;
  if (!fact.lastVerified) return true;
  const last = new Date(fact.lastVerified).getTime();
  if (Number.isNaN(last)) return false;
  return now - last > STALE_WINDOW_MS;
}

function statusOf(fact: BrandFactView, now: number): Board34Status {
  if (!fact.acceptedAt) return "needs_confirmation";
  if (fact.verificationStatus === "drift_detected") return "needs_confirmation";
  if (isStale(fact, now)) return "stale";
  return "approved";
}

function verificationType(fact: BrandFactView): Board34Fact["verificationType"] {
  if (fact.verificationStatus === "drift_detected") return "Cross-source";
  if (!fact.sourceUrl) return "User supplied";
  return "Website";
}

function mapFact(fact: BrandFactView, now: number): Board34Fact {
  return {
    id: fact.id,
    label: fact.subcategory || fact.factKey,
    value: fact.factValue,
    evidenceUrl: fact.sourceUrl,
    evidenceLabel: fact.sourceUrl ? sourceHost(fact.sourceUrl) : "User supplied",
    verificationType: verificationType(fact),
    owner: fact.acceptedAt ? "You" : null,
    lastCheckedAt: fact.lastVerified,
    status: statusOf(fact, now),
    excerpt: fact.sourceExcerpt,
    userOverridden: fact.userOverridden,
  };
}

function buildCategories(facts: readonly BrandFactView[], now: number): Board34Category[] {
  const groups = new Map<string, Board34Fact[]>();
  for (const fact of facts) {
    if (fact.dismissedAt) continue; // dismissed facts are archived out of the workspace
    const list = groups.get(fact.domain) ?? [];
    list.push(mapFact(fact, now));
    groups.set(fact.domain, list);
  }
  return DOMAINS.filter((domain) => groups.has(domain)).map((domain) => ({
    id: domain,
    label: domainLabel(domain),
    facts: groups.get(domain) ?? [],
  }));
}

function buildSummary(categories: readonly Board34Category[]): Board34FactSummary {
  const facts = categories.flatMap((category) => category.facts);
  const approvedCount = facts.filter((fact) => fact.status === "approved").length;
  const confirmationCount = facts.filter((fact) => fact.status === "needs_confirmation").length;
  const staleCount = facts.filter((fact) => fact.status === "stale").length;
  return { approvedCount, confirmationCount, staleCount, totalCount: facts.length };
}

function sourcesInspected(
  facts: readonly BrandFactView[],
  now: number,
): Board34Data["sourcesInspected"] {
  const recent = facts.filter((fact) => {
    if (fact.dismissedAt || !fact.sourceUrl || !fact.lastVerified) return false;
    const verified = new Date(fact.lastVerified).getTime();
    return !Number.isNaN(verified) && now - verified <= SOURCES_WINDOW_MS;
  });
  if (recent.length === 0) {
    return { kind: "not-measured", reason: "No source was inspected in the last 7 days." };
  }
  return { kind: "available", value: new Set(recent.map((fact) => fact.sourceUrl)).size };
}

function nextReviewAt(facts: readonly BrandFactView[], now: number): Board34Data["nextReviewAt"] {
  const dueDates = facts
    .filter((fact) => !fact.dismissedAt && statusOf(fact, now) === "approved" && fact.lastVerified)
    .map((fact) => new Date(fact.lastVerified as string).getTime() + STALE_WINDOW_MS)
    .filter((value) => !Number.isNaN(value));
  if (dueDates.length === 0) {
    return { kind: "not-measured", reason: "No approved fact is scheduled for recheck yet." };
  }
  return { kind: "available", value: new Date(Math.min(...dueDates)).toISOString() };
}

function firstConfirmationFactId(categories: readonly Board34Category[]): string | null {
  for (const category of categories) {
    const fact = category.facts.find((candidate) => candidate.status === "needs_confirmation");
    if (fact) return fact.id;
  }
  return null;
}

const DOMAIN_OPTIONS = DOMAINS.map((domain) => ({ id: domain, label: DOMAIN_LABELS[domain] }));

/** `identity.other`, `offerings.other`, ... - the controlled vocabulary's own
 *  escape hatch (`shared/factAgent/schema.ts`'s `ALLOWED_KEYS`) for a fact
 *  that does not fit a specific key. A user-added fact always uses it: this
 *  form collects a free-text label, not one of the enum's specific keys. */
function otherFactKey(): "other" {
  return "other";
}

function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "fact";
}

export function useBoard34Data(): V2LiveResult<Board34Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const factsQuery = useBrandFacts(selectedBrandId || undefined);
  const approveMutation = useApproveFact(selectedBrandId || undefined);
  const amendMutation = useAmendFact(selectedBrandId || undefined);
  const dismissMutation = useDismissFact(selectedBrandId || undefined);
  const addMutation = useAddFact(selectedBrandId || undefined);
  const recheckMutation = useRecheckFact(selectedBrandId || undefined);

  const now = Date.now();

  const built = useMemo(() => {
    const facts = factsQuery.data ?? [];
    const categories = buildCategories(facts, now);
    return {
      categories,
      summary: buildSummary(categories),
      sourcesInspected: sourcesInspected(facts, now),
      nextReviewAt: nextReviewAt(facts, now),
      firstConfirmationFactId: firstConfirmationFactId(categories),
    };
    // `now` is intentionally excluded: re-deriving on every render (rather
    // than only when the query result changes) would make "Stale" flip mid-
    // session as the clock ticks past a fact's 30-day mark, which is honest
    // but would also make row order/expansion state jump under the person's
    // cursor. It settles on the next fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsQuery.data]);

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId || selectedBrand === undefined) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (factsQuery.isPending) return { state: { kind: "loading" } };
  if (factsQuery.isError) {
    return {
      state: {
        kind: "error",
        message:
          factsQuery.error instanceof Error
            ? factsQuery.error.message
            : "The brand facts could not be loaded.",
      },
    };
  }

  const facts = factsQuery.data ?? [];
  if (facts.length === 0) {
    return { state: { kind: "empty", reason: "No fact has been extracted for this brand yet." } };
  }

  const data: Board34Data = {
    brand: { id: selectedBrandId, name: selectedBrand.name },
    navigation: { brandId: selectedBrandId, mode: "guided" },
    categories: built.categories,
    factSummary: built.summary,
    sourcesInspected: built.sourcesInspected,
    nextReviewAt: built.nextReviewAt,
    firstConfirmationFactId: built.firstConfirmationFactId,
    domainOptions: DOMAIN_OPTIONS,
    actions: {
      acceptFact: async (factId) => {
        await approveMutation.mutateAsync(factId);
      },
      dismissFact: async (factId) => {
        await dismissMutation.mutateAsync(factId);
      },
      amendFact: async (factId, factValue) => {
        await amendMutation.mutateAsync({ factId, factValue });
      },
      addFact: async ({ domain, label, factValue, sourceUrl }) => {
        await addMutation.mutateAsync({
          domain,
          subcategory: label,
          factKey: `${otherFactKey()}_${slugify(label)}`,
          factValue,
          sourceUrl: sourceUrl || undefined,
        });
      },
      recheckFact: async (factId) => {
        await recheckMutation.mutateAsync(factId);
      },
    },
  };

  return { state: { kind: "ready" }, data };
}
