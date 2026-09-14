import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { ExternalLink } from "@/v2/shared/ui/ExternalLink";
import { Panel } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { SearchInput } from "@/v2/shared/ui/SearchInput";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { UnderlineTabs, type UnderlineTab } from "@/v2/shared/ui/UnderlineTabs";
import { v2Type } from "@/v2/theme/typography";

export type ContentOpportunityLevel = "Low" | "Medium" | "High";
export type ContentEvidenceQuality = "Weak" | "Fair" | "Good" | "Strong";
export type ContentStatus = "High priority" | "Needs update" | "Minor update" | "Up to date";
export type ContentEffort = "S" | "M" | "L";
export type ContentPageSourceType = "bofu" | "faq" | "article";

export type Board41Page = {
  id: string;
  sourceType: ContentPageSourceType;
  title: string;
  /** Null when the content has no live URL yet - it exists but is not published. */
  path: string | null;
  type: string;
  questionsCovered: number;
  visibilityGap: ContentOpportunityLevel | null;
  evidenceQuality: ContentEvidenceQuality | null;
  freshness: string;
  recommendedChange: string;
  effort: ContentEffort;
  status: ContentStatus;
};

export type Board41UnmappedQuestion = { id: string; prompt: string };

export type Board41Data = {
  brandId: string;
  mode: "guided" | "expert";
  pages: Board41Page[];
  unmappedQuestions: Board41UnmappedQuestion[];
  coverageGapCount: number;
  duplicateTopicCount: number;
  pagesWithoutEvidenceCount: number;
  prioritizedAction: {
    pageId: string;
    pageName: string;
    question: string | null;
    recommendedChange: string;
  } | null;
};

export type Board41Actions = {
  createTask: (pageId: string) => void;
  refresh: () => void;
  pendingTaskId: string | null;
};

type Tab = "pages" | "unmapped";

function statusTone(status: ContentStatus): "bad" | "warn" | "brand" | "ok" {
  switch (status) {
    case "High priority":
      return "bad";
    case "Needs update":
      return "warn";
    case "Minor update":
      return "brand";
    case "Up to date":
      return "ok";
    default:
      return "brand";
  }
}

function levelTone(level: ContentOpportunityLevel | null): "ok" | "warn" | "bad" | "neutral" {
  if (level === "Low") return "ok";
  if (level === "Medium") return "warn";
  if (level === "High") return "bad";
  return "neutral";
}

