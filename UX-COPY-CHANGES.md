# VentureCite — UX Copy Clarify: Before / After Proposal

A copy-clarity pass over the entire site's UX copy (from `UX-COPY.md`), graded against the
PRODUCT.md brand voice: **Practical, Considered, Sharp — plainspoken, anti-jargon; errors
state the problem AND the fix; consistent terminology; specific buttons; empty states give a
next action.** Operator audience, so real terms (citations, crawlers, prompts, rankings, GEO)
are kept, not dumbed down.

**Nothing in the code has changed.** This is a proposal for you to proofread. Only strings
that genuinely need a change are listed; everything not here stays as-is.

## How to use this
- **Section A** is the high-leverage part: global terminology/pattern decisions that each fix
  dozens of strings at once. Confirm or override the "Recommended" column — I'll apply your
  choice everywhere.
- **Section B** is the row-by-row before/after, numbered `C1…Cn`. Tell me which to apply
  (e.g. "apply all except C14, C22" or "A1–A6 and C1–C40").
- Rows marked _[guidance]_ describe a fix rather than giving one literal replacement string
  (usually "add a helper line" or "standardize these N variants") — I'll draft the exact text
  when you green-light them.
- `{placeholders}` in copy are kept verbatim.

---

## A. Global terminology & pattern decisions (each repeats across many screens)

These are the systemic issues every reviewer flagged independently. Deciding them once fixes
the long tail of inconsistency. **Recommended** = my suggested canonical; change any cell and
I'll conform to it.

| # | Issue (variants seen) | Recommended canonical | Applies to |
|---|---|---|---|
| A1 | Error-toast title: `Couldn't X` vs `Could not X` vs `Failed to X` vs generic `Error` | **`Couldn't <verb> <object>`** (contraction; drop the generic "Error" title; retire "Failed to") | ~all error toasts app-wide |
| A2 | Errors that state the problem but not the fix | **Every error ends with a concrete next step** — "Try again.", "Refresh and try again.", or "Contact support if it keeps happening." | dozens of toasts + server messages |
| A3 | Missing/misconfigured AI-key message has **7+ phrasings** | **`{Feature} isn't set up on this server yet. Contact support to enable it.`** | content gen, improve, citation checks, keywords, popular topics, etc. |
| A4 | Raw field-name validation: `keywords are required`, `engineId and stepId are required`, `prompt text required`, `confirm: true required` | **Natural sentence naming the UI control** — "Add at least one keyword…", "Enter the prompt text…" | many 400 validations |
| A5 | Implementation detail leaked into copy: `{ force: true }`, `confirm: true`, `keywords[]`, OpenAI/env-var names, "Supabase magic link", "terminal state" | **Plain language, no internal syntax/vendor/jargon** | brand-create, prompt reset, keyword job, reset-password, run cancel |
| A6 | Spelling: British `optimise/optimisation` mixed with American `optimize` | **American throughout** (`optimize`, `optimization`) | GEO Signals toasts vs. rest of app |
| A7 | Sign in vs Log In | **"Sign in"** everywhere (button, link, nav) | Login, Register, Landing nav |
| A8 | Destructive verb: Delete vs Remove | **"Delete"** for permanent removal (Competitors currently say "Remove") | Competitors vs Brand/Article/FAQ |
| A9 | "citation run" vs "citation check" vs "scan" for the same user action | **Pick one user-facing verb** — recommend **"citation check"** for the action, "run" only for the stored record | onboarding, DeleteBrandDialog, ScanCompletionListener |
| A10 | "AI Tutor" vs "AI tutor" vs "your VentureCite tutor" | **"AI Tutor"** (proper name) everywhere | EducationAssistant, PageHeaderHelp, WelcomeState |
| A11 | "AI engines" vs "AI search engines" vs "AI-powered search" | **"AI engines"** | Landing, Register, FAQ |
| A12 | "Website" vs "Website Domain" for the same field | **"Website"** | Brands vs Competitors |
| A13 | Empty-stat filler: `—` vs "Need more data" vs "No data yet" | **"No data yet"** | ResultsTab summary tiles |
| A14 | Priority badges: "High Priority" but "Medium"/"Low" | **"High" / "Medium" / "Low"** (drop "Priority" from the one) | AI Visibility Guide |
| A15 | Button casing: sentence case vs Title Case mixed ("Add fact" vs "Add Competitor", "add variation") | **Sentence case for in-app buttons** (recommend) — decide once | Intelligence tabs, dialogs, ScanStatusPanel |
| A16 | "Command Center" vs "Dashboard" for the home destination | **Pick one** — recommend **"Command Center"** (matches home identity) | onboarding CTAs, nav |
| A17 | "Fact Sheet" vs "fact sheet" | **"Fact Sheet"** (feature name) in UI chrome; lowercase only mid-sentence prose | Setup tab, Welcome body |
| A18 | "target query" vs "query" for the same GEO-signals input | **"target query"** | analyze vs pipeline-simulation |
| A19 | HTTP status shown raw ("URL returned HTTP {status}.") vs translated | **Translate to plain language** + fix ("That URL returned an error (HTTP {status}). Check it loads in a browser, then try again.") | brand-mentions, schema-audit |
| A20 | Success-heading exclamation marks inconsistent ("Password Reset!" vs "Check your email") | **Calm, minimal `!`** — reserve for genuine wins; default to none | auth success screens/toasts |

