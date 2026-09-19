// Off switches for scheduled jobs that spend money per brand.
//
// Both jobs crashed on every run from 2026-08-12 until the fix in a1d8fbc.
// The owner decided on 2026-09-19 that they stay stopped until someone turns
// them on deliberately, so they default to OFF. Set the variable to "true" in
// the deploy environment to run a job; no code change is needed.
//
//   AUTO_CITATION_ENABLED=true     weekly citation scans (runAutoCitationJob)
//   BRAND_ACTIVATION_ENABLED=true  dashboard activation sweep (runBrandActivationSweep)
export type PaidJob = "AUTO_CITATION" | "BRAND_ACTIVATION";

export function isPaidJobEnabled(job: PaidJob, env: NodeJS.ProcessEnv = process.env): boolean {
  return env[`${job}_ENABLED`] === "true";
}
