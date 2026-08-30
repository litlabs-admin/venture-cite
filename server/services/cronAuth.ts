// Cron endpoint authorization, extracted verbatim from
// server/routes/cron.ts as part of the B7 service-layer split.
//
// Auth: either an Authorization: Bearer <CRON_SECRET> header (Vercel cron
// auto-injects this) OR an x-cron-secret header (manual / external trigger).
//
// Takes plain header values rather than an Express Request so this module
// stays Express-free, matching every other module in server/services/.

export function isCronAuthorized(
  authorizationHeader: string | undefined,
  cronSecretHeader: string | string[] | undefined,
): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")) {
    if (authorizationHeader.slice(7) === secret) return true;
  }
  if (typeof cronSecretHeader === "string" && cronSecretHeader === secret) return true;
  return false;
}
