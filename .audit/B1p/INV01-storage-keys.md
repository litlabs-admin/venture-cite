# INV01 storage keys cleared at logout

## The logout rule

File: client/src/hooks/use-auth.ts:34-40
Rule: The main logout calls Supabase sign-out and the logout API first. It then scans localStorage. It removes every key with the `venturecite-` prefix and the exact keys `hasSeenOnboarding` and `completedGuideSteps`. It does not scan sessionStorage. A rejection skips this cleanup.

File: client/src/pages/reset-password.tsx:126-129
Rule: The password-reset sign-out calls Supabase sign-out only. It does not call `clearAllVentureCiteStorage`.

Supabase sign-out removes its exact auth storage key, its `-code-verifier` key, and its `-user` key. This client config uses the default auth key `sb-<project-ref>-auth-token`.

## Every persisted key found

| Key | Written at | Cleared by logout? | Evidence |
|---|---|---|---|
| `vc_visibility_engine` | client/src/pages/ai-visibility.tsx:820-823; client/src/hooks/use-persisted-state.ts:22-28 | No | The helper writes the supplied key. The main rule only matches `venturecite-` or two legacy names. |
| `vc_citations_tab` | client/src/pages/citations.tsx:356; client/src/hooks/use-persisted-state.ts:22-28 | No | The helper writes the supplied key. The key has no matching prefix or legacy name. |
| `vc_keywords_filter` | client/src/pages/keyword-research.tsx:61; client/src/hooks/use-persisted-state.ts:22-28 | No | The helper writes the supplied key. The key has no matching prefix or legacy name. |
| `vc_selected_brand_id` | client/src/hooks/use-brand-selection.ts:7,30; client/src/hooks/use-persisted-state.ts:22-28 | No | The helper writes the supplied key. The key has no matching prefix or legacy name. |
| `venturecite-recs-dismissed:<userId>` | client/src/components/dashboard/Pulse.tsx:28,101-104,123 | No | The key starts with `venturecite-`, but the password-reset path does not call the prefix cleanup. The main cleanup follows two fallible awaited calls. |
| `venturecite-visibility-visited` | client/src/pages/ai-visibility.tsx:832 | No | The key starts with `venturecite-`, but the password-reset path does not call the prefix cleanup. The main cleanup follows two fallible awaited calls. |
| `vc-theme-v1` | client/src/lib/theme.ts:41,73-81 | No | The key has no matching prefix or legacy name. The root route only reads the key at src/routes/__root.tsx:227-230. |
| `internal-page-view` | client/src/pages/internal-page.tsx:248,259-261 | No | The key has no matching prefix or legacy name. |
| `venturecite:pending-verify-email` | client/src/pages/register.tsx:17,63-69 | No | The key is written to sessionStorage. The cleanup scans localStorage only. |
| `sb-<project-ref>-auth-token` | client/src/lib/authStore.ts:18-22 via client/src/lib/supabase.ts:10-15 | Yes on Supabase sign-out | Supabase uses `sb-${baseUrl.hostname.split('.')[0]}-auth-token` by default. Its sign-out removes the configured storage key. |

## Violations

### V-01 | high

Key: `vc_visibility_engine`
Written at: client/src/pages/ai-visibility.tsx:820-823; client/src/hooks/use-persisted-state.ts:22-28
Why logout misses it: The main cleanup matches only `venturecite-` and two legacy names.
How it fails (two users, one browser): User B inherits User A's selected AI engine.
Confidence: high

### V-02 | medium

Key: `vc_citations_tab`
Written at: client/src/pages/citations.tsx:356; client/src/hooks/use-persisted-state.ts:22-28
Why logout misses it: The key does not match the prefix or either legacy name.
How it fails (two users, one browser): User B inherits User A's citations tab.
Confidence: high

### V-03 | medium

Key: `vc_keywords_filter`
Written at: client/src/pages/keyword-research.tsx:61; client/src/hooks/use-persisted-state.ts:22-28
Why logout misses it: The key does not match the prefix or either legacy name.
How it fails (two users, one browser): User B inherits User A's keyword filter.
Confidence: high

### V-04 | high

Key: `vc_selected_brand_id`
Written at: client/src/hooks/use-brand-selection.ts:7,30; client/src/hooks/use-persisted-state.ts:22-28
Why logout misses it: The key does not match the prefix or either legacy name.
How it fails (two users, one browser): User B can open User A's selected brand context.
Confidence: high

### V-05 | high

Key: `venturecite-recs-dismissed:<userId>`
Written at: client/src/components/dashboard/Pulse.tsx:28,101-104,123
Why logout misses it: The password-reset sign-out at client/src/pages/reset-password.tsx:126-129 skips the cleanup. The main path also skips cleanup if either awaited call rejects.
How it fails (two users, one browser): User B can inherit User A's dismissed recommendations after either sign-out path fails to clean storage.
Confidence: high

### V-06 | high

Key: `venturecite-visibility-visited`
Written at: client/src/pages/ai-visibility.tsx:832
Why logout misses it: The password-reset sign-out at client/src/pages/reset-password.tsx:126-129 skips the cleanup. The main path also skips cleanup if either awaited call rejects.
How it fails (two users, one browser): User B can inherit User A's visited-state flag after either sign-out path fails to clean storage.
Confidence: high

### V-07 | medium

Key: `vc-theme-v1`
Written at: client/src/lib/theme.ts:41,73-81
Why logout misses it: The key does not match the prefix or either legacy name.
How it fails (two users, one browser): User B inherits User A's theme preference.
Confidence: high

### V-08 | medium

Key: `internal-page-view`
Written at: client/src/pages/internal-page.tsx:248,259-261
Why logout misses it: The key does not match the prefix or either legacy name.
How it fails (two users, one browser): User B inherits User A's internal page view.
Confidence: high

### V-09 | high

Key: `venturecite:pending-verify-email`
Written at: client/src/pages/register.tsx:17,63-69
Why logout misses it: The key is in sessionStorage, but logout cleanup only scans localStorage.
How it fails (two users, one browser): User B can see User A's pending verification email in the shared browser session.
Confidence: high

## UNDETERMINED

- None.
