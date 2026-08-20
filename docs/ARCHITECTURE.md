# VentureCite — GEO SaaS Platform
## Architecture, Tech Stack & Migration Reference

> Last updated: 2026-04-14
> Status: Phase 1 — Active development
> Scope: Beta-ready product for Venture PR pilot client

---

## 1. What We're Building

VentureCite is an AI-powered Generative Engine Optimization (GEO) platform. Brands use it to get discovered and cited by AI-powered search engines — ChatGPT, Perplexity, Gemini, and others.

Phase 1 delivers six core features end-to-end: Brand Setup, AI Visibility Checklist, Keyword Research, AI Content Generation, Citation Tracking, and Content Distribution. All other features already exist in the codebase and are preserved — they are surfaced in the UI with a Coming Soon badge until future phases.

Phase 1 also migrates the platform off Replit infrastructure: Neon PostgreSQL → Supabase, Replit connectors (Stripe, Resend) → direct API key integrations, Replit auth stub → removed (custom email/password auth retained), and all Replit-specific build tooling removed.

---

## 2. Core Design Principles

### 2.1 Stateless API Layer
- Every request reads from the database. No in-process cache or session data stored in memory between requests.
- Sessions stored in PostgreSQL (via `connect-pg-simple`), not in-process.
- Safe to run multiple server instances.

### 2.2 Non-Blocking AI Calls
- OpenAI calls are async and wrapped. Every endpoint that calls OpenAI has a try/catch. Errors return a structured JSON error — the server never goes silent or throws unhandled.
- AI-generated JSON is parsed defensively. Malformed output is caught; a fallback or error message is returned.

### 2.3 Modular Feature Scope
- All features live in `server/routes.ts` under clearly separated route groups.
- Non-Phase-1 features exist in the codebase untouched. Their UI is gated with a Coming Soon badge. Their backend routes are preserved.
- Adding a new feature = add routes in `routes.ts`, add schema in `shared/schema.ts`, add page in `client/src/pages/`. Nothing else changes structurally.

### 2.4 Secure by Default
- Passwords: bcrypt with 12 salt rounds. Never stored in plaintext.
- Sessions: HTTP-only cookies via express-session. Session secret required in environment — no hardcoded fallback.
- CORS: explicit origin allowlist only. No wildcard.
- Payload limits: `express.json()` capped at 1mb.
- Error responses: sanitized messages only. No stack traces to client.

---

## 3. Tech Stack

### Frontend

| Component | Choice | Why |
|---|---|---|
| Framework | **React 18** | Component model, rich ecosystem |
| Build tool | **Vite 5** | Fast HMR, ESM-native |
| Router | **Wouter 3** | Lightweight (~1KB), hook-based, no React Router overhead |
| UI components | **shadcn/ui + Radix UI** | Accessible, unstyled primitives with Tailwind layer |
| Styling | **Tailwind CSS 3** | Utility-first, consistent design system |
| Data fetching | **TanStack Query 5** | Server state, caching, background refetch |
| Forms | **React Hook Form 7 + Zod** | Typed validation, minimal re-renders |
| Charts | **Recharts 2** | Citation and analytics visualisations |
| Animations | **Framer Motion 11** | Transition polish |

### Backend

| Component | Choice | Why |
|---|---|---|
| Framework | **Express.js 4** | Stable, well-understood, extensive middleware |
| Language | **TypeScript 5.6** | End-to-end type safety via shared schema |
| ORM | **Drizzle ORM 0.39** | Type-safe queries, SQL-close, fast migrations |
| Auth | **Custom email/password** | bcrypt + express-session + connect-pg-simple |
| AI | **OpenAI SDK 5 (GPT-4o)** | Content generation, keyword research, visibility scoring |
| Payments | **Stripe 20** | Subscription billing, checkout, customer portal |
| Email | **Resend 4** | Password reset, transactional email |
| Bundler | **esbuild** | Fast server bundle for production |

### Infrastructure — Current (Replit) vs Target (Standalone)

| Service | Current | Target (Phase 1) |
|---|---|---|
| Database | **Neon PostgreSQL** (serverless) | **Supabase** (PostgreSQL) |
| Database driver | `@neondatabase/serverless` | `postgres` (pg) |
| Stripe keys | Replit connector (injected at runtime) | `STRIPE_SECRET_KEY` env var |
| Stripe sync | `stripe-replit-sync` (auto-managed) | Direct webhook + `stripe` SDK only |
| Email keys | Replit Resend connector | `RESEND_API_KEY` env var |
| Auth (secondary) | Replit OAuth stub | Removed (custom auth only) |
| Dev runtime | Replit autoscale | Any Node.js 20 host |

---

## 4. Folder Structure

