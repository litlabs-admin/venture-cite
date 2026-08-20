# Phase 5 — Chatbot (A1) Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. NO COMMITS during execution — user reviews full diff at end.

**Goal:** Floating chat bubble in bottom-right of every authenticated page → side sheet opens → GEO/AEO/SEO tutor powered by Claude Sonnet 4.5 via OpenRouter. Production-grade from day one (per-user rate limit, daily token budget, 30-day TTL persistence, error capture, cache-aware system prompt, brand context).

**Architecture:** New `chatbot_messages` + `chatbot_token_usage` tables. New `POST /api/assistant/chat` endpoint added to existing function bundle. New floating bubble component mounted once in `AppLayout`. Daily prune step added to existing cron orchestrator. Sonnet via OpenRouter (OpenAI SDK with custom baseURL). PR 5.1 ships non-streaming baseline; PR 5.2 upgrades to SSE streaming; PR 5.3 adds brand-aware context.

**Tech Stack:** Express + Drizzle + raw pg.Pool, OpenAI SDK pointed at OpenRouter, React + TanStack Query + Radix Sheet, vitest + RTL (happy-dom).

---

## Constraints (locked)

- **Vercel Hobby:** no new function, no new cron entry. New env var: `OPENROUTER_API_KEY` (was optional, becomes required when chatbot ships).
- **Supabase Free:** chatbot persistence bounded ~50 MB ceiling via 30-day TTL + 100-msg-per-user soft cap.
- **No commits.** User reviews full diff at end.
- **Test count baseline:** 274. After Phase 5: 274 + 13 = 287 (7 server + 6 RTL).

---

## PR 5.1 — Production baseline: persistence + budget + non-streaming Sonnet (~3 days)

### Task 1: Migration `0048_chatbot_messages.sql`

**Files:**
- Create: `migrations/0048_chatbot_messages.sql`

- [ ] **Step 1: Write migration**

```sql
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id      VARCHAR      REFERENCES brands(id) ON DELETE SET NULL,
  role          TEXT         NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT         NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  model         TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chatbot_messages_user_created_idx
  ON chatbot_messages(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_token_usage (
  user_id       VARCHAR      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date    DATE         NOT NULL,
  input_tokens  INTEGER      NOT NULL DEFAULT 0,
  output_tokens INTEGER      NOT NULL DEFAULT 0,
  message_count INTEGER      NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
```

- [ ] **Step 2: Add Drizzle schema** in `shared/schema.ts` after the existing tables

```ts
export const chatbotMessages = pgTable("chatbot_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userCreatedIdx: index("chatbot_messages_user_created_idx").on(t.userId, t.createdAt.desc()),
}));

export const chatbotTokenUsage = pgTable("chatbot_token_usage", {
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  usageDate: date("usage_date").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  messageCount: integer("message_count").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.usageDate] }),
}));
```

(Verify imports: `uuid`, `index`, `date`, `primaryKey` may need to be added to the drizzle-orm/pg-core import in schema.ts.)

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: clean.

### Task 2: Extend `llmPricing.ts` with chatbot caps

**Files:**
- Modify: `server/lib/llmPricing.ts`

- [ ] **Step 1: Add chatbot caps**

Append after `DAILY_TOKEN_CAP`:

```ts
// Per-user chatbot token cap per day. -1 = unlimited (admin).
// Chatbot messages are MUCH smaller than article generation — typical
// 200–800 tokens per turn. Caps tuned so worst-case spend stays
// reasonable per tier (free=$4.50/mo, pro=$22/mo, enterprise=$75/mo).
export const CHATBOT_DAILY_TOKEN_CAP: Record<Tier, number> = {
  free: 15_000,
  beta: 30_000,
  pro: 75_000,
  enterprise: 250_000,
  admin: -1,
};

// Per-user chatbot messages per hour. Two-axis cap (token + count) so
// a small budget can't be drained by spamming 1-token messages.
export const CHATBOT_MESSAGES_PER_HOUR: Record<Tier, number> = {
  free: 20,
  beta: 30,
  pro: 60,
  enterprise: 120,
  admin: 1000,
};
```

- [ ] **Step 2: Add Sonnet 4.5 to pricing table**

In `PRICING_PER_1K_TOKENS_CENTS` add:

```ts
"claude-sonnet-4.5": { in: 0.3, out: 1.5 },
"anthropic/claude-sonnet-4.5": { in: 0.3, out: 1.5 },
```

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

### Task 3: OpenRouter client wrapper

**Files:**
- Create: `server/lib/openrouterClient.ts`

