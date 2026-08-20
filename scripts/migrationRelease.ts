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
