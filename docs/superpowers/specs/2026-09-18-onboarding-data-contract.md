# Onboarding data contract

Status: draft, 2026-09-18. Covers the six-step onboarding in the "VentureCite Onboarding Flow" canvas. It replaces `client/src/pages/welcome.tsx`.

## Why the current backend does not fit

I checked these against the code on this branch.

- Every `/api/onboarding/*` route sits behind `requireAuthForApi` (`server/routes.ts:89`, `server/auth.ts:252`). The new flow shows the first measurements before sign-up, so those routes cannot serve it.
- `scrape-stream` returns a profile and up to 10 competitors, and nothing it returns is measured. Prompts and citations only exist after `confirm`, when `runOnboardingAutopilot` runs 10 prompts on 6 engines (`server/lib/onboardingAutopilot.ts`). That takes minutes.
- None of these exist in onboarding today: a quick first read, crawler and schema checks, a sample answer, an insight, the most-cited sources, an agency or client concept.

## What the reference does

I observed this by logging trakkr.ai's network traffic for venturepr.com on 2026-09-18. It runs 11 calls before sign-up. `scrape` returns raw text. `analyze` is one LLM call that returns the profile, 5 topics with 24 prompts, and 6 competitors. `loading-states` writes four lines specific to the site. While the user answers "Who", seven checks run in parallel, each taking 0.5 to 4 s.

Its preview panel shows invented numbers. `live-probe`, the real ChatGPT run, scored every brand 0 and flagged the result `is_real: true`. Then `generate-preview` returned scores from 38 to 78, with trends. We do not copy that. The rule for this flow is to show a number only if we measured it. If nothing was measured, say so.

## Session model

Onboarding runs as an anonymous session keyed by an unguessable id. The session holds every result below, and sign-up claims it.

```
POST /api/public/onboarding/sessions        { domain }            -> { sessionId }
GET  /api/public/onboarding/sessions/:id/events   (SSE, replays on reconnect)
POST /api/public/onboarding/sessions/:id/answers  { audience, agencyName?, profile?, competitors? }
POST /api/onboarding/claim                  { sessionId }         -> { brandId }   (authenticated, see "Sign-up and claim")
```

Limits: 5 sessions per IP per hour, one live session per IP, 24 h expiry. The session never writes to `brands`. `claim` does that.

## Events, in the order the UI needs them

Each event is `{ type, data }`. The UI renders whatever has arrived and keeps a skeleton for the rest.

| Event           | Needed by              | Source                                                                    | Target time    |
| --------------- | ---------------------- | ------------------------------------------------------------------------- | -------------- |
| `site`          | Scan                   | fetch homepage: title, meta description, favicon                          | 1 s            |
| `loading_lines` | Scan                   | LLM, 4 short lines about this site                                        | 2 s            |
| `profile`       | Brand                  | LLM over page text (reuse `brandProfilePrompt.ts`)                        | 6-10 s         |
| `competitors`   | Brand, previews        | same LLM call, 6 shown plus total found                                   | with `profile` |
| `topics`        | Save                   | LLM, 5 topics, 24 prompts in the listicle shape                           | with `profile` |
| `readiness`     | Brand preview, insight | robots.txt per AI crawler, llms.txt, JSON-LD types, sitemap               | 1 s            |
| `probe`         | First read             | 3 prompts on Gemini and ChatGPT, parsed for brand and competitor mentions | 4-8 s          |
| `sources`       | First read preview     | domains cited in the `probe` answers                                      | with `probe`   |
| `insight`       | First read             | LLM over `readiness` plus page text, one finding with a quote             | 3 s            |
| `done`          | all                    |                                                                           |                |

Scan ends once `profile` arrives. The rest keeps running while the user is on Who and Brand, so First read never waits.

## Shapes

```ts
type Site = { domain: string; title: string; faviconUrl: string };

type Profile = {
  name: string;
  industry: string;
  descriptor: string; // "PR agency for disruptive tech", shown under the heading
  description: string;
  audience: string;
};

type Competitor = { name: string; domain: string; faviconUrl: string };
type Competitors = { shown: Competitor[]; totalFound: number };

type Topic = { topic: string; prompts: string[] };

type Readiness = {
  crawlers: {
    bot: "GPTBot" | "ClaudeBot" | "PerplexityBot" | "Google-Extended" | "CCBot";
    allowed: boolean;
  }[];
  llmsTxt: boolean;
  sitemap: boolean;
  schemaTypes: string[];
};

type Engine = "chatgpt" | "claude" | "gemini" | "perplexity" | "deepseek" | "grok";

type ProbeResult = {
  prompt: string;
  engine: Engine;
  brandCited: boolean;
  brandRank: number | null;
  mentioned: { name: string; domain: string | null; rank: number }[];
  snippet: string; // first 200 characters of the answer
};

type Probe = {
  results: ProbeResult[];
  promptsTested: number;
  brandAppearances: number;
  competitorAppearances: number;
};

type Source = {
  domain: string;
  kind: "news" | "editorial" | "directory" | "reviews" | "social" | "other";
  count: number;
};

type Insight = {
  headline: string;
  detail: string;
  evidenceQuote: string | null;
  tone: "positive" | "gap";
};
```

## Decisions, 2026-09-19

- `probe` runs on Gemini and ChatGPT.
- Sign-up uses email and password only. No Google, no magic link.
- The agency path is in scope.

## Sign-up and claim

Save calls the existing `POST /api/auth/register` with the email, the password and the `sessionId`. Registration keeps its current rules. It applies `shared/passwordPolicy.ts` and the leaked-password check, it creates the user unverified, and it returns no session.

The claim cannot run at sign-up. A new account is on tier `pending`, which allows 0 brands (`shared/schema/identity.ts:149`). Stripe collects a card before the app opens. The order is:

1. Save registers the account and stores `sessionId` on the user (`users.onboarding_state.pendingSessionId`).
2. The user verifies their email and logs in.
3. The existing signup gate sends them to plan selection and checkout.
4. Checkout returns to `/welcome?checkout=…`. The page sees `pendingSessionId` and calls `POST /api/onboarding/claim`.
5. `claim` checks that the session belongs to this user's email or id, then runs inside the brand quota (`withBrandQuota`).

`claim` creates the brand from `profile` plus the user's edits. It creates the competitors, and it creates the tracked prompts from `topics`, up to `TRACKED_PROMPTS_CAP`. It stores `probe` as the first `citation_runs` row with one `geo_rankings` row per result, so the dashboard opens with data. Then it starts the existing autopilot for the full baseline. A second call with the same session returns the same `brandId`.

The session expires after 24 h. If it expired before the claim, `/welcome` falls back to the domain step with the domain prefilled.

## Agency accounts

The smallest model that serves the Who step, with no new table:

- `users.account_kind`: `brand` or `agency`. The default is `brand`.
- `users.agency_name`: text, null for a brand account.
- `brands.relationship`: `own` or `client`. The default is `own`.

Ownership does not change. Brands stay scoped by `brands.user_id`, so every existing repository, route and RLS rule still applies. An agency is one login with many client brands. That fits the `agency` plan, which allows 10 brands.

This does not cover several people in one agency sharing its clients. That needs a workspace table, a membership table with roles, and a change to how brands are scoped. It is a separate project.

## Open decisions

- The copy on the confirm-email screen, and where "Send it again" points. The existing `/api/auth/resend-verification` works for both.