- [ ] **Step 1: Write the wrapper**

```ts
import OpenAI from "openai";

let cached: OpenAI | null = null;

// Lazy singleton — instantiated on first use so tests can mock the
// module before construction. Uses OpenAI SDK pointed at OpenRouter
// (OpenAI-compatible API). Throws if OPENROUTER_API_KEY missing.
export function getOpenRouterClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required for the chatbot");
  }
  cached = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://venturecite.com",
      "X-Title": "VentureCite",
    },
    timeout: 45_000,
    maxRetries: 1,
  });
  return cached;
}

export const CHATBOT_MODEL = "anthropic/claude-sonnet-4.5";
```

- [ ] **Step 2: Run typecheck**

### Task 4: Chatbot knowledge / system prompt

**Files:**
- Create: `server/lib/chatbotKnowledge.ts`

- [ ] **Step 1: Write the system prompt**

```ts
// System prompt for the GEO/AEO/SEO tutor chatbot. ~3,500 tokens.
// Cached via Anthropic ephemeral cache (90% discount on hits) so the
// real per-message cost is ~200–800 tokens of user/assistant text.
//
// IMPORTANT: When you change this string, the cache is invalidated and
// the next call pays full price. Keep edits batched.

export const SYSTEM_PROMPT = `You are the VentureCite AI tutor. You help users understand and execute Generative Engine Optimization (GEO), Answer Engine Optimization (AEO), and traditional SEO strategies — and how to use the VentureCite product to do them.

# Identity & guardrails
- You are NOT a general-purpose assistant. Politely decline questions about anything outside GEO/AEO/SEO/marketing strategy and the VentureCite product.
- You are NOT a coder, lawyer, accountant, doctor, or therapist. Decline accordingly.
- You do NOT make up facts. If you don't know, say so and suggest where the user could check.
- You speak like a senior strategist who genuinely wants the user to win — direct, specific, no fluff.
- Length: 2–6 short paragraphs unless the user asks for more depth.

# GEO 101 (Generative Engine Optimization)
GEO is the discipline of getting your brand cited by AI answer engines (ChatGPT, Claude, Perplexity, Google AI Overviews, Gemini) when users ask questions in your category.

It differs from SEO because:
- The "ranking" is a sentence inside an AI response, not a blue link
- LLMs re-index on their own schedule (typically 1–2 weeks lag from publication)
- Citation rate matters more than position
- Authority signals (mentions across the web) matter more than backlinks

# AEO vs SEO vs GEO
- **SEO** — Optimize for search-engine ranking pages (Google, Bing). Keyword-driven, link-driven.
- **AEO** — Optimize for "answer boxes" (featured snippets, People Also Ask, voice assistants). Q&A-driven, schema-driven.
- **GEO** — Optimize for AI-generated answers (LLM citations). Authority-driven, content-quality-driven.

# VentureCite page-by-page guide
- **Dashboard** — citation trends, rankings, recommendations
- **Brands** — set up the entity LLMs need to recognize
- **AI Visibility** — pre-launch checklist (fact sheet, FAQ, schema)
- **Content** — generate GEO-optimized articles via the agent
- **Articles** — manage published content
- **Citations** — run prompts against ChatGPT/Claude/Perplexity, see who cited you
- **GEO Analytics** — citation rate over time, per-platform breakdown
- **AI Intelligence** — competitor share-of-answer
- **GEO Signals** — domain authority indicators (mentions, listicles, Wikipedia)
- **Community** — Reddit/Quora outreach (LLMs heavily cite these)
- **Competitors** — track who else is being cited
- **FAQ Manager** — structured Q&A LLMs love to quote
- **Fact Sheet** — canonical brand info LLMs anchor citations to

# What to do first (6-step recipe)
1. Create your brand and fill out industry + description
2. Complete the AI Visibility checklist (fact sheet, FAQ, schema)
3. Generate 5–10 GEO-optimized articles via the Content agent
4. Publish them on your site
5. Generate 10–20 citation-check prompts (questions a customer would ask)
6. Run a citation check weekly — expect first citations 1–2 weeks after publishing

# Measurement timeline
- **Week 1** — articles published, but citation rate near 0%
- **Week 2–3** — first citations appear as LLMs re-index
- **Week 4+** — citation rate stabilizes (target: 20%+)
- **Month 3+** — rankings emerge, share-of-answer measurable vs competitors

The 1–2 week lag is normal. Don't panic at week 1. Don't quit at week 2.

