# Trakkr replication spec - "Prompts" sidebar group

Scope: `/dashboard`, `/actions`, `/prompts`, `/research`, `/diagnose`.
Captured live from https://trakkr.ai as a logged-in user.
Brand in session: "Venture PR" (brand_id `7d474cd4-0273-480c-8e85-cff6cf434cc8`).
Date of capture: 2026-08-07. All copy below is verbatim from the DOM.

Screenshots were not available in this environment. All observations come from the DOM
and from the browser performance/network records.

---

## 0. Shell (common to all five pages)

### 0.1 Sidebar navigation

The sidebar is an `<aside>` fixed to the left. Width 200px. Class:
`fixed inset-y-0 left-0 w-[200px] z-30 bg-white border-r border-...`.

Top of sidebar: a brand switcher button labelled "Venture PR".
Below it: a button "Ask" with the keyboard hint "⌘K".

Navigation groups and links, in DOM order:

| Group label | Anchor text | href |
|---|---|---|
| (ungrouped) | Dashboard | `/dashboard` |
| (ungrouped) | Actions | `/actions` |
| Prompts | Prompts | `/prompts` |
| Prompts | Research | `/research` |
| Prompts | Diagnose | `/diagnose` |
| Visibility | Pages | `/pages` |
| Visibility | Citations | `/citations` |
| Visibility | Competitors | `/competitors` |
| Visibility | Perception | `/perception` |
| Traffic | Visitors | `/traffic/analytics` |
| Traffic | Crawlers | `/traffic/crawler` |
| Growth | Content | `/create` |
| Growth | Site Optimization | `/optimize` |
| Growth | AI Pages | `/ai-pages` |
| Growth | Reddit | `/reddit` |
| Growth | Automations | `/automations` |
| Connect your AI | Integrations | `/integrate` |
| (footer) | Settings | `/settings` |
| (footer, icon only) | (no text) | `/learn` |

Group headers observed as buttons: "Prompts", "Visibility", "Traffic", "Growth",
"Connect your AI". Additional buttons: "Open navigation", "Open Settings".

### 0.2 Chrome outside the sidebar

- A fixed widget container at `bottom-4 right-4 md:bottom-6 md:right-6 z-[90]`.
- An Intercom launcher (`div.intercom-lightweight-app`) plus one `<iframe>`.
- Page content is wrapped in `div.max-w-[1800px].mx-auto.w-full.min-h-screen`.
  At `min-[2000px]` the wrapper gains left and right borders.

---

## 1. `/dashboard`

- URL: `https://trakkr.ai/dashboard`
- Document title: "Dashboard"
- H1: NOT OBSERVED (no `<h1>` in the page; the brand name "Venture PR" acts as the title line)
- Subtitle line: "Data through Aug 6, 2026"

### 1.1 Header action buttons

| Button | Behaviour |
|---|---|
| "Share" | NOT OBSERVED (not clicked) |
| "Export" | NOT OBSERVED (not clicked) |
| "Reports" | NOT OBSERVED (not clicked) |

### 1.2 KPI tiles (6 tiles, DOM order)

Each tile is a link. Each tile carries a small info button with `aria-label="Help: ..."`
and class `cursor-help`.

| # | Label | Value | Sub-label | Delta | href | Help button aria-label |
|---|---|---|---|---|---|---|
| 1 | VISIBILITY | 10 | "vs yesterday" | "+0.8" (also seen as "+0.7") | `/reports` | "Help: Visibility score" |
| 2 | MENTIONS | 28 | "last 7 days" | none | `/prompts` | "Help: Total mentions" |
| 3 | RANK | #80 | "of 554" / "this week" | none | `/competitors` | "Help: Competitive rank" |
| 4 | CITATIONS | 408 | "this week" | none | `/citations` | "Help: Citation count" |
| 5 | AI TRAFFIC | -- | "Connect GA" | none | `/traffic/analytics` | "Help: AI traffic" |
| 6 | CONVERSATIONS | -- | "Connect AI Crawlers" | none | `/traffic/crawler` | "Help: Conversations" |

Note on values: RANK read "#1 of 306" during first paint and settled at "#80 of 554"
after data load. Treat the first paint as a placeholder.

Delta formatting: signed one-decimal number, e.g. "+0.8".

#### Help tooltip (observed)

Hovering the info icon opens a `role="tooltip"`. Content of "Help: Visibility score":

> "Visibility score
>
> How prominently AI models mention your brand when answering relevant questions. Higher-ranked mentions earn more points.
>
> 100 × √(position points ÷ (successful responses × 10))
>
> Good: 40+ · Excellent: 60+
>
> Learn more"

The "Learn more" anchor points to `/learn/docs/concepts#visibility`.

The tooltip icon sits inside the tile link. A plain click on it navigates to the tile
href (clicking "Help: Visibility score" navigated to `/reports`).

The tooltip bodies of "Help: Total mentions", "Help: Competitive rank",
"Help: Citation count", "Help: AI traffic" and "Help: Conversations" are NOT OBSERVED.
The tooltip element did not re-render for the other triggers during capture.

### 1.3 Panel: VISIBILITY OVER TIME

- Heading: "VISIBILITY OVER TIME"
- Range switcher, `aria-label="Visibility chart date range"`. Options, verbatim: "7D", "14D", "30D".
- Chart type: line/area chart.
- X axis labels observed at 7D: "Jul 31", "Aug 1", "Aug 2", "Aug 3", "Aug 4", "Aug 5", "Aug 6".
- Y axis ticks: "0", "5", "10", "15".
- Tooltip contents: NOT OBSERVED.
- Colours: NOT OBSERVED.

### 1.4 Panel: RANKINGS

- Heading: "RANKINGS"
- Header link: "Manage" → `/competitors`
- Footer line: "You: #80 of 554 brands"
- Rows: 50 competitor rows plus the user's own row pinned at the end.

Each row is a `<button>` wrapping a link to
`/competitors?tab=head-to-head&rival=<URL-encoded brand name>`.

Row cell order: rank ("#1"), optional single-letter avatar fallback, brand name,
score, delta.

Full observed list (rank, brand, score, delta):

```
#1  Edelman 61 -4        #26 Racepoint Global 17 -5
#2  Weber Shandwick 53 -2 #27 Bolt PR 17 -4
#3  Ketchum 47 -4        #28 Hotwire 17 -4
#4  FleishmanHillard 45 -5 #29 Proper Propaganda 16 +2
#5  Highwire PR 40 -4    #30 Siegel+Gale 16 -4
#6  Walker Sands 35 -4   #31 PRLab 16 +5
#7  Bospar 32 +2         #32 Interbrand 16 +3
#8  Ogilvy 31 +2         #33 Muck Rack 15 +4
#9  LaunchSquad 30 -4    #34 Prosek Partners 15 -2
#10 Brunswick Group 27 -2 #35 Burson 15 +2
#11 Finn Partners 23 +3  #36 WE Communications 15 +2
#12 Apple 22 +5          #37 5WPR 15 -1
#13 Ruder Finn 22 +3     #38 Highwire 15 -3
#14 SHIFT Communications 22 -5 #39 Google 14 +2
#15 InkHouse 21 -3       #40 Amazon 14 +2
#16 PAN Communications 20 +5 #41 Cision 14 +2
#17 Golin 19 +5          #42 PR Newswire 14 -4
#18 Crackle PR 19 +3     #43 Matter Communications 14 +0
#19 BLASTmedia 19 +3     #44 NVIDIA 14 +2
#20 The Hoffman Agency 19 +5 #45 APCO Worldwide 14 +4
#21 Microsoft 19 +4      #46 Mission North 14 +3
#22 BCW 18 -5            #47 MSL 13 -5
#23 Porter Novelli 18 +4 #48 Prophet 13 -4
#24 Method Communications 17 +0 #49 Landor 13 +2
#25 FGS Global 17 +3     #50 Sparkpr 13 -4
#80 Venture PR 10 +1  (pinned "you" row)
```

Delta formatting: signed integer, "+0" is rendered for no change.
Sort behaviour: fixed by rank. NOT OBSERVED to be sortable.

### 1.5 Panel: ACTIONS

- Heading: "ACTIONS"
- Progress label: "0/8"
- Stat chips: "2 quick wins", "8 open"
- Link "View all" → `/actions`
- One action card, a link to `/actions?actionId=f5ddba42-fcf0-4699-98bf-3e794355fd4c`,
  with text: "Deploy Service-Specific Schema", "~45 min", "1", "Med Impact".