function qualityTone(quality: ContentEvidenceQuality | null): "ok" | "warn" | "bad" | "neutral" {
  if (quality === "Strong" || quality === "Good") return "ok";
  if (quality === "Fair") return "warn";
  if (quality === "Weak") return "bad";
  return "neutral";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function matchesSearch(page: Board41Page, term: string): boolean {
  if (!term) return true;
  const haystack = `${page.title} ${page.path ?? ""} ${page.type}`.toLowerCase();
  return haystack.includes(term);
}

function PagesTable({
  pages,
  onSelect,
}: {
  pages: readonly Board41Page[];
  onSelect: (page: Board41Page) => void;
}) {
  const columns: readonly DataColumn<Board41Page>[] = [
    {
      key: "title",
      header: "Page",
      render: (row) => (
        <div className="min-w-0">
          <p className={v2Type.bodyStrong}>{row.title}</p>
          {row.path ? (
            <p className={v2Type.meta}>{row.path}</p>
          ) : (
            <p className={`${v2Type.meta} text-[color:var(--v2-warn)]`}>Not published yet</p>
          )}
        </div>
      ),
    },
    { key: "type", header: "Type", wrap: false },
    { key: "questionsCovered", header: "Questions covered", numeric: true, wrap: false },
    {
      key: "visibilityGap",
      header: "Visibility gap",
      wrap: false,
      render: (row) =>
        row.visibilityGap ? (
          <Chip tone={levelTone(row.visibilityGap)}>{row.visibilityGap}</Chip>
        ) : (
          <StateLabel state="not-measured" />
        ),
    },
    {
      key: "evidenceQuality",
      header: "Evidence quality",
      wrap: false,
      render: (row) =>
        row.evidenceQuality ? (
          <Chip tone={qualityTone(row.evidenceQuality)}>{row.evidenceQuality}</Chip>
        ) : (
          <StateLabel state="not-measured" />
        ),
    },
    {
      key: "freshness",
      header: "Freshness",
      wrap: false,
      render: (row) => <span className={v2Type.num}>{formatDate(row.freshness)}</span>,
    },
    { key: "recommendedChange", header: "Recommended change" },
    { key: "effort", header: "Effort", wrap: false },
    {
      key: "status",
      header: "Status",
      wrap: false,
      render: (row) => <Chip tone={statusTone(row.status)}>{row.status}</Chip>,
    },
  ];

  return (
    <DataTable
      className="mt-4"
      columns={columns}
      emptyMessage="No published pages are tracked yet. Publish BOFU content, FAQs or articles to see them here."
      footer={`Showing ${pages.length} of ${pages.length} pages`}
      onRowClick={onSelect}
      rowKey={(row) => row.id}
      rows={pages}
    />
  );
}

function UnmappedTable({ questions }: { questions: readonly Board41UnmappedQuestion[] }) {
  const columns: readonly DataColumn<Board41UnmappedQuestion>[] = [
    { key: "prompt", header: "Approved buyer question" },
  ];
  return (
    <DataTable
      className="mt-4"
      columns={columns}
      emptyMessage="Every approved buyer question has a matching page."
      rowKey={(row) => row.id}
      rows={questions}
    />
  );
}

function PageDetail({
  page,
  actions,
}: {
  page: Board41Page | undefined;
  actions?: Board41Actions;
}) {
  if (!page) return null;
  const creating = actions?.pendingTaskId === page.id;
  return (
    <Panel className="mt-5" padding="spacious">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={v2Type.caps}>{page.type}</p>
          <h2 className={`${v2Type.cardTitle} mt-1`}>{page.title}</h2>
          {page.path ? (
            <ExternalLink className="mt-1" href={page.path}>
              {page.path}
            </ExternalLink>
          ) : (
            <p className={`${v2Type.meta} mt-1 text-[color:var(--v2-warn)]`}>Not published yet</p>
          )}
        </div>
        <Chip tone={statusTone(page.status)}>{page.status}</Chip>
      </div>
      <p className={`${v2Type.body} mt-3`}>{page.recommendedChange}</p>
      <div className="mt-5 flex items-center gap-3">
        <Button disabled={creating} onClick={() => actions?.createTask(page.id)} type="button">
          {creating ? "Creating…" : "Create improvement task"}
        </Button>
        <Button
          disabled
          title="Use only when no suitable existing page exists."
          type="button"
          variant="outline"
        >
          Plan new page
        </Button>
      </div>
      <p className={`${v2Type.meta} mt-2`}>Use only when no suitable existing page exists.</p>
    </Panel>
  );
}

function RightRail({ data }: { data: Board41Data }) {
  return (
    <aside className="min-w-0" aria-label="Content inventory gaps">
      <Panel padding="compact">
        <p className={v2Type.label}>Coverage gaps</p>
        <p className={`${v2Type.statBig} mt-1 text-[26px]`}>{data.coverageGapCount}</p>
        <p className={`${v2Type.meta} mt-1`}>Approved buyer question has no suitable page.</p>
      </Panel>
      <Panel className="mt-3" padding="compact">
        <p className={v2Type.label}>Duplicate topics</p>
        <p className={`${v2Type.statBig} mt-1 text-[26px]`}>{data.duplicateTopicCount}</p>
        <p className={`${v2Type.meta} mt-1`}>Similar content shared across multiple pages.</p>
      </Panel>
      <Panel className="mt-3" padding="compact">
        <p className={v2Type.label}>Pages without evidence</p>
        <p className={`${v2Type.statBig} mt-1 text-[26px]`}>{data.pagesWithoutEvidenceCount}</p>
        <p className={`${v2Type.meta} mt-1`}>Lack customer proof, data, or specific examples.</p>
      </Panel>

      <h2 className={`${v2Type.sectionTitle} mt-6 border-t border-[var(--v2-line)] pt-5`}>
        Top prioritized action
      </h2>
      {data.prioritizedAction ? (
        <div className="mt-2">
          <p className={v2Type.bodyStrong}>Improve {data.prioritizedAction.pageName}</p>
          {data.prioritizedAction.question ? (
            <p className={`${v2Type.meta} mt-1`}>
              Approved question: &ldquo;{data.prioritizedAction.question}&rdquo;
            </p>
          ) : null}
          <p className={`${v2Type.body} mt-1.5`}>{data.prioritizedAction.recommendedChange}</p>
        </div>
      ) : (
        <p className={`${v2Type.body} mt-2`}>No page needs urgent attention right now.</p>
      )}
    </aside>
  );
}

export function Board41Screen({
  data,
  actions,
}: V2ScreenProps<Board41Data> & { actions?: Board41Actions }) {
  const [tab, setTab] = useState<Tab>("pages");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(data.pages[0]?.id ?? null);

  const filteredPages = useMemo(
    () => data.pages.filter((page) => matchesSearch(page, search.trim().toLowerCase())),
    [data.pages, search],
  );
  const filteredQuestions = useMemo(
    () =>
      data.unmappedQuestions.filter((question) =>
        question.prompt.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [data.unmappedQuestions, search],
  );

  const selected = filteredPages.find((page) => page.id === selectedId) ?? filteredPages[0];

  const tabs: readonly UnderlineTab[] = [
    { value: "pages", label: "Pages", count: data.pages.length },
    { value: "unmapped", label: "Unmapped questions", count: data.unmappedQuestions.length },
  ];

  return (
    <div
      className="min-h-full text-[14px] leading-[1.5] text-[color:var(--v2-ink)]"
      data-testid="board41-screen"
    >
      <TwoColumn
        className="min-h-full gap-0"
        main={
          <div className="min-w-0 px-6 py-7">
            <PageHeader
              title="Improve existing pages before creating new content"
              sub="Map your approved buyer questions to existing pages and strengthen what you already have."
            />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <UnderlineTabs
                items={tabs}
                onChange={(value) => setTab(value === "unmapped" ? "unmapped" : "pages")}
                value={tab}
              />
              <SearchInput
                className="w-64"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search pages or questions…"
                value={search}
              />
            </div>

            {tab === "pages" ? (
              <>
                <PagesTable onSelect={(page) => setSelectedId(page.id)} pages={filteredPages} />
                <PageDetail actions={actions} page={selected} />
              </>
            ) : (
              <UnmappedTable questions={filteredQuestions} />
            )}
          </div>
        }
        rightRail={
          <div className="border-t border-[var(--v2-line)] px-7 py-7 md:border-t-0 md:border-l">
            <RightRail data={data} />
          </div>
        }
        rightRailWidth={322}
      />
    </div>
  );
}