# Reddit/Quora strategy basics
LLMs heavily cite Reddit/Quora answers. To benefit:
1. Find the 5–10 subreddits + Quora topics your customers actually ask in (use the Community tab)
2. Answer questions thoroughly with your expertise — first, value; second, link
3. Don't shill. Cite your work only when it's genuinely the best answer
4. One thoughtful answer per week beats ten spammy ones

# Style
- Be direct. Lead with the answer, then briefly explain why.
- Reference VentureCite pages by name when relevant: "Open the Citations page and..."
- When the user asks "should I do X," give them an opinion, not a list of pros and cons.
- When the user is stuck, ask one clarifying question — never two.
`;
```

- [ ] **Step 2: Run typecheck**

### Task 5: Chatbot budget enforcement

**Files:**
- Create: `server/lib/chatbotBudget.ts`

- [ ] **Step 1: Write the budget helper**

```ts
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  CHATBOT_DAILY_TOKEN_CAP,
  CHATBOT_MESSAGES_PER_HOUR,
  BudgetExceededError,
  type Tier,
} from "./llmPricing";

// Reads today's token usage row. Returns 0 if no row yet.
export async function tokensUsedToday(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    select coalesce(input_tokens + output_tokens, 0)::int as total
    from public.chatbot_token_usage
    where user_id = ${userId}
      and usage_date = current_date
  `);
  const r = rows as unknown as { rows?: Array<{ total: number }> } & Array<{ total: number }>;
  return Number(r.rows?.[0]?.total ?? r[0]?.total ?? 0) || 0;
}

// Returns count of chatbot_messages with role='user' in the last hour.
export async function messagesLastHour(userId: string): Promise<number> {
  const rows = await db.execute(sql`
    select count(*)::int as n
    from public.chatbot_messages
    where user_id = ${userId}
      and role = 'user'
      and created_at > now() - interval '1 hour'
  `);
  const r = rows as unknown as { rows?: Array<{ n: number }> } & Array<{ n: number }>;
  return Number(r.rows?.[0]?.n ?? r[0]?.n ?? 0) || 0;
}

export async function assertChatbotBudget(userId: string, tier: Tier): Promise<void> {
  const tokenCap = CHATBOT_DAILY_TOKEN_CAP[tier] ?? CHATBOT_DAILY_TOKEN_CAP.free;
  const msgCap = CHATBOT_MESSAGES_PER_HOUR[tier] ?? CHATBOT_MESSAGES_PER_HOUR.free;
  if (tokenCap < 0) return;

  const [tokens, msgs] = await Promise.all([
    tokensUsedToday(userId),
    messagesLastHour(userId),
  ]);

  if (tokens >= tokenCap) {
    throw new BudgetExceededError(tier, tokenCap, tokens);
  }
  if (msgs >= msgCap) {
    throw new BudgetExceededError(tier, msgCap, msgs);
  }
}

// Atomic UPSERT — increments today's row.
export async function recordChatbotUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await db.execute(sql`
    insert into public.chatbot_token_usage (user_id, usage_date, input_tokens, output_tokens, message_count)
    values (${userId}, current_date, ${inputTokens}, ${outputTokens}, 1)
    on conflict (user_id, usage_date) do update set
      input_tokens = chatbot_token_usage.input_tokens + ${inputTokens},
      output_tokens = chatbot_token_usage.output_tokens + ${outputTokens},
      message_count = chatbot_token_usage.message_count + 1
  `);
}
```

- [ ] **Step 2: Run typecheck**

### Task 6: Storage methods for chatbot messages

**Files:**
- Modify: `server/databaseStorage.ts`

- [ ] **Step 1: Add three methods**

Find an appropriate section (near other recent additions) and add:

```ts
async getChatbotHistory(userId: string, limit = 10): Promise<ChatbotMessage[]> {
  const rows = await db
    .select()
    .from(chatbotMessages)
    .where(eq(chatbotMessages.userId, userId))
    .orderBy(desc(chatbotMessages.createdAt))
    .limit(limit);
  // Reverse so oldest is first (chronological order for the LLM context).
  return rows.reverse();
}

async insertChatbotMessage(msg: {
  userId: string;
  brandId?: string | null;
  role: "user" | "assistant";
  content: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  model?: string | null;
}): Promise<ChatbotMessage> {
  const [row] = await db.insert(chatbotMessages).values({
    userId: msg.userId,
    brandId: msg.brandId ?? null,
    role: msg.role,
    content: msg.content,
    inputTokens: msg.inputTokens ?? null,
    outputTokens: msg.outputTokens ?? null,
    model: msg.model ?? null,
  }).returning();
  return row;
}

