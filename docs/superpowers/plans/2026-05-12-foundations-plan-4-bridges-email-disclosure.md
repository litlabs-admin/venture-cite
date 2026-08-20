# Foundations Plan 4 — Bridges + Email verification + AI disclosure

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Close three independent gaps the Foundations spec calls out: two known dead bridges in user flows, missing email verification on signup, and missing AI-generation disclosure on articles.

**Architecture:** Four parallel-safe tasks across mostly disjoint files. Each task is small (~30-90 min). All can dispatch in one wave.

**Plan-wide rules:**

- **DO NOT COMMIT.** No `git commit`, ever.
- **DO NOT run ANY git command that mutates state.** Read-only only.
- **DO NOT TRUST .md files** — verify everything against current code.
- **Vercel Hobby ceiling.** No new external services. Resend is already wired.
- **Token compliance.** Any new UI uses design tokens.

**Spec reference:** [docs/superpowers/specs/2026-05-10-foundations-design.md](../specs/2026-05-10-foundations-design.md) §4.6 (Bridge fixes), §4.8 (Email verification), §4.9 (AI disclosure).

---

## Task 1: Welcome → fact-scrape bridge (§4.6 first item)

**Goal:** `/welcome` confirm path doesn't trigger `scrapeBrandFacts`. Users who finish onboarding via this path land on `/brand-fact-sheet` which polls every 3s for 2 min for facts that will never arrive.

**Files:**

- Modify: `server/routes/onboarding.ts`

**Steps:**

- [ ] Recon:
  ```bash
  grep -n "runOnboardingAutopilot\|scrapeBrandFacts\|confirm" server/routes/onboarding.ts
  grep -n "scrapeBrandFacts" server/routes/brands.ts server/lib/factExtractor*
  ```
- [ ] In the `POST /api/onboarding/confirm` handler, immediately after `runOnboardingAutopilot(...)` is invoked, add `setImmediate(() => scrapeBrandFacts(brand.id).catch((err) => logger.warn({ err, brandId: brand.id }, "Welcome-path fact scrape failed")))`. Import `scrapeBrandFacts` from whichever module exports it (verify path).
- [ ] Type-check: `npm run check`.

**DO NOT COMMIT.**

---

## Task 2: Keyword research → content URL handoff (§4.6 second item)

**Goal:** Clicking "Generate Content" on a keyword in `/keyword-research` navigates to `/content?keyword=...&industry=...&type=...&brandId=...`. `content.tsx` does not parse those URL params. Click → blank draft.

**Files:**

- Modify: `client/src/pages/content.tsx`
- Verify (read-only): `client/src/pages/keyword-research.tsx` (the link source — `~line 147-155`)

**Steps:**

- [ ] Recon:
  ```bash
  grep -n "useSearch\|URLSearchParams\|keyword\|brandId" client/src/pages/content.tsx
  grep -n "keyword.*brandId\|/content?" client/src/pages/keyword-research.tsx
  ```
  Confirm the exact param names keyword-research sends.
- [ ] In `content.tsx`, import `useSearch` from wouter. Parse the search string with `URLSearchParams`. On mount, if `keyword`, `industry`, `type`, or `brandId` are present AND the bootstrap effect creates a new draft, pass them as initial values to the form state setter.

  ```tsx
  import { useSearch } from "wouter";
  // In the component:
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const seedKeyword = params.get("keyword") ?? undefined;
  const seedIndustry = params.get("industry") ?? undefined;
  const seedType = params.get("type") ?? undefined;
  const seedBrandId = params.get("brandId") ?? undefined;
  ```

  Wire these into the existing initial-draft creation effect. If keyword-research sends `topic` instead of `keyword` (or some other rename), match what it actually sends.

- [ ] Verify keyword-research param names still align after the read. If they're out of sync, prefer fixing keyword-research to match what content.tsx now reads (so future callers benefit from the canonical names).
- [ ] Type-check + lint.

**DO NOT COMMIT.**

---

## Task 3: Email verification + welcome email (§4.8)

**Goal:** `server/auth.ts:288` calls `createUser({ email_confirm: true })` — skipping Supabase email verification. Anyone can register with [REDACTED EMAIL] and be instantly logged in.

