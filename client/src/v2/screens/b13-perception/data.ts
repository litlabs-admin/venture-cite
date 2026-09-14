// Live: brand identity, probe status, platforms, answer text, source URLs, run dates, and the
// four theme buckets - built from the perception run's own praised/questioned evidence phrases
// (`brand_perception_runs`, never invented by this file), unresolved hallucinations
// (`brand_hallucinations`), and approved facts with no mention anywhere in the captured evidence
// (`brand_fact_sheet`).
// Pending: mention coverage and a next-check schedule.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useBrandFacts, type BrandFactView } from "@/v2/data/brandFacts";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type {
  Board13Action,
  Board13Answer,
  Board13Confidence,
  Board13Coverage,
  Board13Data,
  Board13Theme,
  Board13Value,
} from "./Screen";

const perceptionDataSchema = z
  .object({
    trust: z.number().nullable(),
    quality: z.number().nullable(),
    value: z.number().nullable(),
    market: z.number().nullable(),
    innovation: z.number().nullable(),
    overall: z.number().nullable(),
    praised: z.array(z.string()),
    questioned: z.array(z.string()),
    evidenceCount: z.number(),
    model: z.string().nullable(),
    evidence: z.array(z.object({ text: z.string(), platform: z.string() })).nullable(),
    evidencePlatforms: z.array(z.string()).nullable(),
    axisNotes: z.record(z.string(), z.string()).nullable(),
    createdAt: z.string(),
    history: z.array(z.number()),
  })
  .nullable();

const probesDataSchema = z
  .object({
    runId: z.string(),
    status: z.string(),
    probesDone: z.number(),
    probesTotal: z.number(),
    startedAt: z.string(),
    completedAt: z.string().nullable(),
    errorMessage: z.string().nullable(),
    probes: z.array(
      z.object({
        platform: z.string(),
        axis: z.string(),
        question: z.string(),
        status: z.string(),
        answer: z.string().nullable(),
        sources: z.array(z.object({ url: z.string() })),
        score: z.number().nullable(),
        noInformation: z.boolean(),
        note: z.string().nullable(),
        errorMessage: z.string().nullable(),
      }),
    ),
  })
  .nullable();

const perceptionEnvelopeSchema = z.object({ success: z.literal(true), data: perceptionDataSchema });
const probesEnvelopeSchema = z.object({ success: z.literal(true), data: probesDataSchema });

type PerceptionApiData = z.infer<typeof perceptionDataSchema>;
type ProbesApiData = z.infer<typeof probesDataSchema>;
type ProbeApiRow = NonNullable<ProbesApiData>["probes"][number];

// `GET /api/hallucinations` - every field this screen reads from a
// `brand_hallucinations` row (`shared/schema/signals.ts`). Only unresolved
// rows are requested: a resolved conflict is no longer something AI answers
// currently get wrong about the brand.
const hallucinationSchema = z.object({
  id: z.string(),
  claimedStatement: z.string(),
  actualFact: z.string().nullable(),
  hallucinationType: z.string(),
  category: z.string().nullable(),
  severity: z.string(),
});
const hallucinationsEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.array(hallucinationSchema),
});
type HallucinationRow = z.infer<typeof hallucinationSchema>;

const measured = <T>(value: T): Board13Value<T> => ({ kind: "measured", value });
const notMeasured = <T>(reason: string): Board13Value<T> => ({ kind: "not-measured", reason });
const failed = <T>(reason: string): Board13Value<T> => ({ kind: "failed", reason });

function readDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  const month = months[date.getUTCMonth()];
  return month ? `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}` : iso;
}

function shortUrl(url: string): string {
  try {
    return `${new URL(url).origin}/…`;
  } catch {
    return url;
  }
}

function answerId(platform: string): string {
  return (
    platform
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "answer"
  );
}

function firstSuccessfulProbe(rows: readonly ProbeApiRow[]): ProbeApiRow | undefined {
  return rows.find(
    (row) => row.status === "scored" && row.answer !== null && row.answer.trim() !== "",
  );
}

