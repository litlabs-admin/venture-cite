import { useMemo, useState } from "react";
import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { StatStrip } from "@/v2/shared/ui/StatStrip";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { FilterSelect, type FilterOption } from "@/v2/shared/ui/FilterSelect";
import { Pagination } from "@/v2/shared/ui/Pagination";
import { Chip } from "@/v2/shared/ui/Chip";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { ExternalLink } from "@/v2/shared/ui/ExternalLink";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { DonutChart } from "@/v2/shared/charts/DonutChart";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type Board37Record = {
  id: string;
  question: string;
  engine: string;
  state: "cited" | "mentioned" | "not_mentioned" | "failed";
  sourceDomain: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  capturedAt: string;
  excerpt: string | null;
};

export type Board37Data = {
  navigation: { brandId: string; mode: V2Mode };
  captureDate: string | null;
  summary: { mentions: number; citations: number; failures: number; attempts: number };
  records: readonly Board37Record[];
  sourceMix: readonly { type: string; count: number }[];
  firstPartyShare: number | null;
  thirdPartyShare: number | null;
};

type Board37ScreenProps = V2ScreenProps<Board37Data>;
const PAGE_SIZE = 10;

function stateChip(state: Board37Record["state"]) {
  switch (state) {
    case "cited":
      return <Chip tone="ok">Cited</Chip>;
    case "mentioned":
      return <Chip tone="brand">Mentioned</Chip>;
    case "not_mentioned":
      return <Chip tone="neutral">Not mentioned</Chip>;
    case "failed":
      return <Chip tone="bad">Failed</Chip>;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
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

function ExcerptRow({ record }: { record: Board37Record }) {
  return (
    <div className="grid grid-cols-1 gap-4 border-t border-[var(--v2-line)] bg-[var(--v2-inset)] p-4 sm:grid-cols-2">
      <div>
        <div className={`${v2Type.caps} mb-1.5`}>Answer excerpt</div>
        {record.excerpt ? (
          <p className={`${v2Type.body} leading-[1.6]`}>&ldquo;{record.excerpt}&rdquo;</p>
        ) : (
          <p className={v2Type.meta}>No excerpt was captured for this attempt.</p>
        )}
      </div>
      <div>
        <div className={`${v2Type.caps} mb-1.5`}>Source</div>
        {record.sourceUrl ? (
          <ExternalLink href={record.sourceUrl}>{record.sourceUrl}</ExternalLink>
        ) : (
          <p className={v2Type.meta}>No source link exists for this answer.</p>
        )}
      </div>
    </div>
  );
}

function SourceMixPanel({ sourceMix }: { sourceMix: readonly { type: string; count: number }[] }) {
  const total = sourceMix.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <Panel>
      <PanelHeader title="Source mix" />
      {total === 0 ? (
        <div className="flex flex-col gap-1">
          <StateLabel state="not-measured" />
          <span className={v2Type.meta}>No citation carries a source type yet.</span>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <DonutChart
            centreCaption="Citations"
            centreValue={total}
            segments={sourceMix.map((entry) => ({
              id: entry.type,
              label: entry.type,
              value: entry.count,
            }))}
            size={104}
            thickness={16}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {sourceMix.map((entry) => (
              <div
                className={`${v2Type.meta} flex items-center justify-between gap-2`}
                key={entry.type}
              >
                <span className="truncate">{entry.type}</span>
                <span className="font-mono tabular-nums">
                  {Math.round((entry.count / total) * 100)}% ({entry.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function PartyCoveragePanel({ first, third }: { first: number | null; third: number | null }) {
  return (
    <Panel>
      <PanelHeader title="First-party vs third-party coverage" />
      {first === null || third === null ? (
        <div className="flex flex-col gap-1">
          <StateLabel state="not-measured" />
          <span className={v2Type.meta}>No citation carries a source domain yet.</span>
        </div>
      ) : (
        <>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--v2-line)]">
            <div className="h-full bg-[var(--v2-brand)]" style={{ width: `${first}%` }} />
            <div className="h-full bg-[var(--v2-ink3)]" style={{ width: `${third}%` }} />
          </div>
          <div className={`${v2Type.meta} mt-2 flex items-center justify-between`}>
            <span>{first}% First-party</span>
            <span>{third}% Third-party</span>
          </div>
        </>
      )}
    </Panel>
  );
}

export function Board37Screen({ data, staleAsOf }: Board37ScreenProps) {
  const [engine, setEngine] = useState("all");
  const [result, setResult] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const engineOptions = useMemo(
    () => uniqueOptions(data.records.map((r) => r.engine)),
    [data.records],
  );
  const sourceTypeOptions = useMemo(
    () => uniqueOptions(data.records.map((r) => r.sourceType)),
    [data.records],
  );
  const resultOptions: FilterOption[] = [
    { value: "all", label: "All results" },
    { value: "cited", label: "Cited" },
    { value: "mentioned", label: "Mentioned" },
    { value: "not_mentioned", label: "Not mentioned" },
    { value: "failed", label: "Failed" },
  ];

  const filtered = data.records.filter((record) => {
    const matchesEngine = engine === "all" || record.engine === engine;
    const matchesResult = result === "all" || record.state === result;
    const matchesSourceType = sourceType === "all" || record.sourceType === sourceType;
    return matchesEngine && matchesResult && matchesSourceType;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const columns: DataColumn<Board37Record>[] = [
    {
      key: "question",
      header: "Buyer question",
      wrap: true,
      render: (row) => (
        <button
          className="flex items-center gap-1.5 text-left font-medium text-[color:var(--v2-ink)] hover:text-[color:var(--v2-brand)]"
          onClick={() =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(row.id)) next.delete(row.id);
              else next.add(row.id);
              return next;
            })
          }
          type="button"
        >
          <V2Icon
            name="chev"
            size={12}
            className={
              expanded.has(row.id) ? "rotate-90 transition-transform" : "transition-transform"
            }
          />
          {row.question}
        </button>
      ),
    },
    { key: "engine", header: "Engine" },
    { key: "state", header: "Answer state", render: (row) => stateChip(row.state) },
    { key: "sourceDomain", header: "Source domain", render: (row) => row.sourceDomain ?? "—" },
    { key: "sourceType", header: "Source type", render: (row) => row.sourceType ?? "—" },
    { key: "capturedAt", header: "Captured", render: (row) => formatDate(row.capturedAt) },
  ];

  return (
    <div className="min-w-0 bg-[var(--v2-paper)] px-7 pb-10 pt-7" data-testid="board37-screen">
      <PageHeader
        title="Where answers cite information"
        sub="Explore the questions people ask, the answers they get, and where your brand is mentioned or cited."
        date={data.captureDate ? `Captured ${formatDate(data.captureDate)}` : "No capture yet"}
      />
      {staleAsOf ? (
        <div className="my-4">
          <StateLabel state="stale" />
          <span className={`${v2Type.meta} ml-2`}>As of {staleAsOf}.</span>
        </div>
      ) : null}
      <StatStrip
        className="my-6"
        items={[
          {
            label: "Mentions",
            value: data.summary.mentions,
            caption: "Brand mentioned but not cited",
          },
          {
            label: "Citations",
            value: data.summary.citations,
            tone: "ok",
            caption: "Brand cited with source URL",
          },
          {
            label: "Failures",
            value: data.summary.failures,
            tone: "bad",
            caption: "No brand mention in answer",
          },
          {
            label: "Attempts",
            value: data.summary.attempts,
            tone: "neutral",
            caption: "Total questions analyzed",
          },
        ]}
      />
      <TwoColumn
        main={
          <Panel padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--v2-line)] p-4">
              <FilterSelect
                label="Engine"
                onValueChange={(v) => {
                  setEngine(v);
                  setPage(1);
                }}
                options={engineOptions}
                value={engine}
              />
              <FilterSelect
                label="Result"
                onValueChange={(v) => {
                  setResult(v);
                  setPage(1);
                }}
                options={resultOptions}
                value={result}
              />
              <FilterSelect
                label="Source type"
                onValueChange={(v) => {
                  setSourceType(v);
                  setPage(1);
                }}
                options={sourceTypeOptions}
                value={sourceType}
              />
            </div>
            <DataTable
              columns={columns}
              rows={pageRows}
              rowKey={(row) => row.id}
              emptyMessage="No answer record matches these filters."
              groupHeader={(row) => (expanded.has(row.id) ? <ExcerptRow record={row} /> : null)}
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
            <SourceMixPanel sourceMix={data.sourceMix} />
            <PartyCoveragePanel first={data.firstPartyShare} third={data.thirdPartyShare} />
            <InfoNote>
              Source-link verification and citation-outreach opportunities are not tracked yet. A
              citation flag does not prove the URL is reachable - review each source before relying
              on it.
            </InfoNote>
          </div>
        }
      />
    </div>
  );
}