---

## B. Before / After — row by row (by screen)

### 1. Authentication & Marketing

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C1 | Login failed ({status}) | Login failed ({status}). Check your email and password and try again. | fix-less error | Login — toast-error |
| C2 | Registration failed ({status}) | Registration failed ({status}). Check your details and try again. | fix-less error | Register — toast-error |
| C3 | Request failed ({status}) | Request failed ({status}). Try again in a moment. | fix-less error | Verify Email — toast-error |
| C4 | Couldn't restart setup | Couldn't restart setup. Try again, or refresh the page. | fix-less error | Welcome — retry fallback |
| C5 | Couldn't retry | Couldn't retry. Try again in a moment. | fix-less, no next action | Welcome — toast-error |
| C6 | We hit a snag | Couldn't read your site | vague heading — doesn't say what failed | Welcome — scraping error box |
| C7 | Something went wrong | Lost connection while reading your site | vague fallback | Welcome — SSE error fallback |
| C8 | Boost performance and streamline efficiency with deep AI-citation analytics. | See share-of-voice trends, citation quality, and competitor gaps in one report. | hype/cliché ("boost", "streamline efficiency") vs. plainspoken sibling cards | Landing — "Advanced Reporting" card |
| C9 | Invalid code | That invite code isn't valid. Check for typos and try again. | fix-less, vague | Pricing — beta code error |
| C10 | Products not configured yet. Please set up Stripe products. | This plan isn't available for checkout right now. Try again shortly or contact support. | written to the admin, shown to a customer | Pricing — checkout toast |

### 2. App Shell / Shared Components / Chatbot

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C11 | Fallback makes "Explain the **this page** page in VentureCite." | Change fallback so it doesn't double "page" (e.g. `Explain {pageLabel} in VentureCite.`) _[guidance]_ | composing two components yields a broken double-"page" prompt | AppShell / PageHeaderHelp |
| C12 | No matches. Press Enter on "Ask" to ask the assistant. | No matches. Press Enter to ask the assistant instead. | nested quote to an unshown label reads as meta-copy | CommandPalette |
| C13 | (Brand Name / Company Name — no disambiguating helper) | Add a one-line helper to each ("Company Name — your legal entity…" vs "Brand Name — what you're tracking…") _[guidance]_ | the only field pair with no helper, and the most confusable | BrandFormFields |
| C14 | Couldn't copy (no description) | Couldn't copy — your browser blocked clipboard access. Select and copy manually. | error with no reason or fix | EducationAssistant |
| C15 | Couldn't restore / Couldn't archive (no description) | Add a cause + next step line (match "Undo failed" pattern) _[guidance]_ | terser than the equivalent mention flow | EducationAssistant / HistoryView |
| C16 | "Couldn't start a new conversation" / "Failed to send message" / "AI Tutor error" | Standardize on "Couldn't send message" / "Couldn't start conversation" | three phrasings for one failure class | useChatbot |
| C17 | Hey 👋 I'm your VentureCite tutor | Hey, I'm your AI Tutor | emoji skews marketing-casual vs. "colleague" voice; also unifies the name (A10) | Chatbot WelcomeState |

