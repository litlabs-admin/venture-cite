// tests/e2e/support/bearer-token.ts
//
// The app authenticates via a Supabase JWT carried as an `Authorization:
// Bearer` header populated client-side from localStorage
// (client/src/lib/authStore.ts's getAccessToken(), consumed by
// client/src/lib/queryClient.ts's apiRequest()) — NOT a cookie. The cached
// storageState has 0 cookies; forwarding page.context().cookies() as a
// Cookie header sends an empty header and never authenticates the request.
// Extract the real bearer token out of localStorage instead.
//
// Shared by tests/e2e/billing.spec.ts and tests/e2e/welcome-brand.spec.ts,
// which both call server APIs directly (via request.post/request.get) and
// need to forward the same real session token those requests are gated on.
import type { Page } from "@playwright/test";

export async function getBearerToken(page: Page): Promise<string> {
  // Storage state is only restored for the page's current origin, so it must
  // already be on the app before this reads window.localStorage.
  const token = await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(key) ?? "");
          return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
        } catch {
          // Not the session entry (or malformed) — keep looking.
        }
      }
    }
    return null;
  });
  if (!token) {
    throw new Error(
      "No Supabase access token found in localStorage — is the shared storageState valid?",
    );
  }
  return token;
}
