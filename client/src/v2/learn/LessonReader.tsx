import { useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useCompleteLesson, useLearnProgress } from "@/v2/data/learnProgress";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import {
  V2_LESSONS,
  getNextV2LessonId,
  getV2Lesson,
  getV2LessonIndex,
  type V2LessonId,
} from "@shared/v2Lessons";

// The lesson reader: `/v2/learn?lesson=<id>`, mounted by LearnPage.tsx
// whenever that search param names a real lesson. Not a separate route -
// LIVE-RULES fixes the canonical `/v2/*` paths, and this view is reached by
// adding a search param to the one Learn already has, exactly as the brief
// for this tree specifies.

function scopedHref(brandId: string, mode: string, path: string, extra?: Record<string, string>) {
  const search = new URLSearchParams({ brandId, mode, ...extra });
  return `${path}?${search.toString()}`;
}

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

function LoadingReader() {
  return (
    <div
      data-testid="v2-lesson-loading"
      role="status"
      aria-busy="true"
      className="min-w-0 flex-1 px-8 py-6"
    >
      <span className="sr-only">Loading lesson</span>
      <Bar className="h-4 w-40" />
      <Bar className="mt-4 h-7 w-96" />
      <Bar className="mt-6 h-32 w-full" />
    </div>
  );
}

export function LessonReader({ lessonId }: { lessonId: V2LessonId }) {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const search = useSearch({ strict: false });
  const mode = (search as Record<string, unknown>).mode === "expert" ? "expert" : "guided";
  const progress = useLearnProgress();
  const completeLesson = useCompleteLesson();

  // Non-null by construction: `lessonId` is typed V2LessonId, and every
  // V2LessonId is a key of shared/v2Lessons.ts's V2_LESSONS - LearnPage.tsx
  // only ever constructs this component with an id `isV2LessonId` already
  // accepted, so `getV2Lesson` cannot miss here.
  const lesson = getV2Lesson(lessonId)!;
  const index = getV2LessonIndex(lessonId);
  const nextId = getNextV2LessonId(lessonId);

  if (brandsLoading || progress.isPending) return <LoadingReader />;

  const brandId = selectedBrandId || "";
  const isCompleted = progress.data?.completions.some((c) => c.lessonId === lessonId) ?? false;

  return (
    <div data-testid="v2-lesson-reader" className="min-w-0 flex-1 px-8 py-6">
      <a
        href={scopedHref(brandId, mode, "/v2/learn")}
        className="inline-flex items-center gap-1 text-caption text-vc-secondary hover:text-vc-primary"
        data-testid="v2-lesson-back"
      >
        <V2Icon name="arrow" size={12} className="rotate-180" />
        All lessons
      </a>

      <p className={`${v2Type.meta} mt-4`}>
        Lesson {index + 1} of {V2_LESSONS.length}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-metric font-semibold leading-tight text-vc-primary">{lesson.title}</h1>
        <span
          className={`${v2Type.meta} inline-flex items-center rounded-full border border-[var(--v2-highlight)] px-2.5 py-1 font-medium tabular-nums text-[color:var(--v2-brand)]`}
        >
          {lesson.durationMinutes} minutes
        </span>
        {isCompleted ? (
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[color:var(--v2-ok)]"
            data-testid="v2-lesson-completed-badge"
          >
            <V2Icon name="check" size={16} />
            Completed
          </span>
        ) : null}
      </div>
      <p className="mt-2 max-w-2xl text-body text-vc-secondary">{lesson.description}</p>

      <section id="why" className="mt-6 max-w-2xl" data-testid="v2-lesson-why">
        <h2 className={v2Type.sectionTitle}>Why this lesson</h2>
        <div className="mt-2 space-y-1">
          {lesson.goals.map((goal) => (
            <div key={goal} className={`${v2Type.body} flex items-start gap-2 text-vc-secondary`}>
              <V2Icon
                name="check"
                size={16}
                className="mt-0.5 shrink-0 text-[color:var(--v2-brand)]"
              />
              <span>{goal}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 max-w-2xl space-y-6" data-testid="v2-lesson-sections">
        {lesson.sections.map((section) => (
          <section key={section.heading}>
            <h2 className={v2Type.sectionTitle}>{section.heading}</h2>
            <div className="mt-2 space-y-2">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-body text-vc-secondary">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-vc-default pt-5">
        {isCompleted ? (
          <span className={`${v2Type.body} font-medium text-[color:var(--v2-ok)]`}>
            You&apos;ve marked this lesson complete.
          </span>
        ) : (
          <Button
            size="sm"
            data-testid="v2-lesson-mark-complete"
            disabled={completeLesson.isPending}
            onClick={() => completeLesson.mutate({ lessonId, brandId: selectedBrandId || null })}
          >
            {completeLesson.isPending ? "Marking complete…" : "Mark complete"}
          </Button>
        )}
        {completeLesson.isError ? (
          <span className="text-caption text-[color:var(--v2-bad)]" role="alert">
            Couldn&apos;t save completion. Try again.
          </span>
        ) : null}

        {nextId ? (
          <a
            href={scopedHref(brandId, mode, "/v2/learn", { lesson: nextId })}
            className="ml-auto inline-flex items-center gap-1.5 text-body font-semibold text-vc-accent hover:underline"
            data-testid="v2-lesson-next"
          >
            Next: {getV2Lesson(nextId)?.title}
            <V2Icon name="arrow" size={14} />
          </a>
        ) : (
          <a
            href={scopedHref(brandId, mode, "/v2/learn")}
            className="ml-auto inline-flex items-center gap-1.5 text-body font-semibold text-vc-accent hover:underline"
            data-testid="v2-lesson-finish"
          >
            Back to your learning path
            <V2Icon name="arrow" size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
