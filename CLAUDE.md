# CLAUDE.md — Operating context for AI-paired development

This file is loaded by Claude Code on every session start. Keep it tight; link out for depth.

---

## MANDATORY: language rule

Always write in ASD-STE100 Simplified Technical English. This applies to all output: chat replies, code comments, commit messages, docs, and UI copy.

- One idea per sentence. Instructions max 20 words, descriptions max 25 words.
- Use the active voice. Give instructions as commands ("Click Save", not "Save can be clicked").
- Use one word for one meaning. Do not use synonyms for variety.
- Use simple present, past, or future tense. No `-ing` verb forms as the main verb.
- Write articles ("the", "a") in full. Do not drop them.
- No idioms, no metaphors, no jargon that a plain word can replace.

---

## What this codebase is

VentureCite — pre-launch GEO SaaS. Single-tenant rooted at `users`; brands hang off users; everything else hangs off brands. Single-instance deployment for now (multi-instance items in [`AUDIT.md`](AUDIT.md) are deferred — see plan in `~/.claude/plans/`).

---

## Tech stack at a glance

- **Frontend**: React 18, Vite, Wouter (router), TanStack Query (server state), Radix UI + Tailwind, React Hook Form + Zod
- **Backend**: Express 4 (ESM), Drizzle ORM + raw `pg.Pool`, Supabase JWT auth (Bearer header — no cookies), node-cron in-process scheduler, polling worker on `content_generation_jobs`
- **External**: Stripe, OpenAI, OpenRouter, Resend, Buffer (optional)
- **Observability**: Sentry + Pino, request-ID middleware via AsyncLocalStorage
- **Quality gates**: ESLint flat config, Prettier, Vitest, Husky pre-commit, GitHub Actions CI

---

## Golden paths (use these patterns; resist inventing new ones)

