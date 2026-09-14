import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, isApiError } from "@/lib/queryClient";
import { citationRatePct } from "@shared/visibilityMetrics";
import { AI_PLATFORMS_ACTIVE } from "@shared/constants";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { StatusDot } from "@/v2/shared/ui/StatusDot";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { KeyValueList } from "@/v2/shared/ui/KeyValueList";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { InlineAlert } from "@/v2/shared/ui/InlineAlert";
import { Segmented } from "@/v2/shared/ui/Segmented";
import { FilterSelect } from "@/v2/shared/ui/FilterSelect";

// ── Data shape ───────────────────────────────────────────────────────────
// Screen.tsx receives the brand's real citation-check history (its own
// geo_rankings rows and its tracked competitors' competitor_geo_rankings
// rows, both over a 60-day window) and aggregates it here so the engine and
// window scope controls can re-derive every table without another round
// trip. A metric this backend genuinely cannot produce (recommendation
// rate, market) stays a Board38Value in the "not-measured" state rather
// than a guess.

export type Board38Value<T> =
  { kind: "measured"; value: T } | { kind: "not-measured"; reason: string };

export type Board38Measurement = {
  brandPromptId: string;
  aiPlatform: string;
  checkedAt: string;
  isCited: boolean;
  rank: number | null;
  mentionedBrands: readonly { name: string; cited: boolean; rank: number | null }[];
};

export type Board38CompetitorMeasurement = {
  competitorId: string;
  brandPromptId: string;
  aiPlatform: string;
  checkedAt: string;
  isCited: boolean;
  rank: number | null;
  citingOutletUrl: string | null;
  citationContext: string | null;
};

export type Board38Competitor = { id: string; name: string; nameVariations: readonly string[] };
export type Board38Prompt = { id: string; text: string; category: string | null };

export type Board38Data = {
  navigation: { brandId: string; mode: "expert" };
  brandName: Board38Value<string>;
  market: Board38Value<string>;
  totalTrackedPrompts: Board38Value<number>;
  prompts: readonly Board38Prompt[];
  competitors: readonly Board38Competitor[];
  measurements: readonly Board38Measurement[];
  competitorMeasurements: readonly Board38CompetitorMeasurement[];
};

const WINDOW_OPTIONS = [7, 14, 30] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];
type EngineFilter = "all" | (typeof AI_PLATFORMS_ACTIVE)[number];

const DIAGNOSTIC_TABS = [
  { label: "Site health", to: "/v2/diagnostics/site-health" },
  { label: "GEO signals", to: "/v2/diagnostics/geo-signals" },
  { label: "Perception", to: "/v2/diagnostics/perception" },
  { label: "Prompt diagnosis", to: "/v2/diagnostics/prompts" },
  { label: "Competitor gap", to: "/v2/diagnostics/competitor-gap" },
] as const;

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function nameMatches(candidate: string, name: string, variations: readonly string[]): boolean {
  const c = normalizeName(candidate);
  if (c === normalizeName(name)) return true;
  return variations.some((v) => normalizeName(v) === c);
}

function withinWindow(iso: string, days: number): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function matchesEngine(platform: string, engine: EngineFilter): boolean {
  return engine === "all" || platform === engine;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}

function buildInternalHref(to: string, navigation: Board38Data["navigation"]): string {
  const params = new URLSearchParams({ brandId: navigation.brandId, mode: navigation.mode });
  return `${to}?${params.toString()}`;
}

function questionHref(brandPromptId: string, navigation: Board38Data["navigation"]): string {
  const params = new URLSearchParams({ brandId: navigation.brandId, mode: navigation.mode });
  return `/v2/visibility/questions/${encodeURIComponent(brandPromptId)}?${params.toString()}`;
}

// ── Aggregation ──────────────────────────────────────────────────────────

type PerformanceRow = {
  id: string;
  name: string;
  isBrand: boolean;
  mentionRate: number | null;
  citationRate: number | null;
  /** Never measured: this backend stores no recommendation concept. Always
   *  null so the column renders an honest "Not measured" state. */
  recommendationRate: null;
  averagePosition: number | null;
  successfulCount: number;
  denominator: number;
  freshnessDays: number | null;
};

