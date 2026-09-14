import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { EvidenceReference, TaskState } from "@shared/work";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { Chip } from "@/v2/shared/ui/Chip";
import { cn } from "@/lib/utils";
import {
  BriefRail,
  CheckList,
  ComparisonTable,
  DisplayValue,
  StaleNotice,
  TaskStepStrip,
  type SharedCheckState,
  type SharedNumericValue,
  type SharedStep,
  type SharedTextValue,
} from "./shared/ConfirmationShared";

export type Board04Progress = {
  currentLevel: { level: number; name: string };
  currentPoints: number;
  nextPoints: number;
  awardedPoints: number;
  nextLevel: SharedTextValue;
  verifiedChanges: SharedNumericValue;
  requiredChanges: SharedNumericValue;
  completionMessage: SharedTextValue;
};

export type Board04Data = {
  task: {
    id: string;
    revision: number;
    state: TaskState;
    /** The evidence a "verify" call sends back, verbatim - see
     *  `evidenceForVerification` in `data.ts`. Empty when the task carries no
     *  reusable evidence yet, which the primary control's `blocked` reason
     *  says plainly rather than sending a call the server would reject. */
    verificationEvidence: readonly EvidenceReference[];
    brandId: string;
    title: string;
    points: number;
    steps: readonly SharedStep[];
    before: { claim: SharedTextValue };
    after: { claim: SharedTextValue };
    sourcePath: SharedTextValue;
    approvedFact: SharedTextValue;
    note: SharedTextValue;
    checkedAt: SharedTextValue;
  };
  checks: {
    urlReachable: SharedCheckState;
    textPresent: SharedCheckState;
    factConfirmed: SharedCheckState;
  };
  progress: Board04Progress;
};

/** The one control this screen offers for moving the task forward. Its shape
 *  tracks the task's own state: an available server command
 *  (`accept`/`start`, matching `TRANSITIONS` in `server/domains/work/policy.ts`)
 *  for the states before "submitted", and the human-confirmation flow for
 *  "submitted" itself - a control the server would reject is not offered. */
export type Board04Primary =
  | { kind: "accept"; run: () => void; pending: boolean }
  | { kind: "start"; run: () => void; pending: boolean }
  | { kind: "confirm"; run: () => void; pending: boolean; blocked: boolean; reason?: string }
  | { kind: "closed"; reason: string };

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