**Files:**

- Modify: `server/auth.ts` — flip `email_confirm: false`, return `{ requiresVerification: true }` on register, add resend-link endpoint with cooldown
- Maybe modify: `client/src/pages/register.tsx` — handle the new `requiresVerification` flag (redirect to a post-submit screen)
- Maybe create: `client/src/pages/verify-email.tsx` — post-submit "check your email" screen with resend button. OR reuse the `forgot-password.tsx` post-submit pattern.
- Maybe create: `server/lib/welcomeEmail.ts` — Resend template fired on first verified login
- Modify: `server/routes/auth.ts` (or wherever auth routes live) — add `POST /api/auth/resend-verification` with rate limit
- Migration: only if `lastVerificationEmailAt` column is needed for cooldown
- Tests: `tests/unit/emailVerification.test.ts`

**Steps:**

- [ ] Recon:

  ```bash
  grep -n "email_confirm\|createUser\|signUp" server/auth.ts
  grep -n "POST.*register\|register" server/auth.ts server/routes/
  grep -n "Resend\|resend\|sendEmail" server/lib/ 2>/dev/null | head -10
  grep -n "lastVerificationEmailAt\|lastLoginAt\|emailVerifiedAt" shared/schema.ts
  ```

- [ ] Flip `createUser` to `email_confirm: false`. Update the register handler to return `{ success: true, requiresVerification: true }` instead of an immediate session. The user is created in Supabase, but not signed in — Supabase sends the confirmation email automatically.

- [ ] Backfill existing users to remain verified: in a new migration, set `email_confirmed_at = NOW()` for every existing row. Use the next sequential number (probably 0054). This avoids invalidating the team's own test accounts.

  ```sql
  -- migrations/0054_backfill_email_confirmed_at.sql
  -- NOOP if Supabase already manages email_confirmed_at outside our DB. If our `users` table mirrors this field, backfill it. If not, this migration is empty/skipped.
  -- Check whether `users.emailVerifiedAt` or similar exists; if not, no migration is needed.
  ```

  If our schema doesn't have an `emailVerifiedAt` mirror (Supabase manages this internally on the auth side), no migration is needed — verify by inspection.

- [ ] Update `client/src/pages/register.tsx`:
  - On `{ requiresVerification: true }` response, redirect to a "Check your email" screen (either reuse `forgot-password.tsx` post-submit pattern or create `/verify-email`)
  - "Resend verification" button with 60-second client-side cooldown

- [ ] Add `POST /api/auth/resend-verification` endpoint with rate limit:
  - Body: `{ email: string }`
  - Server-side rate limit: 3 per hour per (IP, email). Use the existing rate-limiter pattern if one exists (`grep -n "rateLimit\|expressRateLimit" server/`); else use an in-memory map keyed on `${ip}:${email}` with 60s and hourly buckets.
  - Calls Supabase Admin to re-send the verification email: `supabaseAdmin.auth.admin.generateLink({ type: 'signup', email })` or `supabaseUserClient.auth.resend({ type: 'signup', email })` — pick whichever matches the installed SDK version.

- [ ] Ship welcome email via Resend on first verified login. The trigger: when a user's `lastLoginAt` is set for the first time after verification.
  - Create `server/lib/welcomeEmail.ts` with a Resend template
  - Hook into the login path in `server/auth.ts` — check if this is the user's first login (e.g., `dbUser.lastLoginAt === null` before updating it) and send once

- [ ] Tests in `tests/unit/emailVerification.test.ts`:
  - Register with `email_confirm: false` returns `{ requiresVerification: true }` instead of session
  - Resend endpoint enforces 60-second client cooldown (server-side rate limit)
  - Resend endpoint enforces 3-per-hour rate limit
  - Welcome email sent exactly once on first verified login

- [ ] Type-check + run tests.

**Risk:** Flipping `email_confirm: false` will break any test accounts that haven't confirmed. Mitigation: backfill in the migration (or manually in Supabase Dashboard if no DB mirror exists).

**DO NOT COMMIT.**

---

## Task 4: AI disclosure (§4.9)

**Goal:** AI-generated articles carry no disclosure label. FTC AI-disclosure guidelines apply; brand trust depends on it.

**Files:**

