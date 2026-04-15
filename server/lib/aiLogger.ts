import type OpenAI from "openai";

// This module used to append every OpenAI request+response to a local
// log.txt file. That file-writing approach doesn't work on serverless or
// ephemeral-filesystem hosts (Vercel, Render free tier, Fly machines), so
// the logger is now a no-op. The export is retained so existing call sites
// (attachAiLogger(openai) in routes.ts, citationChecker.ts, and
// contentGenerationWorker.ts) keep compiling without any churn.
//
// Drop in a real logger here later (Axiom, Datadog, Supabase insert, etc.)
// if you need an audit trail.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function attachAiLogger(_openai: OpenAI): void {
  // Intentionally empty.
}
