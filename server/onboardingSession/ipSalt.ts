/**
 * The salt for onboarding_sessions.ip_hash. A known salt makes the hash
 * reversible by brute force over the IPv4 space, so production needs a real
 * secret.
 *
 * SESSION_SECRET is preferred, but production does not always set it: the
 * first release threw here on every session create and /start showed
 * "Internal Server Error". SUPABASE_SERVICE_ROLE_KEY is always set in
 * production (the app cannot authenticate anyone without it) and is never
 * exposed to clients, so it is the fallback.
 */
export function onboardingIpSalt(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret) return secret;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set to hash onboarding client IPs",
    );
  }
  return "onboarding-session-dev-salt";
}
