# Group K — Internationalisation & Localisation

## Executive Summary

**Current state**: No i18n infrastructure. English-only. No user locale/timezone. No RTL.

1. No i18n library in dependencies — cannot add a language without code changes
2. Hardcoded English strings throughout client (~250) + server errors (~100) + email templates (~50)
3. `Intl.NumberFormat('en-US')` hardcoded in pricing and analytics
4. `users` table lacks `language`, `locale`, `timezone` columns
5. No RTL support; cron jobs assume UTC

---

## Dimension 57 — i18n

### [CRITICAL] No i18n library
**File**: `package.json:13-85`
**Evidence**: No `i18next`, `react-intl`, or ICU message formatter
**Impact**: Cannot add a language without source changes
**Fix**: `i18next` + `react-i18next` + `i18next-http-backend`

### [CRITICAL] Hardcoded English strings throughout
**File**: `client/src/pages/landing.tsx`, `register.tsx`, `pricing.tsx`, `brands.tsx` (+ ~30 others)
**Evidence**: 200+ UI strings hardcoded — "Create your account", "Get Cited by AI Search Engines", "Brand created", etc.
**Impact**: 200+ strings × 34 pages = weeks of extraction work
**Fix**: Extract to i18n JSON; `i18n.t("key")` calls

### [HIGH] Hardcoded `en-US` in currency/number formatting
**File**: `client/src/pages/pricing.tsx:90`, `client/src/pages/revenue-analytics.tsx:42,49`
**Evidence**: `new Intl.NumberFormat('en-US', {...})` hardcoded
**Impact**: German user sees `1,234.56 USD` vs expected `1.234,56 €`
**Fix**: Pass user locale from preferences: `Intl.NumberFormat(userLocale, ...)`

### [HIGH] Inconsistent date formatting
**File**: `client/src/pages/ai-intelligence.tsx:212-218`, `client/src/pages/article-view.tsx:107`, `client/src/pages/client-reports.tsx:322`, `client/src/pages/community-engagement.tsx:673`, `client/src/pages/geo-rankings.tsx:238`, `server/emailService.ts:39`
**Evidence**: Mix of `toLocaleDateString()` (browser locale) and `toLocaleDateString('en-US', ...)` (hardcoded)
**Fix**: `date-fns` with user locale; add `timezone` column

### [HIGH] Cron jobs UTC-only; no user timezone
**File**: `server/scheduler.ts:140,153,218-221`
**Evidence**:
- `getUTCDay()`
- `"0 8 * * 0"` Sunday 08 UTC
- `"0 7 * * 1"` competitor discovery Monday 07 UTC
**Impact**: Tokyo user gets weekly report at 17:00 local time
**Fix**: Store `users.timezone`; compute per-user UTC equivalent; `date-fns-tz`

### [MEDIUM] No RTL support
**File**: `client/index.html:2`, Tailwind config
**Evidence**: `<html lang="en">`, no `dir=` attribute; no RTL Tailwind variants
**Impact**: Arabic/Hebrew/Persian users see LTR layout
**Fix**: `dir={isRTL ? "rtl" : "ltr"}`; enable Tailwind RTL plugin; use logical properties (`ms-4` not `ml-4`)

### [MEDIUM] No locale-aware sorting
**Evidence**: No `localeCompare` usage; default `.sort()` = UTF-16 order
**Impact**: Swedish "Ä" sorts after "Z" instead of with "A"
**Fix**: `.sort((a, b) => a.localeCompare(b, userLocale))`; SQL `COLLATE`

---

## Dimension 58 — Localisation Beyond i18n

### [CRITICAL] No user locale/timezone columns
**File**: `shared/schema.ts:6-28` (users table)
**Evidence**: Has `id`, `email`, `firstName`, `lastName`, `profileImageUrl`, `accessTier`, subscription fields; no `language`, `locale`, `timezone`
**Fix**: Migration: `ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en', ADD COLUMN locale TEXT DEFAULT 'en-US', ADD COLUMN timezone TEXT DEFAULT 'UTC'`

### [HIGH] first/last name assumes Western order
**File**: `shared/schema.ts:10-11`, `client/src/pages/register.tsx:85-104`, `client/src/components/Navbar.tsx`
**Evidence**: Separate `firstName`/`lastName`; placeholders "John"/"Doe"; displayed as `${firstName} ${lastName}`
**Impact**: Chinese users (family-name first), single-name users, mononyms (e.g. "Madonna") don't fit
**Fix**: Single `fullName` column; optional `familyName`/`givenName` split for cultural preference

### [HIGH] No address fields or country-specific validation
**File**: `shared/schema.ts` — no address columns
**Impact**: Future tax compliance (VAT, sales tax by state/country) blocked
**Fix**: Migration: `country`, `state_or_province`, `city`, `postal_code`; country-specific postal validators

### [HIGH] No phone number field / E.164 validation
**Fix**: Add `phone TEXT`; validate with `libphonenumber-js`

### [MEDIUM] Email content English-only
**File**: `server/emailService.ts:32-120`
**Fix**: Per-locale templates; `getEmailTemplate(name, userLang)` helper

### [MEDIUM] Currency hardcoded to USD
**File**: `client/src/pages/pricing.tsx:89-94`
**Evidence**: Function accepts `currency` param but Stripe products single-currency (likely USD)
**Fix**: Stripe multi-currency; `preferredCurrency` on user

---

## Positive observations

1. `date-fns` already in deps — easy migration path for locale-aware formatting
2. `Intl.NumberFormat` used (just hardcoded to en-US — trivial to parameterize)
3. UTC used consistently in server — clean migration to user timezones
4. Scheduler comments mention UTC explicitly (timezone awareness)
5. Strict TypeScript — helps during refactor

---

## If you were to add i18n from scratch

**Library**: `i18next` + `react-i18next` + `i18next-http-backend`
**Translation platform**: Crowdin or Lokalise
**Estimated scope**: ~400 strings (250 client + 100 server + 50 emails)

**Effort**:
- String extraction + integration: 3 weeks
- Schema changes (`language`/`locale`/`timezone`): 1 week
- High-priority pages (auth, dashboard, pricing, brands, errors): 2 weeks
- RTL support: 3 weeks (separate, defer until demand)

**Phased rollout**:
1. Month 1: Extract + setup + schema
2. Month 2: Spanish (es-ES, es-MX) + French (fr-FR) on core pages
3. Month 3: German (de-DE) + full-product translation
4. Month 4+: RTL, timezone-aware scheduling, multi-currency

**Immediate cheap wins**:
- Add `language`/`locale`/`timezone` columns now (future-proofs migration)
- Stop new hardcoded strings today: require all UI text via `t('...')` helper, even if identity function for now