async pruneChatbotMessages(): Promise<{ deletedByAge: number; deletedByCap: number }> {
  // 30-day TTL.
  const ageRes = await db.execute(sql`
    delete from public.chatbot_messages
    where created_at < now() - interval '30 days'
    returning id
  `);
  const ageR = ageRes as unknown as { rows?: unknown[] } & unknown[];
  const deletedByAge = (ageR.rows?.length ?? ageR.length ?? 0);

  // Per-user soft cap of 100 messages, keeping newest.
  const capRes = await db.execute(sql`
    with ranked as (
      select id, row_number() over (partition by user_id order by created_at desc) as rn
      from public.chatbot_messages
    )
    delete from public.chatbot_messages
    where id in (select id from ranked where rn > 100)
    returning id
  `);
  const capR = capRes as unknown as { rows?: unknown[] } & unknown[];
  const deletedByCap = (capR.rows?.length ?? capR.length ?? 0);

  return { deletedByAge, deletedByCap };
}
```

(Add `chatbotMessages` to the imports from `@shared/schema` if not already present.)

- [ ] **Step 2: Add to IStorage interface** in the same file (find the interface) — add the three method signatures.

- [ ] **Step 3: Run typecheck**

### Task 7: `POST /api/assistant/chat` endpoint

**Files:**
- Create: `server/routes/assistant.ts`
- Modify: `server/routes.ts` (mount the new router) — find where other routes/* are mounted and add `setupAssistantRoutes(app)` call

- [ ] **Step 1: Write the endpoint**

```ts
import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated, requireUser } from "../auth";
import { asyncHandler } from "../lib/asyncHandler";
import { sendError } from "../lib/routesShared";
import { storage } from "../databaseStorage";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import {
  assertChatbotBudget,
  recordChatbotUsage,
} from "../lib/chatbotBudget";
import {
  BudgetExceededError,
  estimateCostCents,
  type Tier,
} from "../lib/llmPricing";
import { getOpenRouterClient, CHATBOT_MODEL } from "../lib/openrouterClient";
import { SYSTEM_PROMPT } from "../lib/chatbotKnowledge";
import { db } from "../db";
import { sql } from "drizzle-orm";

const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8_000),
  })).min(1),
  brandId: z.string().optional(),
});

