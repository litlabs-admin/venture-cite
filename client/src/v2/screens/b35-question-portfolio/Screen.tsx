import { useMemo, useState } from "react";
import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { SearchInput } from "@/v2/shared/ui/SearchInput";
import { FilterSelect, type FilterOption } from "@/v2/shared/ui/FilterSelect";
import { Pagination } from "@/v2/shared/ui/Pagination";
import { Chip } from "@/v2/shared/ui/Chip";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { Meter } from "@/v2/shared/ui/Meter";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { v2Type } from "@/v2/theme/typography";

export type Board35Question = {
  id: string;
  text: string;
  journeyStage: string | null;
  audienceNames: readonly string[];
  category: string | null;
  region: string;
  activeEngineCount: number;
  latestVisibilityCount: number;
  latestVisibilityDenominator: number;
  citationRate: number | null;
  change30d: number | null;
  status: "tracked" | "suggested" | "archived";
  paused: boolean;
};

export type Board35Value<T> =
  { kind: "measured"; value: T } | { kind: "not-measured"; reason: string };

export type Board35Data = {
  navigation: { brandId: string; mode: V2Mode };
  questions: readonly Board35Question[];
  setHealth: Board35Value<{ score: number; verdict: string }>;
  allowance: { used: number; limit: number };
};

type Board35ScreenProps = V2ScreenProps<Board35Data>;

const PAGE_SIZE = 10;

function v2Href(path: string, navigation: Board35Data["navigation"]): string {
  const search = new URLSearchParams({ brandId: navigation.brandId, mode: navigation.mode });
  return `${path}?${search.toString()}`;
}

function statusTone(status: Board35Question["status"], paused: boolean): "ok" | "warn" | "neutral" {
  if (paused) return "neutral";
  if (status === "archived") return "neutral";
  return "ok";
}

function questionStatusLabel(question: Board35Question): string {
  if (question.paused) return "Paused";
  if (question.status === "archived") return "Archived";
  if (question.status === "suggested") return "Suggested";
  const rate =
    question.latestVisibilityDenominator > 0
      ? question.latestVisibilityCount / question.latestVisibilityDenominator
      : null;
  const declining = question.change30d !== null && question.change30d <= -20;
  if ((rate !== null && rate < 0.34) || declining) return "Needs work";
  return "Active";
}

function uniqueOptions(values: readonly (string | null)[]): FilterOption[] {
  const seen = new Set<string>();
  const options: FilterOption[] = [{ value: "all", label: "All" }];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: value });
  }
  return options;
}

function BalanceGaps({ questions }: { questions: readonly Board35Question[] }) {
  const stages = ["Awareness", "Consideration", "Decision"];
  const counted = stages.map((stage) => ({
    stage,
    count: questions.filter((question) => question.journeyStage === stage).length,
  }));
  const total = questions.length;
  if (total === 0) return <p className={v2Type.meta}>No questions to balance yet.</p>;
  const weakest = counted.reduce(
    (min, entry) => (entry.count < min.count ? entry : min),
    counted[0],
  );
  return (
    <div className="flex flex-col gap-2">
      {counted.map((entry) => (
        <div className="flex items-center justify-between gap-3" key={entry.stage}>
          <span className={v2Type.body}>{entry.stage} stage</span>
          <span
            className={`${v2Type.meta} ${entry.stage === weakest.stage ? "font-semibold text-[color:var(--v2-warn)]" : ""}`}
          >
            {entry.count} of {total} questions (
            {total > 0 ? Math.round((entry.count / total) * 100) : 0}%)
          </span>
        </div>
      ))}
    </div>
  );
}

