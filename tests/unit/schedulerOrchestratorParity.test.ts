// Every job the in-process scheduler registers MUST also exist as a step in
// the daily orchestrator.
//
// DISABLE_IN_PROCESS_SCHEDULER (the documented Render shape) switches the
// node-cron scheduler off entirely and makes POST /api/cron/daily-orchestrator
// the only trigger for scheduled work. Any job registered ONLY in the
// scheduler then stops running - with no error, no failed step and no log
// line, because nothing is left to report it.
//
// That is exactly what happened to tour-events-cleanup (tour_events would
// grow without bound) and detect-fact-scrape-failure (alerting silently off).
// Both were scheduler-only. This test is the reason the next one gets caught.
//
// Deliberately a source-text check rather than a runtime one: importing
// server/scheduler.ts pulls in the DB, Supabase and Resend clients, and the
// invariant we care about is "is it registered", which is a fact about the
// source, not about a running process.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

/** Job names from `cronCrashGuard("name", fn)` inside initScheduler(). */
function schedulerJobs(): string[] {
  const src = read("server/scheduler.ts");
  const body = src.slice(src.indexOf("export function initScheduler"));
  return [...body.matchAll(/cronCrashGuard\(\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Step names from `orch.run("name", ...)` in the orchestrator. */
function orchestratorSteps(): string[] {
  return [...read("server/routes/cron.ts").matchAll(/orch\.run\(\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("scheduler ↔ orchestrator job parity", () => {
  it("finds jobs on both sides (guards the regexes themselves)", () => {
    // If a refactor changes the registration shape these regexes go quiet and
    // the parity assertion below would pass vacuously.
    expect(schedulerJobs().length).toBeGreaterThan(5);
    expect(orchestratorSteps().length).toBeGreaterThan(15);
  });

  it("registers every in-process cron job as an orchestrator step", () => {
    const steps = new Set(orchestratorSteps());
    // The legacy weekly report is the one intentional rename: the scheduler
    // calls it "weekly-report", the orchestrator "weekly-report-legacy".
    // Same function (runWeeklyReportJob), same debounce key.
    const alias: Record<string, string> = { "weekly-report": "weekly-report-legacy" };

    const orphaned = schedulerJobs().filter((j) => !steps.has(alias[j] ?? j));

    expect(
      orphaned,
      `scheduler-only jobs never run when DISABLE_IN_PROCESS_SCHEDULER is set`,
    ).toEqual([]);
  });

  it("gives every orchestrator step a budget cap", () => {
    // A step with no STEP_CAPS_MS entry gets `cap === undefined`, so its
    // deadline becomes NaN and Math.min(budget, NaN) is NaN - the step would
    // run with a meaningless deadline.
    const caps = read("server/routes/cron.ts");
    const capBlock = caps.slice(caps.indexOf("const STEP_CAPS_MS"), caps.indexOf("} as const;"));
    const capped = new Set([...capBlock.matchAll(/"([^"]+)":\s*\d/g)].map((m) => m[1]));
    expect(orchestratorSteps().filter((s) => !capped.has(s))).toEqual([]);
  });
});