function mapProbeAnswers(probes: ProbesApiData, retrievedAt: string): Board13Answer[] {
  if (!probes) return [];

  const byPlatform = new Map<string, ProbeApiRow[]>();
  for (const probe of probes.probes) {
    const platformRows = byPlatform.get(probe.platform) ?? [];
    platformRows.push(probe);
    byPlatform.set(probe.platform, platformRows);
  }

  return Array.from(byPlatform.entries()).map(([platform, rows]) => {
    const first = rows[0];
    const successful = firstSuccessfulProbe(rows);
    const failedRow = rows.find((row) => row.status === "failed");
    const reason = failedRow?.errorMessage ?? first?.note ?? "The model did not return an answer.";
    const source = successful?.sources[0];
    const answerState: Board13Value<string> = successful?.answer
      ? measured<string>(successful.answer)
      : failedRow
        ? failed(reason)
        : notMeasured(first?.noInformation ? "The model returned no information." : reason);
    const sourceUrl: Board13Value<string> = source
      ? measured<string>(shortUrl(source.url))
      : notMeasured("No source URL was recorded.");
    const sourceHref: Board13Value<string> = source
      ? measured<string>(source.url)
      : notMeasured("No source URL was recorded.");
    const dateState: Board13Value<string> =
      successful || failedRow
        ? measured<string>(retrievedAt)
        : notMeasured("No answer was retrieved.");

    return {
      id: answerId(platform),
      model: measured(platform),
      snippet: answerState,
      sourceUrl,
      sourceHref,
      retrievedAt: dateState,
    };
  });
}

function mapEvidenceAnswers(perception: PerceptionApiData, retrievedAt: string): Board13Answer[] {
  if (!perception?.evidence) return [];
  return perception.evidence.map((item, index) => ({
    id: answerId(`${item.platform}-${index}`),
    model: measured(item.platform),
    snippet: measured(item.text),
    sourceUrl: notMeasured("The perception run did not store a source URL."),
    sourceHref: notMeasured("The perception run did not store a source URL."),
    retrievedAt: measured(retrievedAt),
  }));
}

const NO_PER_THEME_COUNT = notMeasured<number>("No per-theme count is recorded.");
const NO_PER_THEME_CONFIDENCE = notMeasured<Board13Confidence>(
  "No per-theme confidence score is recorded.",
);
const NO_LINKED_FACT = notMeasured<string>("No single approved fact is linked to this theme.");

function themeRow(
  id: string,
  phrase: string,
  coverage: Board13Coverage,
  action: Board13Action,
): Board13Theme {
  return {
    id,
    name: measured(phrase),
    observed: measured(phrase),
    approved: NO_LINKED_FACT,
    coverage: measured(coverage),
    coverageCount: NO_PER_THEME_COUNT,
    coverageTotal: NO_PER_THEME_COUNT,
    coverageRate: NO_PER_THEME_COUNT,
    confidence: NO_PER_THEME_CONFIDENCE,
    action: measured(action),
    selected: false,
  };
}

/**
 * The four theme buckets, built only from rows that already exist:
 *
 *  - accurate: `perception.praised` - phrases the scoring LLM extracted
 *    because the evidence text backed them (`server/lib/perceptionScorer.ts`
 *    requires every entry be "quoted or closely paraphrased FROM the
 *    excerpts - never invented").
 *  - missing: an accepted `brand_fact_sheet` row whose value does not appear
 *    anywhere in the captured probe answers or evidence text - a real,
 *    if approximate, substring check, never an invented gap.
 *  - conflicting: every unresolved `brand_hallucinations` row - a claim AI
 *    made against a known actual fact.
 *  - unverified: `perception.questioned` - the same evidence-grounded
 *    extraction as `praised`, for phrases the scoring LLM flagged rather
 *    than confirmed.
 */