- Migration: `migrations/0055_articles_ai_generated.sql`
- Modify: `shared/schema.ts` — add `aiGenerated: boolean("ai_generated").notNull().default(false)`
- Modify: `server/contentGenerationWorker.ts` — when transitioning to `ready` from a generated job, set `ai_generated: true`. Manual edits do NOT flip the flag.
- Create: `client/src/components/AIGeneratedPill.tsx` — `<Sparkles /> AI-generated` in muted chrome
- Modify: `client/src/pages/articles.tsx` — pill on row card
- Modify: `client/src/components/articles/ViewEditDialog.tsx` — pill in header
- Modify: `client/src/components/articles/DistributeDialog.tsx` — pill in preview
- Modify: `client/src/pages/content.tsx` — pill on ready-state header
- Tests: `tests/unit/articlesAIGenerated.test.ts`

**Steps:**

- [ ] Recon:

  ```bash
  ls migrations/ | sort | tail -5
  grep -n "articles\b" shared/schema.ts | head -10
  grep -n "setArticleReady\|articles.*status.*ready" server/contentGenerationWorker.ts | head -10
  ```

  Confirm next migration number, find where status flips to `ready`.

- [ ] Create migration `migrations/0055_articles_ai_generated.sql`:

  ```sql
  ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false;
  ```

- [ ] Add Drizzle column: `aiGenerated: boolean("ai_generated").notNull().default(false)` on `articles` in `shared/schema.ts`.

- [ ] In `server/contentGenerationWorker.ts`, when the article transitions from any pending/running state into `ready` via a generation job, set `ai_generated: true`. Find the existing setArticleReady call or equivalent and extend its update payload.

- [ ] Backfill: in the same migration or a follow-up, set `ai_generated = true` for every existing article that was created via the worker:

  ```sql
  -- Backfill: every article that has a content_generation_jobs row was AI-generated.
  UPDATE articles SET ai_generated = true
  WHERE id IN (SELECT DISTINCT article_id FROM content_generation_jobs);
  ```

- [ ] Create `client/src/components/AIGeneratedPill.tsx`:

  ```tsx
  import { Sparkles } from "lucide-react";
  import { cn } from "@/lib/utils";

  export function AIGeneratedPill({ className }: { className?: string }) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
        aria-label="AI-generated content"
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        AI-generated
      </span>
    );
  }
  ```

- [ ] Mount the pill in 4 places, gated on `article.aiGenerated`:
  - `client/src/pages/articles.tsx` row card title row
  - `client/src/components/articles/ViewEditDialog.tsx` header
  - `client/src/components/articles/DistributeDialog.tsx` preview
  - `client/src/pages/content.tsx` ready-state header

- [ ] Add `aiGenerated` to any API response shape that returns article data (if it's already on the row, no work; if a response transformer omits it, include it).

- [ ] Tests:
  - Generation flow flips `ai_generated = true` when status reaches `ready`
  - Manual article creation (POST /api/articles directly with no generation job) keeps `ai_generated = false`

- [ ] Type-check + lint + run tests.

**DO NOT COMMIT.**

---

## Self-Review

**1. Spec coverage:**

| Spec section                      | Plan 4 task |
| --------------------------------- | ----------- |
| §4.6 welcome→fact-scrape          | Task 1      |
| §4.6 keyword→content              | Task 2      |
| §4.8 email verification           | Task 3      |
| §4.8 welcome email                | Task 3      |
| §4.9 articles.ai_generated column | Task 4      |
| §4.9 AIGeneratedPill              | Task 4      |

All §4.6, §4.8, §4.9 covered.

**2. Placeholder scan.** No TBD; every step has concrete code or shell command.

**3. Type consistency.** `aiGenerated` boolean naming consistent across schema, worker, API, and component prop.

**4. Wave structure.**

- Tasks 1, 2, 3, 4 — all parallel-safe (different files). Single wave.

**5. Risks.**

- Task 3: existing test accounts could break on `email_confirm: false` flip. Mitigation: backfill or manual confirmation in Supabase Dashboard.
- Task 4: migration is additive + default false; safe.
- Task 1: setImmediate fire-and-forget pattern matches existing `brands.ts` use. Safe.

Plan complete.