### 1.6 Panel: TOP PROMPTS

- Heading: "TOP PROMPTS"
- Link "View all" → `/prompts`
- 5 rows. Each row links to `/prompts?highlight=<prompt uuid>`.
- Cell order per row: rank number, prompt text, AI volume band, score, delta.

| # | Prompt text | Volume | Score | Δ | href |
|---|---|---|---|---|---|
| 1 | "compare leading robotics and AI hardware public relations firms" | 50-200 | 40 | - | `/prompts?highlight=5a1872d5-cf61-4e78-a61b-2cb15061671d` |
| 2 | "best public relations agencies for disruptive B2B SaaS startups" | 200-1K | 22 | - | `/prompts?highlight=65365ec8-1ef4-4f94-9440-6ba5e570cce0` |
| 3 | "best PR agencies for consumer electronics and hardware launches" | 200-1K | 19 | - | `/prompts?highlight=7482b68e-a916-4150-934b-6c9862022608` |
| 4 | "best public relations partners for category creation and storytelling" | 200-1K | - | - | `/prompts?highlight=75b87ca3-698c-4ba2-ab8c-2482ef53e47d` |
| 5 | "top public relations partners for global consumer tech brands" | 200-1K | - | - | `/prompts?highlight=25ed43b5-5f6b-4452-b890-7a737a653da2` |

### 1.7 Panel: SITE HEALTH

- Heading: "SITE HEALTH"
- Link "Optimize" → `/optimize`
- Big number: "87"
- Severity chips: "0 crit", "1 high", "3 med", "3 low"
- Footer meta: "53 pages", "nextjs", "3d ago"

### 1.8 Panel: PERCEPTION

- Heading: "PERCEPTION"
- Link "Details" → `/perception`
- Big number: "66", delta "+2.7"
- Sub-metrics: "Innovation Appeal 70.4", "Value Experience 68.7", "Quality Performance 67.4"

### 1.9 Model cards (8 cards)

Each card is a link to `/competitors?mode=prompts&model=<model key>`.
Each card shows a label ("VISIBILITY" when data exists, "No data yet" when not),
a score, the suffix "/100", a one-line model description, the text
"View prompts by model", and the score repeated.

| # | Model key in href | Description copy | Header label | Score |
|---|---|---|---|---|
| 1 | `Perplexity` | "Perplexity AI - answer engine with citations" | VISIBILITY | 24 /100 |
| 2 | `OpenAI` | "OpenAI's ChatGPT - the most widely used AI assistant" | VISIBILITY | 15 /100 |
| 3 | `Anthropic` | "Anthropic's Claude - known for safety and helpfulness" | "No data yet" | - |
| 4 | `Google%20AI%20Overviews` | "Google's AI-generated search summaries" | "No data yet" | - |
| 5 | `Gemini` | "Google's Gemini - multimodal AI assistant" | "No data yet" | - |
| 6 | `Grok` | "xAI's Grok - real-time knowledge from X" | "No data yet" | - |
| 7 | `Deepseek` | "DeepSeek - efficient open-source AI" | "No data yet" | - |
| 8 | `Meta` | "Meta's AI assistant powered by Llama" | "No data yet" | - |

Below the model cards there is a link "Explore" → `/competitors`.

### 1.10 Panel: CITATIONS

- Heading: "CITATIONS"
- Link "Explore" → `/citations`
- Sparkline axis labels: "14d ago" and "Today"
- Big number "408" with sub-label "sources"
- Sub-heading "TOP SOURCES" with the qualifier "all-time"
- Source rows, each a link to `/citations?source=<domain>`:

| Domain | Count | href |
|---|---|---|
| linkedin.com | 58 | `/citations?source=linkedin.com` |
| the-square.co | 45 | `/citations?source=the-square.co` |
| clutch.co | 38 | `/citations?source=clutch.co` |
| cracklepr.com | 34 | `/citations?source=cracklepr.com` |

### 1.11 Traffic tiles (zero states)

Tile "AI TRAFFIC" (link → `/traffic/analytics`):
> "Connect analytics"
> "See visitors from AI citations"
> "Connect"

Tile "CONVERSATIONS" (link → `/traffic/crawler`, appears twice as a link):
> "Dashboard"
> "No conversations yet"
> "Set up tracking"

### 1.12 Complete outbound link graph for `/dashboard`

| Element | Anchor text | href |
|---|---|---|
| KPI tile 1 | "VISIBILITY 10 +0.8 vs yesterday" | `/reports` |
| KPI tile 2 | "MENTIONS 28 last 7 days" | `/prompts` |
| KPI tile 3 | "RANK #80 of 554 this week" | `/competitors` |
| KPI tile 4 | "CITATIONS 408 this week" | `/citations` |
| KPI tile 5 | "AI TRAFFIC -- Connect GA" | `/traffic/analytics` |
| KPI tile 6 | "CONVERSATIONS -- Connect AI Crawlers" | `/traffic/crawler` |
| Rankings header | "Manage" | `/competitors` |
| Rankings rows (51) | (row contents) | `/competitors?tab=head-to-head&rival=<name>` |
| Actions header | "View all" | `/actions` |
| Action card | "Deploy Service-Specific Schema ..." | `/actions?actionId=f5ddba42-...` |
| Top prompts header | "View all" | `/prompts` |
| Top prompt rows (5) | (prompt text) | `/prompts?highlight=<uuid>` |
| Site health header | "Optimize" | `/optimize` |
| Perception header | "Details" | `/perception` |
| Model cards (8) | (card contents) | `/competitors?mode=prompts&model=<key>` |
| Below model cards | "Explore" | `/competitors` |
| Citations panel | (icon) | `/citations` |
| Citations source rows (4) | (icon/row) | `/citations?source=<domain>` |
| AI traffic tile | (tile) | `/traffic/analytics` |
| Conversations tile (x2) | (tile) | `/traffic/crawler` |

### 1.13 Network API surface for `/dashboard`

Two API hosts: `https://api.trakkr.ai` (labelled API below) and the Supabase REST
endpoint `https://vhdphutoswgscnkskrcj.supabase.co/rest/v1` (labelled SB).
All requests are `fetch`. Method is GET unless noted.
Response shapes were not readable through `read_network_requests` for these
cross-origin calls, so response notes below are inferred from the request path and
from the rendered panel. Anything not inferable is marked NOT OBSERVED.