function computeScoped(data: Board38Data, windowDays: WindowDays, engine: EngineFilter) {
  return {
    measurements: data.measurements.filter(
      (m) => withinWindow(m.checkedAt, windowDays) && matchesEngine(m.aiPlatform, engine),
    ),
    competitorMeasurements: data.competitorMeasurements.filter(
      (m) => withinWindow(m.checkedAt, windowDays) && matchesEngine(m.aiPlatform, engine),
    ),
  };
}

function computePerformanceRows(
  data: Board38Data,
  windowDays: WindowDays,
  engine: EngineFilter,
): PerformanceRow[] {
  const { measurements, competitorMeasurements } = computeScoped(data, windowDays, engine);
  const denominator = measurements.length;
  const brandName = data.brandName.kind === "measured" ? data.brandName.value : "Your brand";

  const brandMentioned = measurements.filter(
    (m) =>
      m.isCited ||
      m.mentionedBrands.some((b) => normalizeName(b.name) === normalizeName(brandName)),
  );
  const brandCited = measurements.filter((m) => m.isCited);
  const brandRanks = brandCited.map((m) => m.rank).filter((r): r is number => r !== null);
  const brandFreshest = brandCited
    .map((m) => m.checkedAt)
    .sort()
    .at(-1);

  const brandRow: PerformanceRow = {
    id: "brand",
    name: brandName,
    isBrand: true,
    mentionRate: denominator > 0 ? citationRatePct(brandMentioned.length, denominator) : null,
    citationRate: denominator > 0 ? citationRatePct(brandCited.length, denominator) : null,
    recommendationRate: null,
    averagePosition: average(brandRanks),
    successfulCount: brandMentioned.length,
    denominator,
    freshnessDays: brandFreshest ? daysSince(brandFreshest) : null,
  };

  const competitorRows: PerformanceRow[] = data.competitors.map((competitor) => {
    const mentioned = measurements.filter((m) =>
      m.mentionedBrands.some((b) =>
        nameMatches(b.name, competitor.name, competitor.nameVariations),
      ),
    );
    const citingRows = competitorMeasurements.filter((m) => m.competitorId === competitor.id);
    const citedRows = citingRows.filter((m) => m.isCited);
    const ranks = citedRows.map((m) => m.rank).filter((r): r is number => r !== null);
    const freshest = citedRows
      .map((m) => m.checkedAt)
      .sort()
      .at(-1);
    return {
      id: competitor.id,
      name: competitor.name,
      isBrand: false,
      mentionRate: denominator > 0 ? citationRatePct(mentioned.length, denominator) : null,
      citationRate: denominator > 0 ? citationRatePct(citedRows.length, denominator) : null,
      recommendationRate: null,
      averagePosition: average(ranks),
      successfulCount: mentioned.length,
      denominator,
      freshnessDays: freshest ? daysSince(freshest) : null,
    };
  });

  return [brandRow, ...competitorRows];
}

type GapRow = {
  id: string;
  question: string;
  competitorNames: readonly string[];
  evidenceUrls: readonly string[];
};

function computeGapRows(data: Board38Data, windowDays: WindowDays, engine: EngineFilter): GapRow[] {
  const { measurements, competitorMeasurements } = computeScoped(data, windowDays, engine);
  const competitorById = new Map(data.competitors.map((c) => [c.id, c]));

  const brandByPrompt = new Map<string, Board38Measurement[]>();
  for (const m of measurements) {
    const list = brandByPrompt.get(m.brandPromptId) ?? [];
    list.push(m);
    brandByPrompt.set(m.brandPromptId, list);
  }
  const competitorByPrompt = new Map<string, Board38CompetitorMeasurement[]>();
  for (const m of competitorMeasurements) {
    const list = competitorByPrompt.get(m.brandPromptId) ?? [];
    list.push(m);
    competitorByPrompt.set(m.brandPromptId, list);
  }

  const rows: (GapRow & { competingCount: number })[] = [];
  for (const prompt of data.prompts) {
    const brandRows = brandByPrompt.get(prompt.id) ?? [];
    const venturePrCited = brandRows.some((r) => r.isCited);
    if (venturePrCited) continue;

    const citing = new Map<string, { name: string; urls: Set<string> }>();
    for (const row of competitorByPrompt.get(prompt.id) ?? []) {
      if (!row.isCited) continue;
      const competitor = competitorById.get(row.competitorId);
      if (!competitor) continue;
      const entry = citing.get(competitor.id) ?? { name: competitor.name, urls: new Set<string>() };
      if (row.citingOutletUrl) entry.urls.add(row.citingOutletUrl);
      citing.set(competitor.id, entry);
    }
    if (citing.size === 0) continue;

    const entries = Array.from(citing.values());
    rows.push({
      id: prompt.id,
      question: prompt.text,
      competitorNames: entries.map((e) => e.name),
      evidenceUrls: Array.from(new Set(entries.flatMap((e) => Array.from(e.urls)))),
      competingCount: entries.length,
    });
  }

  rows.sort(
    (a, b) => b.competingCount - a.competingCount || b.evidenceUrls.length - a.evidenceUrls.length,
  );
  return rows.slice(0, 8).map(({ competingCount: _competingCount, ...row }) => row);
}

