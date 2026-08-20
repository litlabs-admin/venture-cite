import "dotenv/config";
import { resumeInFlightAutopilots } from "./server/lib/onboardingAutopilot";
// The same step the orchestrator runs. Brand creation starts the autopilot but
// something has to carry it past the fact-sheet phase; with no cron and no
// server restart, nothing has.
const t0 = Date.now();
await resumeInFlightAutopilots(Date.now() + 8 * 60 * 1000);
console.log("resume finished in", Math.round((Date.now() - t0) / 1000) + "s");
