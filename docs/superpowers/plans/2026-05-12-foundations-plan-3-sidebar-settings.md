# Foundations Plan 3 — Sidebar IA + Settings Expansion

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the sidebar legible at first read, re-enable Account Settings, remove the vermillion stripe that competes with primary CTAs, and turn the Settings page into something a real customer can use (Billing via Stripe portal, Profile editing, Password change, Integrations panel).

**Architecture:** Three focused tasks. Task 1 touches one file (Sidebar.tsx). Task 2 adds server routes. Task 3 expands the Settings page. Tasks 1 and 2 are file-isolated and parallel-safe; Task 3 sequences after Task 2.

**Tech stack:** React 18 + Wouter + TanStack Query + Tailwind/shadcn; Express + Drizzle + Stripe SDK + Supabase Admin (for password change); Pino logger.

**Plan-wide rules:**
- **DO NOT COMMIT.** No `git commit`, ever.
- **DO NOT run ANY git command that mutates state.** No `git stash`, `git stash pop`, `git reset`, `git checkout`, `git restore`, `git add`, `git commit`, `git push`, `git pull`, `git rebase`, `git merge`, `git clean`, or `git branch` mutations. Read-only only: `git status`, `git diff`, `git log`, `git show`, `git stash list`. Use `git diff HEAD -- <file>` instead of stash.
- **DO NOT TRUST .md files** in the repo — verify everything against current code.
- **Vercel Hobby ceiling.** No new external services beyond what's already wired (Stripe, Supabase, Resend are all already present).
- **Token compliance.** Any new UI uses design tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-destructive`, etc.), `font-mono tabular-nums` on stacked numerics, `<Skeleton>` for loading.

**Spec reference:** [docs/superpowers/specs/2026-05-10-foundations-design.md](../specs/2026-05-10-foundations-design.md) §4.2 (Sidebar IA) and §4.3 (Settings expansion).

---

## Task 1: Sidebar IA changes

**Goal:**
- Re-enable Account Settings in the user menu dropdown
- Remove the vermillion active-stripe (4px brand-color left rail competing with primary CTAs)
- Rename ambiguous labels (founders shouldn't have to guess what "GEO Tools" vs "GEO Signals" vs "GEO Analytics" mean)

**Files:**
- Modify: `client/src/components/Sidebar.tsx`

### Steps

- [ ] **Step 1: Recon.**
  ```bash
  grep -n "Account settings\|Settings\|disabled\|absolute.*bg-primary\|data-tour-id" client/src/components/Sidebar.tsx
  ```
  Find the line where Account Settings is rendered with `disabled`, the absolute vermillion stripe element, and the data-tour-id markers.

- [ ] **Step 2: Re-enable Account Settings.**

  Find the dropdown menu item rendering Account Settings (currently disabled). Replace with a Wouter-navigation link:

  ```tsx
  // Before:
  <DropdownMenuItem disabled>
    <Settings className="mr-2 h-4 w-4" />
    Account settings
  </DropdownMenuItem>

  // After (verify the navigation pattern used elsewhere in this file; could be useLocation hook from wouter, or a <Link> wrapper):
  <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
    <Settings className="mr-2 h-4 w-4" />
    Account settings
  </DropdownMenuItem>
  ```

  Where `navigate` is obtained via `const [, navigate] = useLocation();` from wouter — if the component doesn't already import `useLocation`, add it.

  Verify `/settings` is mounted in App.tsx (it is per plan recon).

- [ ] **Step 3: Remove the vermillion active stripe.**

  Find the absolute-positioned `<span>` or `<div>` that renders a `bg-primary` left rail on the active nav item (per spec, around line 112-114). It looks like:
  ```tsx
  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-primary rounded-r-full" />
  ```
  Delete the entire JSX element. The active state still gets the dark-slate fill (`bg-sidebar-primary text-sidebar-primary-foreground`) — that's correct per design.json.

- [ ] **Step 4: Rename ambiguous labels.**

  Update the nav-item label strings in the NAV_* arrays. Routes stay the same; only the display labels change.

  | Route | Old label | New label |
  |---|---|---|
  | `/ai-visibility` | "AI Visibility" | "Visibility Setup" |
  | `/citations` | "Citations" | "Citations" (no change) |
  | `/geo-analytics` | "GEO Analytics" | "Visibility Report" |
  | `/ai-intelligence` | "AI Intelligence" | "AI Intelligence" (no change) |
  | `/client-reports` | "Reports" | "Client Reports" |
  | `/geo-tools` | "GEO Tools" | "Optimization Tools" |
  | `/geo-signals` | "Signals" | "Page Signals" |
  | `/opportunities` | "Opportunities" | "Off-Page Opportunities" |
  | `/crawler-check` | "Crawler Check" | "Crawler Check" (no change) |
  | `/faq-manager` | "FAQ Manager" | "FAQ Manager" (no change) |
  | `/brand-fact-sheet` | "Fact Sheet" | "Fact Sheet" (no change) |

  Other items (Dashboard, Brands, Content, Articles, Keywords, Community, Competitors): leave as-is.

- [ ] **Step 5: Verify data-tour-id markers still resolve.**

  ```bash
  grep -n "data-tour-id" client/src/components/Sidebar.tsx
  ```
  The marker IDs (`sidebar.group.setup`, `sidebar.group.create`, etc., plus per-nav-item markers) are bound to routes, not labels. Renames don't break them. Confirm.

  Then run the tour-target verifier:
  ```bash
  npx tsx scripts/verify-tour-targets.ts 2>&1 | tail -10
  ```
  Expected: 26 targets all present (or whatever count the verifier reports — should match pre-Plan-3 count).

- [ ] **Step 6: Type-check + lint.**
  ```bash
  npm run check 2>&1 | tail -10
  npm run lint -- client/src/components/Sidebar.tsx 2>&1 | tail -10
  ```

- [ ] **Step 7: Smoke test (manual).**
  - Start dev server. Log in.
  - Click user-avatar dropdown → click "Account settings" → should land on `/settings`.
  - Sidebar active state: navigate between routes. Confirm no vermillion left-stripe; only dark-slate fill on the active item.
  - Confirm new labels appear correctly.

**DO NOT COMMIT.**

---

## Task 2: Server routes for Billing + Profile + Password

**Goal:** Add three routes the expanded Settings page needs.
1. `POST /api/billing/portal-session` — creates a Stripe customer-portal session, returns the redirect URL.
2. `PATCH /api/user/profile` — accepts `{ firstName?, lastName?, timezone? }` and persists.
3. `POST /api/user/password` — accepts `{ currentPassword, newPassword }`, re-authenticates, updates via Supabase Admin.

**Files:**
- Verify (read-only): `shared/schema.ts` — confirm `users` table has `stripeCustomerId`, `firstName`, `lastName`, `timezone` columns. If `firstName`/`lastName`/`timezone` are missing, add via migration (see Step 5 below).
- Modify: `server/routes.ts` (or wherever route mounts live) — register new handlers, OR create a new route module and mount it.
- Likely create: `server/routes/billing.ts`, `server/routes/userProfile.ts` (or whatever pattern the codebase already uses — verify in Step 1).
- Tests: `tests/unit/billingPortalSession.test.ts`, `tests/unit/userProfileUpdate.test.ts`, `tests/unit/userPasswordChange.test.ts`

### Steps

- [ ] **Step 1: Recon existing route layout + Stripe wiring.**
  ```bash
  ls server/routes/
  grep -rn "stripe\|Stripe" server/routes/ server/lib/ | head -30
  grep -n "stripeCustomerId\|firstName\|lastName\|timezone" shared/schema.ts
  grep -rn "import { stripe" server/ | head -10
  ```
  Note:
  - Where `stripeCustomerId` lives on `users` (it should — Stripe is wired per CLAUDE.md)
  - Whether `firstName`, `lastName`, `timezone` columns exist on `users`
  - Where the Stripe SDK is imported (likely `server/stripe.ts` or `server/lib/stripe.ts`)
  - The existing route-mounting pattern (e.g., `setupAuthRoutes(app)`, `setupContentRoutes(app)`)

- [ ] **Step 2: Decide migrations needed.**
  - If `firstName`, `lastName`, `timezone` columns are MISSING on the `users` table: write a migration adding them (TEXT NULL, no default).
  - If they exist: skip the migration.
  - Use the next sequential migration number (check `ls migrations/` for the highest, increment).

  Migration template if needed (e.g., `migrations/0053_user_profile_fields.sql`):
  ```sql
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS timezone TEXT;
  ```

  And update `shared/schema.ts` `users` definition to add Drizzle columns (only if added):
  ```ts
  firstName: text("first_name"),
  lastName: text("last_name"),
  timezone: text("timezone"),
  ```

- [ ] **Step 3: Write the failing tests first (TDD).**

  **`tests/unit/billingPortalSession.test.ts`** — assert:
  - Authenticated request to `POST /api/billing/portal-session` for a user WITH `stripeCustomerId` returns `{ url: string }` (HTTP 200). The Stripe SDK is mocked.
  - Authenticated request for a user WITHOUT `stripeCustomerId` returns 400 with a clear error message ("No billing account on file" or similar — DO NOT auto-create customers on this route; that should happen at subscription creation).
  - Unauthenticated request returns 401.

  **`tests/unit/userProfileUpdate.test.ts`** — assert:
  - `PATCH /api/user/profile` with `{ firstName: "Sarah", lastName: "Builder", timezone: "America/New_York" }` returns 200 and the row is updated.
  - Validates `timezone` against `Intl.supportedValuesOf("timeZone")` (reject random strings with 400).
  - Allows partial updates (any subset of the 3 fields).

  **`tests/unit/userPasswordChange.test.ts`** — assert:
  - `POST /api/user/password` with correct `currentPassword` + valid `newPassword` (8+ chars) returns 200; Supabase Admin `updateUserById` is called.
  - Wrong `currentPassword` returns 401 (re-auth fails).
  - `newPassword < 8` chars returns 400.

  Match the existing test helper pattern from `tests/unit/contentCancel.test.ts` (mocks express handler + storage + Supabase Admin client).

  Run each test — expect FAIL because handlers don't exist yet.

- [ ] **Step 4: Implement `POST /api/billing/portal-session`.**

  Create `server/routes/billing.ts` (or add to existing routes module — match existing pattern):

  ```ts
  import express, { type Router } from "express";
  import { isAuthenticated, requireUser } from "../auth";
  import { stripe } from "../stripe"; // adapt to actual import path
  import { storage } from "../storage"; // adapt
  import { logger } from "../lib/logger";

  export function setupBillingRoutes(app: express.Express): void {
    const router: Router = express.Router();

    router.post("/portal-session", isAuthenticated, async (req, res) => {
      const user = requireUser(req);
      const dbUser = await storage.getUser(user.id);

      if (!dbUser?.stripeCustomerId) {
        return res.status(400).json({ error: "No billing account on file. Subscribe to a plan first." });
      }

      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: dbUser.stripeCustomerId,
          return_url: `${process.env.APP_URL ?? "https://venturecite.com"}/settings`,
        });
        res.json({ url: session.url });
      } catch (err) {
        logger.error({ err, userId: user.id }, "Stripe portal session failed");
        res.status(502).json({ error: "Billing portal temporarily unavailable" });
      }
    });

    app.use("/api/billing", router);
  }
  ```

  Mount via `setupBillingRoutes(app)` wherever other route setups are called.

  Re-run the billing portal test — expect PASS.

- [ ] **Step 5: Implement `PATCH /api/user/profile`.**

  Add to existing user-account route module (e.g., `server/routes/userAccount.ts`):

  ```ts
  import { z } from "zod";

  const profileSchema = z.object({
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    timezone: z.string().optional(),
  });

  router.patch("/profile", isAuthenticated, async (req, res) => {
    const user = requireUser(req);
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { firstName, lastName, timezone } = parsed.data;

    if (timezone) {
      const valid = Intl.supportedValuesOf("timeZone");
      if (!valid.includes(timezone)) {
        return res.status(400).json({ error: "Invalid timezone" });
      }
    }

    await storage.updateUser(user.id, {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(timezone !== undefined && { timezone }),
    });

    res.json({ ok: true });
  });
  ```

  If `storage.updateUser` doesn't exist or doesn't support partial updates of these fields, extend the DAO. Verify with:
  ```bash
  grep -n "updateUser\b" server/storage.ts server/databaseStorage.ts
  ```

  Re-run profile test — expect PASS.

- [ ] **Step 6: Implement `POST /api/user/password`.**

  ```ts
  const passwordSchema = z.object({
    currentPassword: z.string().min(1, "Current password required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
  });

  router.post("/password", isAuthenticated, async (req, res) => {
    const user = requireUser(req);
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { currentPassword, newPassword } = parsed.data;

    // Re-authenticate by signing in with current password.
    // The Supabase admin client doesn't do password verification directly; use the user-context client.
    const { data: signInData, error: signInError } = await supabaseUserClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError || !signInData?.user) {
      return res.status(401).json({ error: "Current password incorrect" });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateError) {
      logger.error({ err: updateError, userId: user.id }, "Password update failed");
      return res.status(502).json({ error: "Password update failed" });
    }

    res.json({ ok: true });
  });
  ```

  Verify the Supabase client patterns used elsewhere — `supabaseAdmin` is likely a singleton in `server/auth.ts` or `server/lib/supabase.ts`. If a "user client for re-auth" doesn't exist, you can construct one inline using `@supabase/supabase-js` with the public anon key — re-auth doesn't need admin privileges.

  Re-run password test — expect PASS.

- [ ] **Step 7: Type-check + run all new tests.**
  ```bash
  npm run check 2>&1 | tail -15
  npx vitest run tests/unit/billingPortalSession.test.ts tests/unit/userProfileUpdate.test.ts tests/unit/userPasswordChange.test.ts 2>&1 | tail -30
  ```

**DO NOT COMMIT.**

---

## Task 3: Settings page expansion

**Goal:** Add four new sections to the Settings page in the order: Profile → Password → Billing → Integrations. Existing sections (Notification preferences, Tour suppression, Account deletion, Data export) stay as-is.

**Files:**
- Modify: `client/src/pages/settings.tsx`

### Steps

- [ ] **Step 1: Recon current Settings structure.**
  ```bash
  grep -n "Card\|Section\|h2\|Notification\|Email\|delete" client/src/pages/settings.tsx | head -40
  ```
  Note the existing card/section pattern used so the new sections feel native.

- [ ] **Step 2: Add Profile section.**

  Place above the existing Notification preferences card.

  ```tsx
  function ProfileSection() {
    const { data: prefs } = useQuery({
      queryKey: ["/api/user/profile"],
      queryFn: () => apiRequest("GET", "/api/user/profile").then((r) => r.json()),
      // If no GET endpoint exists yet, read from /api/user/me or whatever endpoint
      // returns the current user; or fold profile fields into the existing user-fetch
    });

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [timezone, setTimezone] = useState("");

    useEffect(() => {
      if (prefs) {
        setFirstName(prefs.firstName ?? "");
        setLastName(prefs.lastName ?? "");
        setTimezone(prefs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
      }
    }, [prefs]);

    const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

    const updateProfile = useMutation({
      mutationFn: (body: Record<string, string>) =>
        apiRequest("PATCH", "/api/user/profile", body).then((r) => r.json()),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
        toast({ description: "Profile updated" });
      },
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => updateProfile.mutate({ firstName, lastName, timezone })}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? "Saving…" : "Save profile"}
          </Button>
        </CardContent>
      </Card>
    );
  }
  ```

  Adapt to whatever query/mutation infrastructure exists. If profile data is already loaded as part of a user-info query elsewhere, reuse instead of duplicating.

- [ ] **Step 3: Add Password section.**

  ```tsx
  function PasswordSection() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const { toast } = useToast();

    const changePassword = useMutation({
      mutationFn: (body: { currentPassword: string; newPassword: string }) =>
        apiRequest("POST", "/api/user/password", body).then(async (r) => {
          if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
          return r.json();
        }),
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast({ description: "Password changed" });
      },
      onError: (err: Error) => toast({ description: err.message, variant: "destructive" }),
    });

    const canSubmit =
      currentPassword.length > 0 &&
      newPassword.length >= 8 &&
      newPassword === confirmPassword &&
      !changePassword.isPending;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Minimum 8 characters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords don't match.</p>
            )}
          </div>
          <Button
            onClick={() => changePassword.mutate({ currentPassword, newPassword })}
            disabled={!canSubmit}
          >
            {changePassword.isPending ? "Changing…" : "Change password"}
          </Button>
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 4: Add Billing section.**

  ```tsx
  function BillingSection() {
    const { toast } = useToast();
    const openPortal = useMutation({
      mutationFn: async () => {
        const r = await apiRequest("POST", "/api/billing/portal-session");
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error ?? "Failed");
        }
        return r.json();
      },
      onSuccess: ({ url }: { url: string }) => {
        window.location.href = url;
      },
      onError: (err: Error) => toast({ description: err.message, variant: "destructive" }),
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Manage subscription, payment method, and invoices through Stripe.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => openPortal.mutate()} disabled={openPortal.isPending}>
            {openPortal.isPending ? "Opening…" : "Manage billing"}
          </Button>
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 5: Add Integrations section.**

  ```tsx
  function IntegrationsSection() {
    const { data: buffer } = useQuery({
      queryKey: ["/api/integrations/buffer/status"],
      queryFn: () => apiRequest("GET", "/api/integrations/buffer/status").then((r) => r.json()),
      // If this endpoint doesn't exist, skip the query and just show "Connect Buffer" without status.
      retry: false,
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="font-medium text-foreground">Buffer</p>
              <p className="text-sm text-muted-foreground">
                {buffer?.connected ? "Connected" : "Not connected"}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              {buffer?.connected ? "Manage" : "Connect"}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3 opacity-60">
            <div>
              <p className="font-medium text-foreground">Slack</p>
              <p className="text-sm text-muted-foreground">Coming soon</p>
            </div>
            <Button variant="outline" size="sm" disabled>Connect</Button>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3 opacity-60">
            <div>
              <p className="font-medium text-foreground">Webhooks</p>
              <p className="text-sm text-muted-foreground">Coming soon</p>
            </div>
            <Button variant="outline" size="sm" disabled>Configure</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  ```

  Adapt the Buffer status query based on whether a status endpoint exists. If it doesn't, just render "Connect" without a status indicator. The Slack/Webhooks tiles are intentionally `disabled` placeholders.

- [ ] **Step 6: Compose the page.**

  In the Settings page render, mount the new sections in order: Profile → Password → Billing → Integrations → (existing) Notification preferences → (existing) Tour preferences → (existing) Data export → (existing) Account deletion.

- [ ] **Step 7: Token compliance check.**
  ```bash
  grep -n "bg-stone\|bg-neutral\|bg-gray-50\|bg-violet\|text-violet\|border-violet\|bg-red-6\|bg-red-7\|text-red-6\|text-red-7\|bg-gradient\|shadow-sm\|shadow-md" client/src/pages/settings.tsx
  ```
  Expected: 0 raw palette matches (after Plan 2's sweep, settings.tsx should already be token-clean; this verifies the new sections also follow tokens).

- [ ] **Step 8: Type-check + lint.**
  ```bash
  npm run check 2>&1 | tail -10
  npm run lint -- client/src/pages/settings.tsx 2>&1 | tail -10
  ```

- [ ] **Step 9: Smoke test.**
  - `npm run dev`, log in, navigate to `/settings` (via the now-enabled Account Settings dropdown link).
  - Profile: edit name/timezone → save → reload → values persist.
  - Password: try wrong current password → error message. Correct current + valid new → success toast.
  - Billing: click "Manage billing" → if user has stripeCustomerId, redirects to Stripe portal. If not, shows "No billing account on file" toast.
  - Integrations: Buffer tile shows connection status (or "Not connected" if no query). Slack/Webhooks tiles are disabled placeholders.

**DO NOT COMMIT.**

---

## Self-Review

**1. Spec coverage:**

| Spec section | Plan 3 task |
|---|---|
| §4.2 Re-enable Account Settings | Task 1 Step 2 |
| §4.2 Remove vermillion stripe | Task 1 Step 3 |
| §4.2 Label renames (7 changes) | Task 1 Step 4 |
| §4.2 Tour markers verified | Task 1 Step 5 |
| §4.3 Billing section (Stripe portal) | Tasks 2 + 3 |
| §4.3 Profile section | Tasks 2 + 3 |
| §4.3 Password section | Tasks 2 + 3 |
| §4.3 Integrations section | Task 3 Step 5 |
| §4.3 Token sweep on delete-account | Already done in Plan 2 Task 9 |

All §4.2 + §4.3 covered.

**2. Placeholder scan.** No TBD/TODO. Every step has concrete code.

**3. Type consistency.** `profileSchema`, `passwordSchema` Zod schemas named consistently. All Tanstack Query mutation hooks follow the same `useMutation({ mutationFn, onSuccess, onError })` pattern. All sections use the same `<Card>` + `<CardHeader>` + `<CardContent>` shadcn structure.

**4. Plan-wide rule consistency.** "DO NOT COMMIT" appears in every task. The "no git mutating commands" rule is enforced via the plan-wide rules.

**5. Wave structure.**
- Task 1 (Sidebar) + Task 2 (Server routes) — parallel-safe (different files entirely)
- Task 3 (Settings UI) — sequences after Task 2 because the client mutations call the new routes

**6. Risks.**
- **Stripe customer ID may not be on every user.** Mitigated by Step 4's 400 response with clear message.
- **Supabase user-client re-auth pattern** may not be in the codebase already. Step 6 provides fallback construction.
- **Tour markers** are bound to routes, not labels, so renames don't break them — but Step 5 verifies anyway.
- **Settings page may have token leftovers** post-Plan 2. Step 7 catches them.

Plan is complete and consistent.
