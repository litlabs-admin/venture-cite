// Canonical names for every job the in-process scheduler registers via
// cronCrashGuard() inside server/scheduler.ts's initScheduler(). Declared
// here, in a dependency-free leaf module, rather than inline in
// scheduler.ts, for two reasons:
//
// 1. Single source of truth. Each cronCrashGuard(...) call in scheduler.ts
//    references one of these constants directly, so this registry cannot
//    drift from what actually gets registered the way a comment or a
//    separate string literal could.
// 2. Import cost. scheduler.ts pulls in the DB, Supabase, and Resend
//    clients at module scope. tests/unit/schedulerOrchestratorParity.test.ts
//    needs the real list of job names without paying that cost, so it
//    imports this module instead of scheduler.ts.
export const SCHEDULER_JOB_NAMES = {
  resumeInFlightAutopilots: "resume-in-flight-autopilots",
  contentCostOutboxDrain: "content-cost-outbox-drain",
  accountPurge: "account-purge",
  brandPurge: "brand-purge",
  tourEventsCleanup: "tour-events-cleanup",
  autoCitation: "auto-citation",
  brandActivation: "brand-activation",
  detectFactScrapeFailure: "detect-fact-scrape-failure",
  weeklyCatchupKickoff: "weekly-catchup-kickoff",
  weeklyReport: "weekly-report",
} as const;

export type SchedulerJobName = (typeof SCHEDULER_JOB_NAMES)[keyof typeof SCHEDULER_JOB_NAMES];
