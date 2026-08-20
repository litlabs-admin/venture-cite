# Agent instructions

## Language

Write all output in ASD-STE100 Simplified Technical English.

- Write one idea in each sentence.
- Keep instructions to 20 words or fewer.
- Keep descriptions to 25 words or fewer.
- Use active voice.
- Use simple present, past, or future tense.
- Use one word for one meaning.
- Use articles in full.
- Avoid idioms, metaphors, and vague technical words.

## Project facts

VentureCite is a React and Express application.

The client uses Vite, TanStack Router, TanStack Query, React Hook Form, Zod, Radix UI, and Tailwind CSS.

The server uses Express, Drizzle, PostgreSQL, Supabase, Stripe, Resend, OpenAI, OpenRouter, Pino, and Sentry.

The build creates a Nitro server under `dist/server`. The production command runs `dist/server/index.mjs`.

## Change rules

- Read `package.json` before you add a dependency or document a command.
- Read the related source and tests before you change code or docs.
- Add new API modules under `server/routes/`. Do not add new route areas to `server/routes.ts`.
- Validate request input at the API boundary.
- Require a Bearer token for protected `/api/` routes.
- Scope user data by `userId` or `brandId`.
- Return 404 for an ownership miss.
- Use `logger` for server logs. Do not use `console.log`.
- Use `SafeMarkdown` for user Markdown. Do not use `dangerouslySetInnerHTML` for user content.
- Scope a new local-storage key by user ID. Clear it at logout.
- Use integer cents for a new money value.

## Database and jobs

Keep schema changes in `shared/schema.ts` and add the next SQL file in `migrations/`.

Run migrations with `npm run db:migrate` in a controlled release step.

The runner records filenames in `public.schema_migrations`. It uses a PostgreSQL advisory lock and one transaction per file.

Production database TLS must verify certificates. Set `DATABASE_CA_CERT_PATH` or `DATABASE_SSL_REJECT_UNAUTHORIZED=true`.

Do not run the in-process scheduler with an external daily orchestrator. Set `DISABLE_IN_PROCESS_SCHEDULER` when an external scheduler calls the cron API.

## Verification

Run these checks after a non-trivial change.

```sh
npm run check
npm run lint
npm run format:check
npm test
```

For a UI change, run `npm run dev` and test the affected user path.

For a release change, read [docs/OPERATIONS.md](docs/OPERATIONS.md).
