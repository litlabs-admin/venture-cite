import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useBrandFacts } from "../data/brandFacts";
import { useBrandPrompts, usePromptResults } from "../data/promptResults";
import { useWorkTasks } from "../data/workTasks";
import { formatDate } from "../mywork/evidence";
import { EvidenceRail } from "./EvidenceRail";
import { NotBuiltPanel } from "./NotBuiltNotice";
import { PromptDiagnosis } from "./PromptDiagnosis";
import { defaultPromptId, observe, toAnswerRows } from "./answerRows";

// Diagnostics - composition only.
//
// FOUR TABS, ONE BUILT. Prompt diagnosis is real; Site health, GEO signals and
// Perception are reachable tabs that say in words that they do not exist yet
// (`NotBuiltNotice.tsx`), which is the treatment Learn established. They are
// tabs rather than absent, because the area's shape is what is under review;
// they hold no stand-in metric, because a greyed number is indistinguishable
// from a real one that failed to load.
//
// The frame is the one every screen in this tree uses: a `min-w-0 flex-1`
// content column at `px-8 py-6` and a 322px right rail with a left hairline
// that becomes a top hairline below `lg`. Every branch renders it, so the
// screen does not jump as data arrives.

const COLUMN = "min-w-0 flex-1 px-8 py-6";
const RAIL =
  "w-full shrink-0 border-t border-vc-default px-8 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6";

type TabId = "site_health" | "geo_signals" | "perception" | "prompt_diagnosis";

const TABS: { id: TabId; label: string }[] = [
  { id: "site_health", label: "Site health" },
  { id: "geo_signals", label: "GEO signals" },
  { id: "perception", label: "Perception" },
  { id: "prompt_diagnosis", label: "Prompt diagnosis" },
];

/** What each unbuilt tab WOULD cover, in the future tense. Nothing here
 *  describes anything currently running. */
const NOT_BUILT_SUBJECTS: Record<Exclude<TabId, "prompt_diagnosis">, string> = {
  site_health: "report what a crawler can and cannot read on your site",
  geo_signals: "report the structured signals a model can find about your brand",
  perception: "report how models describe your brand when asked directly",
};