### Adding an API endpoint
1. Add DB columns to [`shared/schema.ts`](shared/schema.ts) + write a migration in `migrations/` (next sequential number)
2. Add DAO method to [`server/databaseStorage.ts`](server/databaseStorage.ts) (will move to per-entity files in Wave 5)
3. Add route in [`server/routes.ts`](server/routes.ts) — wrap in `isAuthenticated` + appropriate `require*Ownership` from [`server/lib/ownership.ts`](server/lib/ownership.ts)
4. Validate request body with a Zod schema (often via `drizzle-zod` `createInsertSchema`)
5. Add a Vitest test in `tests/` if the route involves money, auth, or ownership
6. Frontend: add a TanStack Query hook (don't `fetch` from a component); use the shared `apiRequest` helper in [`client/src/lib/queryClient.ts`](client/src/lib/queryClient.ts)

### Logging
- **Server**: import `logger` from `./lib/logger`. Use `logger.info({ ...fields }, "msg")` style — fields first, message second. Never `console.log` in server code (ESLint warns).
- **Errors with context**: `logger.error({ err, brandId }, "what went wrong")` — Pino's serializer extracts the stack.
- **Sentry**: capture explicitly for unexpected paths: `Sentry.captureException(err, { tags: { source: "..." } })`. The global error handler already captures 5xx; you only need explicit captures inside catch blocks that swallow errors locally (worker tick, cron jobs).

### Auth & ownership
- Auth = Supabase JWT in `Authorization: Bearer ...`. Verified by `isAuthenticated` middleware in [`server/auth.ts`](server/auth.ts).
- Ownership scoping uses the `app.param` interceptors (auto-applied per `:brandId`, `:articleId` route params) plus explicit `require*` helpers in [`server/lib/ownership.ts`](server/lib/ownership.ts). 404 (not 403) on miss — anti-enumeration.
- Multi-tenant scoping is **app-level only** (no Postgres RLS). Every query that returns user data must filter by `userId` or `brandId`. New queries without scoping will be caught in code review.

### Database
- Drizzle ORM for app code. Raw `pool` only for migrations + advisory-lock health checks.
- Migrations are auto-applied on boot from `migrations/*.sql` in lex order ([`server/index.ts:181-236`](server/index.ts#L181-L236)). One file = one transaction. No down-migrations exist; reversibility is a Wave 4/5 fix.

### Workers
- Content worker polls `content_generation_jobs` every 5s and uses `FOR UPDATE SKIP LOCKED` to claim. **Do not start a second instance** until the leader-election work in the deferred backlog lands.
- Scheduler crons run in-process. Same caveat.

---

## What NOT to do

- ❌ Don't write to `localStorage` from new code without scoping the key by `userId` (see [`client/src/lib/draftStore.ts`](client/src/lib/draftStore.ts) for the right pattern). Add the key to the logout-clear list in [`client/src/hooks/use-auth.ts`](client/src/hooks/use-auth.ts) too.
- ❌ Don't mock the database in integration tests — use a real Supabase test project or in-memory pg if absolutely needed.
- ❌ Don't add a new dependency without checking it isn't already in `package.json` (see redundant `react-icons` + `lucide-react`, `tw-animate-css` + `tailwindcss-animate` — those are tracked for removal).
- ❌ Don't create new monolithic files. `server/routes.ts` is already 7000+ lines; resist adding more. New domain area → new file under `server/routes/` (Wave 5 will split the existing one).
- ❌ Don't skip the audit log on a sensitive operation — when Wave 2 lands, every delete/subscription/admin op will write to `audit_logs` via a `withAudit()` wrapper.
- ❌ Don't `dangerouslySetInnerHTML` user content. Use [`client/src/components/SafeMarkdown.tsx`](client/src/components/SafeMarkdown.tsx) (rehype-sanitize).

---

## Where to look first

| Question | Look here |
|---|---|
| What does the audit say about X? | [`AUDIT.md`](AUDIT.md) → linked group file |
| What's the remediation order? | `~/.claude/plans/how-should-we-go-noble-reddy.md` |
| How is auth wired? | [`server/auth.ts`](server/auth.ts) + [`server/lib/ownership.ts`](server/lib/ownership.ts) |
| Where do API routes live? | [`server/routes.ts`](server/routes.ts) (one file today; per-domain Wave 5) |
| Schema / FKs / cascade rules | [`shared/schema.ts`](shared/schema.ts) + [`migrations/0003_fk_hardening.sql`](migrations/0003_fk_hardening.sql) |
| How does logging work? | [`server/lib/logger.ts`](server/lib/logger.ts), [`server/instrument.ts`](server/instrument.ts) |
| Webhook patterns | [`server/webhookHandlers.ts`](server/webhookHandlers.ts) (Stripe — reference for future Shopify HMAC) |
| Worker / queue | [`server/contentGenerationWorker.ts`](server/contentGenerationWorker.ts), [`server/scheduler.ts`](server/scheduler.ts) |
| Env vars | [`server/env.ts`](server/env.ts), [`.env.example`](.env.example) |
| Architecture overview (some sections stale) | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

---

## Conventions

- **Imports**: `@/` = `client/src/`. `@shared/` = `shared/`. Server uses relative imports (no alias).
- **File naming**: kebab-case for pages (`pages/ai-intelligence.tsx`), PascalCase for components (`components/Sidebar.tsx`).
- **DB column ↔ JS field**: snake_case in DB, camelCase in Drizzle schema (Drizzle handles the mapping).
- **Time**: store UTC. User-timezone awareness is deferred (Wave 4/K).
- **Money**: revenue is currently stored as JS Number — Wave 4.1 migrates to integer cents. **Don't add new money columns as float**.
- **Toasts**: use the `useToast()` hook from `@/components/ui/use-toast`.

---

## Verification rituals

After any non-trivial change, before claiming done:

```bash
npm run check        # tsc strict
npm run lint         # 0 errors
npm run format:check # Prettier clean
npm test             # all green
```

Husky's pre-commit hook runs lint-staged on changed files only — but full `npm test` and `npm run check` are CI-only, so run them locally before pushing.

For UI changes: spin up `npm run dev` and click through the affected flow. Type-checks don't catch UX regressions.

---

## Known landmines (don't be surprised)

- `server/routes.ts` is 7000+ lines. Search before grepping.
- `server/databaseStorage.ts` mixes mocks with real implementations in places.
- `shared/schema.ts` ships to the browser (Wave 5 splits it).
- Three overlapping onboarding UIs exist (Wave 4.7 consolidates).
- Cascade deletes (`migrations/0003_fk_hardening.sql`) silently purge ~20 tables on brand delete. Soft delete arrives in Wave 4.5.
- The Stripe webhook is correctly verified + idempotent. The Shopify webhook **isn't yet** — see Wave 1.1.

---

## When in doubt

- Read the audit's relevant group file in [`audit/`](audit/) — it cites specific lines.
- Check the remediation plan to see if the issue is already scheduled.
- Ask before refactoring something that isn't on the plan; pre-launch refactors land in Wave 5.