export function setupAssistantRoutes(app: Express): void {
  app.post("/api/assistant/chat", isAuthenticated, asyncHandler(async (req, res) => {
    try {
      const user = requireUser(req);
      const tier = (user.accessTier ?? "free") as Tier;

      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid request",
        });
      }
      const { messages, brandId } = parsed.data;

      const last = messages[messages.length - 1];
      if (last.role !== "user") {
        return res.status(400).json({
          success: false,
          error: "Last message must be from user",
        });
      }
      if (last.content.length > 2_000) {
        return res.status(400).json({
          success: false,
          error: "Message too long (max 2,000 characters)",
        });
      }

      // 1. Budget check
      try {
        await assertChatbotBudget(user.id, tier);
      } catch (e) {
        if (e instanceof BudgetExceededError) {
          return res.status(429).json({
            success: false,
            code: "budget_exceeded",
            error: "Daily AI tutor budget reached. Resets at midnight UTC.",
          });
        }
        throw e;
      }

      // 2. Persist user message FIRST so a failed call still preserves it
      await storage.insertChatbotMessage({
        userId: user.id,
        brandId: brandId ?? null,
        role: "user",
        content: last.content,
      });

      // 3. Build prompt: cached system + last 10 messages from DB + new user msg
      const history = await storage.getChatbotHistory(user.id, 11); // includes the just-inserted user msg
      const promptMessages = [
        {
          role: "system" as const,
          content: SYSTEM_PROMPT,
        },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // 4. Call OpenRouter
      const client = getOpenRouterClient();
      let completion;
      try {
        completion = await client.chat.completions.create({
          model: CHATBOT_MODEL,
          // Anthropic cache_control passes through OpenRouter for the system message.
          // The OpenAI SDK type doesn't include cache_control; cast to any for the field.
          messages: promptMessages.map((m, i) =>
            i === 0
              ? ({ ...m, cache_control: { type: "ephemeral" } } as unknown as typeof m)
              : m,
          ),
          temperature: 0.4,
          max_tokens: 1500,
        });
      } catch (err) {
        captureAndFlush(err, { tags: { source: "assistant.chat", stage: "openrouter" } });
        return res.status(502).json({
          success: false,
          error: "AI tutor is temporarily unavailable. Please try again in a moment.",
        });
      }

      const content = completion.choices[0]?.message?.content ?? "";
      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;

      // 5. Persist assistant message
      await storage.insertChatbotMessage({
        userId: user.id,
        brandId: brandId ?? null,
        role: "assistant",
        content,
        inputTokens,
        outputTokens,
        model: CHATBOT_MODEL,
      });

      // 6. Increment usage
      await recordChatbotUsage(user.id, inputTokens, outputTokens);

      // 7. Log to api_costs for analytics
      try {
        const cents = estimateCostCents(CHATBOT_MODEL, inputTokens, outputTokens);
        await db.execute(sql`
          insert into public.api_costs (user_id, service, model, tokens_in, tokens_out, est_cost_cents)
          values (${user.id}, 'chatbot', ${CHATBOT_MODEL}, ${inputTokens}, ${outputTokens}, ${cents})
        `);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "assistant.chat: api_costs log failed");
      }

      res.json({
        success: true,
        data: { content, inputTokens, outputTokens },
      });
    } catch (error) {
      sendError(res, error, "Failed to process chatbot message");
    }
  }));
}
```

- [ ] **Step 2: Mount in `server/routes.ts`**

Find where other route setup functions are called (e.g. `setupDashboardRoutes(app)`) and add:

```ts
import { setupAssistantRoutes } from "./routes/assistant";
// ...
setupAssistantRoutes(app);
```

- [ ] **Step 3: Make `OPENROUTER_API_KEY` documented as required for chatbot**

In `server/env.ts`, add a comment by the existing `OPENROUTER_API_KEY: z.string().optional()`:

```ts
// Optional in core, but REQUIRED at runtime for the chatbot endpoint.
// The endpoint throws a clear error if missing — easier to debug than a
// process-startup hard-fail in environments that don't use the chatbot.
OPENROUTER_API_KEY: z.string().optional(),
```

- [ ] **Step 4: Run typecheck**

### Task 8: Add `chatbot-prune` cron step

**Files:**
- Modify: `server/routes/cron.ts`

- [ ] **Step 1: Add to STEP_CAPS_MS**

Append `"chatbot-prune": 5_000,` to the `STEP_CAPS_MS` object.

- [ ] **Step 2: Add the step**

Find where other steps are scheduled (look for `await orch.run("...")` lines near the end of the orchestrator). Add:

```ts
await orch.run("chatbot-prune", async () => {
  return await storage.pruneChatbotMessages();
});
```

- [ ] **Step 3: Run typecheck**

### Task 9: Server unit tests

**Files:**
- Create: `tests/unit/chatbotBudget.test.ts`
- Create: `tests/unit/assistantChat.test.ts`

- [ ] **Step 1: Write `chatbotBudget.test.ts`** (mock db.execute)

Cover:
1. `tokensUsedToday` returns 0 when no row
2. `assertChatbotBudget` throws `BudgetExceededError` when tokens >= cap
3. `assertChatbotBudget` throws when message count >= hourly cap

- [ ] **Step 2: Write `assistantChat.test.ts`** (mock OpenRouter, storage)

Cover:
1. Empty messages array → 400
2. Last message not user role → 400
3. User message > 2 KB → 400
4. Budget exceeded → 429 with `code: "budget_exceeded"`
5. Successful flow: persists user msg, calls OpenRouter, persists assistant msg, increments usage, returns data

(7 tests total: 3 + 5 = 8, but per spec we want 7; combine the two budget tests into one as `assertChatbotBudget` table-driven test.)

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/unit/chatbotBudget.test.ts tests/unit/assistantChat.test.ts
```

Expected: 7 passing.

### Task 10: `EducationAssistant` floating bubble + sheet

**Files:**
- Create: `client/src/components/EducationAssistant.tsx`
- Modify: `client/src/components/AppLayout.tsx` (mount it)
- Modify: `client/src/hooks/use-auth.ts` (add localStorage clear key)

- [ ] **Step 1: Write the component**

