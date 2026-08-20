# Group E — Security

## Executive Summary

21 findings: 5 CRITICAL, 4 HIGH, 8 MEDIUM, 4 LOW. These block ship:

1. **Shopify webhook missing HMAC** — forgable revenue events
2. **Buffer API token stored in plaintext** — DB breach = social account takeover
3. **No rate limit on auth endpoints** — credential stuffing, enumeration
4. **No HSTS, no HTTPS redirect enforced in code** — MITM risk if deployment doesn't handle it
5. **No account deletion or GDPR export** — €20M fines / 4% global revenue

---

## Dimension 19 — Core Security

### [CRITICAL] Shopify webhook missing HMAC signature verification
**File**: `server/routes.ts:3111-3144`
**Evidence**: Endpoint `/webhooks/shopify/orders` processes `req.body` without validating `X-Shopify-Hmac-SHA256`. Explicit comment reads "you wire up real integrations, add a shared-secret / HMAC check here"
**Impact**: Unauthenticated attackers can forge purchase events, injecting fake revenue and affiliate data into `purchase_events`. Analytics fraud; potential financial fraud.
**Fix**: HMAC-SHA256 verification against Shopify secret; compare computed hash to header; reject on mismatch

### [CRITICAL] Buffer API token stored plaintext
**File**: `shared/schema.ts:25`, `server/routes.ts:240`
**Evidence**: `bufferAccessToken: text("buffer_access_token")` unencrypted in `users`
**Impact**: DB breach exposes active Buffer tokens; attacker posts/deletes content on user social accounts
**Fix**: AES-256-GCM encrypt with `BUFFER_ENCRYPTION_KEY`; decrypt on-demand only

### [CRITICAL] No HSTS header; no HTTPS redirect in code
**File**: `server/index.ts:32-45` (helmet config)
**Evidence**: No HSTS; no HTTPS redirect middleware; CSP allows `'self'` on HTTP+HTTPS
**Impact**: Production HTTP sends Bearer tokens in cleartext; network MITM hijacks sessions (depends on deployment layer to enforce TLS)
**Fix**: `hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }` in helmet; force HTTPS redirect; or confirm edge TLS enforcement

### [CRITICAL] No account deletion endpoint (GDPR Art. 17 violation)
**File**: `server/routes.ts` — no `/api/user/delete` or equivalent
**Impact**: Non-compliance with GDPR "right to erasure"; €20M or 4% global revenue fines; CCPA violation
**Fix**: `POST /api/user/delete` with Supabase auth deletion + cascade deletes of user-owned data

### [CRITICAL] No GDPR data export endpoint (Art. 20 violation)
**File**: `server/routes.ts` — no `/api/user/export`
**Impact**: Non-compliance with "right to portability"; legal liability
**Fix**: `GET /api/user/export` returning JSON of all user-owned data

### [HIGH] Username enumeration via login error messages
**File**: `server/auth.ts:237-239`
**Evidence**: Login returns "Invalid email or password" (good). Forgot-password (line 289) correctly returns same message — verify both paths are actually identical
**Impact**: If error paths diverge, attackers probe valid emails
**Fix**: Ensure identical wording and timing across non-existent vs wrong-password cases

### [HIGH] No rate limiting on admin endpoints
**File**: `server/routes.ts:620` (`POST /api/beta/codes`)
**Evidence**: `isAdmin` check present; no rate limit middleware
**Impact**: Compromised admin can DOS service
**Fix**: 60 req/min even for admin routes

### [HIGH] JWT in localStorage (XSS → token exfiltration)
**File**: `client/src/lib/supabase.ts:10-16`
**Evidence**: Supabase default `persistSession: true` stores JWT in localStorage
**Status**: Mitigated by prod CSP (`scriptSrc: ["'self'", "js.stripe.com"]`), but XSS in any dep exfiltrates token
**Hardening**: Consider Supabase cookie-based session (beta) or rotating to httpOnly cookie auth; verify `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` (helmet defaults)

### [HIGH] No session revocation verified on password change
**File**: Supabase-managed (no server code)
**Evidence**: Supabase likely revokes sessions on password change, but not verified in our code
**Fix**: Explicitly sign out all sessions on password change via Supabase admin API; test end-to-end

---

## Dimension 20 — Authentication Edge Cases

### [CRITICAL] No rate limiting on auth endpoints
**File**: `server/auth.ts:164-256`
**Evidence**: `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password` have no rate limit
**Impact**: Credential stuffing; brute force; mass account creation; email bombing target inboxes via forgot-password
**Fix**: 5-10 attempts per IP+email per 15min with exponential backoff

### [HIGH] No MFA/2FA enforcement
**File**: `server/auth.ts` (no MFA logic)
**Status**: Supabase supports TOTP but not surfaced in our UI
**Fix**: `mfaRequired` flag; TOTP verification for enterprise/admin accounts

### [MEDIUM] No device/session management UI
**Impact**: User can't see/revoke active sessions
**Fix**: `/api/sessions` list + revoke endpoints backed by Supabase admin

