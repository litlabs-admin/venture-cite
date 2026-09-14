import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { ExternalLink } from "@/v2/shared/ui/ExternalLink";
import { Panel } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type OpportunityLevel = "Low" | "Medium" | "High";
export type EarnedMediaStatus = "Not started" | "In progress" | "Completed" | "Not a fit";
export type EarnedMediaRelationship = "No contact" | "Warm contact" | "Existing contact";
export type EarnedMediaSourceType = "listicle" | "community" | "mention" | "citation";

export type Board40Opportunity = {
  id: string;
  sourceType: EarnedMediaSourceType;
  sourceTypeLabel: string;
  sourceName: string;
  sourceUrl: string | null;
  topicMatch: OpportunityLevel;
  affectedQuestionCount: number;
  relationship: EarnedMediaRelationship;
  evidenceType: string;
  effort: OpportunityLevel;
  confidence: OpportunityLevel;
  status: EarnedMediaStatus;
  canUpdateStatus: boolean;
  detail: {
    headline: string;
    quote: string | null;
    quoteAttribution: string | null;
    observedAt: string | null;
  };
};

export type Board40Data = {
  brandId: string;
  mode: "guided" | "expert";
  counts: { all: number; listicle: number; community: number; mention: number; citation: number };
  outreachCounts: { notStarted: number; inProgress: number; completed: number; notFit: number };
  opportunities: Board40Opportunity[];
};

export type Board40Actions = {
  createTask: (opportunityId: string) => void;
  updateStatus: (opportunityId: string, status: EarnedMediaStatus) => void;
  refresh: () => void;
  pendingTaskId: string | null;
  pendingStatusId: string | null;
};

type FilterValue = "all" | EarnedMediaSourceType;

const filterLabels: Record<FilterValue, string> = {
  all: "All opportunities",
  listicle: "Listicles",
  community: "Community discussions",
  mention: "Existing mentions",
  citation: "AI-cited sources",
};

function levelTone(level: OpportunityLevel): "ok" | "warn" | "neutral" {
  if (level === "High") return "ok";
  if (level === "Medium") return "warn";
  return "neutral";
}

