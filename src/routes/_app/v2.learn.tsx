import { createFileRoute } from "@tanstack/react-router";
import LearnPage from "@/v2/learn/LearnPage";

// `/v2/learn`.
//
// The dotted filename resolves to the nested path, so the route id is
// "/_app/v2/learn" - the parent (`v2.tsx`) already carries the gate and the
// search schema, and neither is repeated here.
//
// LearnPage renders board 14's real overview (next lesson, full path, real
// learning progress) or, when `?lesson=<id>` names one of the six real
// lessons in shared/v2Lessons.ts, the lesson reader. See LearnPage.tsx.
export const Route = createFileRoute("/_app/v2/learn")({
  component: LearnPage,
  staticData: { v2Shell: "guided", v2Board: "b14" },
});