export function Board35Screen({ data, staleAsOf }: Board35ScreenProps) {
  const [search, setSearch] = useState("");
  const [journeyStage, setJourneyStage] = useState("all");
  const [audience, setAudience] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const journeyOptions = useMemo(
    () => uniqueOptions(data.questions.map((question) => question.journeyStage)),
    [data.questions],
  );
  const audienceOptions = useMemo(
    () => uniqueOptions(data.questions.flatMap((question) => question.audienceNames)),
    [data.questions],
  );
  const statusOptions: FilterOption[] = [
    { value: "all", label: "All" },
    { value: "Active", label: "Active" },
    { value: "Needs work", label: "Needs work" },
    { value: "Paused", label: "Paused" },
    { value: "Suggested", label: "Suggested" },
  ];

  const filtered = data.questions.filter((question) => {
    const matchesSearch =
      search.trim().length === 0 ||
      question.text.toLowerCase().includes(search.toLowerCase()) ||
      question.audienceNames.some((name) => name.toLowerCase().includes(search.toLowerCase()));
    const matchesStage = journeyStage === "all" || question.journeyStage === journeyStage;
    const matchesAudience = audience === "all" || question.audienceNames.includes(audience);
    const matchesStatus = status === "all" || questionStatusLabel(question) === status;
    return matchesSearch && matchesStage && matchesAudience && matchesStatus;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const columns: DataColumn<Board35Question>[] = [
    {
      key: "text",
      header: "Approved question",
      wrap: true,
      render: (row) => (
        <a
          className="font-semibold text-[color:var(--v2-ink)] hover:text-[color:var(--v2-brand)]"
          href={v2Href(`/v2/visibility/questions/${row.id}`, data.navigation)}
        >
          {row.text}
        </a>
      ),
    },
    {
      key: "journeyStage",
      header: "Journey stage",
      render: (row) => row.journeyStage ?? "Not set",
    },
    {
      key: "audienceNames",
      header: "Audience",
      render: (row) => (row.audienceNames.length > 0 ? row.audienceNames.join(", ") : "Not set"),
    },
    { key: "region", header: "Region" },
    { key: "activeEngineCount", header: "Active engines", numeric: true },
    {
      key: "latestVisibilityCount",
      header: "Latest visibility",
      numeric: true,
      render: (row) =>
        row.latestVisibilityDenominator > 0
          ? `${row.latestVisibilityCount} / ${row.latestVisibilityDenominator}`
          : "Not measured",
    },
    {
      key: "citationRate",
      header: "Citation rate",
      numeric: true,
      render: (row) => (row.citationRate === null ? "Not measured" : `${row.citationRate}%`),
    },
    {
      key: "change30d",
      header: "Change (30d)",
      numeric: true,
      render: (row) =>
        row.change30d === null ? (
          "Not measured"
        ) : (
          <span
            className={
              row.change30d >= 0 ? "text-[color:var(--v2-ok)]" : "text-[color:var(--v2-bad)]"
            }
          >
            {row.change30d >= 0 ? "+" : ""}
            {row.change30d}%
          </span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Chip tone={statusTone(row.status, row.paused)}>{questionStatusLabel(row)}</Chip>
      ),
    },
  ];

  return (
    <div className="min-w-0 bg-[var(--v2-paper)] px-7 pb-10 pt-7" data-testid="board35-screen">
      <PageHeader
        title="Buyer questions"
        sub="Track and optimize the questions buyers ask about your company."
      />
      {staleAsOf ? (
        <div className="my-4">
          <StateLabel state="stale" />
          <span className={`${v2Type.meta} ml-2`}>As of {staleAsOf}.</span>
        </div>
      ) : null}
      <TwoColumn
        className="mt-6"
        main={
          <Panel padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--v2-line)] p-4">
              <SearchInput
                className="min-w-[220px] flex-1"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search questions, keywords or audiences…"
                value={search}
              />
              <FilterSelect
                label="Journey stage"
                onValueChange={(value) => {
                  setJourneyStage(value);
                  setPage(1);
                }}
                options={journeyOptions}
                value={journeyStage}
              />
              <FilterSelect
                label="Audience"
                onValueChange={(value) => {
                  setAudience(value);
                  setPage(1);
                }}
                options={audienceOptions}
                value={audience}
              />
              <FilterSelect
                label="Status"
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
                options={statusOptions}
                value={status}
              />
            </div>
            <DataTable
              columns={columns}
              rows={pageRows}
              rowKey={(row) => row.id}
              emptyMessage="No approved question matches these filters."
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--v2-line)] p-4">
              <span className={v2Type.meta}>
                {filtered.length === 0
                  ? "0 of 0"
                  : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
              </span>
              <Pagination onPageChange={setPage} page={safePage} pageCount={pageCount} />
            </div>
          </Panel>
        }
        rightRail={
          <div className="flex flex-col gap-5">
            <Panel>
              <PanelHeader
                title="Set health"
                info="A deterministic score of the tracked question set."
              />
              {data.setHealth.kind === "measured" ? (
                <>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className={`${v2Type.statBig}`}>{data.setHealth.value.score}</span>
                    <span className={v2Type.meta}>{data.setHealth.value.verdict}</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <StateLabel state="not-measured" />
                  <span className={v2Type.meta}>{data.setHealth.reason}</span>
                </div>
              )}
            </Panel>
            <Panel>
              <PanelHeader title="Balance gaps" />
              <BalanceGaps questions={data.questions} />
            </Panel>
            <Panel>
              <PanelHeader title="Allowance" />
              <div className={`${v2Type.bodyStrong} mb-1`}>
                {data.allowance.used} of {data.allowance.limit}
              </div>
              <Meter
                label="Questions used"
                max={data.allowance.limit}
                value={data.allowance.used}
              />
              <p className={`${v2Type.meta} mt-1.5`}>questions used</p>
            </Panel>
            <InfoNote>
              Market and language are not tracked per question yet. Region reflects the
              brand&rsquo;s measurement region.
            </InfoNote>
          </div>
        }
      />
    </div>
  );
}
