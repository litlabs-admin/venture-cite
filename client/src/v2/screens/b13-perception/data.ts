// Live: brand identity, probe status, platforms, answer text, source URLs, and run dates.
// Pending: normalized theme classification, four summary counts, mention coverage, and next-check schedule.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board13Answer, Board13Data, Board13Value } from "./Screen";

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

function buildBoard13Data(
  brandId: string,
  brandName: string,
  perception: PerceptionApiData,
  probes: ProbesApiData,
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

  return {
    brandId: measured(brandId),
    brandName: measured(brandName),
    summary: notMeasured(
      "The backend does not store the normalized synthesis shown by this screen.",
    ),
    accurateThemes: notMeasured("Theme classification is pending backend support."),
    missingThemes: notMeasured("Theme classification is pending backend support."),
    conflictingClaims: notMeasured("Theme classification is pending backend support."),
    unverifiedImpressions: notMeasured("Theme classification is pending backend support."),
    themes: notMeasured("Theme classification is pending backend support."),
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
      const [perception, probes] = await Promise.all([
        readPerception(brandId),
        readProbes(brandId),
      ]);
      return { perception, probes };
    },
  });

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

  const data = buildBoard13Data(brandId, selectedBrand.name, response.perception, response.probes);
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
