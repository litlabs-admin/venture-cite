import {
  runReleaseEnvironmentPreflight,
  type PreflightEnvironment,
} from "./releaseEnvironmentPreflight";

const PRODUCTION_CONFIRMATION = "venturecite-production";

export function isReleaseMigrationCommand(argumentsList: readonly string[]): boolean {
  return argumentsList.includes("--release");
}

export function assertReleaseMigrationConfirmation(options: {
  nodeEnv: string | undefined;
  isReleaseCommand: boolean;
  confirmation: string | undefined;
}): void {
  if (options.nodeEnv !== "production") return;

  if (!options.isReleaseCommand) {
    throw new Error("Production migrations require `npm run db:migrate:release`.");
  }

  if (options.confirmation !== PRODUCTION_CONFIRMATION) {
    throw new Error(
      "Set CONFIRM_PRODUCTION_MIGRATIONS=venturecite-production before a production migration.",
    );
  }
}

export function assertProductionMigrationEnvironment(
  environment: PreflightEnvironment = process.env,
): void {
  const report = runReleaseEnvironmentPreflight(environment);
  if (report.passed) return;

  const failedChecks = report.checks
    .filter((check) => !check.passed)
    .map((check) => check.name)
    .join(", ");
  throw new Error(`Release environment preflight failed: ${failedChecks}`);
}

export function assertProductionMigrationReady(options: {
  nodeEnv: string | undefined;
  isReleaseCommand: boolean;
  confirmation: string | undefined;
  environment?: PreflightEnvironment;
}): void {
  assertReleaseMigrationConfirmation(options);
  if (options.nodeEnv === "production") {
    assertProductionMigrationEnvironment(options.environment ?? process.env);
  }
}