```
venturecite/
│
├── client/                          # React + Vite frontend
│   ├── index.html
│   └── src/
│       ├── main.tsx                 # Entry point
│       ├── App.tsx                  # Router, protected route HOC
│       ├── index.css                # Tailwind imports
│       ├── assets/                  # Static assets (logo moved here in Phase 1)
│       ├── components/
│       │   ├── Navbar.tsx           # Top nav — persists across all authenticated routes
│       │   ├── GuidedOnboarding.tsx # Post-login onboarding flow (triggers after auth)
│       │   ├── OnboardingChecklist.tsx
│       │   ├── PlatformGuide.tsx
│       │   └── ui/                  # 60+ shadcn/ui primitives (do not modify)
│       ├── hooks/
│       │   ├── use-auth.ts          # Auth state: user, isLoading, isAuthenticated, logout
│       │   ├── use-mobile.tsx
│       │   └── use-toast.ts
│       ├── lib/
│       │   ├── queryClient.ts       # TanStack Query client config
│       │   ├── auth-utils.ts
│       │   └── utils.ts
│       └── pages/
│           │   # --- Phase 1 Active Features ---
│           ├── login.tsx
│           ├── register.tsx
│           ├── forgot-password.tsx
│           ├── reset-password.tsx
│           ├── landing.tsx
│           ├── home.tsx
│           ├── dashboard.tsx
│           ├── brands.tsx           # Brand Setup
│           ├── keyword-research.tsx # AI Keyword Research
│           ├── content.tsx          # AI Content Generation
│           ├── articles.tsx         # Saved Articles + Distribution
│           ├── article-view.tsx     # Article detail
│           ├── citations.tsx        # Track AI Citations
│           ├── ai-visibility.tsx    # AI Visibility Checklist
│           ├── pricing.tsx          # Pricing + Stripe
│           │   # --- Coming Soon (code preserved, UI gated) ---
│           ├── geo-rankings.tsx
│           ├── geo-analytics.tsx
│           ├── geo-tools.tsx
│           ├── geo-signals.tsx
│           ├── geo-opportunities.tsx
│           ├── ai-intelligence.tsx
│           ├── ai-traffic.tsx
│           ├── agent-dashboard.tsx
│           ├── outreach.tsx
│           ├── analytics-integrations.tsx
│           ├── community-engagement.tsx
│           ├── faq-manager.tsx
│           ├── client-reports.tsx
│           ├── brand-fact-sheet.tsx
│           ├── publication-intelligence.tsx
│           ├── revenue-analytics.tsx
│           ├── crawler-check.tsx
│           └── competitors.tsx
│
├── server/                          # Express backend
│   ├── index.ts                     # App entry — middleware stack, server startup
│   ├── routes.ts                    # All API routes (~5800 lines)
│   ├── db.ts                        # Drizzle client — database connection
│   ├── customAuth.ts                # Email/password auth: register, login, reset
│   ├── email.ts                     # Resend email service
│   ├── stripeClient.ts              # Stripe SDK instance
│   ├── webhookHandlers.ts           # Stripe webhook processing
│   ├── setupProducts.ts             # Stripe product initialisation
│   ├── storage.ts                   # Abstract storage interface
│   ├── databaseStorage.ts           # Database storage implementation
│   ├── vite.ts                      # Vite dev server integration
│   └── replit_integrations/         # Replit OAuth — analysed and removed in Phase 1
│       └── auth/
│           ├── replitAuth.ts        # OpenID Connect with Replit (replaced by customAuth.ts)
│           ├── routes.ts            # Replit auth routes
│           └── storage.ts          # Session storage helpers
│
├── shared/
│   └── schema.ts                    # Drizzle table definitions + Zod schemas (shared)
│
├── scripts/
│   ├── post-merge.sh                # Removed in Phase 1 — auto db:push is dangerous
│   ├── seed-stripe-products.ts      # One-time Stripe product seed
│   └── setup-stripe-products.ts    # One-time Stripe product setup
│
├── migrations/                      # Drizzle auto-generated migration files
├── docs/                            # Project documentation
├── attached_assets/                 # Logo assets — moved to client/src/assets/ in Phase 1
├── package.json                     # Single package.json for full monorepo
├── tsconfig.json                    # TypeScript config — strict mode
├── vite.config.ts                   # Vite config
├── drizzle.config.ts                # Drizzle ORM config
└── tailwind.config.ts
```

---

## 5. Architectural Patterns

### 5.1 Auth Pattern

Session-based authentication. No JWTs issued to the browser.

```
POST /api/auth/login
  ↓
customAuth.ts: loginUser() — bcrypt.compare()
  ↓
req.session.userId = user.id     (stored in PostgreSQL sessions table)
  ↓
Cookie set: HTTP-only, SameSite=Lax
  ↓
Subsequent requests: isCustomAuthenticated middleware
  → reads req.session.userId
  → fetches user from DB
  → sets req.user
```

