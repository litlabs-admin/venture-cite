// Live: brand facts, work level and points, latest completed fact-scan pages, review actions.
// Pending backend work: exact per-step awards, fact scope, expiry, reviewer and conflict records.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import {
  useBrandFacts,
  useApproveFact,
  useAmendFact,
  type BrandFactView,
} from "@/v2/data/brandFacts";
import { useWorkSummary } from "@/v2/data/workSummary";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board07Data, Board07Fact, Board07Page, Board07Value } from "./Screen";

const scrapeRunSchema = z
  .object({
    id: z.string(),
    brandId: z.string(),
    status: z.string(),
    completedAt: z.string().nullable(),
  })
  .passthrough();

const scrapePageSchema = z
  .object({
    id: z.string(),
    runId: z.string(),
    url: z.string(),
    canonicalUrl: z.string(),
    status: z.string(),
    fetchedAt: z.string().nullable(),
    factCount: z.number(),
    statusCode: z.number().nullable(),
    errorKind: z.string().nullable(),
  })
  .passthrough();

const latestRunResponseSchema = z.object({
  success: z.boolean(),
  run: scrapeRunSchema.nullable(),
});

const runDetailResponseSchema = z.object({
  success: z.boolean(),
  run: scrapeRunSchema,
  pages: z.array(scrapePageSchema),
});

type LatestRunResponse = z.infer<typeof latestRunResponseSchema>;
type RunDetailResponse = z.infer<typeof runDetailResponseSchema>;

function unavailable(reason: string): Board07Value<never> {
  return { kind: "not-measured", reason };
}

function optionalString(value: string | null, reason: string): Board07Value<string> {
  return value === null ? unavailable(reason) : { kind: "available", value };
}

function sourcePath(value: string | null): string {
  if (value === null) return "User supplied";
  try {
    const url = new URL(value);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    return value;
  }
}

function factName(factKey: string): string {
  const words = factKey.replace(/[_-]+/g, " ").trim();
  return words.length === 0 ? factKey : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function factReview(fact: BrandFactView): Board07Fact["review"] {
  if (fact.dismissedAt !== null) return { kind: "dismissed" };
  if (fact.acceptedAt !== null) return { kind: "confirmed" };
  return { kind: "needs-review" };
}

function mapFact(fact: BrandFactView): Board07Fact {
  const source = sourcePath(fact.sourceUrl);
  const firstParty = fact.sourceUrl !== null;
  return {
    id: fact.id,
    name: factName(fact.factKey),
    value: { kind: "available", value: fact.factValue },
    source: { kind: "available", value: source },
    sourceClass: {
      kind: "available",
      value: firstParty ? "first-party" : "user-supplied",
    },
    scope: unavailable("The fact scope is not stored by this endpoint."),
    effectiveDate: unavailable("The fact effective date is not stored by this endpoint."),
    expiry: unavailable("The fact expiry is not stored by this endpoint."),
    reviewer: unavailable("The reviewer is not stored by this endpoint."),
    conflict: unavailable("The conflict record is not stored by this endpoint."),
    lastCheck: optionalString(fact.lastVerified, "No fact check date is available for this value."),
    excerpt: optionalString(fact.sourceExcerpt, "No source excerpt is available for this value."),
    extractedAt: optionalString(
      fact.lastVerified,
      "No extraction date is available for this value.",
    ),
    review: factReview(fact),
  };
}

function mapPage(page: z.infer<typeof scrapePageSchema>, completedAt: string | null): Board07Page {
  const path = sourcePath(page.url);
  return {
    path,
    factCount: { kind: "available", value: page.factCount },
    scannedAt: optionalString(
      page.fetchedAt ?? completedAt,
      "No scan date is available for this page.",
    ),
    sourceKind: path === "/pricing" ? "site" : "document",
  };
}

async function readLatestRun(brandId: string): Promise<LatestRunResponse> {
  const response = await apiRequest(
    "GET",
    `/api/brand-fact-sheet/runs/latest-completed?brandId=${encodeURIComponent(brandId)}`,
  );
  return latestRunResponseSchema.parse(await response.json());
}

async function readRunDetail(runId: string): Promise<RunDetailResponse> {
  const response = await apiRequest(
    "GET",
    `/api/brand-fact-sheet/runs/${encodeURIComponent(runId)}`,
  );
  return runDetailResponseSchema.parse(await response.json());
}

function queryErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function latestAsOf(facts: readonly BrandFactView[], run: LatestRunResponse["run"]): string {
  if (run?.completedAt !== null && run?.completedAt !== undefined) return run.completedAt;
  const lastVerified = facts
    .map((fact) => fact.lastVerified)
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1);
  return lastVerified ?? "unknown";
}

