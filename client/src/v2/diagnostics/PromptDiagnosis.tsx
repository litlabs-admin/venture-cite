import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Eye, FileText, Globe, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StateBadge } from "../state/StateBadge";
import type { BrandFactView } from "../data/brandFacts";
import type { BrandPromptView, PromptResultView } from "../data/promptResults";
import type { WorkTaskSummaryView } from "../data/workSummary";
import { formatDate } from "../mywork/evidence";
import { AnswerTable } from "./AnswerTable";
import { NotBuiltBadge } from "./NotBuiltNotice";
import {
  citedUrlsOf,
  intentLine,
  observationSentence,
  observe,
  pathOf,
  retrievalOf,
  toAnswerRows,
} from "./answerRows";

// One approved buyer question, what each model answered, and what that
// implies - stopping deliberately short of why.
//
// THE ASSESSMENT ROW IS ALWAYS "Hypothesis — needs testing". It is not
// computed and it never escalates, because nothing on this screen can
// establish a cause: the data records what a model said, never why it said it.
// A row that sometimes read "Confirmed" would turn a correlation between a
// page's wording and an omission into a finding the product cannot support.

const SECTION_LABEL = "text-data font-medium tracking-wide text-vc-tertiary uppercase";

type SubTab = "answers" | "sources" | "history";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "answers", label: "Raw answers" },
  { id: "sources", label: "Source URLs" },
  { id: "history", label: "Change history" },
];

/** One row of the observation table. `value` carries its own tone; a row with
 *  no measurement renders a `StateBadge` instead of prose, so an absent
 *  observation cannot be mistaken for a finding. */
function ObservationRow({
  icon: Icon,
  label,
  children,
  testId,
}: {
  icon: typeof Eye;
  label: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)] items-center gap-4 border-b border-vc-default px-4 py-3 last:border-b-0"
    >
      <span className="flex min-w-0 items-center gap-2 text-body text-vc-secondary">
        <Icon className="h-4 w-4 shrink-0 text-vc-tertiary" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 text-body">{children}</span>
    </div>
  );
}

