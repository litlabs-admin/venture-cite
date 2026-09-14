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

// Board 14, live. Every field below is a real value once the screen reaches
// "ready": the six lessons are static content (shared/v2Lessons.ts) and
// completion comes from server/routes/v2Learn.ts, so - unlike boards whose
// metrics can independently fail to exist - there is no per-field "not
// measured" case left once the whole-screen state (Route.tsx, driven by
// data.ts's V2LiveResult) is itself ready. `nextLesson` and
// `recommendedLesson` are the one place a value can still be genuinely
// absent: once every lesson is complete, there is no next lesson to
// recommend, and that is a fact worth stating plainly rather than routing
// through a generic "not measured" badge that would misreport a finished
// course as an unmeasured one.

export type Board14Lesson = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  points: number;
  icon: V2IconName;
  state: "completed" | "not-started";
  completedAt: string | null;
  prerequisite: string | null;
};

export type Board14NextLesson = {
  id: string;
  title: string;
  durationMinutes: number;
  description: string;
  goals: readonly string[];
  actionLabel: string;
  rationaleLabel: string;
  icon: V2IconName;
};

export type Board14RecommendedLesson = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
};

export type Board14Learning = {
  level: number;
  stage: string;
  points: number;
  totalPoints: number;
  /** 0..1: `points / totalPoints`. */
  progressRate: number;
  completedLessons: number;
  totalLessons: number;
  minutesSpent: number;
};

export type Board14Data = {
  context: { brandId: string; mode: V2Mode };
  title: string;
  subtitle: string;
  banner: { label: string; text: string; progressLabel: string };
  /** `null` once every lesson is complete - there is no next lesson. */
  nextLesson: Board14NextLesson | null;
  lessons: readonly Board14Lesson[];
  learning: Board14Learning;
  /** `null` once every lesson is complete. */
  recommendedLesson: Board14RecommendedLesson | null;
  visibilityNote: { title: string; text: string };
  help: { title: string; text: string; linkLabel: string };
};

type Board14Props = V2ScreenProps<Board14Data>;

function scopedHref(context: Board14Data["context"], path: string): string {
  const search = new URLSearchParams({ brandId: context.brandId, mode: context.mode });
  return `${path}?${search.toString()}`;
}

