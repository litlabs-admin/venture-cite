import { V2_LESSONS, V2_TOTAL_LESSON_POINTS } from "@shared/v2Lessons";
import type { Board14Data, Board14Lesson } from "./Screen";

// Preview fixture: the same six real lessons the live adapter (data.ts)
// serves, with the first two marked completed so the gallery render shows
// both lesson states at once. Not sample/invented lessons - shared/
// v2Lessons.ts is the one source of lesson content for both the live screen
// and this preview.

const COMPLETED_IDS = new Set(["ai-answer-visibility", "citations-and-source-trust"]);

const lessons: Board14Lesson[] = V2_LESSONS.map((lesson, index) => {
  const completed = COMPLETED_IDS.has(lesson.id);
  const previous = index > 0 ? V2_LESSONS[index - 1] : null;
  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    durationMinutes: lesson.durationMinutes,
    points: lesson.points,
    icon: lesson.icon,
    state: completed ? "completed" : "not-started",
    completedAt: completed ? "2026-09-10T12:00:00.000Z" : null,
    prerequisite: !completed && previous ? `After ${previous.title}` : null,
  };
});

const completedLessons = lessons.filter((lesson) => lesson.state === "completed");
const nextSource = V2_LESSONS.find((lesson) =>
  lessons.some((row) => row.id === lesson.id && row.state === "not-started"),
)!;
const earnedPoints = completedLessons.reduce((total, lesson) => total + lesson.points, 0);
const minutesSpent = completedLessons.reduce((total, lesson) => total + lesson.durationMinutes, 0);

export const board14Fixture: Board14Data = {
  context: { brandId: "brand-venture-pr", mode: "guided" },
  title: "Learn what improves AI visibility",
  subtitle: "A personalized learning path for your current stage",
  banner: {
    label: "Real work level: Improve (Level 3)",
    text: "That's your work level, not your progress through this course - see how it's calculated on Today.",
    progressLabel: "See your progress",
  },
  nextLesson: {
    id: nextSource.id,
    title: nextSource.title,
    durationMinutes: nextSource.durationMinutes,
    description: nextSource.description,
    goals: nextSource.goals,
    actionLabel: "Start lesson",
    rationaleLabel: "Why this lesson?",
    icon: nextSource.icon,
  },
  lessons,
  learning: {
    level: completedLessons.length + 1,
    stage: "Source literacy",
    points: earnedPoints,
    totalPoints: V2_TOTAL_LESSON_POINTS,
    progressRate: earnedPoints / V2_TOTAL_LESSON_POINTS,
    completedLessons: completedLessons.length,
    totalLessons: V2_LESSONS.length,
    minutesSpent,
  },
  recommendedLesson: {
    id: nextSource.id,
    title: nextSource.title,
    description: nextSource.description,
    durationMinutes: nextSource.durationMinutes,
  },
  visibilityNote: {
    title: "Learning points do not measure visibility.",
    text: "Learning points track your progress through this course. They are separate from work points and do not affect your brand's visibility measurements.",
  },
  help: {
    title: "Need help?",
    text: "Every lesson in this path is listed below, with what's completed and what's next.",
    linkLabel: "Open help center",
  },
};