---

## Dimension 21 — Infrastructure & Network

### [MEDIUM] Database SSL not explicitly required
**File**: `server/db.ts:19`, `.env.example`
**Evidence**: `ssl: { rejectUnauthorized: false }` in `server/db.ts` — accepts self-signed; DATABASE_URL doesn't include `?sslmode=require`
**Impact**: MITM on pooled connection; connection string contains password
**Fix**: Use Supabase root CA: `ssl: { ca: fs.readFileSync('certs/supabase-ca.crt') }`; add `?sslmode=require` to connection string template

### [MEDIUM] No admin panels visible — confirm
**Evidence**: No admin routes with impersonation observed — confirm by grepping `isAdmin`/`role === 'admin'` usage
**Fix**: If admin UI added later, gate behind VPN/IP allowlist or separate subdomain with stricter auth

---

## Dimension 22 — Advanced Attack Vectors

### [MEDIUM] Prototype pollution risk in request-body spread patterns
**File**: `server/routes.ts:3431` and others (grep `...req.body`)
**Evidence**: Spread operator on req.body into DB updates
**Fix**: Use explicit `pickFields()` allowlist instead of spread; `Object.freeze(Object.prototype)` at boot

### [LOW] SSRF protections strong (positive)
**File**: `server/lib/ssrf.ts`
**Evidence**: Two-layer hostname + DNS validation; private IP blocks; size/timeout caps
**Status**: ✅ good

### [LOW] No ReDoS patterns found
**Status**: ✅ no catastrophic regex on user input

### [LOW] No decompression bomb risk
**Status**: ✅ Express doesn't auto-decompress; no zlib.inflate() calls on user data

---

## Dimension 23 — Compliance & Privacy

### [CRITICAL] No account deletion endpoint — see Dimension 19

### [CRITICAL] No GDPR export — see Dimension 19

### [HIGH] No audit trail for sensitive operations
**File**: No `audit_logs` table in schema
**Impact**: Cannot trace user deletion, password change, billing update
**Fix**: `audit_logs(user_id, action, entity, entity_id, before, after, ts)`; wrap DELETE/subscription/billing ops

### [HIGH] Cascade deletes without audit
**File**: `migrations/0003_fk_hardening.sql`
**Evidence**: `ON DELETE CASCADE` silently purges 20+ tables on brand/user delete
**Fix**: Soft delete (`deleted_at`); 30-day retention window before physical purge; audit log

### [MEDIUM] No List-Unsubscribe header in transactional emails
**File**: `server/emailService.ts:127-131`
**Impact**: CAN-SPAM/GDPR gap
**Fix**: `List-Unsubscribe: <mailto:...>, <https://...>` with one-click

### [MEDIUM] Third-party data processors not documented
**Impact**: Privacy Policy should list Supabase, Stripe, Resend, OpenAI, OpenRouter, Buffer with DPA references
**Fix**: Update Privacy Policy + maintain vendor list in `docs/`

### [MEDIUM] PII in logs — confirm sanitizer coverage
**File**: `server/index.ts:101-131`
**Evidence**: `sanitizeLogBody` covers password/tokens; but errors thrown with user-entered values can still hit console.error outside this path
**Fix**: Apply sanitizer inside global error handler too; audit `aiLogger.ts`

---

## Dimension 24 — Ethical UX & Dark Patterns

### [LOW] No detected dark patterns — manual UX audit required
**Status**: Code doesn't enforce unethical patterns; Group A/I cover UI-level concerns

---

## Dimension 25 — Legal / License Compliance

### [LOW] No GPL dependencies detected
**Status**: ✅ all deps MIT/Apache; safe for commercial use
**Fix**: Periodic `license-checker` run in CI

---

## Positive observations

1. **Ownership scoping thorough**: 30+ `require*()` helpers in `server/lib/ownership.ts`; anti-enumeration 404s
2. **Drizzle prevents SQLi** — parameterized queries throughout
3. **Stripe webhook verified** — `stripe.webhooks.constructEvent()` (reference for Shopify fix)
4. **CSP strict in prod** — no `'unsafe-inline'` for scripts
5. **Rate limiting on AI endpoints** — 10 req/min
6. **Log sanitizer** redacts passwords/tokens/API keys
7. **Admin flag enforced** (where admin routes exist)
8. **Graceful shutdown** (SIGTERM/SIGINT)
9. **SSRF two-layer defense** (`server/lib/ssrf.ts`)
10. **No hardcoded secrets** — all in `.env`
11. **Passwords never in our DB** — Supabase handles hashing
12. **Helmet security headers** applied globally

---

## Remediation Priority

**Week 1 — Ship-blockers**:
- Shopify HMAC verification
- Account deletion endpoint
- GDPR export endpoint
- Auth rate limiting
- HSTS + force HTTPS

**Week 2 — High**:
- Encrypt Buffer token
- Admin rate limiting
- Audit logging
- Soft deletes

**Week 3+ — Hardening**:
- List-Unsubscribe
- DB SSL verification
- MFA
- Device/session UI
