# How to add a cron job

Use this guide to add a new scheduled job to VentureCite. Read [Jobs and cron
architecture](../reference/jobs-and-cron.md) first for how the existing jobs
fit together.

## Register the job

Add your job inside `initScheduler()` in `server/scheduler.ts`, following the
pattern every existing job uses:

```ts
const YOUR_JOB_CRON = process.env.YOUR_JOB_CRON || "0 * * * *";
if (cron.validate(YOUR_JOB_CRON)) {
  cron.schedule(YOUR_JOB_CRON, cronCrashGuard("your-job", runYourJob));
  logger.info({ cron: YOUR_JOB_CRON }, "your job scheduled");
}
```

- Read the schedule from an environment variable with a hardcoded default,
  not a bare literal. This lets an operator change the cadence without a
  code change.
- Always call `cron.validate(...)` before `cron.schedule(...)`. An invalid
  expression should produce a startup log, not a silent no-op or a crash.
- Always wrap the job body in `cronCrashGuard(jobName, fn)`. Without it, a
  rejected promise inside a `node-cron` callback is an unhandled rejection
  that can crash the process, taking every other scheduled job down with it.
- If the job's import graph is large (for example, it pulls in the content
  generation pipeline), import it lazily inside the callback instead of at
  the top of `scheduler.ts`. A static import runs on every process boot,
  whether or not the job ever fires.

## Guard against duplicate runs

Decide whether your job needs concurrency protection, sequence protection,
or both — they are different problems (see [Jobs and cron
architecture](../reference/jobs-and-cron.md#preventing-a-job-from-running-twice)):

- If two scheduler processes overlapping (a deploy, a restart) could corrupt
  data or double-charge a provider, wrap the job body in
  `withAdvisoryLock(lockKey, jobName, impl)` from `server/lib/advisoryLock.ts`,
  with a new, unused key in the `9100xx` range.
- If a second sequential run of the same job (in-process cron plus the
  external daily orchestrator both firing) has a real cost — sending an
  email again, spending on an LLM call again — wrap it in
  `withJobDebounce(jobName, window, impl)` from `server/lib/jobDebounce.ts`
  as well. Do not add debounce to a job whose second run is a safe no-op,
  such as a purge.

## Add it to the daily orchestrator, if it must run without the in-process scheduler

`POST /api/cron/daily-orchestrator` (`server/routes/cron.ts`) is what fires
scheduled work on a host where `DISABLE_IN_PROCESS_SCHEDULER=true`. If your
job must run in that mode too, add a call to it there, guarded by the same
lock or debounce helper you used above.

## Verify

```sh
npm run check
npm test
```

Run the job's function directly in a test or a local script before relying
on the cron schedule to exercise it; `node-cron`'s scheduling is not
something a unit test should assert on. If your job touches the database,
see [Running the integration suite locally](./run-the-integration-suite.md).
