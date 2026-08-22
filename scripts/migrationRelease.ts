import {
  runMigrationBootstrapPreflight,
  runReleaseEnvironmentPreflight,
  type PreflightEnvironment,
} from "./releaseEnvironmentPreflight";

const PRODUCTION_CONFIRMATION = "venturecite-production";

export function isReleaseMigrationCommand(argumentsList: readonly string[]): boolean {
  return argumentsList.includes("--release");
}

export function isBootstrapMigrationCommand(argumentsList: readonly string[]): boolean {
  return argumentsList.includes("--bootstrap");
}

export function migrationLedgerModeForCommand(options: {
  nodeEnv: string | undefined;
  isReleaseCommand: boolean;
}): "application-only" | "reconcile-supabase" {
  return options.nodeEnv === "production" && options.isReleaseCommand
    ? "application-only"
    : "reconcile-supabase";
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
  bootstrap = false,
): void {
  const report = bootstrap
    ? runMigrationBootstrapPreflight(environment)
    : runReleaseEnvironmentPreflight(environment);
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
  isBootstrapCommand?: boolean;
  confirmation: string | undefined;
  environment?: PreflightEnvironment;
}): void {
  if (options.isBootstrapCommand && options.nodeEnv !== "production") {
    throw new Error("Migration bootstrap requires NODE_ENV=production.");
  }
  assertReleaseMigrationConfirmation(options);
  if (options.nodeEnv === "production") {
    assertProductionMigrationEnvironment(
      options.environment ?? process.env,
      options.isBootstrapCommand ?? false,
    );
  }
}
