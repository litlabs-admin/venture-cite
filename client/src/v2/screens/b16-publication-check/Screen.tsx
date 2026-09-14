import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DiffHighlight } from "@/v2/shared/ui/DiffHighlight";
import { Panel } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TextField } from "@/v2/shared/ui/TextField";
import { v2FocusRing } from "@/v2/shared/ui/shared";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";
import "./styles.css";

export type Board16Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stale"; value: T; asOf: string };

export type Board16CheckResult = "Verified" | "Mismatch";

export type Board16Data = {
  publication: {
    url: Board16Value<string>;
    expectedCanonicalUrl: Board16Value<string>;
    fetchedAt: Board16Value<string>;
    fetchState: Board16Value<string>;
    nextObservationAt: Board16Value<string>;
    rewardPoints: Board16Value<number>;
  };
  revision: {
    approvedAt: Board16Value<string>;
    heading: Board16Value<string>;
    content: Board16Value<string>;
  };
  livePage: {
    heading: Board16Value<string>;
    content: Board16Value<string>;
  };
  checks: {
    urlStatusCode: Board16Value<number>;
    urlReachable: Board16Value<Board16CheckResult>;
    changedText: Board16Value<Board16CheckResult>;
    approvedFacts: Board16Value<Board16CheckResult>;
    canonical: Board16Value<Board16CheckResult>;
    indexability: Board16Value<Board16CheckResult>;
  };
  task: {
    buyerNeed: Board16Value<string>;
    evidence: Board16Value<string>;
  };
};

type PublicationStep = {
  label: string;
  status: "completed" | "active";
  number: number;
  caption: string;
};

const STEPS: readonly PublicationStep[] = [
  { label: "Review brief", status: "completed", number: 1, caption: "Completed" },
  { label: "Edit page", status: "completed", number: 2, caption: "Completed" },
  { label: "Verify publication", status: "active", number: 3, caption: "Active" },
];

const REQUIREMENTS = [
  "Changed text is present",
  "Approved facts are preserved",
  "Canonical URL is correct",
  "Page is indexable (no noindex and not blocked)",
] as const;

function WarningTriangle({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 3L22 20H2z" />
      <path d="M12 9v5M12 17.2v.1" />
    </svg>
  );
}

function CheckMark({ size = 15, strokeWidth = 2.4 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M6.5 12.5l3.4 3.4 7.6-8" />
    </svg>
  );
}

function RewardIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="29"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 32 32"
      width="29"
    >
      <path d="M16 2.7l11.5 6.7v13.2L16 29.3 4.5 22.6V9.4z" />
      <path d="M16 9.2l2 4.1 4.5.7-3.3 3.2.8 4.5-4-2.1-4 2.1.8-4.5-3.3-3.2 4.5-.7z" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

