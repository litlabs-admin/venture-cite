import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { Chip } from "@/v2/shared/ui/Chip";
import { DiffHighlight } from "@/v2/shared/ui/DiffHighlight";
import { Panel } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { cn } from "@/lib/utils";

export type SharedTextValue =
  { kind: "measured"; value: string } | { kind: "not-measured"; reason: string };

export type SharedNumericValue =
  { kind: "measured"; value: number } | { kind: "not-measured"; reason: string };

export type SharedCheckState =
  | { kind: "passed" }
  | { kind: "pending" }
  | { kind: "failed"; reason: string }
  | { kind: "not-measured"; reason: string }
  | { kind: "stale"; asOf: string };

export type SharedStep = {
  label: string;
  node: { kind: "completed" } | { kind: "active"; number: number } | { kind: "pending" };
};

export function DisplayValue({ value }: { value: SharedTextValue }) {
  if (value.kind === "measured") return <>{value.value}</>;

  return (
    <span
      className="inline-flex flex-wrap items-center gap-1.5"
      data-testid="v2-value-not-measured"
    >
      <StateLabel state="not-measured" />
      <span className={v2Type.meta}>{value.reason}</span>
    </span>
  );
}

function CheckStatus({ state }: { state: SharedCheckState }) {
  switch (state.kind) {
    case "passed":
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[color:var(--v2-ok)]">
          <V2Icon name="check" size={17} />
          <span>Passed</span>
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[color:var(--v2-warn)]">
          <V2Icon name="clock" size={17} />
          <span>Pending</span>
        </span>
      );
    case "failed":
      return <StateLabel state="failed" />;
    case "not-measured":
      return <StateLabel state="not-measured" />;
    case "stale":
      return <StateLabel state="stale" />;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export type CheckListRow = {
  label: string;
  state: SharedCheckState;
};

export function CheckList({
  rows,
  variant,
  displayStatus,
}: {
  rows: readonly CheckListRow[];
  variant: "panel" | "plain";
  displayStatus: boolean;
}) {
  return (
    <div
      className={cn(
        variant === "panel"
          ? "rounded-[var(--v2-radius-panel)] border border-[var(--v2-line)] px-[18px] py-1"
          : "flex flex-col gap-[9px]",
      )}
      data-testid="v2-check-list"
    >
      {rows.map((row, index) => (
        <div
          className={cn(
            "flex min-w-0 items-center justify-between gap-4",
            variant === "panel" && index > 0 && "border-t border-[var(--v2-line)] pt-3",
            variant === "panel" && "pb-3 first:pt-2",
          )}
          key={row.label}
        >
          <span className={cn("flex min-w-0 items-center gap-2", v2Type.bodyStrong)}>
            <span className="shrink-0" aria-hidden="true">
              {row.state.kind === "passed" ? (
                <V2Icon name="check" size={17} className="text-[color:var(--v2-ok)]" />
              ) : row.state.kind === "pending" ? (
                <V2Icon name="clock" size={17} className="text-[color:var(--v2-warn)]" />
              ) : (
                <V2Icon name="warn" size={17} className="text-[color:var(--v2-warn)]" />
              )}
            </span>
            <span className="min-w-0">{row.label}</span>
          </span>
          {displayStatus || row.state.kind !== "passed" ? <CheckStatus state={row.state} /> : null}
        </div>
      ))}
    </div>
  );
}

export function TaskStepStrip({
  steps,
  className,
  testId = "v2-task-step-strip",
}: {
  steps: readonly SharedStep[];
  className?: string;
  testId?: string;
}) {
  return (
    <ol className={cn("flex w-full items-center gap-2", className)} data-testid={testId}>
      {steps.map((step, index) => (
        <li className="flex min-w-0 flex-1 items-center gap-2" key={`${index}-${step.label}`}>
          <span
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
              step.node.kind === "pending"
                ? "bg-[var(--v2-line)] text-[color:var(--v2-ink3)]"
                : "bg-[var(--v2-brand)] text-[color:var(--v2-paper)]",
            )}
          >
            {step.node.kind === "completed" ? (
              <V2Icon name="check" size={13} strokeWidth={2.6} />
            ) : null}
            {step.node.kind === "active" ? step.node.number : null}
          </span>
          <span
            className={cn(
              "min-w-0 truncate",
              step.node.kind === "pending" ? v2Type.meta : v2Type.bodyStrong,
            )}
          >
            {step.node.kind === "active" ? (
              <span className="sr-only">{step.node.number} </span>
            ) : null}
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                "h-px min-w-3 flex-1",
                step.node.kind === "completed" ? "bg-[var(--v2-line2)]" : "bg-[var(--v2-line)]",
              )}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export type ComparisonRow = {
  label: ReactNode;
  cells: readonly ReactNode[];
};

export function ComparisonTable({
  headers,
  rows,
  className,
}: {
  headers: readonly string[];
  rows: readonly ComparisonRow[];
  className?: string;
}) {
  return (
    <Panel padding="none" className={cn("overflow-hidden", className)}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--v2-line)]">
            {rows.some((row) => row.label !== "") ? <th className="w-[24%]" /> : null}
            {headers.map((header) => (
              <th className={cn("px-4 py-1.5", v2Type.caps)} key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="border-b border-[var(--v2-line)] last:border-b-0" key={rowIndex}>
              {rows.some((item) => item.label !== "") ? (
                <td className={cn("px-4 py-2.5 align-top", v2Type.body)}>{row.label}</td>
              ) : null}
              {row.cells.map((cell, cellIndex) => (
                <td className={cn("px-4 py-2.5 align-top", v2Type.body)} key={cellIndex}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export type BriefProgress = {
  currentLevel: { level: number; name: string };
  currentPoints: number;
  nextLevel: SharedTextValue;
  verifiedChanges: SharedNumericValue;
  requiredChanges: SharedNumericValue;
  completionMessage: SharedTextValue;
};

export type FactualBriefProps = {
  variant: "factual";
  points: number;
  progress: BriefProgress & { nextPoints: number };
};

export type ConfirmationBriefProps = {
  variant: "confirmation";
  points: number;
  progress: BriefProgress & { taskPoints: number };
};

function LevelRing({
  level,
  currentPoints,
  nextPoints,
}: {
  level: number;
  currentPoints: number;
  nextPoints: number;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const ratio = nextPoints > 0 ? Math.min(1, Math.max(0, currentPoints / nextPoints)) : 0;

  return (
    <svg aria-hidden="true" className="shrink-0" height="66" viewBox="0 0 66 66" width="66">
      <circle cx="33" cy="33" fill="none" r={radius} stroke="var(--v2-line)" strokeWidth="5" />
      <circle
        cx="33"
        cy="33"
        fill="none"
        r={radius}
        stroke="var(--v2-brand)"
        strokeDasharray={`${circumference * ratio} ${circumference}`}
        strokeLinecap="round"
        strokeWidth="5"
        transform="rotate(-90 33 33)"
      />
      <text
        fill="var(--v2-ink3)"
        fontFamily="var(--font-sans)"
        fontSize="9"
        textAnchor="middle"
        x="33"
        y="30"
      >
        Level
      </text>
      <text
        fill="var(--v2-ink)"
        fontFamily="var(--font-sans)"
        fontSize="15"
        fontWeight="600"
        textAnchor="middle"
        x="33"
        y="44"
      >
        {level}
      </text>
    </svg>
  );
}

function LevelMark({ level }: { level: number }) {
  return (
    <svg aria-hidden="true" className="shrink-0" height="52" viewBox="0 0 52 52" width="52">
      <path
        d="M26 2.6 45.5 13.9v22.2L26 47.4 6.5 36.1V13.9z"
        fill="var(--v2-brand-soft)"
        stroke="var(--v2-brand)"
        strokeWidth="1.5"
      />
      <path
        d="m26 17.5 2.6 5.3 5.8.85-4.2 4.1 1 5.75-5.2-2.7-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"
        fill="var(--v2-brand)"
      />
      <text
        fill="var(--v2-paper)"
        fontFamily="var(--font-sans)"
        fontSize="8"
        fontWeight="700"
        textAnchor="middle"
        x="26"
        y="27"
      >
        {level}
      </text>
    </svg>
  );
}

function RailHeading({ children, icon }: { children: ReactNode; icon: "shield" | "none" }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon === "shield" ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]">
          <V2Icon name="shield" size={16} />
        </span>
      ) : null}
      <h2 className={v2Type.sectionTitle}>{children}</h2>
    </div>
  );
}

function FactualBrief({ points, progress }: FactualBriefProps) {
  return (
    <div className="space-y-0" data-testid="v2-brief-rail">
      <RailHeading icon="shield">Completion check</RailHeading>
      <p className={cn(v2Type.body, "mt-3")}>Software checks the page.</p>
      <p className={cn(v2Type.body, "mt-1")}>You confirm the business facts.</p>
      <Chip className="mt-4 px-3 py-2" icon="star" tone="ok">
        {points} work points after confirmation
      </Chip>
      <div className="mt-6 border-t border-[var(--v2-line)] pt-5">
        <h3 className={v2Type.bodyStrong}>Private brand progress</h3>
        <div className="mt-4 flex items-center gap-4">
          <LevelRing
            currentPoints={progress.currentPoints}
            level={progress.currentLevel.level}
            nextPoints={progress.nextPoints}
          />
          <div className="min-w-0">
            <p className={v2Type.sectionTitle}>
              Level {progress.currentLevel.level} · {progress.currentLevel.name}
            </p>
            <p className={cn(v2Type.body, "mt-1")}>
              <span className="font-mono font-semibold tabular-nums text-[color:var(--v2-brand)]">
                {progress.currentPoints}
              </span>
              <V2Icon name="arrow" size={13} className="mx-1.5 text-[color:var(--v2-ink3)]" />
              <span className="font-mono font-semibold tabular-nums text-[color:var(--v2-brand)]">
                {progress.nextPoints}
              </span>{" "}
              <span className={v2Type.meta}>work points</span>
            </p>
            <p className={cn(v2Type.meta, "mt-1.5 whitespace-pre-line")}>
              {progress.completionMessage.kind === "measured" ? (
                progress.completionMessage.value
              ) : (
                <DisplayValue value={progress.completionMessage} />
              )}
            </p>
          </div>
        </div>
        <span className="mt-4 inline-flex rounded-[7px] bg-[var(--v2-brand-soft)] px-3 py-2 text-[12.5px] font-semibold text-[color:var(--v2-brand)]">
          Next level: {DisplayValue({ value: progress.nextLevel })}
        </span>
      </div>
    </div>
  );
}

function ConfirmationBrief({ points, progress }: ConfirmationBriefProps) {
  return (
    <div className="space-y-0" data-testid="v2-brief-rail">
      <RailHeading icon="none">Completion summary</RailHeading>
      <div className="mt-5 flex items-center gap-3">
        <LevelMark level={progress.currentLevel.level} />
        <div className="min-w-0">
          <p className={v2Type.sectionTitle}>
            Level {progress.currentLevel.level} · {progress.currentLevel.name}
          </p>
          <p className={cn(v2Type.body, "mt-0.5")}>
            Current: <span className="font-mono tabular-nums">{progress.currentPoints}</span> work
            points
          </p>
        </div>
      </div>
      <div className="mt-6 border-t border-[var(--v2-line)] pt-5">
        <h3 className={v2Type.bodyStrong}>After confirmation</h3>
        <Chip className="mt-4 px-3 py-1.5" tone="brand">
          <span className="font-mono tabular-nums">+{points}</span> work points
        </Chip>
        <p className={cn(v2Type.bodyStrong, "mt-4")}>
          {DisplayValue({ value: progress.nextLevel })}
        </p>
        <p className={cn(v2Type.meta, "mt-0.5 whitespace-pre-line")}>
          {progress.completionMessage.kind === "measured" ? (
            progress.completionMessage.value
          ) : (
            <DisplayValue value={progress.completionMessage} />
          )}
        </p>
      </div>
      <div className="mt-6 flex items-start gap-3 border-t border-[var(--v2-line)] pt-5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--v2-inset)] text-[color:var(--v2-ink2)]">
          <V2Icon name="arrow" size={15} />
        </span>
        <div>
          <h3 className={v2Type.bodyStrong}>Next: measure the result</h3>
          <p className={cn(v2Type.meta, "mt-1")}>
            Your work points stay earned while we wait for new observations.
          </p>
        </div>
      </div>
    </div>
  );
}

export function BriefRail(props: FactualBriefProps | ConfirmationBriefProps) {
  return props.variant === "factual" ? (
    <FactualBrief {...props} />
  ) : (
    <ConfirmationBrief {...props} />
  );
}

export function StaleNotice({ asOf }: { asOf: string }) {
  return (
    <div className="mb-4 flex items-center gap-2" role="status">
      <StateLabel state="stale" />
      <span className={v2Type.meta}>Last checked {asOf}. A new check is required.</span>
    </div>
  );
}

export { DiffHighlight };