| Method | Path + query | Note on response |
|---|---|---|
| GET | SB `/users?id=eq.<userId>&select=id,email,name,plan,plan_cycle,stripe_customer_id,subscription_id,subscription_status,subscription_checked_at,brand_limit,flags,extra_features,extra_brands,extra_prompts,in_grace_period,grace_period_ends_at,signup_method,signup_source,bubble_id,has_seen_v2_welcome,team_id,team_role,is_client,has_restricted_brand_access,is_agency,agency_name,timezone,date_format,two_factor_enabled,two_factor_enabled_at,weekly_report_enabled,weekly_report_sent_at,weekly_report_unsubscribed_at,pitch_open_emails_enabled,discount_coupon_code,discount_coupon_sent_at,discount_coupon_redeemed_at,referral_sidebar_enabled,trial_started_at,trial_ends_at,has_used_growth_trial,trial_converted_at,first_paid_at,cancel_at_period_end,subscription_paused_at,subscription_resumes_at,pause_reason,onboarding_checklist,created_at,updated_at` | user row |
| GET | API `/internal/platform-stats` | NOT OBSERVED |
| GET | API `/subscription/effective` | plan entitlements |
| POST | API `/analytics/identify` | analytics |
| GET | API `/auth/session` | session |
| GET | SB `/rpc/get_pending_team_invite_for_current_user` | invite or null |
| GET | API `/pages/config?brand_id=<id>` | NOT OBSERVED |
| GET | API `/double/run/<brandId>` | NOT OBSERVED |
| GET | API `/users/me/mcp-token/sessions` | MCP sessions |
| GET | API `/users/admin-access` | NOT OBSERVED |
| GET | API `/subscription/downgrade-changes` | NOT OBSERVED |
| GET | SB `/brand_members?user_id=eq.<userId>&select=role,brand_id,brands(*,brand_groups(id,name,color,position))` | brand list for switcher |
| GET | SB `/team_clients?user_id=eq.<userId>&status=eq.active&select=brand_id,can_export,brands(*)` | client brands |
| GET | API `/client/group-brands` | NOT OBSERVED |
| GET | API `/subscription/sync?force=false` | NOT OBSERVED |
| GET | API `/actions/plan?brand_id=<id>` | weekly plan, feeds ACTIONS panel |
| GET | API `/citations/<brandId>/history?days=28` | citation sparkline |
| GET | API `/ga/status?brand_id=<id>&user_id=<userId>` | GA connection state, drives AI TRAFFIC tile |
| GET | API `/brands/<brandId>/first-report-status` | NOT OBSERVED |
| GET | API `/brand-groups` | NOT OBSERVED |
| GET | API `/dashboard?brand_id=<id>&days=30` | main KPI + chart payload |
| GET | API `/rankings/<brandId>?days=30&compact=true` | RANKINGS panel rows |
| GET | API `/citations/<brandId>?limit=50&provider_schema=providers-v5&cache_policy=empty-no-store-v1` | CITATIONS panel + top sources |
| GET | API `/crawler/dashboard?brand_id=<id>&days=7&granularity=auto` | CONVERSATIONS tile |
| GET | API `/prism/status?brand_id=<id>` | NOT OBSERVED |
| GET | API `/actions/preferences?brand_id=<id>` | NOT OBSERVED |
| GET | API `/prompts?brand_id=<id>` | TOP PROMPTS panel |
| GET | API `/volume/brand/<brandId>?calculate_missing=false` | AI volume bands |
| GET | API `/gates/teaser/generate-all/<brandId>` | NOT OBSERVED |
| GET | SB `/reports?select=id&brand_id=eq.<id>&status=eq.completed` | completed report ids |
| GET | API `/api/circulation-templates?brand_id=<id>` | NOT OBSERVED |
| GET | SB `/brands?select=id,active,paid,deleted,preview,created_at,name,favicon,domain&id=eq.<id>` | brand header |
| POST | API `/api/activation/track` | analytics |
| GET | SB `/reports?select=id,status,progress,visibility,created_at,updated_at&brand_id=eq.<id>&status=eq.completed&order=created_at.desc&limit=1` | latest completed report |
| GET | SB `/reports?select=id,status,progress,visibility,created_at,updated_at&brand_id=eq.<id>&order=created_at.desc&limit=1` | latest report of any status |
| GET | SB `/prompts?select=id&brand_id=eq.<id>&active=eq.true` | active prompt count |
| GET | SB `/tags?select=id,brand_id,name,colour,created_by,created_at,updated_at&brand_id=eq.<id>&order=name.asc` | tag list |
| GET | SB `/brands?select=perception_enabled,perception_competitors,perception_goals,perception_setup_completed_at,perception_last_run_at&id=eq.<id>` | PERCEPTION panel gate |
| GET | SB `/audits?select=id,overall_score,critical_issues,high_issues,medium_issues,low_issues,pages_analyzed,created_at,domain_checks,detected_platform&brand_id=eq.<id>&status=eq.complete&order=created_at.desc&limit=1` | SITE HEALTH panel |
| GET | API `/agent/automations?brand_id=<id>` | NOT OBSERVED |
| GET | API `/agent/needs-you?brand_id=<id>` | NOT OBSERVED |
| GET | API `/brands/<brandId>/markets` | NOT OBSERVED |
| GET | API `/api/perception/story?brand_id=<id>` | PERCEPTION copy |

Third-party beacons also fire: `https://e.trakkr.ai/flags/`, `https://e.trakkr.ai/i/v0/e/`,
`/ingest/capture/`, Google Ads `ccm/collect` and `rmkt/collect`, LinkedIn `px.ads.linkedin.com`.

---

## 2. `/actions`

- URL: `https://trakkr.ai/actions`
- Document title: "Actions"
- H1: "Actions"
- Meta line next to H1: "Updated 18m ago" (relative time, refreshes)
- Intro banner above the H1, with a "Dismiss" icon button (`aria-label="Dismiss"`):
  > "Your Agent finds work, plans three for the week, and measures what ships. Every measured outcome appears in Results, including no movement."

### 2.1 Header action buttons

| Button | Note |
|---|---|
| "New action" | NOT OBSERVED (not clicked) |
| "Export" | Present in the "This week" view only. Absent in the "Results" view. |

### 2.2 Tabs

Two tabs, implemented as `role="tab"` buttons with ids
`desk-status-tab-week` and `desk-status-tab-results`, controlling panels
`desk-status-panel-week` and `desk-status-panel-results`.

| Tab label | URL it sets | Count badge |
|---|---|---|
| "This week" | `/actions` (no query param) | none |
| "Results" | `/actions?view=results` | none |

### 2.3 Stat strip (both tabs)

Four clickable stat chips, in order:

| Value | Label |
|---|---|
| 8 | "found" |
| 0 | "planned" |
| 0 | "measuring" |
| 0 | "earned" |

Chips are `<button>` elements with class `h-7 ... rounded px-2 text-caption hover:bg-muted/40`.
What each chip filters is NOT OBSERVED.

### 2.4 Tab "This week"

Empty state block:
- H2: "Nothing planned yet"
- Copy: "A short plan appears here when new report or crawler data lands. Everything found so far is below."

Filter row, in order: "Open", "Type", "Learning", the count "8 of 8", and a
"Columns and density" icon button.

#### Filter "Open"

Opens a popover. Options, verbatim, one per line:

```
Open
Snoozed
Dismissed
```

#### Filter "Type"

Button `aria-label="Filter by type"`, `aria-haspopup="dialog"`.
Popover heading: "Type". Three rows, each a button with a label and a count.
Observed labels are all identical:

| Label | Count |
|---|---|
| "Suggested" | 5 |
| "Suggested" | 2 |
| "Suggested" | 1 |

The popover body scrolls, `max-height: 283px`. It is anchored with a rotated arrow div.

#### Button "Learning"

Not a dropdown. It opens a modal (`role="dialog"`) with a brain icon trigger:

> "What Trakkr has learned
>
> Trakkr reads this brand's recent choices and outcomes when it creates new actions.
>
> Nothing learned yet
>
> Optional dismissal feedback and measured results will appear here. Machine cleanup never counts.
>
> 0 machine events ignored
> Done"

Close behaviour: the "Done" button closes the modal.

#### Button "Columns and density"

Opens a popover with two sections:

```
COLUMNS
Reset
Work
Why now
Page
Impact

DENSITY
Options
Regular
Compact
```

#### Table

Column headers, in order: "WORK", "WHY NOW".
(The "Page" and "Impact" columns exist in the column picker but are hidden by default.)
Sort behaviour: NOT OBSERVED (headers are not buttons).
Row hover state: NOT OBSERVED.
Each row ends with an "Open" button that opens the action drawer.

The 8 rows. Cell 1 = work title plus a type chip; cell 2 = "why now" copy.

| # | WORK | Type chip | WHY NOW |
|---|---|---|---|
| 1 | "Deploy Service-Specific Schema" | Technical | "For query \"best public relations agencies for disruptive B2B SaaS startups\": Deploy Service-Specific Schema Visibility is 22.36%." |
| 2 | "Create B2B SaaS Pillar Content" | Content | "For query \"best public relations agencies for disruptive B2B SaaS startups\": Create B2B SaaS Pillar Content Visibility is 22.36%." |
| 3 | "Publish AI-Specific Technical Narratives" | Content | "For query \"best PR firms for AI startups\": Publish AI-Specific Technical Narratives Visibility is 0.0%." |
| 4 | "Join the Quora thread AI reads for \"best agencies for earned media coverage versus paid...\"" | Citation | "\"How-do-PR-agencies-guarantee-media-placements\" on Quora has been cited 9 times in AI answers across google_ai_overviews, and you are not in it. Models already trust this thread; a useful answer there puts you inside the source they quote." |
| 5 | "Join the Tenten thread AI reads for \"best public relations partners for category...\"" | Citation | "\"Top PR agencies\" on Tenten has been cited 22 times in AI answers across perplexity, and you are not in it. Models already trust this thread; a useful answer there puts you inside the source they quote." |
| 6 | "gartner.com is shaping your AI answers: make the profile work for you" | Citation | "AI answers cite gartner.com 19 times for questions like \"compare executive positioning strategies for tech...\" across google_ai_overviews, perplexity. Answer engines lean on review sites for trust signals, which makes your profile there one of your most-read pages." |
| 7 | "G2 is shaping your AI answers: make the profile work for you" | Citation | "AI answers cite G2 4 times for questions like \"best agencies for securing product reviews in tech...\" across perplexity. Answer engines lean on review sites for trust signals, which makes your profile there one of your most-read pages." |
| 8 | "Aggressive Citation Building" | Citation | "For query \"best PR firms for AI startups\": Aggressive Citation Building Visibility is 0.0%." |

