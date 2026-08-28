# Slice S01-server-core

Files assigned: 13
Files read in full: 13
Total lines read: 2496

## Findings

### F-S01-server-core-001 | critical | security
File: server/auth.ts:231-256
What the code does: The public allowlist includes PUT requests for the shared boards. The API guard skips authentication for every allowlisted method and path.
Why it is wrong: The board route replaces the complete shared board in system_state on each PUT (server/routes/board.ts:104-123). The route has no authentication middleware.
How it fails: An unauthenticated visitor sends a valid tickets array to PUT /api/board. The request passes the allowlist and erases or replaces the internal roadmap.
Confidence: high

### F-S01-server-core-002 | high | correctness
File: server/auth.ts:44-58, 99-110
What the code does: isAuthenticated returns immediately when req.user already exists. The preceding attachUserIfPresent middleware sets req.user for valid Bearer tokens (server/auth.ts:262-286; server/routes.ts:79-88).
Why it is wrong: The early return skips the lazy workflow tick, request user context, and Sentry user assignment. The lazy tick is the replacement for the removed global workflow cron.
How it fails: Every normal authenticated API request reaches isAuthenticated with an existing user and returns at line 58. No request calls maybeTickActiveRunsForUser, so active workflow runs do not advance through this mechanism.
Confidence: high

### F-S01-server-core-003 | high | configuration
File: server/env.ts:80, 194-197
What the code does: The environment schema always requires OPENAI_API_KEY. The parser throws when the key is absent.
Why it is wrong: The fake content provider explicitly supports running without an OpenAI key (server/lib/localFlowSafety.ts:27-29). The local example also selects the fake provider and tells users to keep provider keys empty (.env.example:92-99).
How it fails: A local environment with CONTENT_GENERATION_PROVIDER=fake and no OPENAI_API_KEY fails startup during environment parsing. The documented fake-provider flow cannot start.
Confidence: high

### F-S01-server-core-004 | medium | correctness
File: server/auth.ts:582-618
What the code does: The login handler stamps welcomedAt before it schedules sendWelcomeEmail. It ignores the sender's false result and records no retry state.
Why it is wrong: sendWelcomeEmail returns false when Resend is not configured or when delivery fails (server/lib/welcomeEmail.ts:32-35, 71-87). The non-null welcomedAt value prevents later login attempts from scheduling the message.
How it fails: The first verified login during a Resend outage sets welcomedAt. Later logins treat the message as already sent, so the user never receives the welcome email even after delivery recovers.
Confidence: high

### F-S01-server-core-005 | medium | performance
File: server/routes.ts:362-373, 424-429
What the code does: The dashboard and onboarding endpoints call getArticles without a limit and filter the full result in memory. The storage method returns every article when no limit is supplied (server/databaseStorage.ts:494-500).
Why it is wrong: The repository provides a user-scoped, limited method for HTTP routes (server/databaseStorage.ts:505-518). These endpoints still read all tenants' articles for every request.
How it fails: As the article table grows, one dashboard or onboarding request loads the complete table into the process. This increases database work, memory use, and response time for every user.
Confidence: high

### F-S01-server-core-006 | medium | correctness
File: server/routes.ts:270-295
What the code does: Beta validation consumes an invite code, then updates the authenticated user's tier in a separate database operation.
Why it is wrong: The invite operation increments used_count before the user update (server/databaseStorage.ts:1992-2007). The route does not use one transaction for both changes.
How it fails: If updateUserStripeInfo fails after code consumption, the request returns an error and the user receives no tier. The invite use is still lost.
Confidence: high

### F-S01-server-core-007 | medium | security
File: server/routes.ts:301-323
What the code does: The admin invite endpoint generates an eight-character base-36 code with Math.random when the caller omits a code. The validation endpoint has no endpoint-specific rate limit (server/routes.ts:270-291).
Why it is wrong: Math.random is not a cryptographic generator for a bearer access code. Unlimited authenticated guesses can target the short generated code space.
How it fails: An attacker with any account can repeatedly submit guessed codes to POST /api/beta/validate. A successful guess grants the tier stored on the invite.
Confidence: medium

### F-S01-server-core-008 | medium | security
File: server/instrument.ts:7-18, 28-46, 59-60
What the code does: beforeSend recursively redacts only the listed personal-data keys and email-shaped strings. It does not list password, token, secret, apiKey, or authorization.
Why it is wrong: Sentry receives the value of an unlisted secret key unchanged. The logger has a separate sensitive-key list, but this Sentry redactor does not share it.
How it fails: redactSentryValue({ token: "secret-value" }) retains the token. Any captured event containing a token or API key can send that value to Sentry.
Confidence: high

### F-S01-server-core-009 | medium | security
File: server/app.ts:84-90
What the code does: The production HTTP redirect builds its Location header from the request Host header.
Why it is wrong: The handler does not compare Host with APP_URL or an approved host list.
How it fails: An HTTP request that reaches Express with Host: attacker.example receives a 301 redirect to https://attacker.example plus the original path.
Confidence: high

### F-S01-server-core-010 | medium | resource abuse
File: server/routes.ts:229-253
What the code does: The public waitlist endpoint validates an email and inserts it. It has no rate-limit middleware. The endpoint is public in the authentication allowlist (server/auth.ts:180-187).
Why it is wrong: The endpoint accepts a new arbitrary email value on every request and stores each distinct value.
How it fails: A script submits many unique valid-looking addresses. Each request adds a persistent row and can grow the waitlist without an application limit.
Confidence: high

### F-S01-server-core-011 | low | correctness
File: server/app.ts:335-364
What the code does: The terminal handlers use /api/*splat and /webhooks/*splat patterns.
Why it is wrong: Express 5.2.1 does not match these wildcard patterns for the base paths /api or /api/ (package.json:95). The authentication guard also checks only paths starting with /api/ (server/auth.ts:252-256).
How it fails: GET /api does not enter the API guard or the terminal 404 handler. It falls through to the adapter or development HTML fallback instead of returning the promised JSON 404.
Confidence: high

### F-S01-server-core-012 | low | reliability
File: server/app.ts:329-334
What the code does: prepareApp stores the first registration promise and returns it for every later call.
Why it is wrong: The code never clears prepared when registerRoutes rejects.
How it fails: One route-registration failure poisons the process-wide promise. Every later prepareApp call returns the same rejected promise, even if the original failure was transient.
Confidence: high

### F-S01-server-core-013 | low | maintainability
File: server/log.ts:1-9
What the code does: The exported log helper writes directly to console.log. server/app.ts calls it for the CORS allowlist and development request summaries (server/app.ts:127, 296-300).
Why it is wrong: Direct console output bypasses the configured Pino log level, structured fields, request context, and central redaction path.
How it fails: LOG_LEVEL=silent does not suppress these messages. Log aggregators receive plain text instead of the server's structured log records.
Confidence: high

## Files with no findings
- server/db.ts (64 lines)
- server/index.ts (106 lines)
- server/nitroBoot.ts (140 lines)
- server/nitroConditionalRequests.ts (54 lines)
- server/stripeClient.ts (54 lines)
- server/supabase.ts (33 lines)
- server/vite.ts (90 lines)

## UNDETERMINED
- Whether the production reverse proxy rejects unrecognized Host headers before Express. Resolve with the active proxy configuration and a live HTTP request test.
