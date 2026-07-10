import { logger } from "./logger";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
export const REDDIT_USER_AGENT = "web:io.litlabs.venturecite:v1.0";

// Every outbound Reddit fetch is wrapped in an AbortController timeout so a
// hung upstream can't burn the entire serverless function budget. Mirrors the
// AbortController + setTimeout + clearTimeout pattern in server/lib/ssrf.ts.
const FETCH_TIMEOUT_MS = 10_000;

let cached: { token: string; expiresAt: number } | null = null;

export function _resetRedditTokenCacheForTests() {
  cached = null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v)
    throw new Error(`${name} is not configured. Create a Reddit script app and set env vars.`);
  return v;
}

export async function getRedditAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) return cached.token;

  const id = requireEnv("REDDIT_CLIENT_ID");
  const secret = requireEnv("REDDIT_CLIENT_SECRET");
  const username = requireEnv("REDDIT_USERNAME");
  const password = requireEnv("REDDIT_PASSWORD");

  const body = new URLSearchParams({ grant_type: "password", username, password });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": REDDIT_USER_AGENT,
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`reddit oauth ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: now + Math.max(60, json.expires_in - 60) * 1000 };
  logger.info({ expiresIn: json.expires_in }, "reddit.oauth.token_refreshed");
  return cached.token;
}

export async function redditFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getRedditAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`https://oauth.reddit.com${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "User-Agent": REDDIT_USER_AGENT,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function hasRedditOAuthCredentials(): boolean {
  return !!(
    process.env.REDDIT_CLIENT_ID &&
    process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_USERNAME &&
    process.env.REDDIT_PASSWORD
  );
}

// Unauthenticated fetch against www.reddit.com. Used when OAuth credentials
// are not configured. Reddit aggressively rate-limits/blocks datacenter IPs
// here, so production reliability is poor — the caller is expected to handle
// 403/429 by falling back to the RSS endpoint.
export async function redditPublicFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`https://www.reddit.com${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        ...(init?.headers ?? {}),
        "User-Agent": REDDIT_USER_AGENT,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