```tsx
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { apiRequest } from "@/lib/queryClient";
import SafeMarkdown from "@/components/SafeMarkdown";

type Msg = { role: "user" | "assistant"; content: string };

const STARTER_PROMPTS = [
  "What's the difference between GEO, AEO, and SEO?",
  "How do I get started with VentureCite?",
  "Why aren't my citations showing up yet?",
  "How should I use Reddit for AEO?",
];

export default function EducationAssistant() {
  const { user } = useAuth();
  const { selectedBrandId } = useBrandSelection();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Per-user localStorage key for conversation persistence (client-side cache).
  const storageKey = user ? `venturecite-chatbot-history:${user.id}` : null;

  // Hydrate on first open
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch {
      // ignore quota
    }
  }, [storageKey, messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const next: Msg[] = [...messages, { role: "user" as const, content: text }];
      setMessages(next);
      setInput("");
      setError(null);
      const res = await apiRequest("POST", "/api/assistant/chat", {
        messages: next,
        brandId: selectedBrandId ?? undefined,
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error ?? "Failed to send message");
      }
      return json.data.content as string;
    },
    onSuccess: (content) => {
      setMessages((m) => [...m, { role: "assistant", content }]);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSend = (text: string) => {
    if (!text.trim() || send.isPending) return;
    send.mutate(text.trim());
  };

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          aria-label="Open AI tutor"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[420px] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>AI Tutor</SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ask me anything about GEO, AEO, SEO, or how to use VentureCite.
              </p>
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="block w-full text-left text-sm border rounded-md p-2 hover:bg-accent"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "ml-8 bg-primary/10 rounded-lg p-3" : "mr-8 bg-muted rounded-lg p-3"}
              >
                <SafeMarkdown>{m.content}</SafeMarkdown>
              </div>
            ))
          )}
          {send.isPending && (
            <div className="mr-8 bg-muted rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive border border-destructive/30 rounded-md p-2">
              {error}
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            placeholder="Ask a question…"
            className="min-h-[44px] resize-none"
            maxLength={2000}
            disabled={send.isPending}
          />
          <Button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || send.isPending}
            size="icon"
            aria-label="Send message"
            className="min-h-[44px] min-w-[44px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Mount in `AppLayout.tsx`**

Add import and mount before closing `</div>` of root:

```tsx
import EducationAssistant from "./EducationAssistant";
// ...
        <main id="main-content" className="overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">{children}</div>
        </main>
      </div>
      <EducationAssistant />
    </div>
```

- [ ] **Step 3: Add localStorage clear key in `use-auth.ts`**

Find the logout-clear list (look for `venturecite-` prefix removals) and add:

```ts
`venturecite-chatbot-history:${oldUserId}`,
```

- [ ] **Step 4: Run typecheck**

### Task 11: RTL tests for `EducationAssistant`

**Files:**
- Create: `tests/unit/EducationAssistant.test.tsx`

- [ ] **Step 1: Write 5 tests**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EducationAssistant from "@/components/EducationAssistant";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "test@test.com" } }),
}));
vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "brand-1" }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/queryClient";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("EducationAssistant", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(apiRequest).mockReset();
  });

  it("renders empty state with starter prompts when opened", async () => {
    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI tutor"));
    expect(await screen.findByText(/Ask me anything about GEO/i)).toBeInTheDocument();
    expect(screen.getByText(/difference between GEO/i)).toBeInTheDocument();
  });

  it("sends message and renders assistant response", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      json: async () => ({ success: true, data: { content: "Hello back", inputTokens: 10, outputTokens: 5 } }),
    } as Response);
    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI tutor"));
    fireEvent.click(await screen.findByText(/difference between GEO/i));
    await waitFor(() => expect(screen.getByText("Hello back")).toBeInTheDocument());
  });

  it("renders friendly error when 429 budget_exceeded", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      json: async () => ({ success: false, code: "budget_exceeded", error: "Daily AI tutor budget reached. Resets at midnight UTC." }),
    } as Response);
    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI tutor"));
    fireEvent.click(await screen.findByText(/difference between GEO/i));
    await waitFor(() => expect(screen.getByText(/Daily AI tutor budget reached/i)).toBeInTheDocument());
  });

  it("hydrates messages from localStorage scoped by user.id", async () => {
    localStorage.setItem(
      "venturecite-chatbot-history:user-1",
      JSON.stringify([{ role: "assistant", content: "Welcome back" }]),
    );
    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI tutor"));
    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  });

  it("disables send button while in-flight", async () => {
    vi.mocked(apiRequest).mockImplementation(
      () => new Promise(() => {}) as Promise<Response>,
    );
    wrap(<EducationAssistant />);
    fireEvent.click(screen.getByLabelText("Open AI tutor"));
    fireEvent.click(await screen.findByText(/difference between GEO/i));
    await waitFor(() => {
      const btn = screen.getByLabelText("Send message");
      expect(btn).toBeDisabled();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/unit/EducationAssistant.test.tsx
```

Expected: 5 passing.

### Task 12: PR 5.1 verification

- [ ] **Step 1: Full typecheck + tests**