No `<a>` elements exist in the `/actions` main region. Navigation is by button + query param.

### 2.5 Tab "Results" (`/actions?view=results`)

Header area gains a "Quarter recap" label and one icon-only button (label NOT OBSERVED).

Table column headers, in order:

| # | Header |
|---|---|
| 1 | WORK |
| 2 | PAGE |
| 3 | BEFORE → AFTER |
| 4 | WINDOW |
| 5 | RESULT |
| 6 | DATE |

One sample row, tagged "EXAMPLE":

| WORK | PAGE | BEFORE → AFTER | WINDOW | RESULT | DATE |
|---|---|---|---|---|---|
| "Rewrite /pricing for AI answers" | – | – | 42d | "Day 11 of 42" | "Aug 7" |

Empty state below the example:
> "No results yet"
> "Work you ship stays here while its window runs. The result lands when it closes."

### 2.6 Drawer: `?actionId=<uuid>`

Opening `/actions?actionId=f5ddba42-fcf0-4699-98bf-3e794355fd4c` renders a right-side drawer.
Container classes:
`pointer-events-auto outline-none fixed inset-y-0 right-0 flex min-h-0 flex-col overflow-hidden border-l border-default bg-surface shadow-overlay sm:rounded-l-md w-full sm:w-[720px] sm:w-[840px] xl:w-[920px]`

Close behaviour: one unlabelled icon button at the end of the drawer button list.
Removing the `actionId` query param closes it. Exact close affordance label NOT OBSERVED.

#### Drawer header

- Meta line: "Technical · MEDIUM · ~45 min"
- Title: "Deploy Service-Specific Schema"
- Stat block: "QUERIES AFFECTED 1 across 3 models"
- Stat block: "FOUND 8 DAYS AGO"
- Why-now copy: "For query \"best public relations agencies for disruptive B2B SaaS startups\": Deploy Service-Specific Schema Visibility is 22.36%."

#### Drawer tabs

Ids follow the pattern `action-<uuid>-pane-tab-<key>`.

| Label | Key | Badge |
|---|---|---|
| "Brief" | brief | none (default selected) |
| "Steps" | steps | "5" |
| "Agent" | agent | none |
| "Activity" | activity | none |

#### Persistent drawer buttons

"Show me how", "Connect your AI assistant to hand this off", "Do this with your AI",
"EVIDENCE & DETAILS" (accordion), and the footer note "Created Jul 29".

#### Section "WHAT TO DO" (visible above the tabs)

Five numbered steps, verbatim:

1. "Check existing schema — Test venturepr.com and your top pages in Google's Rich Results Test to see what structured data you already have. Note which schema types are present and which pages have none. Verify: You know which pages have schema and which types are present."
2. "Add Organization schema — Add Organization JSON-LD to venturepr.com homepage with your company name, URL, logo, and social profiles. This tells AI models the basic facts about your brand." Code block:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Venture PR",
  "url": "https://venturepr.com",
  "logo": "https://venturepr.com/logo.png",
  "description": "One-sentence company description"
}
</script>
```
"Verify: Organization JSON-LD is in your homepage source code."
3. "Add Product/Service schema — Add Product or Service schema to pages relevant to \"best public relations agencies for disru\" with features, pricing, and descriptions. Use Product for physical/digital products, Service for service offerings." Code block:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Venture PR",
  "url": "https://venturepr.com",
  "description": "Product description",
  "brand": { "@type": "Brand", "name": "Venture PR" },
  "offers": { "@type": "Offer", "url": "https://venturepr.com/pricing" }
}
</script>
```
"Verify: Each key page has appropriate Product/Service schema in its source."
4. "Validate all markup — Run each updated page through the Rich Results Test. Every page should pass with zero errors and show the expected schema types. Verify: All tested pages show valid structured data with no errors."
5. "Verify improvement — Re-run diagnosis for \"best public relations agencies for disruptive B2B SaaS startups\" to measure visibility change after adding structured data. Verify: Visibility score has improved for this query."

#### Tab "Brief" (default)

Section "CRAWL IMPACT":
> "Resolve the deploy service-specific schema issue so the affected pages are easier for crawlers and AI systems to parse."
> "Deploy Service-Specific Schema"
> "Issue open"
> "Unknown - no grounded baseline"
> "Fixing the template or metadata blocker improves the machine-readable signals AI crawlers rely on."
> "Next audit cycle after the fix ships"
> "No quantitative forecast is shown because the supplied packet has no grounded causal baseline."

#### Accordion "EVIDENCE & DETAILS"

Expanded content:
> "DIAGNOSIS EVIDENCE"
> "View full diagnosis"
> "“best public relations agencies for disruptive B2B SaaS startups”"
> "VISIBILITY 22.36%"
> "-- -- #7 --"
> "Venture PR maintains a niche presence in AI search, appearing only in ChatGPT results while remaining invisible to other major models and query variations."

#### Tab "Steps"

Progress header: "0/5", "~45 min left".
Steps are grouped under phase labels:

| Phase label | Step # | Title | Time |
|---|---|---|---|
| RESEARCH & PLAN | 1 | "Check existing schema" | 5 min |
| RESEARCH & PLAN | 2 | "Add Organization schema" | 10 min |
| EXECUTE | 3 | "Add Product/Service schema" | 20 min |
| EXECUTE | 4 | "Validate all markup" | 5 min |
| VERIFY | 5 | "Verify improvement" | 5 min |

Step 1 expanded shows its body copy, an external resource chip "Rich Results Test",
and the line "Done when: You know which pages have schema and which types are present."

#### Tab "Agent"

> "Trakkr is the eyes, your AI is the hands. Hand this action to your assistant and it ships the fix in your own stack. Trakkr watches the result and verifies the lift."

Three-step strip: "Diagnose / Trakkr", "Act / Your AI", "Verify / Trakkr".

Callout:
> "Connect your AI first"
> "Wire Claude, Cursor, or ChatGPT to Trakkr. Read-only, about 30 seconds."

Section "WORK ORDER" with a chip "@snapshot" and a copyable prompt:
> "Using my Trakkr MCP, take on this action and ship it in my own stack.
>
> ACTION (Trakkr id: f5ddba42-fcf0-4699-98bf-3e794355fd4c)
> Deploy Service-Specific Schema
> Brand: Venture PR (id: 7d474cd4-0273-480c-8e85-cff6cf434cc8)  ·  Technical
>
> WHY IT MATTERS
> For query "best public relations agencies for disruptive B2B SaaS startups": Deploy Service-Specific Schema Visibility is 22.36%.
>
> STEPS
> 1. Check existing schema
> ... (the five steps repeated with Verify: lines and code blocks)"

#### Tab "Activity"

> "Created"
> "Jul 29, 2026"
> "Add note"

### 2.7 Network API surface for `/actions`

Shell calls (users, brand_members, team_clients, subscription, auth/session,
client/group-brands, pages/config, double/run, mcp-token/sessions, admin-access,
brand-groups) are the same as on `/dashboard`. Page-specific calls:

| Method | Path + query | Note |
|---|---|---|
| GET | API `/actions/preferences?brand_id=<id>` | filter/column preferences |
| GET | API `/actions?brand_id=<id>&status=open&scope=latest&sort_by=priority_score&sort_dir=desc&page=1&per_page=50` | the 8 table rows. Paginated. |
| GET | API `/actions/stats?brand_id=<id>` | the found/planned/measuring/earned chips |
| GET | API `/actions/plan?brand_id=<id>` | "This week" plan, empty here |
| GET | API `/actions/briefing?brand_id=<id>` | intro/briefing copy |
| GET | API `/actions/<actionId>` | drawer payload |
| GET | API `/actions/<actionId>/timeline` | drawer "Activity" tab |
| GET | API `/opportunity-pool?brand_id=<id>&limit=500` | pool feeding the table |
| GET | API `/proof/feed?brand_id=<id>&since=<ISO timestamp>` | Results tab feed |
| GET | API `/citations/<brandId>/gsc` | NOT OBSERVED |
| GET | API `/crawler/page-profile?brand_id=<id>&page_url=<encoded url>&days=14` | CRAWL IMPACT block |
| GET | API `/agent/automations?brand_id=<id>` | NOT OBSERVED |
| GET | API `/agent/needs-you?brand_id=<id>` | NOT OBSERVED |
| GET | SB `/reports?select=id&brand_id=eq.<id>&status=eq.completed` | report gate |

