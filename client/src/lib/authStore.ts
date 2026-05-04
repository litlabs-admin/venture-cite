import { supabase } from "./supabase";
import { Sentry } from "@/lib/sentry";

// Returns the current access token, auto-refreshing if close to expiry.
// Relies on supabase-js's built-in session persistence + refresh.
// Swallows errors (network, parse) and returns null so protected queries
// fail with a clean 401 instead of an unhandled rejection.
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch (err) {
    Sentry.captureException(err, { tags: { source: "authStore.getSession" } });
    return null;
  }
}

export async function setSession(tokens: { access_token: string; refresh_token: string }) {
  const { error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (error) {
    Sentry.captureException(error, { tags: { source: "authStore.setSession" } });
    throw error;
  }
}

export async function clearSession() {
  await supabase.auth.signOut();
}