Password reset: `nanoid(32)` token, 1-hour TTL, one-time use enforced in DB.

### 5.2 AI Call Pattern

Every OpenAI call follows this pattern. Never awaited outside a try/catch.

```typescript
try {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [...],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(response.choices[0].message.content || "{}");
  res.json({ success: true, data: parsed });
} catch (error: any) {
  console.error("[AI] Generation failed:", error.message);
  res.status(500).json({ success: false, error: "Generation failed. Please try again." });
}
```

### 5.3 Access Tier Enforcement

Tier limits defined once in `shared/schema.ts`. Enforced at the API layer, not in the UI.

```typescript
export const usageLimits = {
  free:       { articlesPerMonth: 5,   maxBrands: 1  },
  beta:       { articlesPerMonth: 20,  maxBrands: 3  },
  pro:        { articlesPerMonth: 40,  maxBrands: 5  },
  enterprise: { articlesPerMonth: 200, maxBrands: -1 },
  admin:      { articlesPerMonth: -1,  maxBrands: -1 },
};
```

Usage counters (`articlesUsedThisMonth`, `brandsUsed`) live on the `users` table. Reset runs on `usageResetDate`.

### 5.4 Protected Route Pattern (Frontend)

```tsx
// client/src/App.tsx
function AuthenticatedRoute({ component: Component }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}
```

`useAuth()` queries `GET /api/auth/me` on mount. Result cached by TanStack Query.

---

## 6. Data Flow

```
User submits form (e.g. Generate Article)
        │
        ▼
React: POST /api/generate-article  {brandId, keywords, tone}
  TanStack Query mutation — loading state shown
        │
        ▼
Express routes.ts:
  1. isCustomAuthenticated middleware — verify session
  2. Check usage limit (articlesUsedThisMonth < tier limit)
  3. Fetch brand data from Supabase via Drizzle
  4. Build system prompt with brand context
        │
        ▼
OpenAI GPT-4o
  Returns JSON: {title, content, seoScore, keywords}
        │
        ▼
routes.ts:
  1. Parse and validate AI response
  2. INSERT article row to Supabase
  3. Increment articlesUsedThisMonth on user row
  4. Return article data
        │
        ▼
React: TanStack Query invalidates /api/articles
  Article appears in list
```

---

## 7. Database Schema (Key Tables)

Full schema in [shared/schema.ts](../shared/schema.ts). Key tables:

```sql
-- Auth
users (id, email, password_hash, first_name, last_name, access_tier,
       stripe_customer_id, stripe_subscription_id, articles_used_this_month,
       brands_used, usage_reset_date, is_admin, created_at, updated_at)

sessions (sid, sess, expire)                          -- express-session store
password_reset_tokens (id, user_id, token, expires_at, used_at)
beta_invite_codes (id, code, max_uses, used_count, access_tier, expires_at)
waitlist (id, email, source, created_at)

-- Phase 1 Core Features
brands (id, user_id, name, website, industry, description, tone, key_values, ...)
articles (id, user_id, brand_id, title, content, status, seo_score,
          view_count, citation_count, published_url, created_at)
citations (id, source, url, platform, keywords[], timestamp, metadata)
keyword_research (id, user_id, brand_id, keyword, opportunity_score,
                  search_volume, ai_platforms[], created_at)
distributions (id, article_id, platform, status, published_url, created_at)

-- Analytics (preserved, active in future phases)
geo_rankings, brand_visibility_snapshots, ai_commerce_sessions,
purchase_events, competitors, outreach_campaigns, automation_rules, ...
```

---

## 8. Environment Variables

**`backend/.env` (required)**

```env
# Database
DATABASE_URL=postgresql://...supabase...

# Auth
SESSION_SECRET=<strong random string — required, no fallback in production>

# AI
OPENAI_API_KEY=sk-...

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
APP_URL=https://yourdomain.com
NODE_ENV=production
PORT=5000
```

**Build-time (frontend)**

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## 9. How to Run

```bash
# Install
npm install

# Sync schema to Supabase
npm run db:push

# Development (Express + Vite on port 5000)
npm run dev

# Type check
npm run check

# Production build
npm run build

# Production start
npm run start
```

---

## 10. Access Levels

| Role | Access | How Set |
|---|---|---|
| Consumer | Free / Beta / Pro / Enterprise tier limits | Default on register |
| Admin | No usage limits, admin UI access | `is_admin = 1` in DB |
| Super Admin | All admin + billing management | Stripe + DB |

Tier upgrades happen via Stripe checkout. Stripe webhook updates `access_tier` on the `users` row automatically.
