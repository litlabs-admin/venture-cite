import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { V2Icon } from "@/v2/theme/V2Icon";
import type { V2IconName } from "@/v2/contracts/icons";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";
import { Panel } from "@/v2/shared/ui/Panel";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { v2FocusRing } from "@/v2/shared/ui/shared";

export type ReviewMetric<T> = { kind: "measured"; value: T } | { kind: "not-measured" };

export type ReviewProgressData = {
  level: ReviewMetric<number>;
  name: ReviewMetric<string>;
  points: ReviewMetric<number>;
  target: ReviewMetric<number>;
  rate: ReviewMetric<number>;
  next: ReviewMetric<{ level: number; name: string; points: number }>;
};

export type ReviewSummaryCard = {
  icon: V2IconName;
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "brand" | "neutral";
};

export function ReviewLayout({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <TwoColumn
      className="min-h-full gap-0"
      mainClassName="min-w-0 px-7 py-6"
      rightRailClassName="border-l border-[var(--v2-line)] px-6 py-6"
      rightRail={rail}
      main={main}
    />
  );
}

export function ReviewPeriodHeader({
  title,
  start,
  end,
  onPeriodClick,
}: {
  title: ReactNode;
  start: ReactNode;
  end?: ReactNode;
  onPeriodClick?: () => void;
}) {
  return (
    <header>
      <h1 className={v2Type.pageTitle}>{title}</h1>
      <Button
        aria-label="Choose review period"
        className={cn(
          v2Type.body,
          "mt-3 h-auto rounded-lg px-0 py-0 font-medium hover:bg-transparent hover:text-[color:var(--v2-ink)]",
          v2FocusRing,
        )}
        onClick={onPeriodClick}
        type="button"
        variant="ghost"
      >
        <V2Icon name="cal" size={15} className="text-[color:var(--v2-ink3)]" />
        <span>{start}</span>
        {end ? (
          <>
            <span aria-hidden="true" className="text-[color:var(--v2-ink4)]">
              –
            </span>
            <span>{end}</span>
          </>
        ) : null}
        <V2Icon name="cdown" size={13} className="text-[color:var(--v2-ink3)]" />
      </Button>
    </header>
  );
}

export function ReviewSummaryCards({
  cards,
  align = "center",
  iconSize = "large",
}: {
  cards: readonly ReviewSummaryCard[];
  align?: "center" | "start";
  iconSize?: "small" | "large";
}) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <Panel
          className={cn(
            "flex min-w-0 gap-3 px-4 py-3.5",
            align === "start" ? "items-start" : "items-center",
          )}
          key={card.label}
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-full",
              iconSize === "small" ? "h-[30px] w-[30px]" : "h-[34px] w-[34px]",
              card.tone === "neutral"
                ? "bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]"
                : "bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]",
            )}
          >
            <V2Icon name={card.icon} size={iconSize === "small" ? 16 : 17} />
          </span>
          <div className="min-w-0">
            <div className={v2Type.meta}>{card.label}</div>
            <div className={cn(v2Type.bodyStrong, "mt-0.5")}>{card.value}</div>
            {card.caption ? <div className={cn(v2Type.meta, "mt-0.5")}>{card.caption}</div> : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function ReviewFormPanel({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Panel className="mt-5 px-6 py-5">
      <h2 className={v2Type.sectionTitle}>{title}</h2>
      {description ? <p className={cn(v2Type.meta, "mt-1")}>{description}</p> : null}
      <div className="mt-4">{children}</div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </Panel>
  );
}

function valueOrState<T>(value: ReviewMetric<T>, format: (item: T) => ReactNode = String) {
  return value.kind === "measured" ? format(value.value) : <NotMeasured />;
}

export function NotMeasured() {
  return (
    <span className={cn(v2Type.meta, "inline-flex items-center gap-1.5 font-semibold")}>
      <V2Icon name="clock" size={14} />
      <span>Not measured</span>
    </span>
  );
}

export function BrandProgressRail({
  progress,
  contained = false,
}: {
  progress: ReviewProgressData;
  contained?: boolean;
}) {
  const content = (
    <>
      <h2 className={v2Type.sectionTitle}>Private brand progress</h2>
      <div className="mt-3 flex items-center gap-3">
        <div className="grid h-[52px] w-[52px] shrink-0 place-items-center bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)] [clip-path:polygon(50%_0%,92%_25%,92%_75%,50%_100%,8%_75%,8%_25%)]">
          <span className="relative grid place-items-center">
            <V2Icon name="star" size={19} />
            {progress.level.kind === "measured" ? (
              <span className={cn(v2Type.caps, "absolute !text-[9px] normal-case")}>
                {progress.level.value}
              </span>
            ) : null}
          </span>
        </div>
        <div className="min-w-0">
          <p className={v2Type.cardTitle}>
            {valueOrState(progress.level, (level) => (
              <>
                Level {level} · {valueOrState(progress.name)}
              </>
            ))}
          </p>
          <p className={cn(v2Type.meta, "mt-0.5")}>
            {valueOrState(progress.points)} work points total
          </p>
        </div>
      </div>
      <div
        className="mt-4 h-[7px] overflow-hidden rounded-full bg-[var(--v2-line)]"
        role="progressbar"
        aria-label="Progress to next level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.rate.kind === "measured" ? progress.rate.value : undefined}
      >
        <div
          className="h-full rounded-full bg-[var(--v2-brand)]"
          style={{
            width: `${progress.rate.kind === "measured" ? Math.min(100, Math.max(0, progress.rate.value)) : 0}%`,
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className={v2Type.num}>
          {valueOrState(progress.points)} / {valueOrState(progress.target)} points
        </span>
        <span className={v2Type.num}>{valueOrState(progress.rate, (rate) => `${rate}%`)}</span>
      </div>
      <p className={cn(v2Type.meta, "mt-1.5")}>
        {valueOrState(
          progress.next,
          (next) =>
            `Next: Level ${next.level} ${next.name} · ${next.points} points and a results review`,
        )}
      </p>
    </>
  );

  return contained ? (
    <Panel className="px-4 py-3.5">{content}</Panel>
  ) : (
    <section>{content}</section>
  );
}