function buildData({
  brandId,
  brandName,
  facts,
  summary,
  latestRun,
  runDetail,
  approveFact,
  amendFact,
}: {
  brandId: string;
  brandName: string;
  facts: readonly BrandFactView[];
  summary: NonNullable<ReturnType<typeof useWorkSummary>["data"]>;
  latestRun: LatestRunResponse["run"];
  runDetail: RunDetailResponse | undefined;
  approveFact: (factId: string) => Promise<void>;
  amendFact: (factId: string, factValue: string) => Promise<void>;
}): Board07Data {
  const mappedFacts = facts.map(mapFact);
  const selectedFact =
    mappedFacts.find((fact) => fact.review.kind === "needs-review") ?? mappedFacts[0];
  const pages: Board07Value<readonly Board07Page[]> =
    runDetail === undefined
      ? unavailable("The latest completed fact scan is not available.")
      : {
          kind: "available",
          value: runDetail.pages.map((page) => mapPage(page, latestRun?.completedAt ?? null)),
        };
  const nextThreshold = summary.nextThreshold;

  return {
    brand: {
      id: brandId,
      name: { kind: "available", value: brandName },
      displayName: { kind: "available", value: "VentureCite" },
    },
    navigation: {
      brandId,
      mode: summary.mode,
    },
    facts: mappedFacts,
    pages,
    progress: {
      level: { kind: "available", value: summary.currentLevel.level },
      levelName: { kind: "available", value: summary.currentLevel.name },
      workPoints: { kind: "available", value: summary.points },
      target:
        nextThreshold === null
          ? unavailable("No next level is available for this brand.")
          : {
              kind: "available",
              value: `Reach Level ${nextThreshold.level} · ${nextThreshold.name}`,
            },
      stepPoints: unavailable("The work summary does not provide per-step awards."),
      completedSteps: { kind: "available", value: summary.milestones.length },
      requiredSteps: { kind: "available", value: 3 },
    },
    selectedFactId: selectedFact?.id ?? "",
    actions: {
      approveFact,
      amendFact,
    },
  };
}

export function useBoard07Data(): V2LiveResult<Board07Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const factsQuery = useBrandFacts(selectedBrandId || undefined);
  const summaryQuery = useWorkSummary(selectedBrandId);
  const approveMutation = useApproveFact(selectedBrandId || undefined);
  const amendMutation = useAmendFact(selectedBrandId || undefined);
  const latestRunQuery = useQuery<LatestRunResponse>({
    queryKey: ["v2", "brand-fact-sheet", "latest-completed", selectedBrandId],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readLatestRun(selectedBrandId),
  });
  const runId = latestRunQuery.data?.run?.id;
  const runDetailQuery = useQuery<RunDetailResponse>({
    queryKey: ["v2", "brand-fact-sheet", "run", runId ?? ""],
    enabled: Boolean(runId),
    meta: { suppressErrorToast: true },
    queryFn: () => readRunDetail(runId ?? ""),
  });

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId || selectedBrand === undefined) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }

  if (
    factsQuery.isPending ||
    summaryQuery.isPending ||
    latestRunQuery.isPending ||
    (Boolean(runId) && runDetailQuery.isPending)
  ) {
    return { state: { kind: "loading" } };
  }

  if (
    factsQuery.isError ||
    summaryQuery.isError ||
    latestRunQuery.isError ||
    (Boolean(runId) && runDetailQuery.isError)
  ) {
    const error =
      factsQuery.error ?? summaryQuery.error ?? latestRunQuery.error ?? runDetailQuery.error;
    return {
      state: {
        kind: "error",
        message: queryErrorMessage(error, "The brand facts could not be loaded."),
      },
    };
  }

  const facts = factsQuery.data;
  const summary = summaryQuery.data;
  const latestRun = latestRunQuery.data?.run ?? null;
  if (facts === undefined || summary === undefined || latestRunQuery.data === undefined) {
    return { state: { kind: "loading" } };
  }
  if (facts.length === 0) {
    return { state: { kind: "empty", reason: "No extracted facts are available for this brand." } };
  }

  const data = buildData({
    brandId: selectedBrandId,
    brandName: selectedBrand.name,
    facts,
    summary,
    latestRun,
    runDetail: runDetailQuery.data,
    approveFact: async (factId) => {
      await approveMutation.mutateAsync(factId);
    },
    amendFact: async (factId, factValue) => {
      await amendMutation.mutateAsync({ factId, factValue });
    },
  });

  const stale =
    factsQuery.isStale ||
    summaryQuery.isStale ||
    latestRunQuery.isStale ||
    (Boolean(runId) && runDetailQuery.isStale);
  if (stale) {
    return {
      state: {
        kind: "stale",
        reason: "The fact data is older than the current refresh window.",
        asOf: latestAsOf(facts, latestRun),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