function Frame({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-stretch lg:flex-row">
      <div className={COLUMN}>{main}</div>
      <aside className={RAIL} aria-label="Evidence boundaries">
        {rail}
      </aside>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

function Heading() {
  return (
    <h1 className="text-metric font-semibold leading-tight text-vc-primary">
      Find the cause. Choose a useful fix.
    </h1>
  );
}

function TabBar({ tab, onTab }: { tab: TabId; onTab: (next: TabId) => void }) {
  return (
    <div className="mt-5 flex items-center gap-6 border-b border-vc-default" role="tablist">
      {TABS.map(({ id, label }) => {
        const active = id === tab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`v2-diagnostics-tab-${id}`}
            onClick={() => onTab(id)}
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
  );
}

function LoadingDiagnostics() {
  return (
    <div data-testid="v2-diagnostics-loading" role="status" aria-busy="true">
      <span className="sr-only">Loading Diagnostics</span>
      <Frame
        main={
          <>
            <Bar className="h-7 w-96" />
            <Bar className="mt-6 h-5 w-full max-w-lg" />
            <Bar className="mt-8 h-6 w-80" />
            <Bar className="mt-5 h-40 w-full" />
            <Bar className="mt-8 h-24 w-full" />
          </>
        }
        rail={
          <>
            <Bar className="h-4 w-40" />
            <Bar className="mt-5 h-4 w-full" />
            <Bar className="mt-2 h-4 w-48" />
            <Bar className="mt-6 h-4 w-full" />
            <Bar className="mt-2 h-4 w-40" />
            <Bar className="mt-8 h-28 w-full" />
          </>
        }
      />
    </div>
  );
}

/** No brands at all. This tree's gate does not redirect a brand-less account
 *  away, so the case is reachable and is named rather than left blank. */
function NoBrand() {
  return (
    <Frame
      main={
        <div data-testid="v2-diagnostics-no-brand" className="max-w-lg">
          <h1 className="text-metric font-semibold text-vc-primary">Add a brand to start</h1>
          <p className="mt-2 text-body text-vc-secondary">
            Answers are recorded per brand, and there is no brand on this account yet. Add one and
            its buyer questions appear here once they have been asked.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/welcome">Add a brand</Link>
          </Button>
        </div>
      }
      rail={
        <p className="text-body text-vc-secondary">
          Evidence boundaries appear with your first brand.
        </p>
      }
    />
  );
}

export default function DiagnosticsPage() {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const promptsQuery = useBrandPrompts(selectedBrandId);
  const resultsQuery = usePromptResults(selectedBrandId);
  const factsQuery = useBrandFacts(selectedBrandId);
  const tasksQuery = useWorkTasks(selectedBrandId ?? "");

  const [tab, setTab] = useState<TabId>("prompt_diagnosis");
  const [promptId, setPromptId] = useState<string | undefined>(undefined);

  // Only the questions that are actually being asked. An archived or paused
  // question's stored answers describe a set the product is no longer running,
  // and presenting them as current would misstate what is being measured.
  const prompts = useMemo(
    () => (promptsQuery.data ?? []).filter((row) => row.status === "tracked" && !row.paused),
    [promptsQuery.data],
  );
  const byPrompt = useMemo(() => resultsQuery.data?.byPrompt ?? [], [resultsQuery.data]);

  const fallbackId = useMemo(() => defaultPromptId(prompts, byPrompt), [prompts, byPrompt]);

  // A selection that no longer exists (the brand changed under the page) is
  // dropped rather than left pointing at a missing question.
  useEffect(() => {
    if (promptId && !prompts.some((row) => row.id === promptId)) setPromptId(undefined);
  }, [prompts, promptId]);

  const activeId = promptId ?? fallbackId;
  const index = Math.max(
    0,
    prompts.findIndex((row) => row.id === activeId),
  );
  const active = prompts[index];
  const result = byPrompt.find((row) => row.promptId === active?.id);
  const observation = observe(toAnswerRows(result));
  const brandName = selectedBrand?.name ?? "Your brand";

  // The one captured page excerpt this screen quotes. First fact carrying both
  // a quoted wording and the page it came from - never a fact whose excerpt is
  // missing, because an unquoted "page evidence" row would be a claim with
  // nothing behind it.
  const fact = useMemo(
    () => (factsQuery.data ?? []).find((row) => row.sourceExcerpt && row.sourceUrl),
    [factsQuery.data],
  );

  // A real planner-generated task, or none. Never a task invented here.
  const experiment = useMemo(() => {
    const open = new Set(["suggested", "accepted", "reopened", "in_progress"]);
    return (tasksQuery.data?.items ?? []).find(
      (task) =>
        open.has(task.state) &&
        (task.type === "improve_page_for_buyer_need" ||
          task.type === "complete_visibility_experiment"),
    );
  }, [tasksQuery.data]);

  if (brandsLoading) return <LoadingDiagnostics />;
  if (!selectedBrandId) return <NoBrand />;
  if (promptsQuery.isPending || resultsQuery.isPending) return <LoadingDiagnostics />;

  const rail = (
    <EvidenceRail observation={observation} lastCheckedAt={formatDate(result?.lastCheckedAt)} />
  );

  if (promptsQuery.isError || resultsQuery.isError) {
    return (
      <Frame
        main={
          <div data-testid="v2-diagnostics-error">
            <ErrorState
              title="Your answers could not be loaded"
              description="The recorded answers for this brand did not load. Nothing has been lost, and nothing has been measured or changed — try again."
              onRetry={() => {
                void promptsQuery.refetch();
                void resultsQuery.refetch();
              }}
              isRetrying={promptsQuery.isFetching || resultsQuery.isFetching}
            />
          </div>
        }
        rail={
          <p className="text-body text-vc-secondary">
            Evidence boundaries are unavailable while the answers cannot be read.
          </p>
        }
      />
    );
  }

  return (
    <Frame
      main={
        <>
          <Heading />
          <TabBar tab={tab} onTab={setTab} />

          {tab !== "prompt_diagnosis" ? (
            <NotBuiltPanel
              title={TABS.find((entry) => entry.id === tab)!.label}
              subject={NOT_BUILT_SUBJECTS[tab]}
            />
          ) : !active ? (
            /* A brand with no approved question. Not an error, and not a
               clean bill of health: nothing has been asked, so nothing has
               been observed about any of it. */
            <div data-testid="v2-diagnostics-no-prompts" className="mt-8 max-w-lg">
              <h2 className="text-section font-semibold text-vc-primary">
                No buyer question has been approved yet
              </h2>
              <p className="mt-2 text-body text-vc-secondary">
                Nothing has been asked of any model for {brandName}, so there is no answer to
                diagnose. This is not a result of zero mentions — no observation exists at all.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/v2/brand-facts">Approve your questions</Link>
              </Button>
            </div>
          ) : (
            <PromptDiagnosis
              key={active.id}
              prompts={prompts}
              index={index}
              onIndex={(next) => setPromptId(prompts[next]?.id)}
              result={result}
              brandName={brandName}
              brandDomain={resultsQuery.data?.brandDomain}
              fact={fact}
              experiment={experiment}
            />
          )}
        </>
      }
      rail={tab === "prompt_diagnosis" ? rail : <UnbuiltRail />}
    />
  );
}

/** The rail for a tab that does not exist. It would be worse to leave the
 *  Evidence boundaries panel standing beside an unbuilt tab: those three
 *  headings describe observations of a question set, and nothing on an
 *  unbuilt tab has been observed. */
function UnbuiltRail() {
  return (
    <div className="space-y-3" data-testid="v2-diagnostics-unbuilt-rail">
      <h2 className="text-body font-semibold text-vc-primary">Evidence boundaries</h2>
      <p className="text-body text-vc-secondary">
        There are none to state. This tab reads no data, so nothing has been observed and nothing is
        unknown-but-checkable here yet.
      </p>
    </div>
  );
}