Note: on the query-param form `?actionId=`, the `/actions` list call adds `&scope=latest`.

---

## 3. `/prompts`

- URL: `https://trakkr.ai/prompts`
- Document title: "Prompts"
- H1: "Prompts"
- Meta line: "Updated just now" (relative)
- Intro banner with a "Dismiss" icon button:
  > "Prompts are the questions people ask AI. Track how each model answers them about your brand."

### 3.1 Header action buttons

| Button | aria-label | Behaviour |
|---|---|---|
| "Health" | "Health review, Strong. Open review." | Opens the Set Health drawer |
| "Export" | none | NOT OBSERVED |
| "Add" | "Add prompts" | Opens a dropdown menu |

Dropdown "Add" contents (label + sub-label pairs):

| Label | Sub-label |
|---|---|
| "Add manually" | "Write your own" |
| "Suggest prompts" | "Let AI find your gaps" |
| "Paste a list" | "Add many at once" |

### 3.2 Tabs

| Tab label | Count badge | URL it sets |
|---|---|---|
| "Prompts" | none | `/prompts` |
| "Tags" | 0 | `/prompts?tab=tags` |
| "Audiences" | 4 | `/prompts?tab=personas` |

### 3.3 Tab "Prompts"

#### Status strip

Reads: "Last report 17h ago", then three numbers "2", "0", "20", then the label
"blind spots". The first two numbers have no visible labels in the text layer.
Their meaning is NOT OBSERVED.

#### Toolbar

Buttons in order: "Filter", "Display", "Topics" (with a badge showing "5").
A search input with placeholder "Search prompts…" is present.

#### Panel "Filter" (inline, expands under the toolbar)

```
STATUS
All
Active
Inactive

AI VOLUME
All
10K+
1–10K
<1K

TOPICS
Consumer Tech PR            6
B2B SaaS PR                 4
Boutique and Alternative PR 2
Thought Leadership and Executive PR 5
Brand and Category PR       3
Uncategorized               3

AUDIENCES
Hardware Launch Lead        7
B2B SaaS Growth Marketer    8
Founder Brand Builder       4
Enterprise Tech Evaluator   4
```

#### Panel "Display" (inline)

```
VIEW
Movers        Biggest changes first
Attention     Low scores · losing ground
Blind spots   Where you're invisible
All           Everything, manually sorted
Lost to rival A competitor passed you

GROUP BY
None
Topic
Tag
Audience
Intent

SORT
High → Low
Biggest change
Score
Change
AI volume
Rank
Date added
A → Z

COLUMNS
Tags
Audience
AI volume
7-day trend
Score
Change
Rank
Active
Date added
```

(The "Blind spots" line uses a curly apostrophe: "Where you’re invisible".)

#### Button "Topics" → the Topics view

Clicking "Topics" navigates to `/prompts?view=topics`.

Copy: "Trakkr grouped your prompts into 5 topics. Rename or merge any time."
Buttons: "Undo", "Back to prompts" (returns to `/prompts`).
Range switcher `aria-label="Filter value"` with options "7D", "30D", "90D".

Column headers, in order, each a sort button with `aria-label="Sort by <name>"`:

| # | Header | aria-label |
|---|---|---|
| 1 | TOPIC | "Sort by Topic" |
| 2 | LEADER | NOT OBSERVED |
| 3 | PROMPTS | "Sort by Prompts" |
| 4 | TREND | NOT OBSERVED |
| 5 | SCORE | "Sort by Score" |
| 6 | Δ | NOT OBSERVED |
| 7 | SHARE | "Sort by Share" |

Rows:

| Topic | Prompts | Score | Δ |
|---|---|---|---|
| "Consumer Tech PR" | 5 / 6 | 4 | 0.0 |
| "B2B SaaS PR" | 3 / 4 | 9 | 0.0 |
| "Boutique and Alternative PR" | 2 / 2 | 3 | 0.0 |
| "Thought Leadership and Executive PR" | 5 / 5 | 0 | 0.0 |
| "Brand and Category PR" | 3 / 3 | 0 | 0.0 |
| "Uncategorized" | 3 | - | - |

The "Uncategorized" row carries a button "Sort into topics".
Footer: "Showing 5 of 5 topics", "20 prompts categorized, 3 uncategorized".
Loading state observed in the SHARE column: "Computing competitor shares..."
(this text persisted through the capture window).

#### Main prompts table

Column headers, in order:

| # | Header | Cell contents |
|---|---|---|
| 1 | (drag handle) | grab-cursor icon, `draggable="true"`, `opacity-0` until row hover |
| 2 | (select) | checkbox button `aria-label="Select prompt"`; header has "Select all prompts" |
| 3 | PROMPT | prompt text, one line clamp, with `title` attribute holding the full text; a pencil button `aria-label="Edit prompt"` appears on row hover (`opacity-0 group-hover/prompt:opacity-100`) |
| 4 | TAGS | tag chips, plus a button `title="Add or remove tags"` |
| 5 | AI VOL | volume band, e.g. "50-200", monospace tabular, `cursor-help` |
| 6 | 7D | sparkline icon |
| 7 | SCORE | integer, monospace tabular, `text-primary` |
| 8 | Δ | signed one-decimal, monospace, `text-muted` |
| 9 | ON | toggle, `aria-label="Pause prompt"` |
| 10 | ADDED | date, e.g. "Jul 2" |
| 11 | (row menu) | `aria-label="More actions"` |

Row height is fixed: `h-11 min-h-11 max-h-11`.
Row hover state: `hover:scale-[1.003] hover:-translate-y-[0.5px] hover:shadow-[0_1px_2px_rgba(0,0,0,0.03)]`,
transition 150ms ease-out.

Row click behaviour: the row wraps a link to
`/diagnose?query=<URL-encoded prompt>&autoStart=true&reportId=32c767b1-d51e-4955-80a1-9db96be602fe`.

Sort behaviour: set from the "Display" panel SORT section, not by clicking headers.

Full row data (23 rows):

| Prompt | Tags | AI VOL | SCORE | Δ | ADDED |
|---|---|---|---|---|---|
| "compare leading robotics and AI hardware public relations firms" | 1 | 50-200 | 40 | +4.4 | Jul 2 |
| "best PR agencies for consumer electronics and hardware launches" | 2 | 200-1K | 19 | +2.7 | Jul 2 |
| "top firms for managing CES media relations and strategy" | – | 50-200 | 0 | 0.0 | Jul 2 |
| "best agencies for securing product reviews in tech publications" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "best public relations agencies for disruptive B2B SaaS startups" | – | 200-1K | 22 | 0.0 | Jul 2 |
| "top tech PR firms for high growth software companies" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "compare leading public relations agencies for enterprise technology brands" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "best alternatives to large PR firms for tech founders" | 4 | 50-200 | 0 | 0.0 | Jul 2 |
| "top firms for managing global product launch media campaigns" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "compare leading agencies for trade show and event PR" | – | 50-200 | 0 | 0.0 | Jul 2 |
| "best PR agencies for series B funding announcement strategy" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "best public relations strategies for viral consumer product launches" | – | 1K-5K | 0 | 0.0 | Jul 2 |
| "best agencies for earned media coverage versus paid placements" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "top boutique firms for securing top tier editorial coverage" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "best agencies for executive thought leadership and ghostwriting services" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "top public relations partners for global consumer tech brands" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "best public relations services for building founder brand authority" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "top firms for brand narrative development and competitive messaging" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "top firms for placing op-eds in tier one publications" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "compare executive positioning strategies for tech industry leaders" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "top agencies for securing expert commentary in business media" | – | 50-200 | 0 | 0.0 | Jul 2 |
| "best public relations partners for category creation and storytelling" | – | 200-1K | 0 | 0.0 | Jul 2 |
| "compare strategic PR agencies focused on organic media growth" | – | 50-200 | 0 | 0.0 | Jul 2 |

Below the table: an inline "Add a prompt..." input.
Footer: "Showing 23 of 23 prompts".
Tag nudge block: "Organize your 23 prompts into tags for better insights and filtering."
with a "Suggest tags" button.

#### Row drawer: "Edit prompt"

Clicking the pencil does NOT open a drawer or modal. It converts the PROMPT cell into
an inline text input pre-filled with the prompt text.
Input classes: `w-full bg-white text-[13px] text-primary px-2 py-1 rounded border border-accent outline-none ring-2 ring-accent/20 transition-all`.
Save/cancel affordances are NOT OBSERVED.

#### Row menu: "More actions"

