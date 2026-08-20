export const LOCAL_FAKE_HOST = "127.0.0.1";
export const NORMAL_DEV_HOST = "0.0.0.0";

export type LocalStartupEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "CONTENT_GENERATION_PROVIDER"
    | "DISABLE_STARTUP_AUTOPILOT"
    | "DISABLE_STRIPE_SETUP"
    | "STRIPE_SECRET_KEY"
  >
>;

export function devListenHost(contentGenerationProvider?: string): string {
  return contentGenerationProvider === "fake" ? LOCAL_FAKE_HOST : NORMAL_DEV_HOST;
}

export function startupAutopilotEnabled(env: LocalStartupEnvironment): boolean {
  return env.CONTENT_GENERATION_PROVIDER !== "fake" && env.DISABLE_STARTUP_AUTOPILOT !== "true";
}

export function stripeSetupEnabled(env: LocalStartupEnvironment): boolean {
  return env.DISABLE_STRIPE_SETUP !== "true" && Boolean(env.STRIPE_SECRET_KEY);
}