### 3. Brand & Content

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C18 | "Reading your website…" (manual brand create success) | Your brand profile is ready to edit. | manual create never reads a site — leftover copy | brands.tsx success toast |
| C19 | "Failed to create/update/delete/optimize FAQ" | "Couldn't create FAQ. Please try again." (+ matching) | states problem not fix; also A1/A2 | faq-manager.tsx |
| C20 | "Failed to discover keywords" / "Failed to delete keyword" | "Couldn't discover keywords. Please try again." (+ matching) | fix-less; also A1 | keyword-research.tsx |
| C21 | "Failed to add/remove/update/ignore competitor" | Append "Please try again." to each | inconsistent within same page | competitors.tsx |
| C22 | Generic "Error" toast title (competitor + distribute + save-edit) | "Couldn't add competitor" / "Couldn't save edits" etc. | generic title; breaks house style (A1) | competitors.tsx, DistributeDialog.tsx |
| C23 | `{err.message ?? "Unknown error"}` | Something went wrong on our end. Please try again. | "Unknown error" = no problem, no fix | faq-manager / keyword-research |
| C24 | Add data to see platform breakdown | Add a competitor to see platform breakdown. | vague; a real action exists to point to | competitors.tsx empty state |
| C25 | Delete-draft confirm button: "Delete" | Delete permanently | same unrecoverable action worded 2 ways (Articles say "Delete permanently") | content.tsx vs articles.tsx |
| C26 | Monthly limit reached (disabled Generate) | Monthly limit reached — upgrade for more | dead end, no path forward | content.tsx Generate button |
| C27 | No popular topics for this industry yet. | No popular topics for this industry yet. Try Refresh or a different industry. | dead-end empty state; actions exist | content.tsx Popular Topics |
| C28 | "Enter a valid URL like https://yourcompany.com." vs "Enter a valid http(s) URL" | Use one phrasing (with example) for both | same rule, two messages | brands.tsx toast vs Zod |
| C29 | "Website Domain" (Competitors) vs "website" (Brands) | Use "Website" for both (A12) | same concept, two names | competitors vs brands |
| C30 | "Couldn't reach the server. Try again." vs "Network error — try again" | Standardize on "Couldn't reach the server. Try again." | same failure, two phrasings | BufferConnectDialog vs DistributeDialog |

### 4. Visibility A — AI Visibility Guide & Citations

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C31 | Could not save progress | Couldn't save progress | breaks "Couldn't X" pattern (A1) | ai-visibility.tsx toggleStep error |
| C32 | "Error" / "Failed to check crawler permissions." | Couldn't check crawler permissions. Please try again. | generic title (A1) | crawler-check.tsx |
| C33 | Copied / Copied to clipboard (title + desc repeat) | Copied to clipboard | title and description repeat the fact | crawler-check.tsx toast |
| C34 | Wikipedia Monitor (quick-action button) | Track Wikipedia Mentions (or a label matching the action) | button label doesn't match the step's task | AI Visibility Guide — ChatGPT step |
| C35 | "High Priority" / "Medium" / "Low" | High / Medium / Low (A14) | only one pill spells out "Priority" | AI Visibility Guide priority pill |
| C36 | "Need more data" / "—" / "No data yet" (parallel tiles) | Use "No data yet" for all (A13) | 3 fillers for "nothing to show" | ResultsTab Summary card |
| C37 | "Will be added" vs "New (will be tracked)" | Use "New (will be tracked)" in both slot states | same concept, two labels | PromptsTab accept modal |
| C38 | "Couldn't accept" / "Update failed" / "Couldn't archive" / "Reset failed" (no fix line) | Add "Please try again." to each (A2) | siblings have a next step, these don't | PromptsTab failure toasts |
| C39 | No detail data available for this run. | No detail data available for this run. Try refreshing or re-running the check. | dead-end empty state | HistoryTab expanded run |

