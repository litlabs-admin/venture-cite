import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { ExternalLink } from "@/v2/shared/ui/ExternalLink";
import { KeyValueList } from "@/v2/shared/ui/KeyValueList";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TextArea } from "@/v2/shared/ui/TextArea";
import { TextField } from "@/v2/shared/ui/TextField";
import {
  BrandProgressRail,
  NotMeasured,
  ReviewFormPanel,
  ReviewLayout,
  ReviewPeriodHeader,
  ReviewSummaryCards,
  type ReviewMetric,
  type ReviewProgressData,
} from "../b10-results-review/shared/ReviewTemplate";

export type Board21ReferralRow = {
  date: string;
  source: string;
  query: string;
  referrerUrl: string;
  sessions: number;
};

export type Board21Data = {
  context: { brandId: string; mode: "guided" | "expert" };
  brand: { name: string };
  reviewDate: ReviewMetric<string>;
  completedChange: {
    title: ReviewMetric<string>;
    date: ReviewMetric<string>;
    summary: ReviewMetric<string>;
  };
  observationWindow: {
    start: ReviewMetric<string>;
    end: ReviewMetric<string>;
    days: ReviewMetric<number>;
  };
  visibility: {
    mentions: ReviewMetric<number>;
    denominator: ReviewMetric<number>;
  };
  referralRows: ReviewMetric<readonly Board21ReferralRow[]>;
  verifiedReferralSourceCount: ReviewMetric<number>;
  qualifiedInquiries: ReviewMetric<number>;
  demoRequests: ReviewMetric<number>;
  attributedReferralUrls: ReviewMetric<readonly string[]>;
  crmOpportunityIds: string;
  outcomeNotes: string;
  crmConnections: {
    hubspot: "not-connected" | "connected";
    salesforce: "not-connected" | "connected";
  };
  evidenceStrength: ReviewMetric<"Moderate" | "Strong" | "Weak">;
  unconfirmedInquiries: ReviewMetric<number>;
  confirmedDemoRequests: ReviewMetric<number>;
  crmOpportunityCount: ReviewMetric<number> | { kind: "not-connected" };
  progress: ReviewProgressData;
  awardPoints: ReviewMetric<number>;
};

type OutcomeCount = ReviewMetric<number>;

function metric<T>(value: ReviewMetric<T>, format: (entry: T) => ReactNode = String): ReactNode {
  return value.kind === "measured" ? format(value.value) : <NotMeasured />;
}

