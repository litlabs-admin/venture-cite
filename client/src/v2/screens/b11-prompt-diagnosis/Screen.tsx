import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { Panel } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { UnderlineTabs } from "@/v2/shared/ui/UnderlineTabs";
import type { V2ScreenProps } from "@/v2/contracts/screen";

export type Board11Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stale"; value: T; asOf: string };

export type Board11AnswerRecord = {
  model: string;
  status: "successful" | "failed";
  snippet: Board11Value<string>;
  note: Board11Value<string>;
  fullResponse: Board11Value<string>;
  sourceUrls: Board11Value<readonly string[]>;
  checkedAt: Board11Value<string>;
};

export type Board11ExperimentAction = { kind: "create" } | { kind: "open"; taskId: string };

export type Board11Data = {
  brandId: string;
  brandName: string;
  buyerQuestion: {
    text: string;
    state: Board11Value<string>;
    intent: Board11Value<string>;
  };
  answerObservation: {
    brandMentioned: Board11Value<boolean>;
    successfulCount: Board11Value<number>;
    successfulTotal: Board11Value<number>;
    failedCount: Board11Value<number>;
  };
  sourceCoverage: {
    retrieved: Board11Value<boolean>;
  };
  pageEvidence: {
    text: Board11Value<string>;
  };
  assessment: {
    state: Board11Value<string>;
  };
  source: {
    path: Board11Value<string>;
    excerpt: Board11Value<string>;
  };
  experiment: {
    title: Board11Value<string>;
    points: Board11Value<number>;
    timing: Board11Value<string>;
    action: Board11Value<Board11ExperimentAction>;
  };
  answerRecords: Board11AnswerRecord[];
  changeHistory: Board11Value<readonly string[]>;
};

type Board11Unavailable<T> = Exclude<Board11Value<T>, { kind: "measured" }>;

function StateValue<T>({ value }: { value: Board11Unavailable<T> }) {
  return (
    <span title={"reason" in value ? value.reason : value.asOf}>
      <StateLabel state={value.kind} />
    </span>
  );
}

function renderValue<T>(value: Board11Value<T>, renderMeasured: (item: T) => ReactNode) {
  if (value.kind === "measured") return renderMeasured(value.value);
  return <StateValue value={value} />;
}

