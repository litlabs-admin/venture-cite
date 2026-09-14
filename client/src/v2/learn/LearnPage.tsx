import { useSearch } from "@tanstack/react-router";
import { Board14Route } from "@/v2/screens/b14-learn/Route";
import { isV2LessonId } from "@shared/v2Lessons";
import { LessonReader } from "./LessonReader";

// Learn - `/v2/learn`.
//
// The dotted route filename (src/routes/_app/v2.learn.tsx) resolves to the
// nested path "/_app/v2/learn"; the parent (v2.tsx) already carries the gate
// and the search schema, and neither is repeated here.
//
// Two things share this one route, switched on the `lesson` search param:
//   - no `lesson` (or an id this catalog doesn't recognize): the board 14
//     overview - your next lesson, the full path, and real learning
//     progress (client/src/v2/screens/b14-learn/).
//   - `?lesson=<id>` naming one of shared/v2Lessons.ts's six lessons: the
//     lesson reader (LessonReader.tsx).
//
// This is a within-page view switch, not a new route: LIVE-RULES fixes the
// canonical `/v2/*` paths this tree may link to, and `/v2/learn` is the one
// this tree owns. v2SearchSchema (src/routes/-shared/searchSchemas.ts)
// declares its object `.passthrough()`, so the extra `lesson` key survives
// parsing without that shared, foundation-owned file needing to know Learn
// added it.
export default function LearnPage() {
  const search = useSearch({ strict: false });
  const lessonParam = (search as Record<string, unknown>).lesson;
  const lessonId =
    typeof lessonParam === "string" && isV2LessonId(lessonParam) ? lessonParam : null;

  if (lessonId) return <LessonReader lessonId={lessonId} />;
  return <Board14Route />;
}