function statusTone(status: EarnedMediaStatus): "brand" | "ok" | "neutral" | "bad" | "warn" {
  switch (status) {
    case "Not started":
      return "brand";
    case "In progress":
      return "warn";
    case "Completed":
      return "ok";
    case "Not a fit":
      return "bad";
    default:
      return "neutral";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function DetailPanel({
  opportunity,
  actions,
}: {
  opportunity: Board40Opportunity | undefined;
  actions?: Board40Actions;
}) {
  if (!opportunity) {
    return (
      <Panel className="mt-5" padding="spacious">
        <p className={v2Type.body}>Select a source from the table to review it.</p>
      </Panel>
    );
  }

  const creating = actions?.pendingTaskId === opportunity.id;
  const updatingStatus = actions?.pendingStatusId === opportunity.id;
  const statusOptions: EarnedMediaStatus[] = [
    "Not started",
    "In progress",
    "Completed",
    "Not a fit",
  ];

  return (
    <Panel className="mt-5" padding="spacious">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={v2Type.caps}>{opportunity.sourceTypeLabel}</p>
          <h2 className={`${v2Type.cardTitle} mt-1`}>{opportunity.sourceName}</h2>
        </div>
        {opportunity.sourceUrl ? (
          <ExternalLink href={opportunity.sourceUrl}>View source</ExternalLink>
        ) : null}
      </div>

      <h3 className={`${v2Type.sectionTitle} mt-5`}>Why this is a good opportunity</h3>
      <p className={`${v2Type.body} mt-1.5`}>{opportunity.detail.headline}</p>
      {opportunity.detail.quote ? (
        <blockquote className="mt-3 border-l-2 border-[var(--v2-line2)] pl-3">
          <p className={v2Type.body}>&ldquo;{opportunity.detail.quote}&rdquo;</p>
          {opportunity.detail.quoteAttribution ? (
            <p className={`${v2Type.meta} mt-1`}>
              — {opportunity.detail.quoteAttribution}
              {opportunity.detail.observedAt
                ? `, ${formatDate(opportunity.detail.observedAt)}`
                : ""}
            </p>
          ) : null}
        </blockquote>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className={v2Type.label}>Topic match</p>
          <Chip className="mt-1" tone={levelTone(opportunity.topicMatch)}>
            {opportunity.topicMatch}
          </Chip>
        </div>
        <div>
          <p className={v2Type.label}>Effort</p>
          <Chip className="mt-1" tone="neutral">
            {opportunity.effort}
          </Chip>
        </div>
        <div>
          <p className={v2Type.label}>Confidence</p>
          <Chip className="mt-1" tone={levelTone(opportunity.confidence)}>
            {opportunity.confidence}
          </Chip>
        </div>
        <div>
          <p className={v2Type.label}>Relationship</p>
          <p className={`${v2Type.body} mt-1`}>{opportunity.relationship}</p>
        </div>
      </div>

      <h3 className={`${v2Type.sectionTitle} mt-5`}>Safe outreach brief (do not send yet)</h3>
      <dl className="mt-2 space-y-2">
        <div>
          <dt className={v2Type.label}>Angle</dt>
          <dd className={`${v2Type.body} mt-0.5`}>
            Offer data-driven insight on the buyer need this source is missing, with a short comment
            from the founder.
          </dd>
        </div>
        <div>
          <dt className={v2Type.label}>Value to the source</dt>
          <dd className={`${v2Type.body} mt-0.5`}>
            Adds fresh, independent data and a practitioner perspective. No sales ask.
          </dd>
        </div>
        <div>
          <dt className={v2Type.label}>Assets to prepare</dt>
          <dd className={`${v2Type.body} mt-0.5`}>
            2–3 key data points, a founder quote, and a relevant anonymized customer example.
          </dd>
        </div>
      </dl>

      {opportunity.canUpdateStatus ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className={v2Type.label}>Outreach status</span>
          {statusOptions.map((option) => (
            <button
              className="rounded-full"
              disabled={updatingStatus || option === opportunity.status}
              key={option}
              onClick={() => actions?.updateStatus(opportunity.id, option)}
              type="button"
            >
              <Chip
                className={option === opportunity.status ? "ring-2 ring-[var(--v2-brand)]" : ""}
                tone={statusTone(option)}
              >
                {option}
              </Chip>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <Button
          disabled={creating}
          onClick={() => actions?.createTask(opportunity.id)}
          type="button"
        >
          {creating ? "Creating…" : "Create outreach task"}
        </Button>
        <span className={v2Type.meta}>Starts as Not started - nothing is sent automatically.</span>
      </div>
    </Panel>
  );
}

function QualificationRail({ data, actions }: { data: Board40Data; actions?: Board40Actions }) {
  const checks = [
    "Relevant to our target buyers",
    "Addresses an observed citation gap",
    "Editorially credible and audience-aligned",
    "Realistic to earn with evidence we can provide",
    "Passes quality and spam filters",
  ];
  const exclusions = [
    "Low-quality or spammy sites",
    "Link farms and paid placement sites",
    "Irrelevant directories",
    "Sites with no real audience or engagement",
    "Auto-generated content",
  ];

  return (
    <aside className="min-w-0" aria-label="Opportunity qualification">
      <h2 className={v2Type.sectionTitle}>How opportunities are qualified</h2>
      <ul className="mt-3 space-y-2">
        {checks.map((check) => (
          <li className="flex items-start gap-2" key={check}>
            <V2Icon className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" name="check" size={14} />
            <span className={v2Type.body}>{check}</span>
          </li>
        ))}
      </ul>

      <h2 className={`${v2Type.sectionTitle} mt-6 border-t border-[var(--v2-line)] pt-5`}>
        Sources we exclude
      </h2>
      <ul className="mt-3 space-y-2">
        {exclusions.map((exclusion) => (
          <li className="flex items-start gap-2" key={exclusion}>
            <V2Icon className="mt-0.5 shrink-0 text-[color:var(--v2-ink3)]" name="warn" size={14} />
            <span className={v2Type.body}>{exclusion}</span>
          </li>
        ))}
      </ul>

      <h2 className={`${v2Type.sectionTitle} mt-6 border-t border-[var(--v2-line)] pt-5`}>
        Outreach status
      </h2>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={v2Type.body}>Not started</span>
          <span className={v2Type.num}>{data.outreachCounts.notStarted}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={v2Type.body}>In progress</span>
          <span className={v2Type.num}>{data.outreachCounts.inProgress}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={v2Type.body}>Completed</span>
          <span className={v2Type.num}>{data.outreachCounts.completed}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={v2Type.body}>Not a fit</span>
          <span className={v2Type.num}>{data.outreachCounts.notFit}</span>
        </div>
      </div>

      <h2 className={`${v2Type.sectionTitle} mt-6 border-t border-[var(--v2-line)] pt-5`}>
        Next review
      </h2>
      <p className={`${v2Type.body} mt-1`}>
        Opportunities refresh from the latest listicle, community, mention and citation data every
        time this page loads.
      </p>
      <Button
        className="mt-3"
        onClick={() => actions?.refresh()}
        size="sm"
        variant="outline"
        type="button"
      >
        Refresh now
      </Button>
    </aside>
  );
}

export function Board40Screen({
  data,
  actions,
}: V2ScreenProps<Board40Data> & { actions?: Board40Actions }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [selectedId, setSelectedId] = useState<string | null>(data.opportunities[0]?.id ?? null);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? data.opportunities
        : data.opportunities.filter((item) => item.sourceType === filter),
    [data.opportunities, filter],
  );

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];

  const columns: readonly DataColumn<Board40Opportunity>[] = [
    {
      key: "sourceName",
      header: "Source",
      render: (row) => (
        <div className="min-w-0">
          <p className={v2Type.bodyStrong}>{row.sourceName}</p>
          <p className={v2Type.meta}>{row.sourceTypeLabel}</p>
        </div>
      ),
    },
    {
      key: "topicMatch",
      header: "Topic match",
      wrap: false,
      render: (row) => <Chip tone={levelTone(row.topicMatch)}>{row.topicMatch}</Chip>,
    },
    {
      key: "affectedQuestionCount",
      header: "Questions affected",
      numeric: true,
      wrap: false,
    },
    {
      key: "relationship",
      header: "Relationship",
      wrap: false,
    },
    {
      key: "evidenceType",
      header: "Evidence",
      wrap: false,
    },
    {
      key: "effort",
      header: "Effort",
      wrap: false,
    },
    {
      key: "confidence",
      header: "Confidence",
      wrap: false,
      render: (row) => <Chip tone={levelTone(row.confidence)}>{row.confidence}</Chip>,
    },
    {
      key: "status",
      header: "Status",
      wrap: false,
      render: (row) => <Chip tone={statusTone(row.status)}>{row.status}</Chip>,
    },
  ];

  return (
    <div
      className="min-h-full text-[14px] leading-[1.5] text-[color:var(--v2-ink)]"
      data-testid="board40-screen"
    >
      <TwoColumn
        className="min-h-full gap-0"
        main={
          <div className="min-w-0 px-6 py-7">
            <PageHeader
              title="Earn evidence from relevant sources"
              sub="Opportunities discovered from observed citation gaps, community activity and existing mentions."
            />
            <div className="mt-5 flex flex-wrap gap-2">
              {(Object.keys(filterLabels) as FilterValue[]).map((value) => {
                const count = value === "all" ? data.counts.all : data.counts[value];
                return (
                  <button key={value} onClick={() => setFilter(value)} type="button">
                    <Chip tone={filter === value ? "brand" : "outline"}>
                      {filterLabels[value]} {count}
                    </Chip>
                  </button>
                );
              })}
            </div>

            <DataTable
              className="mt-5"
              columns={columns}
              emptyMessage="No evidence-backed opportunities exist yet. They appear once listicles, community posts, mentions or AI citations are tracked."
              onRowClick={(row) => setSelectedId(row.id)}
              rowKey={(row) => row.id}
              rows={filtered}
            />

            <DetailPanel actions={actions} opportunity={selected} />
          </div>
        }
        rightRail={
          <div className="border-t border-[var(--v2-line)] px-7 py-7 md:border-t-0 md:border-l">
            <QualificationRail actions={actions} data={data} />
          </div>
        }
        rightRailWidth={390}
      />
    </div>
  );
}