type ChangeEntry = { id: string; name: string; delta: number };

function computeChangeHistory(data: Board38Data): ChangeEntry[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const inCurrent = (iso: string) => new Date(iso).getTime() >= now - 30 * day;
  const inPrevious = (iso: string) => {
    const t = new Date(iso).getTime();
    return t < now - 30 * day && t >= now - 60 * day;
  };
  const brandName = data.brandName.kind === "measured" ? data.brandName.value : "Your brand";

  const countMentioned = (
    rows: readonly Board38Measurement[],
    matches: (m: Board38Measurement) => boolean,
  ) => rows.filter(matches).length;

  const brandMatch = (m: Board38Measurement) =>
    m.isCited || m.mentionedBrands.some((b) => normalizeName(b.name) === normalizeName(brandName));
  const currentBrand = countMentioned(
    data.measurements.filter((m) => inCurrent(m.checkedAt)),
    brandMatch,
  );
  const previousBrand = countMentioned(
    data.measurements.filter((m) => inPrevious(m.checkedAt)),
    brandMatch,
  );

  const entries: ChangeEntry[] = [
    { id: "brand", name: brandName, delta: currentBrand - previousBrand },
  ];

  for (const competitor of data.competitors) {
    const match = (m: Board38Measurement) =>
      m.mentionedBrands.some((b) =>
        nameMatches(b.name, competitor.name, competitor.nameVariations),
      );
    const current = countMentioned(
      data.measurements.filter((m) => inCurrent(m.checkedAt)),
      match,
    );
    const previous = countMentioned(
      data.measurements.filter((m) => inPrevious(m.checkedAt)),
      match,
    );
    entries.push({ id: competitor.id, name: competitor.name, delta: current - previous });
  }

  return entries;
}

type Confidence = { level: "High" | "Medium" | "Low" | "Not measured"; text: string };

function computeConfidence(rows: readonly PerformanceRow[]): Confidence {
  const denominator = rows[0]?.denominator ?? 0;
  if (denominator === 0) {
    return { level: "Not measured", text: "No successful answers exist in this scope yet." };
  }
  const competitorRows = rows.filter((r) => !r.isBrand);
  const allHaveEvidence =
    competitorRows.length > 0 && competitorRows.every((r) => r.successfulCount > 0);
  if (denominator >= 20 && allHaveEvidence) {
    return {
      level: "High",
      text: "Results are based on consistent evidence across tracked competitors.",
    };
  }
  if (denominator >= 5) {
    return {
      level: "Medium",
      text: "Some tracked competitors have limited evidence in this scope.",
    };
  }
  return { level: "Low", text: "Very little evidence exists in this scope yet." };
}

function computeExcludedCount(
  data: Board38Data,
  windowDays: WindowDays,
  engine: EngineFilter,
): number {
  const { measurements } = computeScoped(data, windowDays, engine);
  const withData = new Set(measurements.map((m) => m.brandPromptId));
  return Math.max(0, data.prompts.length - withData.size);
}

// ── Presentation ─────────────────────────────────────────────────────────