function buildThemes(
  perception: PerceptionApiData,
  hallucinations: readonly HallucinationRow[],
  acceptedFacts: readonly BrandFactView[],
  corpus: string,
): Board13Theme[] {
  const rows: Board13Theme[] = [];

  (perception?.praised ?? []).forEach((phrase, index) => {
    rows.push(themeRow(`accurate-${index}`, phrase, "High", "Keep"));
  });

  for (const fact of acceptedFacts) {
    const value = fact.factValue.trim();
    if (!value || corpus.includes(value.toLowerCase())) continue;
    rows.push({
      id: `missing-${fact.id}`,
      name: measured(fact.factKey || fact.subcategory),
      observed: notMeasured("Not mentioned in any captured evidence."),
      approved: measured(fact.factValue),
      coverage: measured("Low"),
      coverageCount: NO_PER_THEME_COUNT,
      coverageTotal: NO_PER_THEME_COUNT,
      coverageRate: NO_PER_THEME_COUNT,
      confidence: NO_PER_THEME_CONFIDENCE,
      action: measured("Prioritize"),
      selected: false,
    });
  }

  for (const hallucination of hallucinations) {
    rows.push({
      id: `conflicting-${hallucination.id}`,
      name: measured(hallucination.category ?? hallucination.hallucinationType),
      observed: measured(hallucination.claimedStatement),
      approved: hallucination.actualFact
        ? measured(hallucination.actualFact)
        : notMeasured("No corrected fact is recorded for this claim."),
      coverage: measured("Conflicting"),
      coverageCount: NO_PER_THEME_COUNT,
      coverageTotal: NO_PER_THEME_COUNT,
      coverageRate: NO_PER_THEME_COUNT,
      confidence: NO_PER_THEME_CONFIDENCE,
      action: measured("Clarify"),
      selected: false,
    });
  }

  (perception?.questioned ?? []).forEach((phrase, index) => {
    rows.push(themeRow(`unverified-${index}`, phrase, "Medium", "Improve"));
  });

  if (rows.length > 0) rows[0]!.selected = true;
  return rows;
}

/** Lower-cased text of every captured probe answer and evidence snippet, for
 *  the missing-theme substring check above. Never used to state a finding on
 *  its own - only to decide whether a fact was mentioned anywhere. */
function buildCorpus(perception: PerceptionApiData, probes: ProbesApiData): string {
  const probeTexts = probes?.probes.flatMap((row) => (row.answer ? [row.answer] : [])) ?? [];
  const evidenceTexts = perception?.evidence?.map((item) => item.text) ?? [];
  return [...probeTexts, ...evidenceTexts].join("\n").toLowerCase();
}

function buildBoard13Data(
  brandId: string,
  brandName: string,
  perception: PerceptionApiData,
  probes: ProbesApiData,
  hallucinations: readonly HallucinationRow[],
  acceptedFacts: readonly BrandFactView[],
): Board13Data {
  const retrievedAt = probes?.completedAt ?? probes?.startedAt ?? perception?.createdAt ?? "";
  const answerRows = probes
    ? mapProbeAnswers(probes, readDateLabel(retrievedAt))
    : mapEvidenceAnswers(perception, readDateLabel(retrievedAt));
  const successfulCount = answerRows.filter((row) => row.snippet.kind === "measured").length;
  const answers: Board13Value<readonly Board13Answer[]> =
    answerRows.length > 0
      ? measured<readonly Board13Answer[]>(answerRows)
      : notMeasured("No successful answer set exists.");
  const measurementDate: Board13Value<string> = retrievedAt
    ? measured<string>(readDateLabel(retrievedAt))
    : notMeasured("No perception run date exists.");

  const corpus = buildCorpus(perception, probes);
  const themeRows = buildThemes(perception, hallucinations, acceptedFacts, corpus);
  const accurateCount = perception?.praised.length ?? 0;
  const missingCount = themeRows.filter((row) => row.id.startsWith("missing-")).length;
  const unverifiedCount = perception?.questioned.length ?? 0;
  const NO_PERCEPTION_RUN = "No perception run exists for this brand yet.";

  return {
    brandId: measured(brandId),
    brandName: measured(brandName),
    summary: perception
      ? measured(
          `${accurateCount} accurate theme${accurateCount === 1 ? "" : "s"}, ${missingCount} missing, ` +
            `${hallucinations.length} conflicting, and ${unverifiedCount} unverified, based on ` +
            `${answerRows.length} captured answer${answerRows.length === 1 ? "" : "s"}.`,
        )
      : notMeasured(NO_PERCEPTION_RUN),
    accurateThemes: perception ? measured(accurateCount) : notMeasured(NO_PERCEPTION_RUN),
    missingThemes:
      acceptedFacts.length > 0
        ? measured(missingCount)
        : notMeasured("No approved brand facts exist to compare against."),
    conflictingClaims: measured(hallucinations.length),
    unverifiedImpressions: perception ? measured(unverifiedCount) : notMeasured(NO_PERCEPTION_RUN),
    themes:
      themeRows.length > 0
        ? measured<readonly Board13Theme[]>(themeRows)
        : notMeasured("No theme has been observed yet."),
    answers,
    successfulAnswers: probes
      ? measured(successfulCount)
      : notMeasured("Probe answer coverage is not available."),
    mentionedAnswers: notMeasured(
      "The perception probe response does not include mention coverage.",
    ),
    evidenceBoundaries: {
      observed: notMeasured("Mention coverage is not available in this response."),
      unknown: notMeasured("Model omission reasons are not stored."),
      nextCheck: notMeasured("A next-check schedule is not stored."),
      noCausalClaim: measured(
        "This task shows how AI answers describe your brand. It does not prove why these patterns occur.",
      ),
      finalNote: measured("We avoid blame and focus on useful experiments."),
    },
    measuredAt: measurementDate,
  };
}

