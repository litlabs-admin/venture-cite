# Group C — Frontend

## Executive Summary
- CRITICAL: localStorage persists analytics IDs (venturecite-ga4-id, venturecite-gsc-url) across logout
- HIGH: Hardcoded console.log() left in production (ai-intelligence.tsx:267)
- HIGH: Missing AbortController on most fetch calls
- HIGH: 30+ useState hooks in ai-intelligence.tsx (1969 lines)
- HIGH: useEffect eslint-disable-line in content.tsx:344
- MEDIUM: No retry logic on TanStack Query
- MEDIUM: Hardcoded en-US locale without fallback

## Dimension 11 - Frontend Logic

### CRITICAL: Unsuppressed Debug Logging
File: client/src/pages/ai-intelligence.tsx:267
console.log("Sending prompt payload:", payload);
Impact: Production code leaks internal API payloads to browser console

### HIGH: Missing AbortController on API Requests
File: Most pages except content.tsx
Evidence: Only content.tsx:402 creates AbortController
Impact: Memory leaks on route transitions

### HIGH: useEffect Dependency Array Disabled
File: client/src/pages/content.tsx:344
Evidence: eslint-disable-line react-hooks/exhaustive-deps without justification

### HIGH: Massive Page Components
File: client/src/pages/ai-intelligence.tsx (1969 lines, 30+ hooks)
Impact: Re-render risk, state tangling

### HIGH: No Retry Logic
File: client/src/lib/queryClient.ts:121,124
Evidence: retry: false on all queries/mutations
Impact: Single transient error fails permanently

### MEDIUM: Hardcoded Locale
File: pricing.tsx:90, revenue-analytics.tsx:42,49
Evidence: new Intl.NumberFormat('en-US', ...)
Impact: Non-US users see wrong locale

## Dimension 12 - Browser Storage

### Storage Clearance on Logout
| Key | Cleared? |
|---|---|
| sb-*-auth-token | YES (Supabase SDK) |
| hasSeenOnboarding | NO |
| completedGuideSteps | NO |
| venturecite-active-draft-id | NO |
| venturecite-visibility-visited | NO |
| venturecite-onboarding | NO |
| venturecite-ga4-id | NO |
| venturecite-gsc-url | NO |

### CRITICAL: Uncleared Analytics Configuration
File: client/src/pages/analytics-integrations.tsx, hooks/use-auth.ts
Impact: User A logs out, User B logs in sees A's GA4 ID

### HIGH: Supabase JWT in localStorage
File: client/src/lib/supabase.ts:12 (persistSession: true)
Impact: XSS can steal JWT (mitigated by CSP)

## Dimension 13 - Mobile & Cross-Browser

### HIGH: No Browser Support Matrix
File: package.json, vite.config.ts
Impact: Unknown support - could break on old Safari/IE11

### HIGH: Touch Targets Below 44px
File: client/src/components/ui/button.tsx:25
Evidence: h-10 (40px), h-9 (36px), icon h-10
Impact: Mis-taps on mobile devices

### MEDIUM: No Safe Area Padding
File: All pages with headers
Impact: Content hidden under notch (iPhone 12+)

### MEDIUM: Hardcoded Breakpoint Mismatch
File: client/src/hooks/use-mobile.tsx:3
Evidence: MOBILE_BREAKPOINT = 768 but Tailwind uses 640/768/1024

## Positive Observations
- TanStack Query used consistently
- ErrorBoundary at root + routes
- Good responsive Tailwind usage
- AbortController in critical path (content.tsx)
- Optimistic updates where relevant
- Helmet CSP configured
- localStorage scoped by userId (draftStore)
- React Hook Form + Zod validation
- Lazy loading with Suspense
- Radix UI accessibility primitives

## Recommendations
1. Clear venturecite-* localStorage on logout
2. Remove debug console.log
3. Increase button heights to 44px
4. Add AbortController to all fetch calls
5. Extract large page state into custom hooks
6. Add retry logic to queries
7. Add browserslist to package.json
8. Add safe-area-inset padding for notches