function DiagnosticTabs({ navigation }: { navigation: Board38Data["navigation"] }) {
  return (
    <div
      aria-label="Diagnostics tabs"
      className="flex flex-wrap gap-x-6 border-b border-[var(--v2-line)]"
      role="tablist"
    >
      {DIAGNOSTIC_TABS.map((tab) => {
        const active = tab.to === "/v2/diagnostics/competitor-gap";
        return (
          <a
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 border-transparent pb-2.5 text-[13.5px] font-medium text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]",
              active && "border-[var(--v2-brand)] font-semibold text-[color:var(--v2-brand)]",
            )}
            href={buildInternalHref(tab.to, navigation)}
            key={tab.to}
            role="tab"
          >
            <span className={v2Type.body}>{tab.label}</span>
          </a>
        );
      })}
    </div>
  );
}

function rateCell(value: number | null) {
  if (value === null) return <StateLabel state="not-measured" />;
  return <span className={cn(v2Type.num, "tabular-nums")}>{value}%</span>;
}

function performanceColumns(): readonly DataColumn<PerformanceRow>[] {
  return [
    {
      key: "name",
      header: "PR service",
      render: (row) => (
        <span className={cn(v2Type.bodyStrong, row.isBrand && "text-[color:var(--v2-brand)]")}>
          {row.name}
        </span>
      ),
    },
    {
      key: "mentionRate",
      header: "Mention rate",
      numeric: true,
      render: (row) => rateCell(row.mentionRate),
    },
    {
      key: "citationRate",
      header: "Citation rate",
      numeric: true,
      render: (row) => rateCell(row.citationRate),
    },
    {
      key: "recommendationRate",
      header: "Recommendation rate",
      numeric: true,
      render: () => <StateLabel state="not-measured" />,
    },
    {
      key: "averagePosition",
      header: "Average position",
      numeric: true,
      render: (row) =>
        row.averagePosition === null ? (
          <StateLabel state="not-measured" />
        ) : (
          <span className={cn(v2Type.num, "tabular-nums")}>{row.averagePosition}</span>
        ),
    },
    {
      key: "successfulCount",
      header: "Successful answers",
      numeric: true,
      render: (row) => (
        <span className={cn(v2Type.num, "tabular-nums")}>
          {row.successfulCount} / {row.denominator}
        </span>
      ),
    },
    {
      key: "freshnessDays",
      header: "Freshness (days)",
      numeric: true,
      render: (row) =>
        row.freshnessDays === null ? (
          <StateLabel state="not-measured" />
        ) : (
          <span className={cn(v2Type.num, "tabular-nums")}>{row.freshnessDays}</span>
        ),
    },
  ];
}

function gapColumns(
  navigation: Board38Data["navigation"],
  brandName: string,
): readonly DataColumn<GapRow>[] {
  return [
    {
      key: "question",
      header: "Buyer question",
      render: (row) => <span className={v2Type.body}>{row.question}</span>,
    },
    {
      key: "competitorNames",
      header: "Competitors cited",
      render: (row) => <span className={v2Type.body}>{row.competitorNames.join(", ")}</span>,
    },
    {
      key: "id",
      header: brandName,
      render: () => (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone="bad" />
          <span className={v2Type.body}>Not cited</span>
        </span>
      ),
    },
    {
      key: "evidenceUrls",
      header: "Evidence links",
      render: (row) =>
        row.evidenceUrls.length > 0 ? (
          <a
            className={cn(
              v2Type.body,
              "font-semibold text-[color:var(--v2-brand)] hover:underline",
            )}
            href={questionHref(row.id, navigation)}
          >
            View {row.evidenceUrls.length} source{row.evidenceUrls.length === 1 ? "" : "s"}
          </a>
        ) : (
          <StateLabel state="not-measured" />
        ),
    },
  ];
}