async function readPerception(brandId: string): Promise<PerceptionApiData> {
  const response = await apiRequest(
    "GET",
    `/api/dashboard/perception/${encodeURIComponent(brandId)}`,
  );
  const payload: unknown = await response.json();
  const parsed = perceptionEnvelopeSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The perception response has an invalid shape.");
  return parsed.data.data;
}

async function readProbes(brandId: string): Promise<ProbesApiData> {
  const response = await apiRequest(
    "GET",
    `/api/dashboard/perception/probes/${encodeURIComponent(brandId)}`,
  );
  const payload: unknown = await response.json();
  const parsed = probesEnvelopeSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The perception probe response has an invalid shape.");
  return parsed.data.data;
}

async function readUnresolvedHallucinations(brandId: string): Promise<HallucinationRow[]> {
  const response = await apiRequest(
    "GET",
    `/api/hallucinations?brandId=${encodeURIComponent(brandId)}&isResolved=false`,
  );
  const payload: unknown = await response.json();
  const parsed = hallucinationsEnvelopeSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The hallucinations response has an invalid shape.");
  return parsed.data.data;
}

export function useBoard13Data(): V2LiveResult<Board13Data> {
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const brandId = selectedBrandId || undefined;
  const query = useQuery({
    queryKey: ["v2", "diagnostics", "perception", brandId],
    enabled: Boolean(brandId),
    staleTime: 30_000,
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      if (!brandId) throw new Error("A brand is required to load perception.");
      const [perception, probes, hallucinations] = await Promise.all([
        readPerception(brandId),
        readProbes(brandId),
        readUnresolvedHallucinations(brandId),
      ]);
      return { perception, probes, hallucinations };
    },
  });
  // Approved facts are a secondary enrichment (the missing-theme check) -
  // its own loading or failure never blocks the perception read itself, so
  // this stays a plain best-effort `[]` rather than a third required leg of
  // the required query above.
  const factsQuery = useBrandFacts(brandId);
  const acceptedFacts = (factsQuery.data ?? []).filter((fact) => fact.acceptedAt);

  if (!brandId || !selectedBrand) {
    return {
      state: { kind: "not-measured", reason: "Select a brand before measuring perception." },
    };
  }
  if (query.isPending) return { state: { kind: "loading" } };
  if (query.isError) {
    return {
      state: {
        kind: "error",
        message:
          query.error instanceof Error
            ? query.error.message
            : "Perception data could not be loaded.",
      },
    };
  }

  const response = query.data;
  if (!response.perception && !response.probes) {
    return {
      state: {
        kind: "not-measured",
        reason: "Perception has not been measured for this brand yet.",
      },
    };
  }

  const data = buildBoard13Data(
    brandId,
    selectedBrand.name,
    response.perception,
    response.probes,
    response.hallucinations,
    acceptedFacts,
  );
  if (query.isStale && data.measuredAt.kind === "measured") {
    return {
      state: {
        kind: "stale",
        reason: "Perception data may be out of date.",
        asOf: data.measuredAt.value,
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