### HIGH: useEffect Dependency Array Disabled
File: client/src/pages/content.tsx:344
Evidence: eslint-disable-line react-hooks/exhaustive-deps without justification
Impact: Risk of stale closures; triggerAutoSave() may have missing dependencies

### HIGH: Massive Page Components
File: client/src/pages/ai-intelligence.tsx (1969 lines, 30+ hooks)
Evidence: useState, useQuery x7, useMutation x3 all in flat list
Impact: Re-render triggers all hooks; hard to reason about effects

### HIGH: No Retry Logic  
File: client/src/lib/queryClient.ts:121,124 (retry: false)
Evidence: Single transient error fails permanently
Impact: Users must manually refresh; no exponential backoff

### MEDIUM: Hardcoded Locale
File: pricing.tsx:90, revenue-analytics.tsx:42,49
Evidence: new Intl.NumberFormat('en-US', ...)
Impact: Non-US users see wrong number formatting

### MEDIUM: No Loading Lock
File: Multiple pages
Evidence: useMutation called but button not disabled during isPending
Impact: Double-click causes race conditions

### MEDIUM: Business Logic in UI
File: client/src/pages/content.tsx:289-342 (autosave)
Evidence: 100+ lines of useEffect managing timers, refs, draft creation
Impact: Hard to test and reuse

## Dimension 12 — Browser Storage

### Storage Clearance
| Key | Cleared? |
|---|---|
| sb-*-auth-token | YES (Supabase SDK) |
| hasSeenOnboarding | NO |
| completedGuideSteps | NO |
| venturecite-ga4-id | NO |
| venturecite-gsc-url | NO |

### CRITICAL: Analytics IDs Persist Across Logout
File: client/src/pages/analytics-integrations.tsx, hooks/use-auth.ts
Impact: User A's GA4 ID visible to User B after login

### HIGH: Supabase JWT in localStorage
File: client/src/lib/supabase.ts:12 (persistSession: true)
Impact: XSS can steal JWT (mitigated by CSP)

### HIGH: Onboarding Flags Not Cleared
File: OnboardingChecklist.tsx, GuidedOnboarding.tsx
Impact: New users skip onboarding if previous user dismissed it

## Dimension 13 — Mobile & Cross-Browser

### HIGH: No Browser Support Matrix
File: package.json, vite.config.ts
Impact: Could break on old Safari, IE11

### HIGH: Touch Targets Below 44px
File: client/src/components/ui/button.tsx:25 (h-10=40px, h-9=36px)
Impact: WCAG violation; mis-taps on mobile

### MEDIUM: No Safe-Area Padding
File: All pages
Impact: Content hidden under notch (iPhone 12+)

### MEDIUM: Responsive Design Incomplete
File: Various pages (max-w-md smallest container)
Impact: Horizontal scroll at 320px width

### MEDIUM: Breakpoint Mismatch
File: client/src/hooks/use-mobile.tsx:3 (MOBILE_BREAKPOINT=768)
Impact: useIsMobile() doesn't match Tailwind breakpoints

## Positive Observations

✅ TanStack Query used consistently (184 calls)
✅ ErrorBoundary at root + routes
✅ AbortController in critical polling
✅ Optimistic updates implemented
✅ Helmet CSP configured
✅ localStorage scoped by userId
✅ React Hook Form + Zod validation
✅ Lazy loading with Suspense
✅ Radix UI accessibility

## Priority Recommendations

Immediate:
1. Clear venturecite-* localStorage on logout (30 min)
2. Remove console.log from ai-intelligence.tsx (5 min)
3. Increase button heights to 44px (30 min)
4. Add AbortController to login/register (2 hours)

Near-term:
5. Extract ai-intelligence.tsx state (6 hours)
6. Add retry logic to queryClient (1 hour)
7. Add browserslist to package.json (30 min)
8. Fix useEffect eslint-disable (1 hour)

Medium-term:
9. Add safe-area-inset (2 hours)
10. Replace hardcoded en-US locale (1 hour)
11. Scope onboarding keys by userId (1 hour)
12. Add AbortController to remaining pages (4 hours)
