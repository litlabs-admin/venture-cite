// Live: GEO signal score and history (geo_signal_runs), citation source-type
// mix (geo_rankings.sourceType/isCited over the trailing 30 days), and a
// structured-data completeness read when the brand's own homepage has ever
// been schema-audited (schema_audits). Backed by
// GET /api/v2/diagnostics/geo-signals/:brandId (server/routes/v2Diagnostics.ts).
//
// Pending backend work: this endpoint has no opportunity-ranking, missing-
// evidence, or next-verification producer - those need the source registry
// and evidence-gap tables `docs/superpowers/analysis/2026-09-14-screens/
// 08-verification-A.md` describes as still missing. They render `not-measured`
// rather than a value nothing computed.
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type {
  Board12Data,
  Board12Series,
  Board12SourceMix,
  Board12SourceSignal,
  Board12Value,
} from "./Screen";

type GeoSignalsResponse = {
  brandName: string;
  score: number | null;
  previousScore: number | null;
  history: { date: string; score: number }[];
  sourceMix: { sourceType: string; detected: number; verified: number }[];
  citedUrlCount: number;
  schemaAudit: { url: string; completenessByType: Record<string, number> } | null;
};

type Envelope = { success: boolean; data: GeoSignalsResponse };

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { success?: unknown; data?: unknown };
  return typeof candidate.success === "boolean" && "data" in candidate;
}

async function readGeoSignals(brandId: string): Promise<GeoSignalsResponse> {
  const response = await apiRequest(
    "GET",
    `/api/v2/diagnostics/geo-signals/${encodeURIComponent(brandId)}`,
  );
  const payload: unknown = await response.json();
  if (!isEnvelope(payload) || !payload.success) {
    throw new Error("The GEO signal response was not successful.");
  }
  return payload.data;
}

function measured<T>(value: T): Board12Value<T> {
  return { kind: "measured", value };
}

function notMeasured<T>(reason: string): Board12Value<T> {
  return { kind: "not-measured", reason };
}

/**
 * The only categories `citationChecker.classifySourceType` ever writes
 * (`server/citationChecker.ts`), plus the bucket for a citation whose source
 * URL didn't resolve to a source type at all. Not the board's original six
 * speculative categories ("Structured entities", "Review sources", ...) - the
 * live schema does not classify citations that finely, and inventing rows for
 * categories nothing measures would be exactly the fake precision this
 * product exists to refuse.
 */
const SOURCE_TYPE_LABELS: Record<
  string,
  { label: string; description: string; icon: "globe" | "mail" | "doc" | "link" | "q" }
> = {
  web: { label: "Web citations", description: "General web pages and articles", icon: "globe" },
  community: {
    label: "Community discussions",
    description: "Reddit, Quora, Hacker News, Stack Exchange",
    icon: "mail",
  },
  reference: {
    label: "Reference sources",
    description: "Wikipedia, government, and education sites",
    icon: "doc",
  },
  video: { label: "Video platforms", description: "YouTube, Vimeo, TikTok", icon: "link" },
  unclassified: {
    label: "Other citations",
    description: "The citation's source URL did not resolve to a source type",
    icon: "q",
  },
};

const SOURCE_TYPE_ORDER = ["web", "community", "reference", "video", "unclassified"];

function buildSourceSignals(response: GeoSignalsResponse): Board12SourceSignal[] {
  const bySourceType = new Map(response.sourceMix.map((row) => [row.sourceType, row]));
  const rows: Board12SourceSignal[] = SOURCE_TYPE_ORDER.filter((key) => bySourceType.has(key)).map(
    (key) => {
      const row = bySourceType.get(key)!;
      const meta = SOURCE_TYPE_LABELS[key] ?? SOURCE_TYPE_LABELS.unclassified;
      return {
        id: key,
        sourceType: measured(meta.label),
        description: measured(meta.description),
        icon: meta.icon,
        detected: measured(row.detected),
        verified: measured(row.verified),
        status: measured(row.verified > 0 ? "verified" : "detected"),
        // No day-by-day breakdown exists in this response, only 30-day
        // totals - a sparkline would need to invent intermediate points.
        trend: notMeasured("A day-by-day trend is not available from this response."),
      };
    },
  );

  if (response.schemaAudit) {
    const types = Object.entries(response.schemaAudit.completenessByType);
    const verifiedTypes = types.filter(([, completeness]) => completeness >= 0.5);
    rows.push({
      id: "structured-data",
      sourceType: measured("Structured data"),
      description: measured(response.schemaAudit.url),
      icon: "diag",
      detected: measured(types.length),
      verified: measured(verifiedTypes.length),
      status: measured(verifiedTypes.length > 0 ? "verified" : "detected"),
      trend: notMeasured("A day-by-day trend is not available from this response."),
    });
  }

  return rows;
}