```bash
npm run check
npm test
```

Expected: clean, 274 + 7 + 5 = 286 tests passing.

- [ ] **Step 2: Manual smoke (optional, requires OPENROUTER_API_KEY)**

Set `OPENROUTER_API_KEY` in `.env`, run `npm run dev`, click bubble, ask "what is GEO" — confirm response.

---

## PR 5.2 — Streaming responses (~1.5 days)

### Task 13: Convert endpoint to SSE

**Files:**
- Modify: `server/routes/assistant.ts`

- [ ] **Step 1: Replace the call section** with SSE writer

```ts
// Open SSE response
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache, no-transform");
res.setHeader("Connection", "keep-alive");
res.setHeader("X-Accel-Buffering", "no");
res.flushHeaders();

let aborted = false;
req.on("close", () => { aborted = true; });

const heartbeat = setInterval(() => {
  if (!aborted) res.write(": heartbeat\n\n");
}, 15_000);

let acc = "";
let inputTokens = 0;
let outputTokens = 0;

try {
  const stream = await client.chat.completions.create({
    model: CHATBOT_MODEL,
    messages: promptMessages.map((m, i) =>
      i === 0
        ? ({ ...m, cache_control: { type: "ephemeral" } } as unknown as typeof m)
        : m,
    ),
    temperature: 0.4,
    max_tokens: 1500,
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    if (aborted) break;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      acc += delta;
      res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
    }
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? 0;
      outputTokens = chunk.usage.completion_tokens ?? 0;
    }
  }
} catch (err) {
  captureAndFlush(err, { tags: { source: "assistant.chat", stage: "openrouter-stream" } });
  if (!aborted) {
    res.write(`data: ${JSON.stringify({ type: "error", error: "AI tutor is temporarily unavailable." })}\n\n`);
  }
} finally {
  clearInterval(heartbeat);
}

// Persist whatever we got, even if aborted (preserves partial work)
if (acc.length > 0) {
  await storage.insertChatbotMessage({
    userId: user.id,
    brandId: brandId ?? null,
    role: "assistant",
    content: acc,
    inputTokens,
    outputTokens,
    model: CHATBOT_MODEL,
  });
  await recordChatbotUsage(user.id, inputTokens, outputTokens);
  // api_costs log (best-effort)
  try {
    const cents = estimateCostCents(CHATBOT_MODEL, inputTokens, outputTokens);
    await db.execute(sql`
      insert into public.api_costs (user_id, service, model, tokens_in, tokens_out, est_cost_cents)
      values (${user.id}, 'chatbot', ${CHATBOT_MODEL}, ${inputTokens}, ${outputTokens}, ${cents})
    `);
  } catch (err) {
    logger.warn({ err, userId: user.id }, "assistant.chat: api_costs log failed");
  }
}

if (!aborted) {
  res.write(`data: ${JSON.stringify({ type: "done", inputTokens, outputTokens })}\n\n`);
  res.end();
}
```

- [ ] **Step 2: Update SSE-shape: drop the JSON shape from validation errors** — they happen pre-stream so still return JSON body; the SSE shape only kicks in after `flushHeaders()`. Reorganize the handler so all validation + budget checks happen BEFORE `flushHeaders()`.

### Task 14: Switch client to consume SSE

**Files:**
- Modify: `client/src/components/EducationAssistant.tsx`

- [ ] **Step 1: Replace `useMutation` body** with fetch + ReadableStream

```ts
const send = useMutation({
  mutationFn: async (text: string) => {
    const next: Msg[] = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setError(null);

    const res = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ messages: next, brandId: selectedBrandId ?? undefined }),
    });

    if (!res.ok || !res.body) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error ?? "Failed to send message");
    }

    // Optimistically add an empty assistant message and stream into it
    let assistantIdx = -1;
    setMessages((m) => {
      assistantIdx = m.length;
      return [...m, { role: "assistant" as const, content: "" }];
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "delta") {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = { ...last, content: last.content + data.content };
              }
              return copy;
            });
          } else if (data.type === "error") {
            setError(data.error);
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
    return "";
  },
  onError: (err: Error) => {
    setError(err.message);
  },
});
```

- [ ] **Step 2: Run typecheck**

### Task 15: RTL test for streaming

**Files:**
- Modify: `tests/unit/EducationAssistant.test.tsx`

- [ ] **Step 1: Add a streaming test** using a mocked `ReadableStream` of 3 chunks and assert text appears progressively. (Skip if too brittle with happy-dom — use a smoke test asserting the final concatenated text instead.)