function DiagnosticTabs({ brandId }: { brandId: string }) {
  const params = new URLSearchParams({ brandId, mode: "guided" }).toString();
  const tabs = [
    { label: "Site health", path: "/v2/diagnostics/site-health" },
    { label: "GEO signals", path: "/v2/diagnostics/geo-signals" },
    { label: "Perception", path: "/v2/diagnostics/perception" },
    { label: "Prompt diagnosis", path: "/v2/diagnostics/prompts", active: true },
  ];

  return (
    <nav
      aria-label="Diagnostics sections"
      className="mb-5 flex gap-6 border-b border-[var(--v2-line)]"
      role="tablist"
    >
      {tabs.map((tab) => (
        <a
          aria-selected={tab.active ?? false}
          className={`-mb-px border-b-2 pb-2.5 ${v2Type.body} font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)] ${
            tab.active
              ? "border-[var(--v2-brand)] text-[color:var(--v2-brand)]"
              : "border-transparent text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"
          }`}
          href={`${tab.path}?${params}`}
          key={tab.path}
          role="tab"
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

function ObservationRow({
  icon,
  label,
  children,
  testId,
}: {
  icon: "eye" | "globe" | "doc" | "scale";
  label: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="grid grid-cols-[38%_minmax(0,1fr)] items-center border-b border-[var(--v2-line)] px-4 py-[11px] last:border-b-0"
      data-testid={testId}
    >
      <span className={`flex min-w-0 items-center gap-2 ${v2Type.body} text-[color:var(--v2-ink)]`}>
        <V2Icon name={icon} size={16} className="shrink-0 text-[color:var(--v2-ink)]" />
        <span>{label}</span>
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

const PLATFORM_MARKS: Record<string, string> = {
  ChatGPT: "bg-[var(--v2-series-2)] text-[color:var(--v2-paper)]",
  Gemini: "bg-[var(--v2-series-4)] text-[color:var(--v2-paper)]",
  Claude: "bg-[var(--v2-series-3)] text-[color:var(--v2-ink)]",
  Perplexity: "bg-[var(--v2-series-1)] text-[color:var(--v2-paper)]",
};

function PlatformMark({ model }: { model: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[11px] font-semibold ${
        PLATFORM_MARKS[model] ?? "bg-[var(--v2-inset)] text-[color:var(--v2-ink2)]"
      }`}
    >
      {model.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ResultLabel({ status }: { status: Board11AnswerRecord["status"] }) {
  const failed = status === "failed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${v2Type.meta} ${
        failed ? "text-[color:var(--v2-bad)]" : "text-[color:var(--v2-ok)]"
      }`}
      data-answer-result={failed ? "failed" : "successful"}
    >
      <V2Icon name={failed ? "warn" : "check"} size={14} />
      {failed ? "Failed (excluded)" : "Successful"}
    </span>
  );
}

function AnswerText({ value }: { value: Board11Value<string> }) {
  return renderValue(value, (text) => <span>{text}</span>);
}

function AnswerRecords({ rows }: { rows: readonly Board11AnswerRecord[] }) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const selected = rows.find((row) => row.model === selectedModel);
  const columns: readonly DataColumn<Board11AnswerRecord>[] = [
    {
      key: "model",
      header: "Model",
      className: "w-[17%]",
      render: (row) => (
        <span className={`flex items-center gap-2 ${v2Type.body} text-[color:var(--v2-ink)]`}>
          <PlatformMark model={row.model} />
          <span>{row.model}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Result",
      className: "w-[19%]",
      render: (row) => <ResultLabel status={row.status} />,
    },
    {
      key: "snippet",
      header: "Answer snippet",
      className: "w-[38%]",
      render: (row) => (
        <span
          className={
            row.status === "failed" ? `${v2Type.body} text-[color:var(--v2-ink3)]` : v2Type.body
          }
        >
          <AnswerText value={row.snippet} />
        </span>
      ),
    },
    {
      key: "note",
      header: "Notes",
      render: (row) => (
        <span className={`${v2Type.body} text-[color:var(--v2-ink3)]`}>
          <AnswerText value={row.note} />
        </span>
      ),
    },
  ];

  return (
    <div data-testid="v2-board11-answer-records">
      <DataTable
        columns={columns}
        emptyMessage={<span className={v2Type.body}>No answer records are available.</span>}
        onRowClick={(row) => setSelectedModel(row.model)}
        rowKey={(row) => row.model}
        rows={rows}
      />
      {selected ? (
        <div
          className="mt-4 rounded-[var(--v2-radius-panel)] border border-[var(--v2-line)] bg-[var(--v2-inset)] px-4 py-3"
          data-testid="v2-board11-full-answer"
        >
          <p className={`${v2Type.label} uppercase tracking-[0.05em]`}>
            {selected.model} full answer
          </p>
          <p className={`${v2Type.body} mt-2 text-[color:var(--v2-ink2)]`}>
            {renderValue(selected.fullResponse, (text) => text)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Boundary({
  icon,
  title,
  children,
  testId,
}: {
  icon: "eye" | "q" | "clock";
  title: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex items-start gap-3" data-testid={testId}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]">
        <V2Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <p className={`${v2Type.bodyStrong} text-[color:var(--v2-ink)]`}>{title}</p>
        <p className={`${v2Type.body} mt-1 text-[color:var(--v2-ink2)]`}>{children}</p>
      </div>
    </div>
  );
}

function EvidenceRail({ data }: { data: Board11Data }) {
  const observation = data.answerObservation;
  const observed = (() => {
    if (observation.successfulCount.kind !== "measured")
      return "Answer observation is not measured";
    if (observation.successfulTotal.kind === "measured") {
      return `Brand absent in ${observation.successfulCount.value} of ${observation.successfulTotal.value} successful answers`;
    }
    if (
      observation.brandMentioned.kind === "measured" &&
      observation.brandMentioned.value === false
    ) {
      return `Brand absent in all ${observation.successfulCount.value} successful answers`;
    }
    return `Brand mentioned in ${observation.successfulCount.value} successful answers`;
  })();

  return (
    <aside className="min-w-0" data-testid="v2-board11-evidence-rail">
      <h2 className={`${v2Type.bodyStrong} text-[color:var(--v2-ink)]`}>Evidence boundaries</h2>
      <div className="mt-4 space-y-[18px]">
        <Boundary icon="eye" title="Observed" testId="v2-board11-boundary-observed">
          {observed}
        </Boundary>
        <Boundary icon="q" title="Unknown" testId="v2-board11-boundary-unknown">
          Why each model omitted the brand
        </Boundary>
        <Boundary icon="clock" title="Next check" testId="v2-board11-boundary-next">
          Repeat the same question set after the page change
        </Boundary>
      </div>
      <section
        aria-labelledby="v2-board11-boundary-title"
        className="mt-[22px] rounded-[var(--v2-radius-panel)] border border-[var(--v2-brand-soft)] bg-[var(--v2-brand-soft)] px-[18px] py-4"
        data-testid="v2-board11-no-fault"
      >
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--v2-ok-soft)] text-[color:var(--v2-brand)]">
          <V2Icon name="shield" size={18} />
        </span>
        <h3
          id="v2-board11-boundary-title"
          className={`${v2Type.bodyStrong} mt-[11px] text-[color:var(--v2-ink)]`}
        >
          No fault confirmed
        </h3>
        <p className={`${v2Type.body} mt-2 text-[color:var(--v2-ink)]`}>
          This task tests a content hypothesis.
        </p>
        <p className={`${v2Type.body} mt-2 text-[color:var(--v2-ink)]`}>
          We avoid blame and focus on useful experiments.
        </p>
      </section>
    </aside>
  );
}

function sourceUrlItems(rows: readonly Board11AnswerRecord[]) {
  return rows.flatMap((row) =>
    row.sourceUrls.kind === "measured"
      ? row.sourceUrls.value.map((url) => ({ model: row.model, url }))
      : [],
  );
}

export function Board11Screen({ data, staleAsOf }: V2ScreenProps<Board11Data>) {
  const [subTab, setSubTab] = useState("answers");
  const questionLabel =
    data.buyerQuestion.state.kind === "measured"
      ? data.buyerQuestion.state.value
      : "Buyer question";
  const intentLabel =
    data.buyerQuestion.intent.kind === "measured" ? data.buyerQuestion.intent.value : null;
  const sourceUrls = sourceUrlItems(data.answerRecords);

  return (
    <div className="v2-mono min-w-0 px-7 py-7" data-testid="v2-board11-screen">
      <TwoColumn
        main={
          <main className="min-w-0">
            <h1 className={v2Type.pageTitle}>Find the cause. Choose a useful fix.</h1>
            {staleAsOf ? (
              <p className={`${v2Type.meta} mt-2`} data-testid="v2-board11-stale">
                Stale · repeat the same question set. As of {staleAsOf}.
              </p>
            ) : null}
            <DiagnosticTabs brandId={data.brandId} />
            <section aria-labelledby="v2-board11-question-title">
              <h2 id="v2-board11-question-title" className={`${v2Type.cardTitle} text-[17px]`}>
                {data.buyerQuestion.text}
              </h2>
              <p className={`${v2Type.meta} mt-1`}>
                {questionLabel}
                {intentLabel ? ` · ${intentLabel}` : null}
              </p>
            </section>

            <Panel className="mt-4 overflow-hidden" padding="none">
              <ObservationRow icon="eye" label="Answer observation" testId="v2-board11-observation">
                {renderValue(data.answerObservation.brandMentioned, (mentioned) => (
                  <span className={`${v2Type.bodyStrong} text-[color:var(--v2-ink)]`}>
                    {mentioned ? "Brand mentioned" : "Brand omitted"}
                  </span>
                ))}
              </ObservationRow>
              <ObservationRow icon="globe" label="Source coverage" testId="v2-board11-coverage">
                {renderValue(data.sourceCoverage.retrieved, (retrieved) => (
                  <span className={`${v2Type.body} text-[color:var(--v2-ink)]`}>
                    {retrieved ? "Services page retrieved" : "Services page not retrieved"}
                  </span>
                ))}
              </ObservationRow>
              <ObservationRow icon="doc" label="Page evidence" testId="v2-board11-page-evidence">
                {renderValue(data.pageEvidence.text, (text) => (
                  <span className={`${v2Type.body} text-[color:var(--v2-ink)]`}>{text}</span>
                ))}
              </ObservationRow>
              <ObservationRow icon="scale" label="Assessment" testId="v2-board11-assessment">
                {renderValue(data.assessment.state, (text) => (
                  <span
                    className={`${v2Type.body} text-[color:var(--v2-ink2)]`}
                    data-testid="v2-board11-assessment-value"
                  >
                    {text}
                  </span>
                ))}
              </ObservationRow>
            </Panel>

            <div className="mt-5 grid gap-8 md:grid-cols-2">
              <section aria-labelledby="v2-board11-source-title">
                <h3 id="v2-board11-source-title" className={v2Type.caps}>
                  Source excerpt
                </h3>
                {data.source.path.kind === "measured" ? (
                  <p className={`${v2Type.meta} mt-3`}>
                    Page:{" "}
                    <a
                      className="text-[color:var(--v2-brand)] hover:underline"
                      data-testid="v2-board11-source-link"
                      href={data.source.path.value}
                    >
                      {data.source.path.value}
                    </a>
                  </p>
                ) : (
                  <div className="mt-3">
                    <StateValue value={data.source.path} />
                  </div>
                )}
                <div className="mt-3 rounded-[var(--v2-radius)] bg-[var(--v2-inset)] px-[14px] py-3">
                  <p
                    className={`${v2Type.body} text-[color:var(--v2-ink2)]`}
                    data-testid="v2-board11-source-excerpt"
                  >
                    {renderValue(data.source.excerpt, (text) => text)}
                  </p>
                </div>
                <p
                  className={`${v2Type.meta} mt-2 text-[color:var(--v2-ink3)]`}
                  data-testid="v2-board11-no-causal-claim"
                >
                  No false definitive causal claim.
                </p>
              </section>

              <section aria-labelledby="v2-board11-experiment-title">
                <h3 id="v2-board11-experiment-title" className={v2Type.caps}>
                  Recommended experiment
                </h3>
                <div className="mt-3">
                  {renderValue(data.experiment.title, (text) => (
                    <p
                      className={`${v2Type.bodyStrong} text-[color:var(--v2-ink)]`}
                      data-testid="v2-board11-experiment-title-value"
                    >
                      {text}
                    </p>
                  ))}
                  <p className={`${v2Type.body} mt-2 text-[color:var(--v2-ink2)]`}>
                    {renderValue(data.experiment.points, (points) => (
                      <>
                        <Chip className="mr-1.5 align-middle" tone="brand">
                          {points} work points
                        </Chip>
                        {renderValue(data.experiment.timing, (timing) => (
                          <span>{timing}</span>
                        ))}
                      </>
                    ))}
                  </p>
                  {renderValue(data.experiment.action, (action) =>
                    action.kind === "open" ? (
                      <Button asChild className="mt-3 h-10 rounded-lg px-4 text-[13.5px]">
                        <a
                          href={`/v2/my-work?${new URLSearchParams({ brandId: data.brandId, mode: "guided", task: action.taskId }).toString()}`}
                        >
                          Open this task
                        </a>
                      </Button>
                    ) : (
                      <Button className="mt-3 h-10 rounded-lg px-4 text-[13.5px]" type="button">
                        Create improvement task
                      </Button>
                    ),
                  )}
                </div>
              </section>
            </div>

            <UnderlineTabs
              className="mt-5"
              items={[
                { value: "answers", label: "Raw answers" },
                { value: "sources", label: "Source URLs" },
                { value: "history", label: "Change history" },
              ]}
              onChange={setSubTab}
              value={subTab}
            />
            {subTab === "answers" ? (
              <section aria-labelledby="v2-board11-records-title" className="mt-3">
                <p id="v2-board11-records-title" className={v2Type.meta}>
                  Sample answer records
                </p>
                <AnswerRecords rows={data.answerRecords} />
              </section>
            ) : null}
            {subTab === "sources" ? (
              <section className="mt-4" data-testid="v2-board11-source-urls">
                {sourceUrls.length > 0 ? (
                  sourceUrls.map(({ model, url }) => (
                    <a
                      className={`block break-all ${v2Type.body} text-[color:var(--v2-brand)] hover:underline`}
                      href={url}
                      key={`${model}-${url}`}
                    >
                      {url}
                    </a>
                  ))
                ) : (
                  <p className={v2Type.body}>
                    No successful answer recorded a source URL for this question.
                  </p>
                )}
              </section>
            ) : null}
            {subTab === "history" ? (
              <section className="mt-4" data-testid="v2-board11-change-history">
                {renderValue(data.changeHistory, (items) => (
                  <p className={v2Type.body}>{items.join("\n")}</p>
                ))}
              </section>
            ) : null}
          </main>
        }
        rightRail={<EvidenceRail data={data} />}
        rightRailWidth={322}
      />
    </div>
  );
}
