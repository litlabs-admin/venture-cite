import { Button } from "@/components/ui/button";
import type { V2IconName } from "@/v2/contracts/icons";
import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { ProgressBar } from "@/v2/shared/ui/ProgressBar";
import { SectionHeading } from "@/v2/shared/ui/SectionHeading";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type Board14Measured<T> = { kind: "measured"; value: T };
export type Board14Unavailable = { kind: "not-measured"; reason: string };
export type Board14Value<T> = Board14Measured<T> | Board14Unavailable;

export type Board14Lesson = {
  id: string;
  title: string;
  description: string;
  durationMinutes: Board14Value<number>;
  state: "completed" | "not-started";
  prerequisite: string | null;
  icon: V2IconName;
};

export type Board14Data = {
  context: { brandId: string; mode: V2Mode };
  title: string;
  subtitle: string;
  banner: { label: string; text: string; progressLabel: string };
  nextLesson: Board14Value<{
    id: string;
    title: string;
    durationMinutes: Board14Value<number>;
    description: string;
    goals: readonly string[];
    actionLabel: string;
    rationaleLabel: string;
    icon: V2IconName;
  }>;
  lessons: Board14Value<readonly Board14Lesson[]>;
  learning: {
    level: Board14Value<number>;
    stage: Board14Value<string>;
    points: Board14Value<number>;
    nextLevelPoints: Board14Value<number>;
    progressRate: Board14Value<number>;
    completedLessons: Board14Value<number>;
    totalLessons: Board14Value<number>;
    minutesSpent: Board14Value<number>;
  };
  recommendedLesson: Board14Value<{
    id: string;
    title: string;
    description: string;
    durationMinutes: Board14Value<number>;
  }>;
  visibilityNote: { title: string; text: string };
  help: { title: string; text: string; linkLabel: string };
};

type Board14Props = V2ScreenProps<Board14Data>;

function isMeasured<T>(value: Board14Value<T>): value is Board14Measured<T> {
  return value.kind === "measured";
}

function scopedHref(context: Board14Data["context"], path: string): string {
  const search = new URLSearchParams({ brandId: context.brandId, mode: context.mode });
  return `${path}?${search.toString()}`;
}

function Availability({ className = "" }: { className?: string }) {
  return <StateLabel state="not-measured" className={className} />;
}

function ValueText<T>({
  value,
  format,
  className = v2Type.body,
}: {
  value: Board14Value<T>;
  format: (value: T) => string;
  className?: string;
}) {
  if (!isMeasured(value)) return <Availability />;
  return <span className={className}>{format(value.value)}</span>;
}

function HexBadge({ size }: { size: "banner" | "rail" }) {
  const dimension = size === "banner" ? 46 : 52;
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 text-[color:var(--v2-brand)]"
      fill="none"
      height={dimension}
      viewBox="0 0 52 52"
      width={dimension}
    >
      <path
        d="M26 3.4 45.1 14.4v22.2L26 47.6 6.9 36.6V14.4z"
        stroke="var(--v2-highlight)"
        strokeWidth="1.6"
      />
      <path
        d="m26 9.6 13.7 7.9v15.9L26 41.3l-13.7-7.9V17.5z"
        stroke="var(--v2-highlight)"
        strokeWidth="1.3"
      />
      <path
        d="m26 18.4 2.35 4.76 5.25.77-3.8 3.7.9 5.23L26 30.39l-4.7 2.47.9-5.23-3.8-3.7 5.25-.77z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function LessonIcon({ name }: { name: V2IconName }) {
  return <V2Icon name={name} size={28} className="mt-0.5 shrink-0 text-[color:var(--v2-brand)]" />;
}

function LessonDuration({ value }: { value: Board14Value<number> }) {
  if (!isMeasured(value)) return <Availability className="mt-1" />;
  return (
    <span
      className={`${v2Type.meta} inline-flex w-[82px] shrink-0 items-center justify-center rounded-full border border-[var(--v2-highlight)] bg-[var(--v2-paper)] px-2.5 py-1 font-medium tabular-nums text-[color:var(--v2-brand)]`}
    >
      {value.value} minutes
    </span>
  );
}

function LessonStatus({ lesson }: { lesson: Board14Lesson }) {
  if (lesson.state === "completed") {
    return (
      <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[color:var(--v2-ok)]">
        <V2Icon name="check" size={17} />
        <span>Completed</span>
      </span>
    );
  }

  return (
    <div className="w-[152px] shrink-0">
      <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[color:var(--v2-ink2)]">
        <span className="h-[17px] w-[17px] rounded-full border-[1.5px] border-[var(--v2-ink2)]" />
        <span>Not started</span>
      </span>
      {lesson.prerequisite ? (
        <span className={`${v2Type.mono} mt-1 block pl-6 text-[11.5px]`}>
          {lesson.prerequisite}
        </span>
      ) : null}
    </div>
  );
}