- [ ] **Step 2: Run all PR 5.2 tests**

```bash
npx vitest run tests/unit/EducationAssistant.test.tsx tests/unit/assistantChat.test.ts
```

Expected: all passing.

### Task 16: PR 5.2 verification

- [ ] **Step 1:** `npm run check && npm test` clean.
- [ ] **Step 2: Manual:** ask the chatbot a question and confirm tokens stream in progressively (visual smoke).

---

## PR 5.3 — Brand-aware system prompt (~1 day)

### Task 17: Server brand context injection

**Files:**
- Modify: `server/routes/assistant.ts`

- [ ] **Step 1: Add brand context loader**

After validation but before building prompt messages:

```ts
let brandContextBlock = "";
if (brandId) {
  const brand = await storage.getBrandById(brandId);
  if (brand && brand.userId === user.id) {
    const [articles, citationRuns] = await Promise.all([
      storage.getArticlesByUserIdWithStatus(user.id, { brandId, limit: 1, offset: 0 }),
      storage.getCitationRunsByBrandId(brandId, 30),
    ]);
    const recentRuns = citationRuns.filter(
      (r) => new Date(r.createdAt).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000,
    );
    const latest = citationRuns.find((r) => r.status === "completed" || r.status === "succeeded");
    const rate =
      latest && (latest.totalChecks ?? 0) > 0
        ? Math.round(((latest.totalCited ?? 0) / latest.totalChecks!) * 100)
        : null;
    brandContextBlock = `[Current user's brand]
Name: ${brand.name}
Industry: ${brand.industry ?? "(not set)"}
Articles: ${articles.length > 0 ? "yes" : "0"}
Citation runs in last 30 days: ${recentRuns.length}
Latest citation rate: ${rate !== null ? rate + "%" : "no completed runs yet"}

Use this context to make your answers specific to their situation. If they ask "what should I do next," reference their actual numbers.`;
  }
}
```

- [ ] **Step 2: Inject brand block AFTER the cached system prompt** (so cache stays effective):

```ts
const promptMessages = [
  { role: "system" as const, content: SYSTEM_PROMPT },
  ...(brandContextBlock ? [{ role: "system" as const, content: brandContextBlock }] : []),
  ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
];
```

(Only message index 0 gets `cache_control`. Brand block is fresh per request.)

- [ ] **Step 3: Run typecheck**

### Task 18: Server unit test for brand context

**Files:**
- Modify: `tests/unit/assistantChat.test.ts`

- [ ] **Step 1: Add a test** that mocks `storage.getBrandById` returning a matching brand, asserts the OpenRouter call receives the brand context as a system message.

- [ ] **Step 2: Run**

### Task 19: PR 5.3 verification

- [ ] **Step 1:** `npm run check && npm test` clean (target: 287 tests).
- [ ] **Step 2: Manual:** with a brand selected, ask "what should I do next?" — confirm response references brand specifics.

---

## End-to-end Phase 5 verification

- [ ] `npm run check` clean
- [ ] `npm test` — target 287 tests passing
- [ ] `npx eslint server/ client/src/` — 0 new errors
- [ ] Manual smoke: open chatbot on dashboard, ask a question, confirm streamed response, switch brand, ask brand-specific question, hammer 21 messages in an hour to confirm 429 rate limit
- [ ] Confirm `chatbot_messages` rows persist with correct token counts
- [ ] Confirm `chatbot_token_usage` row increments per call

---

## Files touched (full list)

**New (server):**
- `migrations/0048_chatbot_messages.sql`
- `server/lib/openrouterClient.ts`
- `server/lib/chatbotKnowledge.ts`
- `server/lib/chatbotBudget.ts`
- `server/routes/assistant.ts`

**New (client):**
- `client/src/components/EducationAssistant.tsx`

**New (tests):**
- `tests/unit/chatbotBudget.test.ts`
- `tests/unit/assistantChat.test.ts`
- `tests/unit/EducationAssistant.test.tsx`

**Modified:**
- `shared/schema.ts` (chatbot tables)
- `server/databaseStorage.ts` (3 methods + interface)
- `server/lib/llmPricing.ts` (chatbot caps + Sonnet pricing)
- `server/routes.ts` (mount assistant routes)
- `server/routes/cron.ts` (chatbot-prune step)
- `server/env.ts` (comment on OPENROUTER_API_KEY)
- `client/src/components/AppLayout.tsx` (mount bubble)
- `client/src/hooks/use-auth.ts` (logout-clear key)

**No commits during execution. User reviews full diff at end.**
