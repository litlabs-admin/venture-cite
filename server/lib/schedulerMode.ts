export type SchedulerMode = "in-process" | "external";

export interface SchedulerEnvironment {
  nodeEnv: "development" | "production" | "test";
  isVercel: boolean;
  disableInProcessScheduler: boolean;
  externalCronOrchestratorEnabled: boolean;
}

const trueValues = new Set(["1", "true", "yes", "on"]);
const falseValues = new Set(["", "0", "false", "no", "off"]);

/** Parses an explicit scheduler environment switch at the configuration boundary. */
export function parseSchedulerBoolean(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  if (trueValues.has(normalized)) return true;
  if (falseValues.has(normalized)) return false;
  throw new Error("Scheduler environment values must be a scheduler boolean");
}

/** Selects one scheduler owner for the current process. */
export function resolveSchedulerMode(environment: SchedulerEnvironment): SchedulerMode {
  if (environment.nodeEnv !== "production") return "in-process";
  if (environment.isVercel) return "external";

  if (environment.externalCronOrchestratorEnabled && !environment.disableInProcessScheduler) {
    throw new Error(
      "Production external cron orchestration requires DISABLE_IN_PROCESS_SCHEDULER=true",
    );
  }

  if (environment.disableInProcessScheduler && !environment.externalCronOrchestratorEnabled) {
    throw new Error(
      "Production scheduler disablement requires EXTERNAL_CRON_ORCHESTRATOR_ENABLED=true",
    );
  }

  return environment.disableInProcessScheduler ? "external" : "in-process";
}