function ScopeRail({
  data,
  windowDays,
  engine,
  excludedCount,
  confidence,
  changeHistory,
  topGap,
  onCreateTask,
  creating,
  createMessage,
}: {
  data: Board38Data;
  windowDays: WindowDays;
  engine: EngineFilter;
  excludedCount: number;
  confidence: Confidence;
  changeHistory: readonly ChangeEntry[];
  topGap: GapRow | undefined;
  onCreateTask: () => void;
  creating: boolean;
  createMessage: { tone: "ok" | "bad"; text: string } | null;
}) {
  const engineLabel = engine === "all" ? "All tracked engines" : engine;
  const canCreate = Boolean(topGap && topGap.evidenceUrls.length > 0);

  return (
    <aside aria-label="Analysis scope" className="min-w-0 space-y-3">
      <Panel padding="compact">
        <PanelHeader title="Analysis scope" />
        <KeyValueList
          items={[
            {
              label: "Buyer questions",
              value:
                data.totalTrackedPrompts.kind === "measured" ? (
                  `${data.totalTrackedPrompts.value} tracked questions`
                ) : (
                  <StateLabel state="not-measured" />
                ),
            },
            { label: "Engines", value: engineLabel },
            { label: "Window", value: `Last ${windowDays} days` },
            {
              label: "Market",
              value:
                data.market.kind === "measured" ? (
                  data.market.value
                ) : (
                  <StateLabel state="not-measured" />
                ),
            },
            { label: "Denominator", value: "Successful-answer denominator" },
          ]}
        />
      </Panel>

      <Panel padding="compact">
        <PanelHeader title="Confidence" />
        <div className="flex items-center gap-2">
          <StatusDot
            tone={
              confidence.level === "High" ? "ok" : confidence.level === "Medium" ? "brand" : "warn"
            }
          />
          <span className={v2Type.bodyStrong}>{confidence.level}</span>
        </div>
        <p className={cn(v2Type.body, "mt-1.5")}>{confidence.text}</p>
      </Panel>

      <Panel padding="compact">
        <PanelHeader title="Excluded data" />
        <p className={v2Type.bodyStrong}>Failed or unclear answers</p>
        <p className={cn(v2Type.body, "mt-1")}>
          {excludedCount > 0
            ? `${excludedCount} tracked question${excludedCount === 1 ? "" : "s"} had no successful answer in this scope and are excluded from this analysis.`
            : "Every tracked question has a successful answer in this scope."}
        </p>
      </Panel>

      <Panel padding="compact">
        <PanelHeader title="Change history" />
        <p className={v2Type.body}>Compared to previous 30 days</p>
        <ul className="mt-2 space-y-1.5">
          {changeHistory.map((entry) => (
            <li className="flex items-center justify-between gap-3" key={entry.id}>
              <span className={v2Type.body}>{entry.name}</span>
              <span
                className={cn(
                  v2Type.num,
                  "tabular-nums",
                  entry.delta > 0 && "text-[color:var(--v2-ok)]",
                  entry.delta < 0 && "text-[color:var(--v2-bad)]",
                )}
              >
                {entry.delta > 0 ? "+" : ""}
                {entry.delta} successful answer{Math.abs(entry.delta) === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel padding="compact">
        <Button
          className="w-full"
          disabled={!canCreate || creating}
          onClick={onCreateTask}
          type="button"
        >
          {creating ? "Creating gap task…" : "Create gap task"}
        </Button>
        {!canCreate ? (
          <p className={cn(v2Type.meta, "mt-2")}>
            No question in this scope has both a missing citation for {"your brand"} and cited
            competitor evidence yet.
          </p>
        ) : null}
        {createMessage ? (
          <div className="mt-2">
            <InlineAlert tone={createMessage.tone === "ok" ? "ok" : "bad"}>
              {createMessage.text}
            </InlineAlert>
          </div>
        ) : null}
      </Panel>
    </aside>
  );
}

export function Board38Screen({ data }: V2ScreenProps<Board38Data>) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [engine, setEngine] = useState<EngineFilter>("all");
  const [createMessage, setCreateMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  const queryClient = useQueryClient();

  const brandName = data.brandName.kind === "measured" ? data.brandName.value : "Your brand";
  const performanceRows = useMemo(
    () => computePerformanceRows(data, windowDays, engine),
    [data, windowDays, engine],
  );
  const gapRows = useMemo(
    () => computeGapRows(data, windowDays, engine),
    [data, windowDays, engine],
  );
  const changeHistory = useMemo(() => computeChangeHistory(data), [data]);
  const confidence = useMemo(() => computeConfidence(performanceRows), [performanceRows]);
  const excludedCount = useMemo(
    () => computeExcludedCount(data, windowDays, engine),
    [data, windowDays, engine],
  );
  const topGap = gapRows[0];

  const createTask = useMutation({
    mutationFn: async (brandPromptId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/v2/competitor-gap/${encodeURIComponent(data.navigation.brandId)}/tasks`,
        { brandPromptId },
      );
      return (await response.json()) as {
        success: true;
        data: { created: boolean; task: { title: string } };
      };
    },
    onSuccess: (result) => {
      setCreateMessage({
        tone: "ok",
        text: result.data.created
          ? `Created "${result.data.task.title}".`
          : `A task for this question already exists: "${result.data.task.title}".`,
      });
      void queryClient.invalidateQueries({
        queryKey: ["v2", "diagnostics", "competitor-gap", data.navigation.brandId],
      });
    },
    onError: (error: unknown) => {
      const body = isApiError(error) ? (error.body as { message?: unknown } | null) : null;
      const friendly = body && typeof body.message === "string" ? body.message : undefined;
      setCreateMessage({
        tone: "bad",
        text:
          friendly ?? (error instanceof Error ? error.message : "Unable to create the gap task."),
      });
    },
  });

  return (
    <div className="min-h-screen min-w-0 bg-[var(--v2-inset)] text-[color:var(--v2-ink)]">
      <div className="px-7 py-4">
        <h1 className={v2Type.pageTitle}>Compare evidence across the same buyer questions</h1>
        <div className="mt-3">
          <DiagnosticTabs navigation={data.navigation} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={v2Type.label}>Scope</span>
          <Segmented
            items={WINDOW_OPTIONS.map((d) => ({ value: String(d), label: `${d}D` }))}
            onChange={(value) => setWindowDays(Number(value) as WindowDays)}
            value={String(windowDays)}
          />
          <FilterSelect
            label="Engine"
            onValueChange={(value) => setEngine(value as EngineFilter)}
            options={[
              { value: "all", label: "All engines" },
              ...AI_PLATFORMS_ACTIVE.map((platform) => ({ value: platform, label: platform })),
            ]}
            value={engine}
          />
        </div>

        <TwoColumn
          className="mt-4"
          main={
            <div className="min-w-0 space-y-4">
              <Panel data-testid="b38-performance-panel" padding="none">
                <div className="border-b border-[var(--v2-line)] px-5 py-4">
                  <h2 className={v2Type.sectionTitle}>PR performance comparison</h2>
                  <p className={cn(v2Type.meta, "mt-1")} data-testid="b38-scope-line">
                    Scope:{" "}
                    {data.totalTrackedPrompts.kind === "measured"
                      ? `${data.totalTrackedPrompts.value} tracked questions`
                      : "questions not measured"}{" "}
                    · {engine === "all" ? "All engines" : engine} · Last {windowDays} days ·
                    Successful-answer denominator
                  </p>
                </div>
                <DataTable
                  columns={performanceColumns()}
                  emptyMessage={<EmptyState icon="q" title="No comparison data in this scope" />}
                  rowKey={(row) => row.id}
                  rows={performanceRows}
                />
              </Panel>

              <Panel data-testid="b38-gap-panel" padding="none">
                <div className="border-b border-[var(--v2-line)] px-5 py-4">
                  <h2 className={v2Type.sectionTitle}>Key question gaps</h2>
                  <p className={cn(v2Type.meta, "mt-1")}>
                    Where competitors appear and {brandName} is absent or cited less often.
                  </p>
                </div>
                <DataTable
                  columns={gapColumns(data.navigation, brandName)}
                  emptyMessage={
                    <EmptyState
                      description="No tracked question shows a competitor citation without a matching one for this brand in the current scope."
                      icon="facts"
                      title="No gaps found in this scope"
                    />
                  }
                  onRowClick={(row) => {
                    window.location.href = questionHref(row.id, data.navigation);
                  }}
                  rowKey={(row) => row.id}
                  rows={gapRows}
                />
              </Panel>
            </div>
          }
          rightRail={
            <ScopeRail
              changeHistory={changeHistory}
              confidence={confidence}
              createMessage={createMessage}
              creating={createTask.isPending}
              data={data}
              engine={engine}
              excludedCount={excludedCount}
              onCreateTask={() => {
                if (!topGap) return;
                setCreateMessage(null);
                createTask.mutate(topGap.id);
              }}
              topGap={topGap}
              windowDays={windowDays}
            />
          }
          rightRailWidth={322}
        />
      </div>
    </div>
  );
}