Popover, `min-w-[180px] max-w-[min(320px,calc(100vw-16px))]`. Items and keyboard hints:

| Item | Shortcut |
|---|---|
| "Edit details" | E |
| "Copy prompt text" | – |
| "Duplicate" | D |
| "Ask Agent about this prompt" | – |
| "Diagnose this query" | – |
| "View rank breakdown" | – |
| "Analyze phrasings" | – |
| "Create content" | – |
| "Move to audience" | – |
| "Move to topic" | – |
| "Pause tracking" | ␣ (space) |
| "Archive prompt" | – |

#### Drawer: "Health"

Trigger: the header "Health" button, `aria-label="Health review, Strong. Open review."`.
Contents:

> "SET HEALTH
> 82
> Strong
> Reviewed 27 minutes ago
>
> Your prompt set is solid and on-target; tighten a few duplicates and vary the phrasing to get a fuller picture.
>
> TOP FIX
> Near-duplicate prompts
>
> Several prompts ask essentially the same question, wasting quota and skewing results.
>
> “best PR agencies for consumer electronics and hardware launches”“top public relations partners for global consumer tech brands”“best public relations agencies for disruptive B2B SaaS startups”
> +1 more
> Trim weak prompts        3
> Add suggested prompts    5
> More issues to review    2
> Score breakdown          6
> What's working           4"

Close behaviour: NOT OBSERVED (Escape did not close it during capture).

#### Panel: "Explore prompt ideas"

Trigger button at the bottom of the table: "Explore 10 prompt ideas available".
It expands an inline panel titled "Ideas" with a sub-label "Venture PR".
Each idea row has: the idea text, an intent chip, four "-" metric cells, and the
buttons "Dismiss", "Add prompt", "Select prompt".

| Idea text | Intent chip |
|---|---|
| "I need help with media coverage for events" | Info |
| "top PR firms for B2B SaaS companies" | Comp |
| "recommendations for PR firms in tech" | Info |
| "best PR strategies for tech startups" | Comp |
| "looking for top public relations agencies" | Info |
| "best practices for product launch PR" | Comp |
| "what makes a successful PR campaign" | Disc |
| "media relations vs influencer marketing" | Comp |
| "how to measure PR campaign success" | Disc |
| "where to find PR services for startups" | Buy |

### 3.4 Tab "Tags" (`/prompts?tab=tags`)

Header buttons change to "Export" and "Manage Tags".
Zero state:

> "Organize with tags"
> "Tags are your own labels for prompts: campaigns, funnel stages, product lines. Market categories are already grouped for you in Topics."
> Buttons: "Create tag", "View topics"

### 3.5 Tab "Audiences" (`/prompts?tab=personas`)

Header buttons change to "New audience" and "Simulate".
Summary strip: "10%" / "visibility" / "10pt spread across audiences".
Sub-tabs: "Overview" (default) and "Journey". Both use the same URL
`/prompts?tab=personas`; no extra query param is set.
Range switcher `aria-label="Audience trend range"` with options "7D", "30D", "90D".

#### Sub-tab "Overview"

Insight line:
> "Enterprise Tech Evaluator sees you at 10%, Founder Brand Builder at 0%. One brand-wide number hides a 10pt spread."

Column headers, in order: AUDIENCE, STAGE, PROMPTS, SCORE, 30D, TREND, TOP PROMPT.
Sortable headers observed: "PROMPTS", "SCORE", "TREND".
Each row also carries a priority segmented control with the options
"Low priority", "Medium priority", "High priority".

| Audience | Description | Stage | Prompts | Score | 30D | Top prompt | Top prompt score |
|---|---|---|---|---|---|---|---|
| "Founder Brand Builder" | "Tech founders and executives focused on personal brand authority through op-eds and expert commentary." | Awareness | 4/4 | 0 | 0.0 | "top firms for placing op-eds in tier one publications" | 0 |
| "Hardware Launch Lead" | "Marketing leaders at consumer electronics or hardware startups focused on product launches and trade show PR." | Consideration | 7/7 | 3 | +0.4 | "best PR agencies for consumer electronics and hardware launches" | 19 |
| "B2B SaaS Growth Marketer" | "CMOs and growth leads at B2B SaaS startups seeking PR to support funding announcements and category creation." | Consideration | 8/8 | 3 | 0.0 | "best public relations agencies for disruptive B2B SaaS startups" | 22 |
| "Enterprise Tech Evaluator" | "Marketing directors at established enterprise tech companies comparing PR agencies for global campaigns and analyst relations." | Decision | 4/4 | 10 | +1.1 | "compare leading robotics and AI hardware public relations firms" | 40 |

Footer button: "Discover audiences your market serves that you don't".
Footer text: "Showing 4 audiences · 100% of prompts assigned".

#### Sub-tab "Journey"

Insight line:
> "You build as buyers get closer. You're quieter early (0%) but strongest at the decision stage (10%), right where buyers choose."

Column headers, in order: STAGE, VISIBILITY, TREND, QUESTIONS, WEAKEST HERE.

| Stage | Stage sub-label | Visibility | Trend | Questions | Weakest here | Its score |
|---|---|---|---|---|---|---|
| Awareness | "just learning the space" | 0 | 0.0 | 4 | "Founder Brand Builder" | 0 |
| Consideration | "weighing the options" | 3 | +0.2 | 15 | "Hardware Launch Lead" | 3 |
| Decision | "close to choosing" | 10 | +1.1 | 4 | "Enterprise Tech Evaluator" | 10 |

Same footer as Overview.

### 3.6 Link graph for `/prompts`

The only `<a>` elements in the Prompts tab are the 22 row links of the form:

`/diagnose?query=<URL-encoded prompt text>&autoStart=true&reportId=32c767b1-d51e-4955-80a1-9db96be602fe`

Observed queries (URL-decoded): "best PR agencies for consumer electronics and hardware launches",
"top firms for managing CES media relations and strategy",
"best agencies for securing product reviews in tech publications",
"best public relations agencies for disruptive B2B SaaS startups",
"top tech PR firms for high growth software companies",
"compare leading public relations agencies for enterprise technology brands",
"best alternatives to large PR firms for tech founders",
"top firms for managing global product launch media campaigns",
"compare leading agencies for trade show and event PR",
"best PR agencies for series B funding announcement strategy",
"best public relations strategies for viral consumer product launches",
"best agencies for earned media coverage versus paid placements",
"top boutique firms for securing top tier editorial coverage",
"best agencies for executive thought leadership and ghostwriting services",
"top public relations partners for global consumer tech brands",
"best public relations services for building founder brand authority",
"top firms for brand narrative development and competitive messaging",
"top firms for placing op-eds in tier one publications",
"compare executive positioning strategies for tech industry leaders",
"top agencies for securing expert commentary in business media",
"best public relations partners for category creation and storytelling",
"compare strategic PR agencies focused on organic media growth".

Everything else on the page is a button, not a link.

### 3.7 Network API surface for `/prompts`

Shell calls as on `/dashboard`. Page-specific:

| Method | Path + query | Note |
|---|---|---|
| GET | API `/prompts/<brandId>/health` | Health drawer payload (score 82, "Strong", top fix) |
| GET | API `/prompts/<brandId>/overtakes` | "Lost to rival" view data |
| GET | API `/prompts/variant-analysis?brand_id=<id>` | "Analyze phrasings" data |
| GET | API `/brands/<brandId>/personas?range=30d` | Audiences tab. Range param matches the 7D/30D/90D switcher. |
| GET | API `/brands/<brandId>/topics` | Topics view |
| GET | API `/volume/brand/<brandId>?calculate_missing=true` | AI VOL column (note: `true` here, `false` on /dashboard) |
| GET | API `/gsc/status?brand_id=<id>` | NOT OBSERVED |
| GET | API `/suggestions/brand/<brandId>` | "Ideas" panel rows |
| GET | API `/integrations/openai-ads?brand_id=<id>` | NOT OBSERVED |
| GET | API `/diagnose/history?brand_id=<id>&limit=100` | drives the per-row diagnose links |
| GET | SB `/prompts?select=id,brand_id,text,active,focus_area,intent,audience,specificity,quality_score,source,created_at,updated_at,priority_score,search_volume,...` | the 23 rows |
| GET | SB `/tags?select=id,brand_id,name,colour,created_by,created_at,updated_at&brand_id=eq.<id>` | Tags tab |
| GET | SB `/tags?...&order=name.asc` | tag picker |
| GET | SB `/prompt_tags?select=prompt_id,tag_id&prompt_id=in.(<uuid list>)` | TAGS column |
| GET | SB `/reports?select=created_at&brand_id=eq.<id>&status=eq.completed&order=created_at.desc&limit=1` | "Last report 17h ago" |
| GET | SB `/reports?select=id,created_at,prompt_scores_data&brand_id=eq.<id>&status=eq.completed&created_at=gte.<ISO>&order=created_at.desc` | SCORE, Δ and 7D sparkline |
| GET | SB `/reports?select=id&brand_id=eq.<id>&status=eq.completed` | gate |
| POST | API `/api/activation/track` | analytics |

