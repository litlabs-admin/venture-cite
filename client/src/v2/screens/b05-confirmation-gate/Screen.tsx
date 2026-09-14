import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { v2Type } from "@/v2/theme/typography";
import { CheckboxRow } from "@/v2/shared/ui/CheckboxRow";
import { Chip } from "@/v2/shared/ui/Chip";
import { cn } from "@/lib/utils";
import {
  BriefRail,
  CheckList,
  ComparisonTable,
  DiffHighlight,
  DisplayValue,
  StaleNotice,
  TaskStepStrip,
  type SharedCheckState,
  type SharedNumericValue,
  type SharedStep,
  type SharedTextValue,
} from "../b04-factual-correction/shared/ConfirmationShared";

export type Board05Progress = {
  currentLevel: { level: number; name: string };
  currentPoints: number;
  taskPoints: number;
  nextLevel: SharedTextValue;
  verifiedChanges: SharedNumericValue;
  requiredChanges: SharedNumericValue;
  completionMessage: SharedTextValue;
};

export type Board05Data = {
  task: {
    id: string;
    revision: number;
    brandId: string;
    title: string;
    points: number;
    steps: readonly SharedStep[];
    beforeText: SharedTextValue;
    updatedText: SharedTextValue;
    approvedFact: SharedTextValue;
    sourcePath: SharedTextValue;
    checkedAt: SharedTextValue;
  };
  checks: {
    urlReachable: SharedCheckState;
    textPresent: SharedCheckState;
  };
  confirmation: { accepted: boolean; value: SharedTextValue };
  progress: Board05Progress;
};

export type Board05Confirm = {
  run: () => void;
  pending: boolean;
  error?: string;
};

function SourcePath({ value }: { value: SharedTextValue }) {
  if (value.kind === "not-measured") return <DisplayValue value={value} />;
  return (
    <a
      className="font-mono text-[12.5px] text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
      href={value.value}
    >
      {value.value}
    </a>
  );
}

function HighlightedText({ value, after }: { value: SharedTextValue; after: boolean }) {
  if (value.kind === "not-measured") return <DisplayValue value={value} />;
  const prefix = after ? "Services available in " : "Services available ";
  if (!value.value.startsWith(prefix)) return value.value;
  return (
    <>
      {prefix}
      <DiffHighlight kind={after ? "confirmed" : "inserted"}>
        {value.value.slice(prefix.length)}
      </DiffHighlight>
    </>
  );
}

function BottomStepStrip() {
  return (
    <div className="-mx-8 mt-6 flex items-center gap-4 border-t border-[var(--v2-line)] bg-[var(--v2-inset)] px-8 py-4">
      <TaskStepStrip
        className="min-w-0 flex-1"
        steps={[
          { label: "Review evidence", node: { kind: "completed" } },
          { label: "Verify work", node: { kind: "active", number: 3 } },
          { label: "Observe results", node: { kind: "pending" } },
        ]}
        testId="v2-bottom-step-strip"
      />
      <p className={cn(v2Type.mono, "shrink-0 text-right")}>
        Points reward verified work.
        <br />
        They do not predict visibility.
      </p>
    </div>
  );
}

const NOOP_CONFIRM: Board05Confirm = { run: () => {}, pending: false };

export function Board05Screen({
  data,
  staleAsOf,
  confirm = NOOP_CONFIRM,
}: V2ScreenProps<Board05Data> & { confirm?: Board05Confirm }) {
  const { task, checks, progress } = data;
  const [accepted, setAccepted] = useState(data.confirmation.accepted);
  const automaticChecksPassed =
    checks.urlReachable.kind === "passed" && checks.textPresent.kind === "passed";
  const canConfirm =
    accepted && automaticChecksPassed && staleAsOf === undefined && !confirm.pending;

  return (
    <div className="flex min-h-full flex-col lg:flex-row" data-testid="v2-board-05">
      <section className="min-w-0 flex-1 px-8 py-6">
        {staleAsOf ? <StaleNotice asOf={staleAsOf} /> : null}
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className={v2Type.pageTitle}>{task.title}</h1>
          <Chip tone="brand">{task.points} work points</Chip>
        </div>

        <TaskStepStrip className="mb-6" steps={task.steps} />

        <h2 className={cn(v2Type.sectionTitle, "mb-3")}>The page now matches your approved fact</h2>
        <ComparisonTable
          className="mb-3.5"
          headers={["Old", "Updated"]}
          rows={[
            {
              label: "",
              cells: [
                <HighlightedText after={false} key="old" value={task.beforeText} />,
                <HighlightedText after key="updated" value={task.updatedText} />,
              ],
            },
          ]}
        />

        <p className={v2Type.bodyStrong}>
          Approved fact: Service region — <DisplayValue value={task.approvedFact} />
        </p>
        <p className={cn(v2Type.meta, "mt-0.5")}>
          <span>Source:</span> <SourcePath value={task.sourcePath} /> ·{" "}
          {task.checkedAt.kind === "measured" ? (
            <span className={v2Type.mono}>Checked {task.checkedAt.value}</span>
          ) : (
            <DisplayValue value={task.checkedAt} />
          )}
        </p>

        <h3 className={cn(v2Type.caps, "mb-2.5 mt-6")}>Application checks</h3>
        <CheckList
          displayStatus={false}
          rows={[
            { label: "Published page is reachable", state: checks.urlReachable },
            { label: "Updated text is present", state: checks.textPresent },
          ]}
          variant="plain"
        />

        <h3 className={cn(v2Type.caps, "mb-3 border-t border-[var(--v2-line)] pt-5")}>
          Your confirmation
        </h3>
        <CheckboxRow
          checked={accepted}
          className="p-0"
          description="Page checks cannot verify your business facts."
          label={
            <>
              I confirm that <DisplayValue value={data.confirmation.value} /> is the correct service
              region.
            </>
          }
          onCheckedChange={setAccepted}
        />
        <div className="mt-5 flex flex-wrap items-center gap-[22px]">
          <Button
            className="h-10 rounded-lg px-4 py-2 text-[13.5px] font-semibold"
            data-testid="v2-board05-confirm"
            disabled={!canConfirm}
            onClick={confirm.run}
            type="button"
          >
            {confirm.pending ? "Confirming…" : "Confirm and complete"}
          </Button>
          <Link
            className="text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)] hover:underline"
            search={{ brandId: task.brandId, mode: "guided" }}
            to="/v2/my-work"
          >
            Save for later
          </Link>
        </div>
        {confirm.error ? (
          <p className="mt-2 text-[12.5px] text-[color:var(--v2-bad)]" data-testid="v2-board05-error">
            {confirm.error}
          </p>
        ) : null}

        <BottomStepStrip />
      </section>

      <aside className="w-full shrink-0 border-t border-[var(--v2-line)] px-6 py-6 lg:w-[322px] lg:border-t-0 lg:border-l">
        <BriefRail points={progress.taskPoints} progress={progress} variant="confirmation" />
      </aside>
    </div>
  );
}