function lessonHref(context: Board14Data["context"], lessonId: string, anchor?: string): string {
  const search = new URLSearchParams({
    brandId: context.brandId,
    mode: context.mode,
    lesson: lessonId,
  });
  return `/v2/learn?${search.toString()}${anchor ? `#${anchor}` : ""}`;
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

function LessonDuration({ minutes }: { minutes: number }) {
  return (
    <span
      className={`${v2Type.meta} inline-flex w-[82px] shrink-0 items-center justify-center rounded-full border border-[var(--v2-highlight)] bg-[var(--v2-paper)] px-2.5 py-1 font-medium tabular-nums text-[color:var(--v2-brand)]`}
    >
      {minutes} minutes
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

/** The card in place of "Your next lesson" once there is none - every
 *  lesson in the path is complete. States the fact plainly instead of
 *  reusing a generic unavailable badge that would read as "not measured". */
function AllLessonsComplete() {
  return (
    <div data-testid="board14-next-lesson-complete" className="flex items-start gap-3 py-3">
      <V2Icon name="check" size={24} className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
      <p className={v2Type.body}>
        You have completed every lesson in this path. Revisit any lesson from the list below.
      </p>
    </div>
  );
}

function NextLesson({ data }: { data: Board14Data }) {
  if (!data.nextLesson) {
    return (
      <div data-testid="board14-next-lesson">
        <AllLessonsComplete />
      </div>
    );
  }

  const lesson = data.nextLesson;
  return (
    <div data-testid="board14-next-lesson" className="flex items-start gap-4 pb-2">
      <LessonIcon name={lesson.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h3 className={v2Type.cardTitle}>{lesson.title}</h3>
          <LessonDuration minutes={lesson.durationMinutes} />
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
            <a href={lessonHref(data.context, lesson.id)}>{lesson.actionLabel}</a>
          </Button>
          <a
            className="text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
            href={lessonHref(data.context, lesson.id, "why")}
            data-testid="board14-why-lesson"
          >
            {lesson.rationaleLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

function LessonPath({ data }: { data: Board14Data }) {
  return (
    <div data-testid="board14-lessons">
      {data.lessons.map((lesson) => (
        <a
          key={lesson.id}
          className="block rounded-[var(--v2-radius)] hover:bg-[var(--v2-inset)]"
          href={lessonHref(data.context, lesson.id)}
        >
          <div
            className="flex items-start gap-4 border-t border-[var(--v2-line)] px-0.5 py-1"
            data-testid="board14-lesson-row"
          >
            <LessonIcon name={lesson.icon} />
            <div className="min-w-0 flex-1">
              <div className={v2Type.bodyStrong}>{lesson.title}</div>
              <div className={`${v2Type.meta} leading-[1.4]`}>{lesson.description}</div>
            </div>
            <LessonDuration minutes={lesson.durationMinutes} />
            <LessonStatus lesson={lesson} />
          </div>
        </a>
      ))}
    </div>
  );
}

function ProgressStat({ icon, label, value }: { icon: V2IconName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <V2Icon name={icon} size={19} className="shrink-0 text-[color:var(--v2-ink)]" />
      <span className={`${v2Type.body} flex-1`}>{label}</span>
      <span className={`${v2Type.body} font-medium tabular-nums text-[color:var(--v2-ink)]`}>
        {value}
      </span>
    </div>
  );
}

function RecommendedLesson({ data }: { data: Board14Data }) {
  if (!data.recommendedLesson) {
    return (
      <p className={v2Type.body} data-testid="board14-recommendation-complete">
        No lesson to recommend - every lesson in the path is complete.
      </p>
    );
  }
  const lesson = data.recommendedLesson;
  return (
    <div className="flex items-start gap-3.5">
      <V2Icon name="q" size={28} className="mt-0.5 shrink-0 text-[color:var(--v2-brand)]" />
      <div className="min-w-0">
        <h3 className={v2Type.bodyStrong}>{lesson.title}</h3>
        <p className={`${v2Type.meta} mt-1.5 leading-[1.6]`}>{lesson.description}</p>
        <LessonDuration minutes={lesson.durationMinutes} />
        <LinkWithArrow className="mt-3" href={lessonHref(data.context, lesson.id)}>
          Start next lesson
        </LinkWithArrow>
      </div>
    </div>
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
      <div className="mt-4 flex items-center gap-3.5">
        <HexBadge size="rail" />
        <div>
          <div className={`${v2Type.cardTitle} text-[18px]`}>
            Level {learning.level} · {learning.stage}
          </div>
          <div className={`${v2Type.body} mt-0.5`}>
            <span className={v2Type.num}>
              {learning.points} / {learning.totalPoints}
            </span>{" "}
            learning points
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <ProgressBar className="flex-1" showValue={false} value={learning.progressRate * 100} />
        <span className={`${v2Type.num} text-[14px] text-[color:var(--v2-ink2)]`}>
          {Math.round(learning.progressRate * 100)}%
        </span>
      </div>

      <div className="mt-4 space-y-0.5">
        <ProgressStat
          icon="learn"
          label="Lessons completed"
          value={`${learning.completedLessons} of ${learning.totalLessons}`}
        />
        <ProgressStat icon="star" label="Learning points earned" value={String(learning.points)} />
        <ProgressStat
          icon="clock"
          label="Time spent learning"
          value={`${learning.minutesSpent} minutes`}
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
          href={scopedHref(data.context, "/v2/learn")}
          data-testid="board14-help-link"
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
