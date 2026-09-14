/**
 * Human labels for the milestone keys `/work/summary` reports in
 * `milestones`. `server/domains/work/policy.ts` owns the canonical pairing;
 * this is a small, deliberately duplicated copy on the display side, the
 * same tradeoff `client/src/v2/today/ProgressRail.tsx`'s `LEVEL_REQUIREMENT`
 * already makes - a policy change is a one-line change here too.
 */
export const MILESTONE_LABELS: Readonly<Record<string, string>> = {
  goal_selected_and_queue_reviewed: "Goal chosen and queue reviewed",
  baseline_ready: "Measurement baseline recorded",
  evidenced_changes_complete: "Evidenced changes verified",
  decision_recorded: "A decision recorded from results",
  multi_period_maintenance: "Work kept going across periods",
};

export function milestoneLabel(key: string): string {
  return MILESTONE_LABELS[key] ?? key;
}
