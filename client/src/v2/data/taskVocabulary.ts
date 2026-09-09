import {
  BarChart3,
  BookOpen,
  FileText,
  FlaskConical,
  Gauge,
  ListChecks,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import type { TaskType } from "@shared/work";

// The words and glyphs every v2 work screen uses for a task.
//
// Today and My work show the same tasks, so the trigger phrase, the icon and
// the effort wording live here once. Two screens that disagreed about what
// `repair_confirmed_access_or_factual_fault` is called would read as two
// different products.

export const TASK_ICONS: Readonly<Record<TaskType, LucideIcon>> = {
  approve_essential_brand_facts: FileText,
  approve_buyer_question_set: ListChecks,
  establish_measurement_baseline: Gauge,
  repair_confirmed_access_or_factual_fault: FileText,
  improve_page_for_buyer_need: BookOpen,
  complete_earned_media_or_community_work: Megaphone,
  review_results_and_record_decision: BarChart3,
  complete_visibility_experiment: FlaskConical,
};

/** What put this task in the queue. Only a confirmed fault is an alarm; the
 *  rest are neutral openings, and are toned that way rather than borrowing
 *  urgency they have not earned. */
export const TRIGGERS: Readonly<Record<TaskType, { label: string; alarming: boolean }>> = {
  approve_essential_brand_facts: { label: "Facts not approved yet", alarming: false },
  approve_buyer_question_set: { label: "Question set not approved", alarming: false },
  establish_measurement_baseline: { label: "No baseline recorded", alarming: false },
  repair_confirmed_access_or_factual_fault: { label: "Confirmed fact conflict", alarming: true },
  improve_page_for_buyer_need: { label: "Buyer need unanswered", alarming: false },
  complete_earned_media_or_community_work: { label: "Coverage gap", alarming: false },
  review_results_and_record_decision: { label: "Results ready to review", alarming: false },
  complete_visibility_experiment: { label: "Experiment ready to run", alarming: false },
};

/** `effort` is nullable minutes. An absent effort renders nothing at all -
 *  a guessed "About 15 minutes" would be an invented measurement. */
export function formatEffort(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `About ${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  return rest === 0 ? `About ${hourPart}` : `About ${hourPart} ${rest} minutes`;
}

/** The table column on the My work artboard is one line wide: "15 min". Same
 *  number as `formatEffort`, no rounding of its own, and still nothing at all
 *  when the effort is absent. */
export function formatEffortCompact(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