function NextLesson({ data }: { data: Board14Data }) {
  if (!isMeasured(data.nextLesson)) {
    return (
      <div data-testid="board14-next-lesson" className="py-3">
        <Availability />
      </div>
    );
  }

  const lesson = data.nextLesson.value;
  return (
    <div data-testid="board14-next-lesson" className="flex items-start gap-4 pb-2">
      <LessonIcon name={lesson.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h3 className={v2Type.cardTitle}>{lesson.title}</h3>
          <LessonDuration value={lesson.durationMinutes} />
        </div>
        <p className={`${v2Type.body} mt-1 max-w-[60ch]`}>{lesson.description}</p>
        <h4 className={`${v2Type.label} mt-2`}>Learning goals</h4>
        <div className="mt-0.5 space-y-0.5">
          {lesson.goals.map((goal) => (
            <div key={goal} className={`${v2Type.body} flex items-center gap-2`}>
              <V2Icon name="check" size={17} className="shrink-0 text-[color:var(--v2-brand)]" />
              <span>{goal}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-6">
          <Button
            asChild
            className="h-10 rounded-lg px-4 text-[13.5px]"
            data-testid="board14-start-lesson"
          >
            <a href={scopedHref(data.context, `/v2/learn/lesson/${lesson.id}`)}>
              {lesson.actionLabel}
            </a>
          </Button>
          <a
            className="text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
            href={scopedHref(data.context, `/v2/learn/lesson/${lesson.id}/why`)}
          >
            {lesson.rationaleLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

function LessonPath({ data }: { data: Board14Data }) {
  if (!isMeasured(data.lessons))
    return (
      <div data-testid="board14-lessons" className="py-3">
        <Availability />
      </div>
    );

  return (
    <div data-testid="board14-lessons">
      {data.lessons.value.map((lesson) => {
        const row = (
          <div
            className="flex items-start gap-4 border-t border-[var(--v2-line)] px-0.5 py-1"
            data-testid="board14-lesson-row"
          >
            <LessonIcon name={lesson.icon} />
            <div className="min-w-0 flex-1">
              <div className={v2Type.bodyStrong}>{lesson.title}</div>
              <div className={`${v2Type.meta} leading-[1.4]`}>{lesson.description}</div>
            </div>
            <LessonDuration value={lesson.durationMinutes} />
            <LessonStatus lesson={lesson} />
          </div>
        );

        if (lesson.state === "completed") {
          return (
            <a
              key={lesson.id}
              className="block rounded-[var(--v2-radius)] hover:bg-[var(--v2-inset)]"
              href={scopedHref(data.context, `/v2/learn/lesson/${lesson.id}/review`)}
            >
              {row}
            </a>
          );
        }
        return <div key={lesson.id}>{row}</div>;
      })}
    </div>
  );
}

function ProgressStat<T>({
  icon,
  label,
  value,
  format,
}: {
  icon: V2IconName;
  label: string;
  value: Board14Value<T>;
  format?: (value: T) => string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <V2Icon name={icon} size={19} className="shrink-0 text-[color:var(--v2-ink)]" />
      <span className={`${v2Type.body} flex-1`}>{label}</span>
      <ValueText
        className={`${v2Type.body} font-medium tabular-nums text-[color:var(--v2-ink)]`}
        format={format ?? ((item) => String(item))}
        value={value}
      />
    </div>
  );
}

function RecommendedLesson({ data }: { data: Board14Data }) {
  if (!isMeasured(data.recommendedLesson)) return <Availability />;
  const lesson = data.recommendedLesson.value;
  return (
    <div className="flex items-start gap-3.5">
      <V2Icon name="q" size={28} className="mt-0.5 shrink-0 text-[color:var(--v2-brand)]" />
      <div className="min-w-0">
        <h3 className={v2Type.bodyStrong}>{lesson.title}</h3>
        <p className={`${v2Type.meta} mt-1.5 leading-[1.6]`}>{lesson.description}</p>
        <LessonDuration value={lesson.durationMinutes} />
        <LinkWithArrow
          className="mt-3"
          href={scopedHref(data.context, `/v2/learn/lesson/${lesson.id}`)}
        >
          Start next lesson
        </LinkWithArrow>
      </div>
    </div>
  );
}

type ProgressReadyLearning = Board14Data["learning"] & {
  level: Board14Measured<number>;
  stage: Board14Measured<string>;
  points: Board14Measured<number>;
  nextLevelPoints: Board14Measured<number>;
  progressRate: Board14Measured<number>;
};

function isProgressReady(learning: Board14Data["learning"]): learning is ProgressReadyLearning {
  return (
    isMeasured(learning.level) &&
    isMeasured(learning.stage) &&
    isMeasured(learning.points) &&
    isMeasured(learning.nextLevelPoints) &&
    isMeasured(learning.progressRate)
  );
}

function ProgressRail({ data }: { data: Board14Data }) {
  const { learning } = data;

  return (
    <aside
      aria-label="Learning progress"
      className="w-full shrink-0 border-t border-[var(--v2-line)] px-8 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6"
      data-testid="board14-progress-rail"
      data-v2-region="aside"
    >
      <h2 className={v2Type.sectionTitle}>Your learning progress</h2>
      {isProgressReady(learning) ? (
        <div className="mt-4 flex items-center gap-3.5">
          <HexBadge size="rail" />
          <div>
            <div className={`${v2Type.cardTitle} text-[18px]`}>
              Level {learning.level.value} · {learning.stage.value}
            </div>
            <div className={`${v2Type.body} mt-0.5`}>
              <span className={v2Type.num}>
                {learning.points.value} / {learning.nextLevelPoints.value}
              </span>{" "}
              learning points
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Availability />
        </div>
      )}

      {isProgressReady(learning) ? (
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar
            className="flex-1"
            showValue={false}
            value={learning.progressRate.value * 100}
          />
          <span className={`${v2Type.num} text-[14px] text-[color:var(--v2-ink2)]`}>
            {Math.round(learning.progressRate.value * 100)}%
          </span>
        </div>
      ) : null}

      <div className="mt-4 space-y-0.5">
        <ProgressStat
          icon="learn"
          label="Lessons completed"
          value={learning.completedLessons}
          format={(value) =>
            `${value} of ${learning.totalLessons.kind === "measured" ? learning.totalLessons.value : "—"}`
          }
        />
        <ProgressStat icon="star" label="Learning points earned" value={learning.points} />
        <ProgressStat
          icon="clock"
          label="Time spent learning"
          value={learning.minutesSpent}
          format={(value) => `${value} minutes`}
        />
      </div>

      <div className="my-5 h-px bg-[var(--v2-line)]" />
      <SectionHeading className="text-[15px]" data-testid="board14-recommended-heading">
        Recommended next lesson
      </SectionHeading>
      <div className="mt-4" data-testid="board14-recommendation">
        <RecommendedLesson data={data} />
      </div>

      <InfoNote className="mt-5 border-transparent bg-[var(--v2-brand-soft)] px-3.5 py-3.5">
        <strong className={`${v2Type.bodyStrong} mb-1.5 block`}>{data.visibilityNote.title}</strong>
        <p className={v2Type.body}>{data.visibilityNote.text}</p>
      </InfoNote>

      <div className="my-5 h-px bg-[var(--v2-line)]" />
      <section>
        <h2 className={v2Type.sectionTitle}>{data.help.title}</h2>
        <p className={`${v2Type.body} mt-2 mb-3`}>{data.help.text}</p>
        <a
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
          href="/help"
        >
          {data.help.linkLabel}
          <V2Icon name="arrow" size={14} />
        </a>
      </section>
    </aside>
  );
}

export function Board14Screen({ data, staleAsOf }: Board14Props) {
  return (
    <div
      className="v2-mono flex min-h-full min-w-0 flex-col bg-[var(--v2-paper)] text-[color:var(--v2-ink)]"
      data-testid="board14-screen"
    >
      <div className="flex min-h-full min-w-0 flex-col lg:flex-row">
        <main className="min-w-0 flex-1 px-8 py-6" data-v2-region="main">
          <PageHeader sub={data.subtitle} title={data.title} />
          {staleAsOf ? (
            <div className="mt-3" data-testid="board14-stale">
              <StateLabel state="stale" /> <span className={v2Type.meta}>As of {staleAsOf}.</span>
            </div>
          ) : null}

          <section className="mt-5 flex items-center gap-4 rounded-[var(--v2-radius-panel)] bg-[var(--v2-brand-soft)] px-[18px] py-[9px]">
            <HexBadge size="banner" />
            <div className="min-w-0 flex-1">
              <div className={`${v2Type.bodyStrong} text-[15px]`}>{data.banner.label}</div>
              <div className={`${v2Type.meta} mt-0.5`}>{data.banner.text}</div>
            </div>
            <LinkWithArrow href={scopedHref(data.context, "/v2/today")}>
              {data.banner.progressLabel}
            </LinkWithArrow>
          </section>

          <SectionHeading className="mt-5 text-[17px]" data-testid="board14-next-heading">
            Your next lesson
          </SectionHeading>
          <div className="mt-2">
            <NextLesson data={data} />
          </div>
          <SectionHeading
            className="mt-5 border-t border-[var(--v2-line)] pt-3"
            data-testid="board14-path-heading"
          >
            All lessons in your path
          </SectionHeading>
          <div className="mt-1">
            <LessonPath data={data} />
          </div>
        </main>
        <ProgressRail data={data} />
      </div>
    </div>
  );
}