---

## 4. `/research`

- URL: `https://trakkr.ai/research`
- Document title: "Research"
- H1: "Research"
- Subtitle: "Discover prompts for Venture PR."
- Header action buttons: none.

### 4.1 Pre-run state (the only state observed)

- H2: "Discover your market position"
- Copy: "We'll analyze ~500 prompts in your industry to find where Venture PR appears in AI recommendations."
- Primary button: "Run Research" (NOT clicked - it consumes credits)
- Under the button: "Takes about 5 minutes"

Section heading: "WHAT YOU'LL DISCOVER". Four items, label + description:

| Label | Description |
|---|---|
| "Visibility Score" | "Your overall AI presence across all prompts" |
| "Winning Prompts" | "Where you rank in the top 3 positions" |
| "Opportunities" | "Prompts where competitors rank but you don't" |
| "Competitive Intel" | "Which brands appear most in your space" |

### 4.2 Controls

There are no form inputs, selects, tabs, filters, date pickers or links in the main
region. The only interactive control is the "Run Research" button.
Post-run UI, progress state, loading skeleton and error state: NOT OBSERVED
(the run was deliberately not started).

### 4.3 Network API surface for `/research`

Shell calls as on `/dashboard`. Page-specific:

| Method | Path + query | Note |
|---|---|---|
| GET | API `/snapshots/credits/<brandId>` | credit balance for the run |
| GET | SB `/prompt_reports?select=*&brand_id=eq.<id>&ready=eq.true&or=(report_type.is.null,report_type.eq.full_re...)` | prior full research reports |
| GET | SB `/prompt_reports?select=*&brand_id=eq.<id>&report_type=eq.topic_snapshot&order=created_at.desc` | topic snapshots |
| GET | SB `/prompts?select=id,text,active&brand_id=eq.<id>` | existing prompt set |
| GET | SB `/reports?select=id&brand_id=eq.<id>&status=eq.completed` | gate |
| GET | API `/agent/automations?brand_id=<id>` | NOT OBSERVED |
| GET | API `/agent/needs-you?brand_id=<id>` | NOT OBSERVED |

---

## 5. `/diagnose` (list)

- URL: `https://trakkr.ai/diagnose`
- Document title: "Diagnose"
- H1: "Diagnose"
- Subtitle: "Why you aren't ranking, and how to fix it."
- Header action buttons: none.

### 5.1 Run form

- Text input, placeholder: "best pr for startups at ces"
- Submit button: "Diagnose"
- Quota chip next to the button: "0/10"

### 5.2 Section "LOW VISIBILITY QUERIES"

Two suggestion buttons. Each shows a query and its score.

| Query | Score |
|---|---|
| "best PR firms for AI startups" | 0 |
| "best public relations agencies for disruptive B2B SaaS startups" | 22 |

### 5.3 Section "RECENT DIAGNOSES"

- H3: "RECENT DIAGNOSES"
- Count chip: "2 / " (the value after the slash was not rendered as text)
- Search input, placeholder: "Search queries…"

Filters (both are dropdown buttons):

| Filter | Trigger text | Options, verbatim |
|---|---|---|
| Status | "Status: All" | "All", "Ranking", "Not ranking" |
| Trend | "Trend: All" | "All", "Improving", "Declining", "Flat", "First run" |

Table column headers, in order, each a button: QUERY, SCORE, POS, CHANGE, DATE.
Sort behaviour: headers are buttons, so sorting is presumed. The applied sort and its
indicator are NOT OBSERVED.

Rows (each row is a link):

| QUERY | SCORE | POS | CHANGE | DATE | href |
|---|---|---|---|---|---|
| "best public relations agencies for disruptive B2B SaaS startups" | 22 | 7 | (blank) | "8 days" | `/diagnose?id=750fe39a-e957-4f78-b2e9-fd857ae112b0` |
| "best PR firms for AI startups" | 0 | - | (blank) | "9 days" | `/diagnose?id=f04f9b6d-69ce-47aa-be43-3a263ea687bb` |

Footer: "Showing 2 of 2 diagnoses".

---

## 6. `/diagnose?id=750fe39a-e957-4f78-b2e9-fd857ae112b0` (report)

The report replaces the list view at the same route. Full structure in DOM order.

### 6.1 Report header

- Eyebrow: "QUERY"
- H1: "“best public relations agencies for disruptive B2B SaaS startups”" (curly quotes are part of the rendered text)
- Buttons: "Track query", "Re-run" (NOT clicked - "Re-run" spends credits)
- Verdict line:
  > "On the board, but trailing the leaders. Best showing is ChatGPT at #7; missing from Claude, Gemini and Perplexity."
- Stat row: "22.4 VIS · #7 BEST · 4/4 ANSWERED · updated 8 days ago"
- Confidence chip: "67% confidence"
- Two toggle buttons: "Sources 6" and "Methodology"
- Trend line: "First run. Fix something below, re-run, and this line will track the move."

### 6.2 Panel "Sources" (toggle, expands inline under the header)

Heading: "REFERENCES". Six numbered references.

| # | Label | Link target |
|---|---|---|
| 1 | "Visibility Report: B2B SaaS PR" | `/dashboard?prompt=best+public+relations+agencies+for+disruptive+B2B+SaaS+startups&range=12w` |
| 2 | "Model Rankings Detail" | `#model-chatgpt` (in-page anchor) |
| 3 | "Page Analysis: Venture PR Blog" | `/optimize?q=best+public+relations+agencies+for+disruptive+B2B+SaaS+startups` |
| 4 | "Variant Fanout Analysis" | `#variants` (in-page anchor) |
| 5 | "Citation Evidence (Missing)" | none - rendered with the suffix "no link" |
| 6 | "Brand Perception Profile" | `/perception?date=2026-07-28` |

### 6.3 Panel "Methodology" (toggle, expands inline)

```
SCORE METHODOLOGY

Visibility
From reports.prompt_scores_data
22.4

14-day delta
vs the report 14 days prior
0.0

Best position
Across all models
#7
```

Then, verbatim:
> "Venture PR is trailing the leaders, currently occupying a fragile position that lacks cross-model consensus."
>
> "Diagnose adds qualitative analysis on top of the visibility score but does not modify it, same number the dashboard and Prompts page show."

### 6.4 Summary section

H2:
> "Venture PR maintains a niche presence in AI search, appearing only in ChatGPT results while remaining invisible to other major models and query variations."

Body paragraph, with inline citation markers rendered as superscript numbers:
> "The brand's visibility is currently anchored by a single mention in ChatGPT [1][2]. While AI models perceive Venture PR as an agile, tech-specialized boutique [6], this reputation has not translated into broad visibility across the model landscape. The primary blockers are a significant misalignment in site content—where analyzed pages focus on consumer apps and e-commerce rather than B2B SaaS [3]—and a total absence from the variant fanout, indicating the brand is not yet associated with the core query's semantic neighbors [4]. Competitors like LaunchSquad and Walker Sands dominate by demonstrating the 'unicorn' track record that models like Gemini and Claude prioritize [2]."

Citation markers in this paragraph, in order: 1, 2, 6, 3, 4, 2.
Each marker is an anchor using the same hrefs as the References table above.

### 6.5 Section "What connects the dots"

- H2: "What connects the dots"
- Sub-label: "Signals that only mean something together"
- Three bullets, each prefixed with the glyph "▸":

1. "A disconnect exists between model perception and site content: Gemini perceives the brand as tech-specialized [6], yet site analysis shows content scores of zero for the target B2B SaaS query [3]."
2. "The combination of zero visibility in variant fanout [4] and a total lack of citations [5] indicates that models do not yet view the brand as a category authority, despite positive boutique sentiment [6]."
3. "ChatGPT is the only model currently rewarding the brand's 'startup-stage fit' [2], while other models prioritize 'unicorn' track records which the brand's current content fails to highlight [3]."

Markers in this section, in order: 6, 3, 4, 5, 6, 2, 3. Marker 5 has no link.