### 5. Visibility B — Signals, GEO Tools, Monitor, Report

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C40 | "Couldn't load {citation trend / rankings / platform visibility / leaderboard / share of voice / gap analysis / prompt coverage / entity strength / Reddit visibility / report / listicles}" | Append a fix, e.g. "— try refreshing." to each (A2) | ~11 loaders state the problem, not the fix; siblings do give a fix | Monitor Overview / Report / GEO Tools error states |
| C41 | Autopilot setup failed. | Autopilot setup failed — retry below, or contact support if it keeps happening. | fix-less; Retry lives elsewhere in the banner | Monitor Overview autopilot banner |
| C42 | Couldn't restart autopilot | Couldn't restart autopilot — try again in a moment. | no next step | Monitor Overview toast |
| C43 | No data yet. (Brand Entity Strength) | No brand entity data yet — it appears after your first citation scan. | too vague; siblings explain cause/timing | Monitor Overview |
| C44 | No competitor data yet (Share of Voice) | No competitor data yet — appears once we detect competitors cited alongside you. | dead-end, no timing | Monitor Overview |
| C45 | No competitor data yet. (Competitors Dominating) | No competitor data yet — appears once we detect brands outranking you. | dead-end | Monitor Overview |
| C46 | No share-of-voice data yet. | No share-of-voice data yet — it fills in after your next citation scan. | no cause | Monitor Overview |
| C47 | No prompt coverage data yet. | No prompt coverage data yet — it appears after your first citation scan. | no cause | Monitor Overview |
| C48 | Your brand has zero visibility on Reddit — a major source AI platforms use for recommendations. | …for recommendations. Start building presence under Act › Community. | stops short of the in-product fix | Monitor Overview RedditVisibility |
| C49 | Scan unavailable (disabled button) | Scan unavailable — {reason, e.g. "add a brand first" / "try again after {time}"} | status with no reason | ScanStatusPanel |
| C50 | "Failed to {discover listicles / update outreach / add listicle / analyze Wikipedia / add Wikipedia mention / draft mention / generate content}" | Append a fix to each (A1/A2) | whole page's failure toasts lack a next step | GEO Tools toasts |
| C51 | Unknown error | Something went wrong — try again, or refresh the page. | meaningless fallback | GEO Tools / BofuContentSheet |
| C52 | lowercase "draft" badge next to "Published" | Draft / Published (capitalize the data-driven fallback) | mixed-case badges read as a bug (A15) | GEO Tools BOFU card badges |

### 6. Fact Sheet / Home / Settings / Admin

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C53 | Could not delete account / Please try again. | Couldn't schedule deletion. Check your password and try again — or contact support if this keeps happening. | fix-less on the most destructive action; no cause | settings.tsx delete |
| C54 | Received an unexpected redirect URL from the server. | Something went wrong opening billing. Try again, or contact support if it persists. | leaks internal validation; money flow | settings.tsx billing portal |
| C55 | Failed to open billing portal | Couldn't open billing. Try again, or contact support if it keeps happening. | generic fix-less; money flow | settings.tsx |
| C56 | Not signed in. | Your session expired. Sign in again to export your data. | confusing on an authed page; no cause/fix | settings.tsx export |
| C57 | Could not load runs. (no retry) | Couldn't load runs. Try again. (add a retry control) | dead-end; contraction (A1) | admin-scrape-runs.tsx |
| C58 | Could not load scrape | Couldn't load scrape. Try again. | contraction; no retry | admin-scrape-inspector.tsx |
| C59 | Timeout scrape-failure alert (no action button) | Add a concrete next action (Re-scrape button; explain "tomorrow" = cooldown) _[guidance]_ | the one scrape-failure state that's a dead end | ScrapeFailureState.tsx |
| C60 | "Edit brand URL" / "Edit your brand description" / "Edit brand" / "Or edit your brand description" / "Edit brand description" | Standardize to "Edit brand URL" and "Edit brand description" | 5 phrasings for 2 destinations | ScrapeFailureState.tsx |