function WhatHappensNext({ checkedAt }: { checkedAt: SharedTextValue }) {
  const items = [
    { icon: "check" as const, title: "Work complete", body: "Your update is recorded." },
    {
      icon: "clock" as const,
      title: "Waiting for observation",
      body: "Our systems monitor the page.",
    },
    {
      icon: "chart" as const,
      title: "Review AI answers",
      body: "We evaluate answer accuracy over time.",
    },
  ];

  return (
    <section
      className="mt-7 border-t border-[var(--v2-line)] bg-[var(--v2-paper)] pt-5"
      data-testid="v2-what-happens-next"
    >
      <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
        <div className="shrink-0">
          <h2 className={v2Type.bodyStrong}>What happens next</h2>
          <p className={cn(v2Type.mono, "mt-0.5")}>
            {checkedAt.kind === "measured" ? (
              `Checked ${checkedAt.value}`
            ) : (
              <DisplayValue value={checkedAt} />
            )}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {items.map((item, index) => (
            <div className="flex min-w-0 flex-1 items-start gap-2" key={item.title}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]">
                <V2Icon name={item.icon} size={16} />
              </span>
              <div className="min-w-0">
                <p className={cn(v2Type.bodyStrong, "truncate")}>{item.title}</p>
                <p className={v2Type.meta}>{item.body}</p>
              </div>
              {index < items.length - 1 ? (
                <V2Icon name="arrow" size={15} className="mt-1 text-[color:var(--v2-line2)]" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The primary control shown when no live `primary` is supplied - the canvas
 *  preview and any caller that only wants to render the approved layout, not
 *  wire a real mutation. Permissive by design (never `blocked`): the guard
 *  that matters is the live one `Route.tsx` builds from real evidence. */
function defaultPrimaryFor(task: Board04Data["task"]): Board04Primary {
  switch (task.state) {
    case "suggested":
      return { kind: "accept", pending: false, run: () => {} };
    case "accepted":
    case "reopened":
      return { kind: "start", pending: false, run: () => {} };
    case "submitted":
      return { kind: "confirm", pending: false, blocked: false, run: () => {} };
    case "in_progress":
      return { kind: "closed", reason: "Waiting for the automated recheck." };
    case "verified":
      return { kind: "closed", reason: "This task is already verified." };
    case "waiting_for_observation":
      return { kind: "closed", reason: "Waiting for the next observation." };
    case "dismissed":
      return { kind: "closed", reason: "This task was dismissed." };
    case "not_applicable":
      return { kind: "closed", reason: "This task was marked not applicable." };
    default: {
      const _exhaustive: never = task.state;
      return _exhaustive;
    }
  }
}

function PrimaryControl({ primary, isStale }: { primary: Board04Primary; isStale: boolean }) {
  if (primary.kind === "accept" || primary.kind === "start") {
    return (
      <Button
        className="h-10 rounded-lg px-4 py-2 text-[13.5px] font-semibold"
        disabled={primary.pending}
        onClick={primary.run}
        type="button"
      >
        {primary.pending
          ? "Saving…"
          : primary.kind === "accept"
            ? "Accept task"
            : "Start task"}
      </Button>
    );
  }
  if (primary.kind === "confirm") {
    return (
      <>
        <Button
          className="h-10 rounded-lg px-4 py-2 text-[13.5px] font-semibold"
          data-testid="v2-board04-confirm"
          disabled={primary.blocked || isStale || primary.pending}
          onClick={primary.run}
          type="button"
        >
          {primary.pending ? "Confirming…" : "Confirm facts and complete task"}
        </Button>
        {primary.reason ? (
          <p className={`${v2Type.meta} basis-full`} data-testid="v2-board04-blocked">
            {primary.reason}
          </p>
        ) : null}
      </>
    );
  }
  return (
    <Button className="h-10 rounded-lg px-4 py-2 text-[13.5px] font-semibold" disabled type="button">
      {primary.reason}
    </Button>
  );
}

export function Board04Screen({
  data,
  staleAsOf,
  primary,
}: V2ScreenProps<Board04Data> & { primary?: Board04Primary }) {
  const { task, checks, progress } = data;
  const isStale = staleAsOf !== undefined;
  const resolvedPrimary = primary ?? defaultPrimaryFor(task);

  return (
    <div className="flex min-h-full flex-col lg:flex-row" data-testid="v2-board-04">
      <section className="min-w-0 flex-1 px-8 py-6">
        {staleAsOf ? <StaleNotice asOf={staleAsOf} /> : null}
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className={v2Type.pageTitle}>{task.title}</h1>
          <Chip tone="brand">{task.points} work points</Chip>
        </div>

        <TaskStepStrip className="mb-6" steps={task.steps} />

        <ComparisonTable
          className="mb-[18px]"
          headers={["Before", "After"]}
          rows={[
            {
              label: <span className={v2Type.body}>Page claim</span>,
              cells: [
                <DisplayValue key="before" value={task.before.claim} />,
                <span className="font-semibold text-[color:var(--v2-ink)]" key="after">
                  <DisplayValue value={task.after.claim} />
                </span>,
              ],
            },
            {
              label: <span className={v2Type.body}>Source path</span>,
              cells: [
                <SourcePath key="before" value={task.sourcePath} />,
                <SourcePath key="after" value={task.sourcePath} />,
              ],
            },
            {
              label: <span className={v2Type.body}>Approved fact</span>,
              cells: [
                <DisplayValue key="before" value={task.approvedFact} />,
                <DisplayValue key="after" value={task.approvedFact} />,
              ],
            },
            {
              label: <span className={v2Type.body}>Note</span>,
              cells: [
                <span className="text-[color:var(--v2-ink3)]" key="before">
                  <DisplayValue value={task.note} />
                </span>,
                <span className="text-[color:var(--v2-ink3)]" key="after">
                  <DisplayValue value={task.note} />
                </span>,
              ],
            },
          ]}
        />

        <CheckList
          rows={[
            { label: "Published URL is reachable", state: checks.urlReachable },
            { label: "Updated text is present", state: checks.textPresent },
            {
              label: "You confirm that the service region is correct",
              state: checks.factConfirmed,
            },
          ]}
          displayStatus
          variant="panel"
        />

        <div className="mt-5 flex flex-wrap items-center gap-[22px]">
          <PrimaryControl isStale={isStale} primary={resolvedPrimary} />
          <Link
            className="text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)] hover:underline"
            search={{ brandId: task.brandId, mode: "guided" }}
            to="/v2/my-work"
          >
            Save for later
          </Link>
        </div>
        <p className={cn(v2Type.meta, "mt-3")}>
          Points reward completed work. Visibility changes are measured separately.
        </p>

        <WhatHappensNext checkedAt={task.checkedAt} />
      </section>

      <aside className="w-full shrink-0 border-t border-[var(--v2-line)] px-6 py-6 lg:w-[322px] lg:border-t-0 lg:border-l">
        <BriefRail points={progress.awardedPoints} progress={progress} variant="factual" />
      </aside>
    </div>
  );
}
