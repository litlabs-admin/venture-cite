// Shared building blocks for per-domain route modules (Wave 5.1).
//
// Before the domain-split, these all lived inline at the top of
// server/routes.ts. Extracting them here means each per-domain route
// file (server/routes/brands.ts, etc.) can import them without
// pulling in the rest of routes.ts.

import OpenAI from "openai";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { attachAiLogger } from "./aiLogger";
import { sendOwnershipError } from "./ownership";

// Singleton OpenAI client used by the routes layer. The contentGeneration
// worker has its own instance because it runs on a separate event loop
// concern; both pin the same SDK version.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Upstream hangs block worker threads indefinitely without a timeout.
  timeout: 45_000,
  maxRetries: 1,
});
attachAiLogger(openai);

// Maximum accepted length for user-supplied content on AI endpoints. Caps
// worst-case OpenAI token consumption so a hostile request can't drain the
// bill on a single call. 40 KB ≈ ~10k tokens input which is already
// generous for article-scale analysis.
export const MAX_CONTENT_LENGTH = 40_000;

// Rate limiter for AI generation endpoints: 10 requests per minute, keyed
// by authenticated user id when available (so shared IPs / proxies don't
// DoS each other) or by IP for unauthenticated callers.
const aiRateKey = (req: Request) => {
  const user = (req as unknown as { user?: { id?: string } }).user;
  if (user?.id) return `user:${user.id}`;
  return `ip:${req.ip ?? "unknown"}`;
};

export const aiLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: aiRateKey,
  message: {
    success: false,
    error: "Too many requests. Please wait a moment before trying again.",
  },
});

// Shared error-response helper: prefers OwnershipError (401/404) when
// present, otherwise returns a generic 500 and logs the underlying error
// server-side. This keeps stack traces and internal messages out of
// production responses.
export function sendError(res: Response, err: unknown, fallback: string, status = 500): void {
  if (sendOwnershipError(res, err)) return;
  const isProd = process.env.NODE_ENV === "production";
  const message = isProd ? fallback : err instanceof Error ? err.message : fallback;
  if (err) console.error("[routes]", fallback, err);
  res.status(status).json({ success: false, error: message });
}

// Try to extract a JSON object from a raw LLM response even when the
// model wraps it in markdown fences, prose, or trailing commentary.
// Returns null on any failure instead of throwing — callers decide the
// fallback shape.
export function safeParseJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = raw.replace(/```json\s*|\s*```/g, "").trim();
  const match = stripped.match(/[\[{][\s\S]*[\]}]/);
  const candidate = match ? match[0] : stripped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