export function PromptDiagnosis({
  prompts,
  index,
  onIndex,
  result,
  brandName,
  brandDomain,
  fact,
  experiment,
}: {
  prompts: readonly BrandPromptView[];
  index: number;
  onIndex: (next: number) => void;
  result: PromptResultView | undefined;
  brandName: string;
  brandDomain: string | null | undefined;
  /** The captured page wording, when one exists. Never fabricated. */
  fact: BrandFactView | undefined;
  /** A real planner-generated task, when one exists. This screen does not
   *  create tasks - no endpoint creates one from a question, and inventing a
   *  recommendation with an invented point value is exactly what `StartRail`
   *  refused to do. */
  experiment: WorkTaskSummaryView | undefined;
}) {
  const [subTab, setSubTab] = useState<SubTab>("answers");
  const prompt = prompts[index];
  const rows = toAnswerRows(result);
  const observation = observe(rows);
  const retrieval = retrievalOf(rows, brandDomain);
  const urls = citedUrlsOf(rows);
  const excerptPath = pathOf(fact?.sourceUrl);

  return (
    <div data-testid="v2-prompt-diagnosis">
      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="text-section font-semibold text-vc-primary"
            data-testid="v2-diagnosis-question"
          >
            {prompt.prompt}
          </h2>
          <p className="mt-1 text-caption text-vc-secondary">{intentLine(prompt)}</p>
        </div>

        {/* The board shows one question and no picker. A screen locked to a
            single arbitrary question is not usable, so the smallest possible
            control is added: a position and two steps. It selects what to
            READ and mutates nothing. */}
        {prompts.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1" data-testid="v2-diagnosis-picker">
            <span className="text-caption text-vc-tertiary tabular-nums">
              {index + 1} of {prompts.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Previous question"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Next question"
              disabled={index === prompts.length - 1}
              onClick={() => onIndex(index + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-md border border-vc-default bg-vc-surface">
        <ObservationRow icon={Eye} label="Answer observation" testId="v2-row-observation">
          {observation.successful === 0 ? (
            <StateBadge state={rows.length === 0 ? "not_measured" : "failed"} />
          ) : (
            <span className="font-medium text-vc-primary">{observationSentence(observation)}</span>
          )}
        </ObservationRow>

        <ObservationRow icon={Globe} label="Source coverage" testId="v2-row-coverage">
          {retrieval.kind === "not_measured" ? (
            <StateBadge state="not_measured" />
          ) : retrieval.kind === "retrieved" ? (
            <span className="text-vc-primary">
              Your site was retrieved in {retrieval.count} of {retrieval.successful} successful
              answers
            </span>
          ) : (
            <span className="text-vc-primary">
              Your site was retrieved in none of the {retrieval.successful} successful answers
            </span>
          )}
        </ObservationRow>

        <ObservationRow icon={FileText} label="Page evidence" testId="v2-row-page-evidence">
          {fact?.sourceExcerpt ? (
            <span className="text-vc-primary">
              Wording captured from {excerptPath ?? "your site"}
            </span>
          ) : (
            <StateBadge state="not_measured" />
          )}
        </ObservationRow>

        {/* Fixed, by design. See the note at the top of this file. */}
        <ObservationRow icon={Scale} label="Assessment" testId="v2-row-assessment">
          <span className="text-vc-secondary" data-testid="v2-assessment-value">
            Hypothesis — needs testing
          </span>
        </ObservationRow>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="v2-diagnosis-excerpt-heading">
          <h3 id="v2-diagnosis-excerpt-heading" className={SECTION_LABEL}>
            Source excerpt
          </h3>
          {fact?.sourceExcerpt ? (
            <>
              <p className="mt-3 text-caption text-vc-secondary">
                Page:{" "}
                {fact.sourceUrl ? (
                  <a
                    href={fact.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-vc-accent hover:underline"
                    data-testid="v2-diagnosis-excerpt-link"
                  >
                    {excerptPath}
                  </a>
                ) : (
                  <span className="text-vc-secondary">{excerptPath ?? "unknown"}</span>
                )}
              </p>
              <blockquote
                data-testid="v2-diagnosis-excerpt"
                className="mt-3 rounded-md bg-vc-muted/60 px-4 py-3 text-body text-vc-primary"
              >
                {fact.sourceExcerpt}
              </blockquote>
            </>
          ) : (
            <p className="mt-3 text-body text-vc-secondary" data-testid="v2-diagnosis-no-excerpt">
              No page wording has been captured for this brand, so there is nothing quoted here to
              read the answers against.
            </p>
          )}
          {/* The third statement of the rule, kept where the person is most
              likely to draw a conclusion from the excerpt. */}
          <p className="mt-3 text-caption text-vc-tertiary" data-testid="v2-no-causal-claim">
            No false definitive causal claim.
          </p>
        </section>

        <section aria-labelledby="v2-diagnosis-experiment-heading">
          <h3 id="v2-diagnosis-experiment-heading" className={SECTION_LABEL}>
            Recommended experiment
          </h3>
          {experiment ? (
            <div data-testid="v2-diagnosis-experiment">
              <p className="mt-3 text-section font-semibold text-vc-primary">{experiment.title}</p>
              <p className="mt-2 text-body text-vc-secondary">
                <span className="rounded-sm bg-vc-accent-subtle px-1.5 py-0.5 text-caption font-medium text-vc-accent tabular-nums">
                  {experiment.points} work points
                </span>{" "}
                after published change and editorial confirmation
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/v2/my-work">Open this task</Link>
              </Button>
            </div>
          ) : (
            // No endpoint creates a task from a question, so a "Create
            // improvement task" button here would either do nothing or invent
            // a task with an invented point value. The absence is stated.
            <div data-testid="v2-diagnosis-no-experiment">
              <p className="mt-3 text-body text-vc-secondary">
                No experiment has been generated for this question. Tasks are produced from
                confirmed findings, and none has been recorded here.
              </p>
              <p className="mt-2 text-caption text-vc-tertiary">
                Nothing on this screen creates a task, so nothing is being suggested for you to do
                yet.
              </p>
              <p className="mt-3 text-caption text-vc-tertiary" data-testid="v2-hypothesis-note">
                Hypothesis — needs testing.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-8 flex items-center gap-6 border-b border-vc-default" role="tablist">
        {SUB_TABS.map(({ id, label }) => {
          const active = id === subTab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`v2-diagnosis-subtab-${id}`}
              onClick={() => setSubTab(id)}
              className={`-mb-px border-b-2 pb-2.5 text-body transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40 ${
                active
                  ? "border-vc-accent font-medium text-vc-accent"
                  : "border-transparent text-vc-tertiary hover:text-vc-secondary"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {subTab === "answers" ? (
          rows.length === 0 ? (
            <p className="text-body text-vc-secondary" data-testid="v2-diagnosis-never-checked">
              This question has never been checked, so no model has answered it. That is not a
              result of zero mentions — no observation exists at all.
            </p>
          ) : (
            <AnswerTable rows={rows} brandName={brandName} />
          )
        ) : null}

        {subTab === "sources" ? (
          urls.length === 0 ? (
            <p className="text-body text-vc-secondary" data-testid="v2-diagnosis-no-sources">
              No successful answer recorded a source URL for this question. That means retrieval was
              not observed, not that the models retrieved nothing.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="v2-diagnosis-sources">
              {urls.map(({ url, platforms }) => (
                <li key={url} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 break-all text-body text-vc-accent hover:underline"
                  >
                    {url}
                  </a>
                  <span className="text-caption text-vc-tertiary">{platforms.join(", ")}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {subTab === "history" ? (
          <div data-testid="v2-diagnosis-history-not-built">
            <NotBuiltBadge />
            <p className="mt-2 max-w-lg text-body text-vc-secondary">
              Change history has not been built. Nothing records when this question&apos;s answers
              changed, so there is no timeline to show — not an empty one, none at all.
            </p>
          </div>
        ) : null}
      </div>

      {result?.lastCheckedAt ? (
        <p className="mt-6 text-caption text-vc-tertiary" data-testid="v2-diagnosis-last-checked">
          Latest answers recorded {formatDate(result.lastCheckedAt)}.
        </p>
      ) : null}
    </div>
  );
}