### 7. Emails & Server Messages (fill client toasts)

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C61 | Not authenticated | You're not logged in. Sign in again to continue. | terse, no fix (A1/A2) | auth.ts 401s |
| C62 | Failed to create account | Couldn't create your account. Try again, or contact support if it keeps happening. | vague fallback | POST /api/auth/register (400) |
| C63 | Registration failed | Registration didn't go through. Try again in a moment. | vague | register (500) |
| C64 | Login failed | Couldn't log you in. Try again, or reset your password if the problem continues. | vague | login (401) |
| C65 | Failed to process request | Couldn't send that email right now. Try again in a moment. | vague | forgot-password / resend-verification (500) |
| C66 | Password reset is now handled in the browser via Supabase magic link. | Click the reset link in your email — it logs you in directly, no separate reset step needed. | leaks vendor + jargon (A5) | reset-password (410) |
| C67 | Failed to schedule account deletion. | Couldn't schedule your account deletion. Try again, or contact support. | vague | /api/user/delete (500) |
| C68 | Failed to build export. | Couldn't build your data export. Try again in a few minutes. | vague | /api/user/export (500) |
| C69 | Failed to load preferences. | Couldn't load your notification preferences. Refresh the page and try again. | vague | notification-preferences (500) |
| C70 | Failed to update profile. | Couldn't save your profile changes. Try again. | vague | /api/user/profile (500) |
| C71 | Password update failed / Failed to change password. | Couldn't update your password. Try again in a moment. | vague (two variants) | /api/user/password (502/500) |
| C72 | Failed to update preferences. | Couldn't save your notification preferences. Try again. | vague | notification-preferences (PATCH 500) |
| C73 | Billing portal temporarily unavailable | Billing portal is temporarily unavailable. Try again in a few minutes. | no fix | billing/portal-session (502) |
| C74 | Invalid or inactive price | That plan isn't available right now. Refresh the page and try again, or contact support if it persists. | technical/blaming | stripe/checkout (400) |
| C75 | Password must satisfy: {rule}. | Add {rule} to your password. | robotic spec phrasing | passwordPolicy.ts |
| C76 | AI service is not configured | AI features aren't set up on this server yet. Contact support to enable them. | vague; unify per A3 | brands/create-from-website (503) |
| C77 | This URL is not allowed | This URL points to a private or internal address, which we can't scrape. Enter your public website URL. | no reason/fix | create-from-website (400 SSRF) |
| C78 | A brand named "{name}" already exists. Pass { force: true } to create anyway. | A brand named "{name}" already exists. Choose a different name, or confirm you want to create a duplicate. | leaks API param (A5) | create-from-website (409) |
| C79 | A brand named "{name}" already exists. | A brand named "{name}" already exists. Choose a different name. | no fix | POST /api/brands (409) |
| C80 | AI returned an unexpected response shape (no keywords[]). | The AI didn't return usable keywords. Try again. | leaks data-shape detail (A5) | keyword_discovery finalize |
| C81 | AI returned an empty response. | The AI didn't return any keywords. Try again. | vague | keyword_discovery finalize |
| C82 | Cannot generate — article is in status '{status}'. | This article can't be generated in its current state ({status}). Refresh the page to see its latest status. | blaming, raw status | articles/:id/generate (409) |
| C83 | keywords are required | Add at least one keyword before generating this article. | raw field name (A4) | articles/:id/generate (400) |
| C84 | industry is required | Select an industry before generating this article. | raw field name (A4) | articles/:id/generate (400) |
| C85 | Content generation is not available. OpenAI API key is not configured. | Content generation isn't set up on this server yet. Contact support to enable it. | leaks env var; A3 | articles/:id/generate (503) |
| C86 | Auto-Improve is not available. OpenAI API key is not configured. | Auto-Improve isn't set up on this server yet. Contact support to enable it. | leaks env var; A3 | articles/:id/improve (503) |
| C87 | AI citation checks are not configured. | Citation checks aren't set up on this server yet. Contact support to enable them. | A3 | brand-prompts/:brandId/run (503) |
| C88 | Failed to fetch keywords | Couldn't load your keywords. Refresh the page and try again. | vague | keyword-research/:brandId (500) |
| C89 | Failed to fetch opportunities | Couldn't load your keyword opportunities. Refresh the page and try again. | vague | keyword-research opportunities (500) |
| C90 | confirm: true required | Confirm the reset before continuing. | leaks body syntax (A5) | brand-prompts/:brandId/reset (400) |
| C91 | AI returned no usable prompts. | The AI didn't return usable prompts. Try again. | missing fix present in sibling | brand-prompts/:brandId/reset (502) |
| C92 | prompt text required | Enter the prompt text before saving. | raw field name (A4) | prompts/:promptId (400) |
| C93 | engineId and stepId are required | Something's missing from that request. Refresh the page and try again. | raw camelCase names (A4) | visibility-progress (400) |
| C94 | Could not fetch the URL. | Couldn't fetch that URL. Check that the page is public and loads in a browser, then try again. | vague | brand-mentions (400) |
| C95 | URL returned HTTP {status}. | That URL returned an error (HTTP {status}). Check the link loads in a browser, then try again. | raw status (A19) | brand-mentions (400) |
| C96 | Run is already in a terminal state. | This run has already finished and can't be cancelled. | "terminal state" jargon (A5) | fact-sheet run cancel (409) |
| C97 | Run status changed before cancel could apply. | This run's status changed just before your cancel went through. Refresh the page and try again if it's still running. | passive, no next step | fact-sheet run cancel (409) |
| C98 | Streaming halted unexpectedly. | The live scan feed was interrupted. Refresh the page to reconnect. | vague | fact-sheet run stream (SSE) |
| C99 | Brand website must be http(s) URL | Add a website URL starting with http:// or https:// to this brand before running this. | terse jargon, no location | fact-sheet plan / full-rescrape (400) |
| C100 | Content and target query required | Enter both content and a target query before analyzing. | terse Zod-style | geo-signals/analyze (400) |
| C101 | Content exceeds {MAX} characters. | Content exceeds the {MAX}-character limit. Trim it and try again. | states limit, not fix (repeats across endpoints) | improve / geo-signals/* (413) |
| C102 | Failed to analyze signals | Couldn't analyze this content. Try again. | vague fallback | geo-signals/analyze (500) |
| C103 | Failed to simulate pipeline | Couldn't simulate the pipeline. Try again. | vague fallback | geo-signals/pipeline-simulation (500) |
| C104 | This URL isn't reachable (private host or invalid). | This URL isn't reachable — it may be private, internal, or malformed. Enter a public website URL. | no fix | geo-signals/schema-audit (400) |
| C105 | 1. Set up — the kernel | 1. Set up — the foundation | "the kernel" = unexplained tech metaphor vs. the other 4 plain titles | Global Welcome tour, step 2 |
| C106 | …cite your brand. A quick 60-second tour of the five-stage workflow? | …cite your brand. Want a quick 60-second tour of the five-stage workflow? | dangling fragment, missing verb | Global Welcome tour, step 1 |

### 8. Explainers / Dropdowns / Command Palette

| # | Current | Suggested | Why | Where |
|---|---|---|---|---|
| C107 | Auxiliary tools — bulk ops, data exports, schema generators, listicle scanners, FAQ helpers. | Bulk ops, data exports, schema generators, listicle scanners, and FAQ helpers — extra GEO tooling outside the core workflow. | "Auxiliary" undersells; page nav calls it "GEO Assets" (A4/A16) | pageExplainers — GEO Tools |
| C108 | NPOV-tuned 2-3 sentence draft you can paste into Wikipedia's edit form. | Neutral-tone (NPOV) draft you can paste into Wikipedia's edit form. | NPOV is undefined jargon — spell out on first use | geo-tools Wiki draft dialog |
| C109 | Title "500-Token Chunk Engineer" + desc "…~375 word chunks…" | Make both state the same target (e.g. "~500-token chunks") | title and description give two different sizes | geo-signals Chunks tab |
| C110 | "Add Your First" vs "Add your first competitor" | Use "Add your first competitor" in both | same action, two labels/cases | competitors empty states |
| C111 | "Copy" (recommendation) vs "Copy robots.txt Rule" (accordion) | Standardize on "Copy rule" | same action, two labels | crawler-check |
| C112 | add variation | Add variation | casing vs. every sibling button (A15) | ScanStatusPanel |

---

## Notes & judgment calls
- **Kept as-is (not flagged):** the AI Visibility Guide's step-by-step how-tos, the glossary,
  most page explainers, industry/fact-category option names, dashboard metric labels — these
  already fit the plainspoken brand voice.
- **Biggest wins are the global decisions (A1–A6):** unifying the error-toast pattern, always
  stating the fix, one missing-AI-key template, killing leaked API syntax, and one spelling.
  Those alone touch ~60 of the strings above.
- **A15 (sentence vs Title case) and A16 (Command Center vs Dashboard) are opinions, not bugs**
  — decide the direction and I'll conform; if you'd rather leave casing alone, say so and I'll
  drop the casing rows.
- Once you mark accept/reject, I'll map each accepted row back to its source component/route
  and apply the edits, then run `npm run check` + lint (copy-only; no behavior change).