function MeasuredState({ value }: { value: Board16Value<unknown> }) {
  switch (value.kind) {
    case "measured":
      return null;
    case "not-measured":
      return <StateLabel state="not-measured" />;
    case "failed":
      return <StateLabel state="failed" />;
    case "stale":
      return <StateLabel state="stale" />;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function ScalarValue<T>({
  value,
  format = String,
  className,
}: {
  value: Board16Value<T>;
  format?: (value: T) => string;
  className?: string;
}) {
  switch (value.kind) {
    case "measured":
      return <span className={className}>{format(value.value)}</span>;
    case "stale":
      return (
        <span
          className={cn("inline-flex items-center gap-2", className)}
          title={`As of ${value.asOf}`}
        >
          <StateLabel state="stale" />
          <span>{format(value.value)}</span>
        </span>
      );
    case "not-measured":
    case "failed":
      return <MeasuredState value={value} />;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatDateTime(value: string, includeTimeZone = false): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    month: "short",
    ...(includeTimeZone ? { timeZoneName: "short" as const } : {}),
    timeZone: "America/Los_Angeles",
    year: "numeric",
  }).format(new Date(value));
  return includeTimeZone ? formatted.replace(/, (?=\d{1,2}:)/, " at ") : formatted;
}

function formatFetchedAt(value: Board16Value<string>): ReactNode {
  return (
    <ScalarValue
      className={v2Type.meta}
      format={(date) => `Last checked: ${formatDateTime(date, true)}`}
      value={value}
    />
  );
}

function formatResultAt(value: Board16Value<string>): ReactNode {
  return <ScalarValue className={v2Type.meta} format={formatDateTime} value={value} />;
}

function inputValue(value: Board16Value<string>): string {
  switch (value.kind) {
    case "measured":
    case "stale":
      return value.value;
    case "not-measured":
    case "failed":
      return "";
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function renderPageContent(value: Board16Value<string>, live: boolean): ReactNode {
  if (value.kind !== "measured" && value.kind !== "stale") {
    return <MeasuredState value={value} />;
  }
  const changedText = "startup storytelling.";
  const changedIndex = live ? value.value.indexOf(changedText) : -1;
  if (changedIndex < 0) return value.value;
  return (
    <>
      {value.value.slice(0, changedIndex)}
      <DiffHighlight>{changedText}</DiffHighlight>
      {value.value.slice(changedIndex + changedText.length)}
    </>
  );
}

function PublicationSteps() {
  return (
    <ol aria-label="Publication steps" className="board16-steps">
      {STEPS.map((step, index) => (
        <li className="board16-step-item" key={step.label}>
          {index > 0 ? <span aria-hidden="true" className="board16-step-connector" /> : null}
          <div className={cn("board16-step", step.status === "active" && "is-active")}>
            <span className="board16-step-node">
              {step.status === "completed" ? (
                <CheckMark size={13} strokeWidth={2.6} />
              ) : (
                step.number
              )}
            </span>
            <span className="board16-step-copy">
              <span className={cn(v2Type.bodyStrong, "board16-step-label")}>{step.label}</span>
              <span
                className={cn(
                  v2Type.meta,
                  "board16-step-caption",
                  step.status === "active" && "is-active",
                )}
              >
                {step.caption}
              </span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function FetchState({ data }: { data: Board16Data }) {
  if (data.publication.fetchState.kind !== "measured") {
    return (
      <div className="board16-fetch-state board16-fetch-state-unavailable">
        <MeasuredState value={data.publication.fetchState} />
        {formatFetchedAt(data.publication.fetchedAt)}
      </div>
    );
  }
  return (
    <div className="board16-fetch-state">
      <span className="board16-ok-mark">
        <CheckMark size={12} strokeWidth={2.5} />
      </span>
      <span className="board16-fetch-copy">
        <span className={cn(v2Type.body, "board16-ok-text")}>
          {data.publication.fetchState.value}
        </span>
        {formatFetchedAt(data.publication.fetchedAt)}
      </span>
    </div>
  );
}

function CheckStatus({ value }: { value: Board16Value<Board16CheckResult> }) {
  switch (value.kind) {
    case "measured":
      return value.value === "Mismatch" ? (
        <span className="board16-mismatch-status">
          <WarningTriangle size={21} />
          <span className={cn(v2Type.bodyStrong, "board16-warn-text")}>Mismatch</span>
        </span>
      ) : (
        <span className={cn(v2Type.bodyStrong, "board16-verified-status")}>Verified</span>
      );
    case "stale":
      return <StateLabel state="stale" />;
    case "not-measured":
      return <StateLabel state="not-measured" />;
    case "failed":
      return <StateLabel state="failed" />;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function CheckRow({
  name,
  description,
  status,
  detail,
  timestamp = true,
  fetchedAt,
  first,
}: {
  name: string;
  description: ReactNode;
  status: Board16Value<Board16CheckResult>;
  detail?: ReactNode;
  timestamp?: boolean;
  fetchedAt: Board16Value<string>;
  first?: boolean;
}) {
  const isMismatch = status.kind === "measured" && status.value === "Mismatch";
  return (
    <div className={cn("board16-check-row", first && "is-first")}>
      <span className={cn("board16-check-icon", isMismatch && "is-warning")}>
        {isMismatch ? <WarningTriangle size={28} /> : <CheckMark size={15} strokeWidth={2.4} />}
      </span>
      <span className="board16-check-copy">
        <span className={cn(v2Type.bodyStrong, "board16-check-name")}>{name}</span>
        <span className={cn(v2Type.meta, "board16-check-description")}>{description}</span>
      </span>
      <span className="board16-check-result">
        <CheckStatus value={status} />
        {detail ? <span className={cn(v2Type.meta, "board16-check-detail")}>{detail}</span> : null}
        {timestamp && !isMismatch ? formatResultAt(fetchedAt) : null}
      </span>
    </div>
  );
}

function Requirement({ children }: { children: ReactNode }) {
  return (
    <li className="board16-requirement">
      <V2Icon name="check" size={17} />
      <span className={v2Type.body}>{children}</span>
    </li>
  );
}

function Board16Main({ data }: { data: Board16Data }) {
  const [url, setUrl] = useState(inputValue(data.publication.url));
  const statusCodeDescription =
    data.checks.urlStatusCode.kind === "measured" ? (
      `The page returned a ${data.checks.urlStatusCode.value} status code.`
    ) : (
      <>
        The page status code is <MeasuredState value={data.checks.urlStatusCode} />.
      </>
    );
  return (
    <main className="board16-main" data-v2-region="main">
      <h1 className={cn(v2Type.pageTitle, "board16-title")}>Verify the published change</h1>
      <PublicationSteps />

      <Panel className="board16-workspace" padding="none">
        <div className="board16-url-box">
          <div className="board16-url-line">
            <TextField
              aria-label="Published URL"
              className="board16-url-input"
              id="board16-published-url"
              label="Published URL"
              onChange={(event) => setUrl(event.target.value)}
              readOnly={data.publication.url.kind !== "measured"}
              value={url}
            />
            <Button className="board16-fetch-button rounded-lg" type="button" variant="outline">
              <span className={v2Type.bodyStrong}>Fetch latest</span>
            </Button>
          </div>
          <FetchState data={data} />
        </div>

        <div className="board16-divider" />
        <section className="board16-comparison">
          <h2 className={cn(v2Type.sectionTitle, "board16-section-title")}>Page comparison</h2>
          <div className="board16-comparison-grid">
            <div className="board16-comparison-column">
              <div className="board16-comparison-head">
                <span className={cn(v2Type.bodyStrong, "board16-comparison-label")}>
                  Approved revision <span className={v2Type.meta}>(from edit page)</span>
                </span>
                <ScalarValue
                  className={v2Type.meta}
                  format={formatDateOnly}
                  value={data.revision.approvedAt}
                />
              </div>
              <div className="board16-page-heading">
                <span className={cn(v2Type.mono, "board16-h2-tag")}>H2</span>
                <span className={cn(v2Type.bodyStrong, "board16-page-heading-text")}>
                  <ScalarValue value={data.revision.heading} />
                </span>
              </div>
              <p className={cn(v2Type.body, "board16-page-copy")}>
                {renderPageContent(data.revision.content, false)}
              </p>
              <a
                className={cn(v2Type.meta, "board16-view-link", v2FocusRing)}
                href={inputValue(data.publication.url)}
                rel="noreferrer"
                target="_blank"
              >
                View full page content
              </a>
            </div>
            <div className="board16-comparison-column">
              <div className="board16-comparison-head">
                <span className={cn(v2Type.bodyStrong, "board16-comparison-label")}>
                  Live page <span className={v2Type.meta}>(published)</span>
                </span>
                <ScalarValue
                  className={v2Type.meta}
                  format={formatDateTime}
                  value={data.publication.fetchedAt}
                />
              </div>
              <div className="board16-page-heading">
                <span className={cn(v2Type.mono, "board16-h2-tag")}>H2</span>
                <span className={cn(v2Type.bodyStrong, "board16-page-heading-text")}>
                  <ScalarValue value={data.livePage.heading} />
                </span>
              </div>
              <p className={cn(v2Type.body, "board16-page-copy")}>
                {renderPageContent(data.livePage.content, true)}
              </p>
              <a
                className={cn(v2Type.meta, "board16-view-link", v2FocusRing)}
                href={inputValue(data.publication.url)}
                rel="noreferrer"
                target="_blank"
              >
                View full page content
              </a>
            </div>
          </div>
        </section>

        <div className="board16-divider" />
        <section className="board16-checks">
          <h2 className={cn(v2Type.sectionTitle, "board16-section-title")}>Verification checks</h2>
          <CheckRow
            description={statusCodeDescription}
            fetchedAt={data.publication.fetchedAt}
            first
            name="URL reachable"
            status={data.checks.urlReachable}
          />
          <CheckRow
            description="Content changes match the approved revision."
            fetchedAt={data.publication.fetchedAt}
            name="Changed text detected"
            status={data.checks.changedText}
          />
          <CheckRow
            description="No approved brand facts were removed or contradicted."
            fetchedAt={data.publication.fetchedAt}
            name="Approved facts preserved"
            status={data.checks.approvedFacts}
          />
          <CheckRow
            description="Canonical URL differs from expected."
            detail={
              <>
                <span>
                  Found:{" "}
                  {inputValue(data.publication.url) || (
                    <MeasuredState value={data.publication.url} />
                  )}
                </span>
                <span>
                  Expected: <ScalarValue value={data.publication.expectedCanonicalUrl} />
                </span>
              </>
            }
            fetchedAt={data.publication.fetchedAt}
            name="Canonical URL"
            status={data.checks.canonical}
            timestamp={false}
          />
          <CheckRow
            description="Page is indexable (no noindex tag and not blocked)."
            fetchedAt={data.publication.fetchedAt}
            name="Indexability"
            status={data.checks.indexability}
          />
        </section>

        <div className="board16-legend">
          <span className="board16-legend-item">
            <span className="board16-legend-ok">
              <CheckMark size={10} strokeWidth={2.6} />
            </span>
            <span className={v2Type.meta}>Application verified (automatic check)</span>
          </span>
          <span className="board16-legend-item">
            <span className="board16-legend-warn">
              <WarningTriangle size={21} />
            </span>
            <span className={v2Type.meta}>User confirmation required</span>
          </span>
        </div>
      </Panel>
    </main>
  );
}

function Board16Aside({ data }: { data: Board16Data }) {
  const urlRequirement =
    data.checks.urlStatusCode.kind === "measured"
      ? `URL is reachable (${data.checks.urlStatusCode.value} status code)`
      : "URL is reachable (status code not measured)";
  return (
    <aside aria-label="Task brief" className="board16-aside" data-v2-region="aside">
      <Panel className="board16-brief" padding="none">
        <h2 className={cn(v2Type.sectionTitle, "board16-brief-title")}>Task brief</h2>
        <p className={cn(v2Type.body, "board16-brief-copy")}>
          <strong className={v2Type.bodyStrong}>Buyer need: </strong>
          <ScalarValue value={data.task.buyerNeed} />
        </p>
        <p className={cn(v2Type.body, "board16-brief-copy")}>
          <strong className={v2Type.bodyStrong}>Evidence: </strong>
          <ScalarValue value={data.task.evidence} />
        </p>

        <div className="board16-rail-rule" />
        <h2 className={cn(v2Type.sectionTitle, "board16-brief-title")}>
          Verification requirements
        </h2>
        <p className={cn(v2Type.body, "board16-brief-copy")}>
          Confirm that the published page matches the approved revision and is accessible to search
          engines.
        </p>
        <ul className="board16-requirements">
          <Requirement>{urlRequirement}</Requirement>
          {REQUIREMENTS.map((requirement) => (
            <Requirement key={requirement}>{requirement}</Requirement>
          ))}
        </ul>

        <div className="board16-rail-rule" />
        <h2 className={cn(v2Type.sectionTitle, "board16-brief-title board16-observation-title")}>
          Next observation date
        </h2>
        <div className="board16-observation">
          <V2Icon name="cal" size={20} />
          <span>
            <span className={cn(v2Type.bodyStrong, "board16-observation-date")}>
              <ScalarValue format={formatDateOnly} value={data.publication.nextObservationAt} />
            </span>
            <span className={cn(v2Type.meta, "board16-observation-copy")}>
              We&apos;ll remind you to re-check this page in 30 days.
            </span>
          </span>
        </div>

        <div className="board16-rail-rule" />
        <div className="board16-reward">
          <RewardIcon />
          <span>
            <span className={cn(v2Type.bodyStrong, "board16-reward-title")}>
              <ScalarValue
                format={(points) => `${points} work points after successful verification`}
                value={data.publication.rewardPoints}
              />
            </span>
            <span className={cn(v2Type.meta, "board16-reward-copy")}>
              Points are awarded only after you verify that the publication is correct.
            </span>
          </span>
        </div>
        <div className="board16-actions">
          <Button className="board16-action-button rounded-lg" type="button">
            <span className={v2Type.bodyStrong}>Verify publication</span>
          </Button>
          <Button
            asChild
            className="board16-action-button rounded-lg"
            type="button"
            variant="outline"
          >
            <a href={inputValue(data.publication.url)} rel="noreferrer" target="_blank">
              <span className={v2Type.bodyStrong}>Open published page</span>
              <ExternalLinkIcon />
            </a>
          </Button>
        </div>
      </Panel>
    </aside>
  );
}

function Board16Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="board16-breadcrumb">
      <span className={cn(v2Type.body, "board16-breadcrumb-current")}>My work</span>
      <span aria-hidden="true" className={cn(v2Type.meta, "board16-breadcrumb-separator")}>
        /
      </span>
      <span className={cn(v2Type.body, "board16-breadcrumb-leaf")}>Publication check</span>
    </nav>
  );
}

export function Board16Screen({ data, staleAsOf }: V2ScreenProps<Board16Data>) {
  return (
    <div className="board16-screen">
      <div className="board16-top" data-v2-region="top">
        <Board16Breadcrumb />
        <span className={v2Type.meta}>Prototype · Sample data</span>
      </div>
      {staleAsOf ? (
        <div className="board16-stale-banner" data-testid="b16-stale-banner">
          <StateLabel state="stale" />
          <span className={v2Type.meta}>
            Last known publication data is from {formatDateTime(staleAsOf)}.
          </span>
        </div>
      ) : null}
      <div className="board16-grid">
        <Board16Main data={data} />
        <Board16Aside data={data} />
      </div>
    </div>
  );
}
