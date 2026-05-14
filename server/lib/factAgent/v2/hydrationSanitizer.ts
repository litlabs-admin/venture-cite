// Sanitize a raw hydration payload before sending to the LLM.
//
// Goals (in order):
//   1. PII safety — never send emails, phones, JWTs, session tokens.
//   2. Signal density — drop image URLs, base64 blobs, build artifacts, React
//      internals so the LLM's attention is on real text.
//   3. Token budget — hard cap at 300KB so a runaway blob doesn't OOM the
//      Vercel function or push the LLM past 128k context.
//
// Order matters: regex redaction first (operates on raw text), then
// noise/key drops, then size cap (post-everything).

const MAX_BYTES = 300_000;

const IMAGE_URL_RE =
  /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|svg|gif|ico|css|woff2?|ttf|otf|eot)(?:\?[^\s"'<>]*)?/gi;
const DATA_URL_RE = /data:[a-zA-Z0-9/+.-]+;base64,[A-Za-z0-9+/=]{500,}/g;
const LONG_BASE64_RE = /(?<![A-Za-z0-9+/=])[A-Za-z0-9+/=]{500,}(?![A-Za-z0-9+/=])/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g;
const JWT_RE = /eyJ[A-Za-z0-9_=-]{8,}\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+/g;
const BUILD_KEY_RE =
  /"(?:buildId|assetPrefix|runtimeConfig|__N_SSG|__N_SSP|_nextI18Next|\$\$typeof|_owner|__source|_self|_owner_alternate)"\s*:\s*(?:"[^"]*"|null|true|false|\d+|\{[^}]*\}|\[[^\]]*\])\s*,?/g;

const SENSITIVE_KEYS =
  /"(token|sessionId|userId|email|phone|auth[A-Za-z]*|password|secret|apiKey|api_key|access[_-]?token|refresh[_-]?token|csrf)"\s*:\s*"([^"]*)"/gi;

export function sanitizeHydration(input: string): string {
  let s = input;

  // 1. Redact PII (regex-only; works on any text, json or otherwise).
  s = s.replace(EMAIL_RE, "[REDACTED_EMAIL]");
  s = s.replace(JWT_RE, "[REDACTED_JWT]");
  s = s.replace(PHONE_RE, "[REDACTED_PHONE]");

  // 2. Redact values for sensitive key names.
  s = s.replace(SENSITIVE_KEYS, (_m, k) => `"${k}":"[REDACTED]"`);

  // 3. Drop noise: image URLs, base64 blobs, build artifacts.
  s = s.replace(IMAGE_URL_RE, "");
  s = s.replace(DATA_URL_RE, "");
  s = s.replace(LONG_BASE64_RE, "[BASE64_BLOB]");
  s = s.replace(BUILD_KEY_RE, "");

  // 4. Collapse repeated whitespace introduced by the substitutions.
  s = s.replace(/\s+/g, " ").trim();

  // 5. Hard byte cap.
  if (s.length > MAX_BYTES) s = s.slice(0, MAX_BYTES);

  return s;
}