### 6.6 Section "Three signals to watch"

- H2: "Three signals to watch"
- Sub-label: "PHRASING · TRAJECTORY · PERCEPTION"

**Card 1 - PHRASING**
> Title: "Total invisibility across semantic variants"
> Meta: "worst: top PR firms specializing in innovative B2B SaaS startups", "0.0× swing"
> Body: "The brand fails to appear in any related search phrasing, indicating a lack of category association in the model's latent space [4]."
> Link: "See competitive landscape" → `#landscape`

**Card 2 - TRAJECTORY**
> Title: "Stable"
> Body: "Visibility has remained flat at 22.36 over the last 14 days, with no new model mentions or rank changes recorded [1]."

**Card 3 - PERCEPTION**
> Title: "Boutique Agility vs. Enterprise Scale"
> Body: "Models recognize the brand's specialized tech focus and responsiveness but note a lack of scale and independent reputation data compared to global firms [6]."
> Link: "See gaps it explains" → `#gaps`

### 6.7 Section "Competitive landscape" (anchor `#landscape`)

- H2: "Competitive landscape"
- Count chip: "15"
- Agreement chip: "100% model agreement"

Column headers, in order: BRAND, ChatGPT, Claude, Gemini, Perplexity, SCORE.
Cells hold either a rank ("#1") or "-".
The user's own row is marked with the badge "YOU" and is not a link.
Every competitor row links to `/competitors/<slug>?q=best%20public%20relations%20agencies%20for%20disruptive%20B2B%20SaaS%20startups`.

| BRAND | ChatGPT | Claude | Gemini | Perplexity | SCORE | href slug |
|---|---|---|---|---|---|---|
| Venture (YOU) | #7 | - | - | - | 22 | (no link) |
| Top | #1 | #1 | #1 | #1 | 100 | `top` |
| Finn | - | #2 | - | - | 90 | `finn` |
| Highwire ("2 variants") | #5 | - | #2 | #4 | 90 | `highwire` |
| Blastmedia | #4 | - | - | #2 | 80 | `blastmedia` |
| Edelman | - | #3 | - | - | 80 | `edelman` |
| Walker | #3 | - | #4 | #3 | 77 | `walker` |
| Hotwire | - | #4 | - | - | 70 | `hotwire` |
| Crackle | #2 | - | - | #7 | 65 | `crackle` |
| Golin | - | #5 | - | - | 60 | `golin` |
| Hoffman | - | - | #5 | - | 60 | `hoffman` |
| Allison+partners | - | #6 | - | - | 50 | `allison%2Bpartners` |
| PAN | - | - | #6 | - | 50 | `pan` |
| Bospar | #6 | #8 | - | #5 | 47 | `bospar` |
| Inkhouse | #7 | - | - | #6 | 45 | `inkhouse` |

Brands without a logo render a single-letter avatar (observed for T-Top, C-Crackle,
A-Allison+partners, P-PAN).

### 6.8 Section "Gaps" (anchor `#gaps`)

- H2: "Gaps"
- Count: "3"
- Severity chips: "1 Critical", "1 Significant", "1 Moderate"

Three gap cards. Each card is collapsible. Each expanded card has the same four blocks:
"YOU", "LEADERS", "RECOMMENDED ACTION", and a "First step" line, then a repeat of the
category+window meta and an "In Actions" badge.

**Gap 1 - CRITICAL**
> Title: "Content Relevance"
> Summary: "Existing high-relevance pages are indexed with a focus on consumer and e-commerce niches rather than B2B SaaS."
> Meta: "Content · 30 days"
> YOU: "Your top-ranked pages focus on consumer app launches and e-commerce PR [3]."
> LEADERS: "Leaders like BLASTmedia and Walker Sands provide deep B2B SaaS-specific evidence, including funding news and analyst relations [2]."
> RECOMMENDED ACTION: "Develop a dedicated B2B SaaS PR pillar page with case studies focused on disruptive software startups."
> "First step · Audit existing 'startup-pr-strategies' page to pivot content toward B2B SaaS technical buyers."
> Badge: "In Actions"

**Gap 2 - SIGNIFICANT**
> Title: "Model Consensus"
> Summary: "The brand is entirely absent from Claude, Gemini, and Perplexity results for this query."
> Meta: "Dev · 14 days"
> YOU: "Ranked only in ChatGPT [2]."
> LEADERS: "Highwire and Bospar appear across 3 or more models [2]."
> RECOMMENDED ACTION: "Implement technical optimizations to ensure AI crawlers can clearly associate the brand with B2B SaaS keywords."
> "First step · Add Organization and Service schema markup to the homepage explicitly defining B2B SaaS PR expertise."
> Badge: "In Actions"

**Gap 3 - MODERATE**
> Title: "Semantic Fragility"
> Summary: "The brand disappears when the query is modified, suggesting a lack of category-level authority."
> Meta: "Partnerships · 60 days"
> YOU: "Zero appearances across five query variants [4]."
> LEADERS: "LaunchSquad leads in 3 out of 5 variants [4]."
> RECOMMENDED ACTION: "Secure mentions in third-party 'best of' lists and industry publications to build citation authority."
> "First step · Identify the top 5 industry lists currently cited by Gemini and Perplexity for B2B SaaS PR."
> Badge: NOT OBSERVED for this card

### 6.9 Complete link graph for the report

| Anchor text | href | Where it sits |
|---|---|---|
| "1" / "Visibility Report: B2B SaaS PR" | `/dashboard?prompt=best+public+relations+agencies+for+disruptive+B2B+SaaS+startups&range=12w` | summary paragraph, TRAJECTORY card, references |
| "2" / "Model Rankings Detail" | `#model-chatgpt` | summary, connects-the-dots, gap 1, gap 2, references |
| "3" / "Page Analysis: Venture PR Blog" | `/optimize?q=best+public+relations+agencies+for+disruptive+B2B+SaaS+startups` | summary, connects-the-dots, gap 1, references |
| "4" / "Variant Fanout Analysis" | `#variants` | summary, connects-the-dots, PHRASING card, gap 3, references |
| "5" / "Citation Evidence (Missing)" | none ("no link") | connects-the-dots, references |
| "6" / "Brand Perception Profile" | `/perception?date=2026-07-28` | summary, connects-the-dots, PERCEPTION card, references |
| "See competitive landscape" | `#landscape` | PHRASING card |
| "See gaps it explains" | `#gaps` | PERCEPTION card |
| Competitor rows (14) | `/competitors/<slug>?q=<encoded query>` | competitive landscape table |

Note: the anchors `#model-chatgpt` and `#variants` point to in-page targets. Those two
target sections were not rendered as visible text blocks during capture, so their
content is NOT OBSERVED.

### 6.10 Network API surface for `/diagnose`

Shell calls as on `/dashboard`. Page-specific:

| Method | Path + query | Note |
|---|---|---|
| GET | API `/diagnose/placeholders/<brandId>` | the input placeholder "best pr for startups at ces" and the LOW VISIBILITY QUERIES chips |
| GET | API `/diagnose/history?brand_id=<id>&limit=100` | RECENT DIAGNOSES table rows |
| GET | API `/diagnose/<reportId>` | the full report payload |
| GET | API `/diagnose/timeline?brand_id=<id>&query=<url-encoded query>&current_id=<reportId>` | the trend line under the header |
| GET | API `/agent/automations?brand_id=<id>` | NOT OBSERVED |
| GET | API `/agent/needs-you?brand_id=<id>` | NOT OBSERVED |

---

## 7. Items explicitly NOT OBSERVED

- Screenshots and exact colour values on every page (no compositing available).
- Tooltip bodies for five of the six dashboard KPI help buttons.
- Chart tooltip contents and chart colours on `/dashboard`.
- Behaviour of "Share", "Export", "Reports" on `/dashboard`.
- Behaviour of "New action" on `/actions`.
- Label of the icon-only button next to "Quarter recap" on `/actions?view=results`.
- The close affordance label of the action drawer.
- Save and cancel controls for the inline prompt edit.
- Close behaviour of the Prompts "Health" drawer.
- Any post-run state of `/research`.
- Sort indicators and active sort on the `/diagnose` list table.
- Content of the `#model-chatgpt` and `#variants` in-page anchor targets.
- Loading skeletons and error states. The only loading text seen was
  "Computing competitor shares..." in the Topics view.
- Response bodies of the API calls. `read_network_requests` recorded only same-origin
  asset requests; the API calls were recovered from the Performance Resource Timing API,
  which exposes URLs but not payloads.
