// Wire contract for the anonymous onboarding session.
// Spec: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
// Server producers validate their output with these schemas before they emit
// an event, and the client parses every event with them. Change a shape here
// and both sides fail to compile.
import { z } from "zod";

export const ONBOARDING_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const ONBOARDING_SESSIONS_PER_IP_PER_HOUR = 5;
/** First-read engines, decided 2026-09-19. Keys match CITATION_MODELS in server/citationChecker.ts. */
export const PROBE_ENGINES = ["Gemini", "ChatGPT"] as const;
export const PROBE_PROMPT_COUNT = 3;
export const SHOWN_COMPETITOR_COUNT = 6;

/** A domain's favicon via the existing CSP-safe image proxy (server/routes: GET /api/logo-proxy). */
export function faviconProxyUrl(domain: string): string {
  const google = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  return `/api/logo-proxy?url=${encodeURIComponent(google)}`;
}

export const engineSchema = z.enum([
  "ChatGPT",
  "Claude",
  "Gemini",
  "Perplexity",
  "DeepSeek",
  "Grok",
]);
export type Engine = z.infer<typeof engineSchema>;

export const siteSchema = z.object({
  domain: z.string(),
  title: z.string(),
  faviconUrl: z.string(),
});

export const loadingLinesSchema = z.object({ lines: z.array(z.string().max(90)).length(4) });

export const profileSchema = z.object({
  name: z.string().min(1).max(120),
  industry: z.string().max(120),
  descriptor: z.string().max(80),
  description: z.string().max(1200),
  audience: z.string().max(300),
});

export const competitorSchema = z.object({
  name: z.string().min(1).max(120),
  domain: z.string().min(3).max(253),
  faviconUrl: z.string(),
});

export const competitorsSchema = z.object({
  shown: z.array(competitorSchema).max(SHOWN_COMPETITOR_COUNT),
  totalFound: z.number().int().min(0),
});

export const topicSchema = z.object({
  topic: z.string().min(1).max(80),
  prompts: z.array(z.string().min(1).max(200)).min(1).max(8),
});
export const topicsSchema = z.object({ topics: z.array(topicSchema).min(1).max(6) });

export const CRAWLER_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
] as const;
export const readinessSchema = z.object({
  crawlers: z.array(z.object({ bot: z.enum(CRAWLER_BOTS), allowed: z.boolean() })),
  llmsTxt: z.boolean(),
  sitemap: z.boolean(),
  schemaTypes: z.array(z.string()),
});

export const probeResultSchema = z.object({
  prompt: z.string(),
  engine: engineSchema,
  brandCited: z.boolean(),
  brandRank: z.number().int().positive().nullable(),
  mentioned: z.array(
    z.object({
      name: z.string(),
      domain: z.string().nullable(),
      rank: z.number().int().positive(),
    }),
  ),
  /** First 200 characters of the engine's answer. */
  snippet: z.string().max(200),
});

export const probeSchema = z.object({
  results: z.array(probeResultSchema),
  promptsTested: z.number().int().min(0),
  brandAppearances: z.number().int().min(0),
  competitorAppearances: z.number().int().min(0),
});

export const sourceSchema = z.object({
  domain: z.string(),
  kind: z.enum(["news", "editorial", "directory", "reviews", "social", "other"]),
  count: z.number().int().positive(),
});
export const sourcesSchema = z.object({ sources: z.array(sourceSchema).max(8) });

export const insightSchema = z.object({
  headline: z.string().min(1).max(80),
  detail: z.string().min(1).max(500),
  evidenceQuote: z.string().max(200).nullable(),
  tone: z.enum(["positive", "gap"]),
});

/** A producer that failed. The UI shows its section as unavailable, never a guess. */
export const stepErrorSchema = z.object({
  step: z.enum(["site", "profile", "readiness", "probe", "insight"]),
  message: z.string().max(300),
});

export const sessionEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("site"), data: siteSchema }),
  z.object({ type: z.literal("loading_lines"), data: loadingLinesSchema }),
  z.object({ type: z.literal("profile"), data: profileSchema }),
  z.object({ type: z.literal("competitors"), data: competitorsSchema }),
  z.object({ type: z.literal("topics"), data: topicsSchema }),
  z.object({ type: z.literal("readiness"), data: readinessSchema }),
  z.object({ type: z.literal("probe"), data: probeSchema }),
  z.object({ type: z.literal("sources"), data: sourcesSchema }),
  z.object({ type: z.literal("insight"), data: insightSchema }),
  z.object({ type: z.literal("step_error"), data: stepErrorSchema }),
  z.object({ type: z.literal("done"), data: z.object({}) }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type SessionEventType = SessionEvent["type"];
export type SessionEventData<T extends SessionEventType> = Extract<
  SessionEvent,
  { type: T }
>["data"];

export type Site = z.infer<typeof siteSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Competitor = z.infer<typeof competitorSchema>;
export type Competitors = z.infer<typeof competitorsSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
export type ProbeResult = z.infer<typeof probeResultSchema>;
export type Probe = z.infer<typeof probeSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Insight = z.infer<typeof insightSchema>;

// ---- Request bodies ----

export const createSessionBodySchema = z.object({ domain: z.string().min(3).max(253) });
export const createSessionResponseSchema = z.object({ sessionId: z.string().uuid() });

/** The user's answers and edits. Sent from the Who and Brand steps; the last write wins. */
export const sessionAnswersSchema = z
  .object({
    audience: z.enum(["own", "client"]),
    agencyName: z.string().trim().min(1).max(120).optional(),
    profile: profileSchema.partial().optional(),
    competitors: z
      .array(competitorSchema.omit({ faviconUrl: true }))
      .max(10)
      .optional(),
  })
  .refine((a) => a.audience === "own" || !!a.agencyName, {
    message: "An agency name is required for a client brand",
    path: ["agencyName"],
  });
export type SessionAnswers = z.infer<typeof sessionAnswersSchema>;

// Response bodies are flat, `{ success: true, ...fields }`. Both the route and
// welcome.tsx parse with these, so neither can drift. They once did: the page
// read `data.data.sessionId` from a flat body, saw nothing pending, and sent a
// signed-up user back to step 1 without claiming their session.
export const claimBodySchema = z.object({ sessionId: z.string().uuid() });
export const claimResponseSchema = z.object({ brandId: z.string() });
export const pendingResponseSchema = z.object({ sessionId: z.string().uuid().nullable() });

/** Where the pending session id lives on the user between sign-up and claim. */
export const PENDING_SESSION_KEY = "pendingOnboardingSessionId";