function formatReviewDate(value: string): string {
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function formatReviewMonthDay(value: string): string {
  const iso = value.length === 10 ? `${value}T00:00:00Z` : value;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()]}`;
}

function formatRange(start: ReviewMetric<string>, end: ReviewMetric<string>): ReactNode {
  if (start.kind === "measured" && end.kind === "measured") {
    return `${formatReviewMonthDay(start.value)} – ${formatReviewDate(end.value)}`;
  }
  return <NotMeasured />;
}

function FieldLabel({ label, state }: { label: string; state?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      {state ? <StateLabel state="not-measured" /> : null}
    </span>
  );
}

function ApplicationVerifiedData({ data }: { data: Board21Data }) {
  const columns: readonly DataColumn<Board21ReferralRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (row) => formatReviewDate(row.date),
      wrap: false,
    },
    {
      key: "source",
      header: "Source / query",
      render: (row) => (
        <span className="block min-w-[130px]">
          <span className={v2Type.bodyStrong}>{row.source}</span>
          <span className={cn(v2Type.meta, "block")}>“{row.query}”</span>
        </span>
      ),
    },
    {
      key: "referrerUrl",
      header: "Referrer URL",
      render: (row) => <ExternalLink href={row.referrerUrl}>{row.referrerUrl}</ExternalLink>,
      wrap: false,
    },
    { key: "sessions", header: "Sessions", numeric: true, wrap: false },
  ];

  return (
    <Panel className="mt-4 px-5 py-4">
      <PanelHeader
        title="Application-verified data"
        info="Data from tracked links and analytics shows activity, not causation."
      />
      <p className={cn(v2Type.meta, "-mt-2 mb-3")}>
        Data we can verify from tracked links and analytics. This shows activity, not causation.
      </p>
      {data.referralRows.kind === "measured" ? (
        <DataTable
          columns={columns}
          rows={data.referralRows.value}
          emptyMessage="No verified referral activity in this window."
        />
      ) : (
        <div className="border-t border-[var(--v2-line)] pt-4">
          <NotMeasured />
          <p className={cn(v2Type.meta, "mt-1")}>
            Referral sessions are not measured until tracked-link ingestion is available.
          </p>
        </div>
      )}
      <div className="mt-3 border-t border-[var(--v2-line)] pt-3">
        <p className={v2Type.bodyStrong}>
          {metric(
            data.verifiedReferralSourceCount,
            (count) => `${count} verified referral sessions`,
          )}
        </p>
        <p className={cn(v2Type.meta, "mt-0.5")}>
          Sessions in this observation window from tracked links.
        </p>
      </div>
    </Panel>
  );
}

function OutcomeForm({ data, staleAsOf }: { data: Board21Data; staleAsOf?: string }) {
  const [qualifiedInquiries, setQualifiedInquiries] = useState(
    data.qualifiedInquiries.kind === "measured" ? String(data.qualifiedInquiries.value) : "",
  );
  const [demoRequests, setDemoRequests] = useState(
    data.demoRequests.kind === "measured" ? String(data.demoRequests.value) : "",
  );
  const [urls, setUrls] = useState(
    data.attributedReferralUrls.kind === "measured"
      ? data.attributedReferralUrls.value.join("\n")
      : "",
  );
  const [opportunities, setOpportunities] = useState(data.crmOpportunityIds);
  const [notes, setNotes] = useState(data.outcomeNotes);
  const [saved, setSaved] = useState(false);

  return (
    <ReviewFormPanel
      title="Your confirmed outcomes"
      description="Tell us what happened. Be accurate — you’ll earn work points for a truthful review."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            id="board21-qualified-inquiries"
            inputMode="numeric"
            label={
              <FieldLabel
                label="Qualified inquiries"
                state={data.qualifiedInquiries.kind === "not-measured"}
              />
            }
            onChange={(event) => {
              setQualifiedInquiries(event.target.value);
              setSaved(false);
            }}
            type="number"
            value={qualifiedInquiries}
          />
          <TextField
            id="board21-demo-requests"
            inputMode="numeric"
            label={
              <FieldLabel label="Demo requests" state={data.demoRequests.kind === "not-measured"} />
            }
            onChange={(event) => {
              setDemoRequests(event.target.value);
              setSaved(false);
            }}
            type="number"
            value={demoRequests}
          />
          <TextArea
            className="min-h-[70px]"
            id="board21-referral-urls"
            label={
              <FieldLabel
                label="Attributed referral URLs"
                state={data.attributedReferralUrls.kind === "not-measured"}
              />
            }
            onChange={(event) => {
              setUrls(event.target.value);
              setSaved(false);
            }}
            rows={2}
            value={urls}
          />
          <TextArea
            className="min-h-[70px]"
            id="board21-crm-opportunity-ids"
            label="CRM opportunity IDs"
            onChange={(event) => {
              setOpportunities(event.target.value);
              setSaved(false);
            }}
            placeholder="e.g. OPP-12345, OPP-67890"
            rows={2}
            value={opportunities}
          />
        </div>
        <TextArea
          className="mt-3 min-h-[62px]"
          id="board21-outcome-notes"
          label="Notes (optional)"
          onChange={(event) => {
            setNotes(event.target.value);
            setSaved(false);
          }}
          rows={2}
          value={notes}
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button
            className={cn(v2Type.bodyStrong, "h-10 rounded-lg px-4")}
            disabled={staleAsOf !== undefined || data.awardPoints.kind !== "measured"}
            type="submit"
          >
            Save outcome review
          </Button>
          <span className={v2Type.meta}>
            <strong className="font-semibold text-[color:var(--v2-brand)]">
              {metric(data.awardPoints, (points) => `${points} work points`)}
            </strong>{" "}
            · Once per review period
          </span>
        </div>
        {staleAsOf ? (
          <p className={cn(v2Type.meta, "mt-3 text-[color:var(--v2-warn)]")} role="status">
            Stale data. This review cannot award points until it refreshes.
          </p>
        ) : null}
        {saved ? (
          <p className={cn(v2Type.meta, "mt-3 text-[color:var(--v2-ok)]")} role="status">
            Your outcome review is recorded for this period.
          </p>
        ) : null}
      </form>
    </ReviewFormPanel>
  );
}

function displayOutcomeCount(value: OutcomeCount | { kind: "not-connected" }): ReactNode {
  if (value.kind === "not-connected") return "—";
  return metric(value);
}

function EvidenceStrength({ data }: { data: Board21Data }) {
  const items = [
    { label: "Verified referral sessions", value: data.verifiedReferralSourceCount },
    { label: "Unconfirmed inquiries", value: data.unconfirmedInquiries },
    { label: "Confirmed demo requests", value: data.confirmedDemoRequests },
  ];
  return (
    <Panel className="mt-3 px-4 py-3.5">
      <PanelHeader
        title="Evidence strength"
        info="Strength reflects verification coverage, not causal certainty."
      />
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-[var(--v2-warn-soft)]" />
        <span className={v2Type.bodyStrong}>{metric(data.evidenceStrength)}</span>
      </div>
      <p className={cn(v2Type.meta, "mb-2")}>
        {data.verifiedReferralSourceCount.kind === "measured"
          ? `Verified sessions from ${data.verifiedReferralSourceCount.value} sources. No CRM connection yet, so full outcomes can’t be confirmed.`
          : "Referral sessions are not measured yet. No CRM connection is available to confirm full outcomes."}
      </p>
      <KeyValueList
        items={[
          ...items.map((item) => ({ label: item.label, value: metric(item.value) })),
          { label: "CRM opportunities", value: displayOutcomeCount(data.crmOpportunityCount) },
        ]}
      />
    </Panel>
  );
}

function AttributionLimits({ data }: { data: Board21Data }) {
  return (
    <Panel className="mt-3 px-4 py-3.5">
      <PanelHeader
        title="Attribution limits"
        info="Visibility evidence does not prove causation."
      />
      <p className={cn(v2Type.body, "flex items-start gap-2")}>
        <V2Icon name="warn" size={15} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
        <span>
          Visibility can influence discovery and consideration, but it doesn’t prove causation.
          Other marketing activity may also contribute to these results.
        </span>
      </p>
      <Link
        className={cn(
          v2Type.bodyStrong,
          "mt-3 inline-flex items-center gap-1.5 hover:text-[color:var(--v2-brand-fill)]",
        )}
        search={{ brandId: data.context.brandId, mode: data.context.mode }}
        to="/v2/visibility"
      >
        Learn about attribution limits
        <V2Icon name="arrow" size={14} />
      </Link>
    </Panel>
  );
}

function ConnectionOptions({ data }: { data: Board21Data }) {
  const [hubspot, setHubspot] = useState(data.crmConnections.hubspot);
  const [salesforce, setSalesforce] = useState(data.crmConnections.salesforce);
  const connect = (provider: "hubspot" | "salesforce") => {
    if (provider === "hubspot") setHubspot("connected");
    else setSalesforce("connected");
  };
  return (
    <Panel className="mt-3 px-4 py-3.5">
      <PanelHeader
        title="Connection options"
        info="Connections can verify opportunity and revenue records."
      />
      <div className="divide-y divide-[var(--v2-line)]">
        <div className="flex items-center gap-2.5 py-2 first:pt-0">
          <span
            className={cn(
              v2Type.caps,
              "grid h-7 w-7 shrink-0 place-items-center rounded-md normal-case text-[color:var(--v2-warn)]",
            )}
          >
            Hb
          </span>
          <div className="min-w-0 flex-1">
            <p className={v2Type.bodyStrong}>Connect HubSpot</p>
            <p className={v2Type.meta}>Automatically verify opportunities and revenue.</p>
          </div>
          <Button
            className={cn(v2Type.bodyStrong, "h-10 rounded-lg px-3")}
            onClick={() => connect("hubspot")}
            type="button"
            variant="outline"
          >
            {hubspot === "connected" ? "Connected" : "Connect"}
          </Button>
        </div>
        <div className="flex items-center gap-2.5 py-2 last:pb-0">
          <span
            className={cn(
              v2Type.caps,
              "grid h-7 w-7 shrink-0 place-items-center rounded-md normal-case text-[color:var(--v2-brand)]",
            )}
          >
            Sf
          </span>
          <div className="min-w-0 flex-1">
            <p className={v2Type.bodyStrong}>Connect Salesforce</p>
            <p className={v2Type.meta}>Verify opportunities and closed won revenue.</p>
          </div>
          <Button
            className={cn(v2Type.bodyStrong, "h-10 rounded-lg px-3")}
            onClick={() => connect("salesforce")}
            type="button"
            variant="outline"
          >
            {salesforce === "connected" ? "Connected" : "Connect"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function WorkPoints({ data }: { data: Board21Data }) {
  return (
    <Panel className="mt-3 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className={v2Type.sectionTitle}>Work points</h2>
        <span className={cn(v2Type.num, "font-semibold text-[color:var(--v2-brand)]")}>
          {metric(data.awardPoints, (points) => `+${points}`)}
        </span>
      </div>
      <p className={cn(v2Type.meta, "mt-1")}>
        You’ll earn {metric(data.awardPoints)} work points for completing a truthful outcome review,
        regardless of the results.
      </p>
    </Panel>
  );
}

export function Board21Screen({ data, staleAsOf }: V2ScreenProps<Board21Data>) {
  const reviewDate =
    data.reviewDate.kind === "measured" ? formatReviewDate(data.reviewDate.value) : <NotMeasured />;
  const completedChange = data.completedChange;
  const visibility =
    data.visibility.mentions.kind === "measured" &&
    data.visibility.denominator.kind === "measured" ? (
      `${data.visibility.mentions.value} / ${data.visibility.denominator.value} mentions`
    ) : (
      <>
        {metric(data.visibility.mentions)} / {metric(data.visibility.denominator)} mentions
      </>
    );

  return (
    <div data-testid="v2-board21-screen">
      <ReviewLayout
        main={
          <div>
            <ReviewPeriodHeader
              title="Connect visibility work to business results"
              start={reviewDate}
            />
            <ReviewSummaryCards
              align="start"
              cards={[
                {
                  icon: "check",
                  label: "Completed change",
                  value: (
                    <>
                      {metric(completedChange.title)}
                      {completedChange.date.kind === "measured" ? (
                        <span className={cn(v2Type.meta, "block")}>
                          {formatReviewDate(completedChange.date.value)}
                        </span>
                      ) : (
                        <span className="block">
                          <NotMeasured />
                        </span>
                      )}
                    </>
                  ),
                  caption: metric(completedChange.summary),
                },
                {
                  icon: "chart",
                  label: "Observation window",
                  value: (
                    <>
                      {formatRange(data.observationWindow.start, data.observationWindow.end)}
                      <span className={cn(v2Type.meta, "block")}>
                        {metric(data.observationWindow.days, (days) => `${days} days`)}
                      </span>
                    </>
                  ),
                  caption: "We’ll look for visibility and business activity in this period.",
                },
                {
                  icon: "eye",
                  label: "Visibility evidence",
                  value: visibility,
                  caption: "Observed during window. Mentions of your brand across LLMs and search.",
                },
              ]}
              iconSize="small"
            />
            <ApplicationVerifiedData data={data} />
            <OutcomeForm data={data} staleAsOf={staleAsOf} />
          </div>
        }
        rail={
          <div>
            <BrandProgressRail contained progress={data.progress} />
            <EvidenceStrength data={data} />
            <AttributionLimits data={data} />
            <ConnectionOptions data={data} />
            <WorkPoints data={data} />
          </div>
        }
      />
    </div>
  );
}