function buildSourceMix(response: GeoSignalsResponse): Board12SourceMix {
  const verifiedRows = response.sourceMix.filter((row) => row.verified > 0);
  const verifiedTotal = verifiedRows.reduce((sum, row) => sum + row.verified, 0);
  if (verifiedTotal === 0) {
    return {
      verifiedTotal: notMeasured("No verified citation has a recorded source type yet."),
      segments: [],
    };
  }
  return {
    verifiedTotal: measured(verifiedTotal),
    segments: verifiedRows.map((row) => {
      const meta = SOURCE_TYPE_LABELS[row.sourceType] ?? SOURCE_TYPE_LABELS.unclassified;
      return {
        id: row.sourceType,
        label: measured(meta.label),
        share: measured(Math.round((row.verified / verifiedTotal) * 100)),
      };
    }),
  };
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function xLabelsFor(history: readonly { date: string }[]): string[] {
  if (history.length <= 5) return history.map((point) => formatShortDate(point.date));
  const indexes = [
    0,
    Math.round((history.length - 1) * 0.25),
    Math.round((history.length - 1) * 0.5),
    Math.round((history.length - 1) * 0.75),
    history.length - 1,
  ];
  return indexes.map((index) => formatShortDate(history[index]!.date));
}

function buildData(brandId: string, response: GeoSignalsResponse): Board12Data {
  const history = response.history;
  const series: Board12Value<Board12Series> =
    history.length > 0
      ? measured({
          primary: history.map((point) => ({ x: formatShortDate(point.date), y: point.score })),
          // No industry-benchmark source exists anywhere in this codebase
          // (see docs/superpowers/analysis/2026-09-14-screens/
          // 08-verification-A.md, row 12). An empty series - never a
          // fabricated line - is what SignalChart uses to drop the second
          // series and its legend entry.
          median: [],
          xLabels: xLabelsFor(history),
        })
      : notMeasured("No GEO signal run has been recorded for this brand yet.");

  return {
    brandId,
    brand: { name: measured(response.brandName) },
    signalCoverage: {
      score:
        response.score === null
          ? notMeasured("No GEO signal run has been recorded for this brand yet.")
          : measured(response.score),
      previousScore:
        response.previousScore === null
          ? notMeasured("No earlier GEO signal run exists to compare against.")
          : measured(response.previousScore),
      change:
        response.score !== null && response.previousScore !== null
          ? measured(response.score - response.previousScore)
          : notMeasured("A change requires two recorded runs."),
      periodStart: history[0] ? formatShortDate(history[0].date) : "",
      periodEnd: history[history.length - 1]
        ? formatShortDate(history[history.length - 1].date)
        : "",
      series,
    },
    sourceSignals: buildSourceSignals(response),
    sourceMix: buildSourceMix(response),
    // No opportunity-ranking model reads geo signal, hallucination, and fact
    // evidence together yet (deferred per the corrected missing-capabilities
    // list, row 19). Every field states why rather than showing an invented
    // recommendation.
    opportunity: {
      title: notMeasured("No opportunity-ranking model exists yet."),
      description: notMeasured("No opportunity-ranking model exists yet."),
      points: notMeasured("No opportunity-ranking model exists yet."),
      evidence: notMeasured("No opportunity-ranking model exists yet."),
      mechanism: notMeasured("No opportunity-ranking model exists yet."),
      uncertainty: notMeasured("No opportunity-ranking model exists yet."),
      uncertaintyDetail: notMeasured("No opportunity-ranking model exists yet."),
    },
    missingEvidence: [],
    nextVerification: {
      title: notMeasured("No verification-ranking model exists yet."),
      detail: notMeasured("No verification-ranking model exists yet."),
      why: notMeasured("No verification-ranking model exists yet."),
      effort: notMeasured("No verification-ranking model exists yet."),
      upside: notMeasured("No verification-ranking model exists yet."),
    },
  };
}

export function useBoard12Data(): V2LiveResult<Board12Data> {
  const { selectedBrandId } = useBrandSelection();
  const query = useQuery<GeoSignalsResponse, Error>({
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readGeoSignals(selectedBrandId),
    queryKey: ["v2", "diagnostics", "geo-signals", selectedBrandId],
    retry: false,
  });

  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "No brand is selected." } };
  }
  if (query.isPending) return { state: { kind: "loading" } };
  if (query.isError) return { state: { kind: "error", message: query.error.message } };

  const data = buildData(selectedBrandId, query.data);
  return { state: { kind: "ready" }, data };
}
