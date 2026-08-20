# Trakkr.ai replication spec - Reports, Explore, Activity, Agent, Agency, Settings, Upgrade, Inbox, Client

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

Observation date: 2026-08-07. Logged-in user. Active brand: "Example Brand".
All content below is observed. Where an item was not observed, the text says "NOT OBSERVED".

## Common shell (all pages in this slice)

- Left sidebar, collapsible. Toggle button label: "Open navigation".
- Brand chip button at sidebar top: "Example Brand".
- Command button: "Ask" with shortcut hint "⌘K".
- Settings button label: "Open Settings".
- Sidebar links (anchor text -> href):
  - Dashboard -> /dashboard
  - Actions -> /actions
  - Prompts -> /prompts
  - Research -> /research
  - Diagnose -> /diagnose
  - Pages -> /pages
  - Citations -> /citations
  - Competitors -> /competitors
  - Perception -> /perception
  - Visitors -> /traffic/analytics
  - Crawlers -> /traffic/crawler
  - Content -> /create
  - Site Optimization -> /optimize
  - AI Pages -> /ai-pages
  - Reddit -> /reddit
  - Automations -> /automations
  - Integrations -> /integrate
  - Settings -> /settings
  - (icon only, no anchor text) -> /learn
- Sidebar section header buttons: "Prompts", "Visibility", "Traffic", "Growth".
- Sidebar footer button: "Connect your AI".
- Intercom launcher button: "Open Intercom Messenger".

### Backend hosts

- App API: `https://api.trakkr.ai`
- Database REST: `https://example-project-ref.supabase.co/rest/v1`
- Analytics ingest: `https://trakkr.ai/ingest/capture/`, `https://e.trakkr.ai/flags/`, `https://e.trakkr.ai/i/v0/e/`
- Error capture: Sentry `example-sentry-org.ingest.de.sentry.io`
- Ad pixels: Google Ads (AW-EXAMPLE), DoubleClick, LinkedIn (pid 9127442)

### Calls made on every page load (shell)

```
GET  supabase /rest/v1/users?id=eq.<userId>&select=id,email,name,plan,plan_cycle,stripe_customer_id,
     subscription_id,subscription_status,subscription_checked_at,brand_limit,flags,extra_features,
     extra_brands,extra_prompts,in_grace_period,grace_period_ends_at,signup_method,signup_source,
     bubble_id,has_seen_v2_welcome,team_id,team_role,is_client,has_restricted_brand_access,is_agency,
     agency_name,timezone,date_format,two_factor_enabled,two_factor_enabled_at,weekly_report_enabled,
     weekly_report_sent_at,weekly_report_unsubscribed_at,pitch_open_emails_enabled,discount_coupon_code,
     discount_coupon_sent_at,discount_coupon_redeemed_at,referral_sidebar_enabled,trial_started_at,
     trial_ends_at,has_used_growth_trial,trial_converted_at,first_paid_at,cancel_at_period_end,
     subscription_paused_at,subscription_resumes_at,pause_reason,onboarding_checklist,created_at,updated_at
GET  api /internal/platform-stats
GET  api /subscription/effective
POST api /analytics/identify
GET  api /auth/session
POST supabase /rest/v1/rpc/get_pending_team_invite_for_current_user
GET  api /pages/config?brand_id=<brandId>
GET  api /double/run/<brandId>
GET  api /users/me/mcp-token/sessions
GET  api /users/admin-access
GET  api /subscription/downgrade-changes
GET  supabase /rest/v1/brand_members?user_id=eq.<userId>&select=role,brand_id,brands(*,brand_groups(id,name,color,position))
GET  supabase /rest/v1/team_clients?user_id=eq.<userId>&status=eq.active&select=brand_id,can_export,brands(*)
GET  api /client/group-brands
GET  api /subscription/sync?force=false
GET  api /agent/automations?brand_id=<brandId>
GET  api /agent/needs-you?brand_id=<brandId>
```

---

## 1. /reports

- URL: `https://trakkr.ai/reports`
- Document title: `Reports`
- H1: `Reports`
- Description line: `Your visibility runs over time.`
- Freshness line in header: `Updated ~18h ago`

### Header action controls (left to right)

1. Date-range button. Current label: `Last 30 days · Daily`.
2. Button `Compare`.
3. Button `Export`.

### Date-range popover

Opened by the date-range button. Sections and controls:

- Section title `QUICK RANGE`, group label `Quick date range`. Radio buttons: `7D`, `14D`, `30D`, `All`.
- Section title `CUSTOM`. Two date inputs, labels `Start` and `End` (`<input type="date">`).
- Computed line under the custom inputs: `31 days`.
- Section title `GROUP BY`, group label `Date grouping`. Options: `Daily`, `Weekly`, `Monthly`.
- Button `Apply`.

### Export menu

Two items, each with a title and a helper line:

- `Export as CSV` - helper `Spreadsheet format`
- `Export as JSON` - helper `Full data with details`

### Tabs

Two tabs: `Timeline` and `Monthly`. `Timeline` is the default.

### Filter chips (below the tabs)

- `All` with count `28`
- `Completed` with count `28`
- Static stat `Success 100%`
- Search box, placeholder `Search reports...`, accessible name `Search reports`.

### Timeline tab body

Period caption: `Jul 2 - Aug 6 · 28 reports`.

KPI cards (label, value, delta, delta caption):

| Label      | Value    | Delta  | Caption              |
| ---------- | -------- | ------ | -------------------- |
| VISIBILITY | 3.7      | -1.2   | vs prev 30d          |
| PRESENCE   | 1%       | +0.3%  | vs prev 30d          |
| AVG RANK   | #5.1     | -0.4   | vs prev 30d          |
| TREND      | Volatile | (none) | 28 reports in period |

Note: the KPI values changed to 3.9 / 1% / #5.4 after a tab switch. The values are data, not fixed copy.

Chart card:

- Title `Visibility over time`
- Badges `+4.0 pts` and `28 points`
- X axis ticks: Jul 9, Jul 12, Jul 16, Jul 20, Jul 24, Jul 29, Aug 2, Aug 6
- Y axis ticks: 0, 4, 8, 12, 15

`WHAT CHANGED` panel. Two groups with counts:

- `IMPROVING (3)` - each row: prompt text, previous value, new value, delta.
  - `compare leading robotics and AI hardware public relations firms` 0.0 -> 39.6 (+39.6)
  - `best public relations agencies for disruptive B2B SaaS startups` 0.0 -> 22.4 (+22.4)
  - `best PR agencies for consumer electronics and hardware launches` 0.0 -> 19.4 (+19.4)
- `DECLINING (1)`
  - `best alternatives to large PR firms for tech founders` 28.9 -> 0.0 (-28.9)

Report table. Column headers are buttons (sortable): `DATE`, `STATUS`, `VISIBILITY`, `PRESENCE`, `RANK`, plus a non-sortable `LLMS` column. `WHAT CHANGED` is also rendered as a button header for the panel above.

Row anatomy: date and time (mono font, e.g. `Aug 6, 9:21 AM`), status badge (`Completed`), visibility (`10.1`), presence (`2%`), rank (`#6.5`), llms count (`8`). Row markup is a `div` with class `flex items-center px-6 h-11 border-b cursor-pointer`. Rows are not `<tr>` elements.

Observed rows (28):

```
Aug 6, 9:21 AM   Completed 10.1 2% #6.5  8
Aug 5, 9:22 AM   Completed  9.3 2% #7.0  8
Aug 4, 11:26 AM  Completed  9.3 2% #7.0  8
Aug 3, 9:21 AM   Completed  8.7 2% #7.5  8
Aug 2, 9:21 AM   Completed  8.7 2% #7.5  8
Aug 1, 9:22 AM   Completed  8.7 2% #7.5  8
Jul 31, 9:22 AM  Completed  8.7 2% #7.5  8
Jul 30, 9:21 AM  Completed  8.7 2% #7.5  8
Jul 29, 9:22 AM  Completed  8.8 2% #7.5  8
Jul 27, 9:46 AM  Completed  0.0 0% #0.0  8
Jul 26, 11:20 AM Completed  0.0 0% #0.0  8
Jul 25, 11:20 AM Completed  0.0 0% #0.0  8
Jul 24, 11:20 AM Completed  2.7 1% #10.0 8
Jul 23, 11:21 AM Completed  2.7 1% #10.0 8
Jul 22, 11:21 AM Completed  2.7 1% #10.0 8
Jul 21, 11:21 AM Completed  2.7 1% #10.0 8
Jul 20, 9:48 AM  Completed  2.7 1% #10.0 8
Jul 19, 11:22 AM Completed  2.7 1% #10.0 8
Jul 18, 11:22 AM Completed  2.7 1% #10.0 8
Jul 17, 11:22 AM Completed  2.7 1% #10.0 8
Jul 16, 11:22 AM Completed  0.0 0% #0.0  8
Jul 15, 11:22 AM Completed  0.0 0% #0.0  8
Jul 14, 11:22 AM Completed  0.0 0% #0.0  8
Jul 13, 9:49 AM  Completed  0.0 0% #0.0  8
Jul 12, 11:22 AM Completed  0.0 0% #0.0  8
Jul 11, 11:22 AM Completed  0.0 0% #0.0  8
Jul 10, 11:22 AM Completed  0.0 0% #0.0  8
Jul 9, 11:22 AM  Completed  6.0 1% #6.0  8
```

### Compare mode

The `Compare` button replaces the header controls. The header then shows `Exit Compare` and `Export` only. The date-range button is hidden.

Layout:

- Left block label `BASELINE`, value `Jul 24 - Jul 31`.
- Separator `vs`.
- Right block label `COMPARISON`, value `Jul 31 - Aug 7`.
- Chart card title `Visibility trend`, subtitle `Comparing visibility scores across both periods`.
- Legend: `Baseline`, `Comparison`. X axis: `Day 1` .. `Day 7`.
- KPI rows: label, baseline value, comparison value, delta:
  - `VISIBILITY` 4.1 -> 9.1, `+5.0 (+122%)`
  - `PRESENCE` 1.0% -> 2.2%, `+1.2 (+120%)`
  - `AVG RANK` #4.6 -> #7.2, `+2.6`
- `DRIVERS (2)`
  - `best PR agencies for consumer electronics and hardware launches` 11.2 -> 19.4 (+8.2)
  - `compare leading robotics and AI hardware public relations firms` 33.5 -> 39.6 (+6.1)
- `DROPS (0)` with empty-state copy: `No declines detected`
- Footer caption: `Comparing 7 baseline reports with 7 comparison reports`
- API call on entering compare mode: `POST api /reports/compare`.

### Monthly tab

Keeps the same KPI row, chart and filter chips. Body is a list of month cards:

- `August 2026` - sub-line `6/31 days tracked`
  - `VISIBILITY` 9.1, delta `+6.7`
  - `PRESENCE` 2%, delta `+1.6`
  - `AVG RANK` #7.2, delta `-2.3`
- `July 2026` - sub-line `22/31 days tracked`
  - `VISIBILITY` 2.4 (no delta)
  - `PRESENCE` 1% (no delta)
  - `AVG RANK` #4.9 (no delta)

### /reports network calls (page specific)

```
GET supabase /rest/v1/reports?select=id,brand_id,visibility,presence,average_rank,mentions,
    models_mentioned,status,model_scores_data,prompt_scores_data,created_at,updated_at
    &brand_id=eq.<brandId>&order=created_at.desc&limit=200
GET supabase /rest/v1/reports?select=id&brand_id=eq.<brandId>&status=eq.completed
POST api /reports/compare              (compare mode only)
GET  api /brands/<brandId>/aliases
```

---

## 2. /reports/:id - report detail

Reached by a click on a table row.

- URL example: `https://trakkr.ai/reports/32c767b1-d51e-4955-80a1-9db96be602fe`
- Document title: `Report · Aug 6, 2026`
- Breadcrumb link: `Reports` -> `/reports`
- Pager caption: `1 of 35`
- H1: `August 6, 2026`
- Meta row: `August 6, 2026`, status badge `Completed`, `9:21 AM`, `8 models`, `23 prompts`

Hero metrics:

- `VISIBILITY` `10.1` with suffix `/100` and delta `+0.7`
- `Presence` `2%`
- `Avg rank` `#6.5` delta `+0.5`
- `Mentions` `4`
- `Queries` `184`
- Caption `Last 30 reports` (sparkline label)

View switch buttons: `By model`, `By prompt`, `Matrix`.

### By model table

Columns: `MODEL`, `RANK`, `Δ`, `VISIBILITY`, `PRESENCE`. `RANK`, `VISIBILITY`, `PRESENCE` are sort buttons.

```
Perplexity   #4.5  +1.9  23.8  9%
ChatGPT      #8.5        14.7  9%
Claude       –           0.0   0%
Gemini       –           0.0   0%
Grok         –           0.0   0%
DeepSeek     –           0.0   0%
Meta AI      –           0.0   0%
AI Overviews –           0.0   0%
```

### By prompt table

Columns: `PROMPT`, `VISIBILITY`, `PRESENCE`, `AVG RANK`. Empty rank shows `–`.

```
compare leading robotics and AI hardware public relations firms          39.6 25% #5.5
best public relations agencies for disruptive B2B SaaS startups          22.4 13% #7.0
best PR agencies for consumer electronics and hardware launches          19.4 13% #8.0
best public relations partners for category creation and storytelling     0.0  0%  –
top public relations partners for global consumer tech brands             0.0  0%  –
best agencies for executive thought leadership and ghostwriting services  0.0  0%  –
best alternatives to large PR firms for tech founders                     0.0  0%  –
top agencies for securing expert commentary in business media             0.0  0%  –
best agencies for securing product reviews in tech publications           0.0  0%  –
top firms for placing op-eds in tier one publications                     0.0  0%  –
compare leading public relations agencies for enterprise technology brands 0.0 0%  –
best public relations strategies for viral consumer product launches      0.0  0%  –
compare strategic PR agencies focused on organic media growth             0.0  0%  –
top tech PR firms for high growth software companies                      0.0  0%  –
best PR agencies for series B funding announcement strategy               0.0  0%  –
top boutique firms for securing top tier editorial coverage               0.0  0%  –
top firms for managing global product launch media campaigns              0.0  0%  –
compare leading agencies for trade show and event PR                      0.0  0%  –
best public relations services for building founder brand authority       0.0  0%  –
best agencies for earned media coverage versus paid placements            0.0  0%  –
top firms for brand narrative development and competitive messaging       0.0  0%  –
compare executive positioning strategies for tech industry leaders        0.0  0%  –
top firms for managing CES media relations and strategy                   0.0  0%  –
```

### Matrix view

- Sort chips: `A-Z`, `Best rank`.
- Caption: `23 prompts × 8 models`.
- Column headers: `PROMPT`, `CHATGPT`, `CLAUDE`, `GEMINI`, `PERPLEXITY`, `DEEPSEEK`, `GROK`, `META AI`, `AI OVERVIEWS`, `AVG`, `RATE`.
- Cell values are `#<rank>` or `–`. Example rows:
  - `best PR agencies for consumer electronics and hardware launches` - Perplexity `#8`, all others `–`, AVG `#8.0`, RATE `13%`
  - `best public relations agencies for disruptive B2B SaaS startups` - ChatGPT `#7`, AVG `#7.0`, RATE `13%`
  - `compare leading robotics and AI hardware public relations firms` - ChatGPT `#10`, Perplexity `#1`, AVG `#5.5`, RATE `25%`
  - All other 20 prompts: every model `–`, AVG `–`, RATE `0%`

### Right rail

`DETAILS` panel (label / value):

- `Status` - `Completed`
- `Run at` - `Aug 6, 2026 · 9:21 AM`
- `Models` - `8`
- `Prompts` - `23`
- `Queries` - `184`
- `Report ID` - `32c767b1` (button, likely copy-to-clipboard)

`VS PREVIOUS REPORT` panel:

- Link `Aug 5 · 9:22 AM` -> `/reports/9aafa4cb-e7cf-424c-a404-7195a24987c3`
- Line `Visibility 9.3→10.1`

`TOP MOVERS` panel (links to prompt detail):

- `best PR agencies for consumer electronics and hardware launches` `+8.2` -> `/prompts/p/7482b68e-a916-4150-934b-6c9862022608`
- `compare leading robotics and AI hardware public relations firms` `+2.6` -> `/prompts/p/5a1872d5-cf61-4e78-a61b-2cb15061671d`

### /reports/:id network calls

```
GET supabase /rest/v1/reports?select=id,brand_id,visibility,presence,average_rank,mentions,
    models_mentioned,status,created_at,updated_at,market_id,location,model_scores_data,
    prompt_scores_data&id=eq.<reportId>
GET supabase /rest/v1/tags?select=id,brand_id,name,colour,created_by,created_at,updated_at
    &brand_id=eq.<brandId>&order=name.asc
GET api /reports/<reportId>/results
GET supabase /rest/v1/reports?...&brand_id=eq.<brandId>&status=eq.completed
    &created_at=lt.<thisReportCreatedAt>&order=created_at.desc&limit=1&market_id=is.null&location=is.null
GET supabase /rest/v1/reports?select=id,created_at,visibility&brand_id=eq.<brandId>
    &status=eq.completed&order=created_at.desc&limit=90&market_id=is.null&location=is.null
GET api /rankings/<brandId>?days=14
```

---

## 3. /explore - pivot builder

- URL: `https://trakkr.ai/explore`
- Document title: `Explore`
- H1: `Explore`
- Description line: depends on the selected ROWS dimension:
  - Models: `Performance by AI platform across 23 active prompts`
  - Prompts: `Individual prompt scores across all models`
  - Competitors: `Your position vs 553 tracked competitors`
  - Dates: `Daily trend across all prompts and models`
- Header meta line: `Data through Aug 6, 2026 · 8 platforms`
- Header buttons: `Export`, `Save this view`

Layout: a left control panel and a right result table.

### Save this view

The `Save this view` button changes into an inline form:

- Text input, placeholder `View name...`
- Button `Save`. The button is disabled until the name field has a value.

### ROWS group

Five options. Each shows an optional count badge.

| Option      | Count badge | State                                                                     |
| ----------- | ----------- | ------------------------------------------------------------------------- |
| Models      | 8           | enabled, default selected                                                 |
| Prompts     | 23          | enabled                                                                   |
| Tags        | none        | disabled (`cursor-not-allowed opacity-50`) - no tags exist for this brand |
| Competitors | 554         | enabled                                                                   |
| Dates       | none        | enabled                                                                   |

### MEASURES group

The measure list changes with the ROWS dimension.

- Models: `Visibility`, `Presence`, `Avg Rank`, `Mentions`, `#1 Share`
- Prompts: `Visibility`, `Presence`, `Avg Rank`, `Mentions`
- Competitors: `Visibility`, `Mention Share`, `Market Rank`, `Mentions`, `#1 Share`, `Win Rate`
- Dates: `Visibility`, `Presence`, `Avg Rank`, `Mentions`

### Window group

Options are always `7d`, `14d`, `30d`, `60d`, `90d`. `30d` is the default. The group title and helper line change with the ROWS dimension:

| ROWS        | Group title         | Helper text                                                                          |
| ----------- | ------------------- | ------------------------------------------------------------------------------------ |
| Models      | `TREND WINDOW`      | `Latest score; trend and comparison use this window.`                                |
| Prompts     | `COMPARISON ANCHOR` | `Latest score; comparison uses the report at this anchor.`                           |
| Competitors | `ANALYSIS WINDOW`   | `Latest visibility and Market Rank; shares and supporting evidence use this window.` |
| Dates       | `DATE RANGE`        | `Dates shown in the table.`                                                          |

### Compare with report control

- A toggle switch with the label `Compare with report 30d earlier`. The `30d` part follows the window selection.
- Default state is off (track colour `bg-gray-300`).
- The control is present for Models and Prompts. It is not present for Competitors or Dates.

### FILTERS group

Button `Add filter` opens a list. The list depends on the ROWS dimension:

- Models rows: `By Model`, `Visibility threshold`, `Presence threshold`, `Avg Rank threshold`, `Mentions threshold`
- Prompts rows: `By Model`, `Visibility threshold`, `Presence threshold`, `Avg Rank threshold`, `Mentions threshold`
- Competitors rows: `By Model`, `By Competitor`, `Visibility threshold`, `Mention Share threshold`, `Market Rank threshold`, `Mentions threshold`
- Dates rows: `Visibility threshold`, `Presence threshold`, `Avg Rank threshold`, `Mentions threshold`

`By Model` opens a checkbox list titled `Filter by model` with the values:
`Claude`, `DeepSeek`, `Gemini`, `AI Overviews`, `Grok`, `Meta AI`, `ChatGPT`, `Perplexity`.

A threshold filter opens an editor panel:

- Title = the measure name, for example `Visibility`.
- Operator buttons: `>`, `<`, `Between`.
- Number input, placeholder `Value`, `type="number"`, mono font.
- Buttons `Cancel` and `Apply`.

A `By Tag` filter was NOT OBSERVED, because the brand has no tags.

### OPTIONS group

Two dropdowns, each with a fixed left label.

- Label `Values`. Current value `Raw values`. Options: `Raw values`, `Rank in column`, `vs Average`.
- Label `Display`. Current value `Table`. Options: `Table`, `Heatmap`.

### Export

The `Export` button starts a download at once. No menu appears.

### Result table - Models rows

Columns: `#`, `MODEL`, `VISIBILITY`, `PRESENCE`, `AVG RANK`, `MENTIONS`. Measure headers carry a sort control.
Each model cell shows the platform name and the model version below it.

```
1 ChatGPT      / GPT 5.5             14.7  8.7%  8.5  2
2 Claude       / Claude Opus 4.8      0.0  0.0%   –   0
3 Gemini       / Gemini 3.5 Flash     0.0  0.0%   –   0
4 Perplexity   / Perplexity Sonar    23.8  8.7%  4.5  2
5 DeepSeek     / DeepSeek V4          0.0  0.0%   –   0
6 Grok         / Grok 4.20            0.0  0.0%   –   0
7 Meta AI      / Llama 4 Maverick     0.0  0.0%   –   0
8 AI Overviews / (no version)         0.0  0.0%   –   0
  Avg (8)                             4.8  2.2%  6.5  1
```

The last row is a summary row labelled `Avg (8)`.

### Result table - Prompts rows

Caption above the table: `23 of 23 prompts`.
Columns: `#`, `PROMPT`, `VISIBILITY`, `PRESENCE`, `AVG RANK`, `MENTIONS`.
Top rows:

```
1 compare leading robotics and AI hardware public relations firms   39.6 25.0% 5.5 2
2 best public relations agencies for disruptive B2B SaaS startups   22.4 12.5% 7.0 1
3 best PR agencies for consumer electronics and hardware launches   19.4 12.5% 8.0 1
4..23 all 0.0 / 0.0% / – / 0
  Avg (23)                                                            3.5  2.2% 6.8 0
```

### Result table - Competitors rows

Columns: `#`, `COMPETITOR`, `VISIBILITY`, `MENTION SHARE`, `MARKET RANK`, `MENTIONS`.
Each competitor cell shows the name and a win/loss line, for example `3W · 0L`.

```
1  Example Competitor A              3W · 0L   60.9 6.7% 1  2,267
2  Example Competitor B      0W · 0L   53.3 6.0% 2  2,022
3  Example Competitor D              0W · 0L   46.6 5.3% 3  1,794
4  Example Competitor C     0W · 0L   45.4 5.6% 4  1,906
5  Highwire PR          9W · 0L   39.7 1.4% 5    460
6  Walker Sands         0W · 9L   35.0 1.6% 6    526
7  Bospar               8W · 18L  32.1 0.9% 7    303
8  Ogilvy               0W · 0L   31.4 2.4% 8    820
9  LaunchSquad          8W · 9L   29.6 1.1% 9    381
10 Brunswick Group      0W · 0L   26.5 2.1% 10   693
11 Finn Partners        0W · 9L   23.1 1.1% 11   359
12 Apple                0W · 0L   22.1 0.7% 12   243
13 Ruder Finn           0W · 0L   22.1 2.3% 13   779
14 SHIFT Communications 0W · 1L   22.1 0.6% 14   213
15 InkHouse             0W · 9L   20.8 0.7% 15   220
16 PAN Communications   0W · 0L   20.1 0.8% 16   287
17 Golin                0W · 0L   19.3 2.6% 17   881
18 Crackle PR           0W · 10L  19.1 0.3% 18    86
19 BLASTmedia           0W · 9L   19.0 0.7% 19   238
20 The Hoffman Agency   0W · 8L   19.0 0.6% 20   216
21 Microsoft            0W · 0L   18.8 0.5% 21   180
22 BCW                  0W · 0L   18.4 0.5% 22   173
23 Porter Novelli       0W · 0L   17.6 1.4% 23   477
24 Method Communications 0W · 8L  17.3 0.3% 24    97
25 FGS Global           0W · 0L   17.1 0.6% 25   191
26 Racepoint Global     0W · 0L   17.1 0.4% 26   145
27 Bolt PR              0W · 18L  16.9 0.2% 27    54
28 Hotwire              0W · 0L   16.6 0.5% 28   157
29 Proper Propaganda    0W · 9L   16.1 0.2% 29    63
30 Siegel+Gale          0W · 0L   16.1 0.4% 30   129
31 PRLab                3W · 15L  15.9 0.2% 31    73
32 Interbrand           0W · 0L   ... (list continues to 554 rows)
```

### Result table - Dates rows

Columns: `DATE`, `VISIBILITY`, `PRESENCE`, `AVG RANK`, `MENTIONS`. Summary row `Avg (29)`.

```
Jul 8  6.0  0.7%  6.0  1
Jul 9  6.0  0.7%  6.0  1
Jul 10 - Jul 16  0.0 0.0% 0.0 0
Jul 17 - Jul 24  2.7 0.7% 10.0 1
Jul 25 - Jul 27  0.0 0.0% 0.0 0
Jul 29  8.8 2.2% 7.5 4
Jul 30 - Aug 3  8.7 2.2% 7.5 4
Aug 4   9.3 2.2% 7.0 4
Aug 5   9.3 2.2% 7.0 4
Aug 6  10.1 2.2% 6.5 4
Avg (29) 4.0 0.9% 5.4 2
```

Note: Jul 28 has no row.

### Loading state

During a dimension change the table shows grey skeleton bars in place of the header and the rows. The description line shows a zero count first, for example `Your position vs 0 tracked competitors`. The header meta line and the `Export` button are hidden while loading.

### /explore network calls

```
GET api /explore/<brandId>/series?days=30
GET api /explore/<brandId>/series?days=30&include_prompt_aggregation=true
GET api /rankings/<brandId>?days=30&include_all=true
GET supabase /rest/v1/reports?select=id&brand_id=eq.<brandId>&status=eq.completed
GET supabase /rest/v1/tags?select=id,brand_id,name,colour,created_by,created_at,updated_at
    &brand_id=eq.<brandId>&order=name.asc
```

---

## 4. /activity

- URL: `https://trakkr.ai/activity`
- Document title: `Activity`
- H1: `Activity`
- Description line: `What changed across your brand.`
- Header button: `Mark all read`

### KPI row

Four cards. Each card has an upper label, a large number and a lower caption.

| Label            | Value | Caption       |
| ---------------- | ----- | ------------- |
| THIS WEEK        | 0     | events        |
| UNREAD           | 1     | notifications |
| HIGH PRIORITY    | 1     | alerts        |
| VISIBILITY DROPS | 1     | this period   |

### Filters

Two dropdown buttons above the feed.

- Type filter. Current label `All types`. Options:
  `All types`, `Visibility drops`, `Visibility gains`, `Competitor gains`, `Position changes`, `Citations found`, `Reports complete`
- Date filter. Current label `30 days`. Options: `7 days`, `14 days`, `30 days`, `All time`

### Feed

Events group under a day header. Observed header: `SAT, JUL 25`, with two chips: `1 event` and `1 new`.

Event card anatomy (left to right):

1. A vertical timeline rail with a dot. The dot uses `bg-accent` when the event is unread.
2. A 32x32 rounded icon tile. Colour follows the severity, for example `bg-error-subtle` with a `trending-down` icon in `text-error`.
3. Category label in 10px uppercase, for example `Visibility`. The colour follows the severity.
4. Severity badge next to the category. Observed value `High`, style `bg-error-subtle text-error`, with a triangle-alert icon.
5. Title line, 13px medium, for example `Visibility dropped 100.0%`.
6. Delta chip, for example `-100.0%`, style `bg-error-subtle text-error`, plus a raw value `0`.
7. Relative age in mono font, for example `12d`.
8. Hover-only icon button with the tooltip `Mark as read`.

The whole card is a `button`. An unread card has `bg-accent-subtle/10` and a left border `border-l-2 border-l-error` in the severity colour.

Observed event: `VISIBILITY` / `HIGH` / `Visibility dropped 100.0%` / `-100.0%` / `0` / `12d`.

Severity values other than `High` were NOT OBSERVED.

### Loading state

On first paint the page shows only the H1, the description line and the two filter buttons. The KPI row and feed appear after the data arrives.

### /activity network calls

```
GET api /notifications?user_id=<userId>&brand_id=<brandId>&limit=100
```

---

## 5. /agent - Agent workspace

- URL: `https://trakkr.ai/agent`
- Document title: `Agent`
- There is no H1 and no description line. The page is a chat workspace.

### Layout

Three columns:

1. Thread rail on the left. It is collapsed by default.
2. Conversation canvas in the middle.
3. Side panel on the right. It is closed by default.

Toolbar buttons above the canvas:

- Left: `Open threads` (icon). When the rail is open the button becomes `Collapse threads`.
- Right: `New thread (⌘N)` (plus icon).
- Right: `What I know about this brand` (brain icon). This opens the Memory panel.

### Thread rail (opened)

- Brand chip at the top: brand name `Example Brand`, then metrics `10.1`, `16%`, a dot separator `·`, and `17 h ago`.
- Search input, placeholder `Search threads`.
- Button `New thread`.
- Empty state title: `No threads yet`
- Empty state body: `Ask anything about your brand and a thread starts here.`
- Two panel tabs at the rail foot: `Memory` and `Connections`.

### Greeting block (canvas)

Format, top to bottom:

1. Date line: `Friday, August 7`
2. Greeting line: `Late night, Rehman.` - time-of-day word, comma, first name, full stop.
3. Insight line: `Perplexity is climbing; Claude slipped and is worth a look.`
4. Model strip. Each item has a platform logo (`/images/ai-logos/<slug>.svg`), the platform name, a mentions count, and a delta with an arrow icon. Up deltas use `text-accent`, down deltas use `text-error`.

```
ChatGPT     16  ↑ 2.1
Claude       2  ↓ 8.2
Perplexity   9  ↑ 12.3
Gemini       6  ↑ 0.5      (arrow direction for Gemini NOT OBSERVED in markup)
```

5. Suggested prompt list. Each row has the prompt text and an estimated run time.

```
Which prompts slipped on Claude?      2 min
Where are competitors ahead?          1 min
How does AI describe us?              1 min
Which 8 actions should we review?     About 10 min
```

### Composer

- Textarea, placeholder `Ask anything`.
- Icon button `Attach file` (paperclip). It uses a hidden `<input type="file">`.
- Icon button `Voice input` (microphone).
- Icon button `Send (↵)` (return arrow).
- Hint line under the composer: `↵ send · ⇧↵ new line · / commands`

No message was sent.

### Memory panel - "What I know about this brand"

Header: `What I know`
Sub-header: `About Example Brand`

`UNDERSTANDING` block:

- Big value `40%`
- Three sub-scores: `Profile 100`, `Data 0`, `Learned 0`

`PROFILE` block (label / value):

- `Brand` - `Example Brand`
- `Description` - long text, truncated, with a `Show more` control. Full text observed:
  "Example Brand is a strategic public relations agency that specializes in building earned-media coverage for disruptive technology, B2B SaaS, and consumer brands. Founded in 2017, the firm focuses on high-growth companies, delivering results through senior-led accounts rather than junior staff. Their core services include media relations, executive thought leadership, product launch strategy, and trade show representation at major events like CES. By leveraging a team of former journalists from top-tier publications, Example Brand helps ambitious brands earn billions of impressions and establish category leadership through credible, non-paid editorial placements. Industry: Public Relations and Communications Target Audience: Founders and CMOs of high-growth tech startups, B2B SaaS companies, and consumer electronics brands"
- `Website` - `brand.example.test`
- `Industry` - `Technology`
- `Competitors` - chips `Highwire PR`, `LaunchSquad`, `BAM`, `Walker Sands`, `VSC`, plus an overflow chip `+300`

`HELP AGENT LEARN` block:

- Chip `Topics to own`
- Chip `Communication style`
- Button `Add to memory`

### Connections panel

Header: `Connections`
Count line: `0 connected for Example Brand`

`AVAILABLE` list. Each row has a name, a helper line and an `Add` button.

| Name             | Helper text                      | Button |
| ---------------- | -------------------------------- | ------ |
| Website & CMS    | Read pages and apply fixes       | Add    |
| Google Analytics | AI visitor traffic & conversions | Add    |
| Search Console   | Query & ranking data             | Add    |
| Slack            | Alerts & scheduled reports       | Add    |
| Notion           | Push reports to a page           | Add    |
| CRM              | Sync AI-sourced leads            | Add    |

`ADVANCED` list:

| Name        | Helper text                         | Button |
| ----------- | ----------------------------------- | ------ |
| MCP servers | Give Agent access to your own tools | Manage |

Footer button: `Manage connections`

### /agent network calls

```
GET api /proof/feed?brand_id=<brandId>&stage=judged
GET api /sites/agent-status?brand_id=<brandId>
GET api /actions/briefing?brand_id=<brandId>
GET api /agent/visibility?brand_id=<brandId>
GET api /agent/signals?brand_id=<brandId>&limit=10
GET api /agent/memory?brand_id=<brandId>
GET api /actions?brand_id=<brandId>&status=pending&sort_by=priority_score&sort_dir=desc&per_page=20
GET api /agent/conversations?brand_id=<brandId>&include_archived=false&limit=50&offset=0
GET api /agent/automations?brand_id=<brandId>
GET api /agent/needs-you?brand_id=<brandId>
GET api /opportunity-pool?brand_id=<brandId>&limit=1
GET api /sites/?brand_id=<brandId>
```

---

## 6. /agent/drafts

- URL: `https://trakkr.ai/agent/drafts`
- Document title: `Email drafts`
- H1: `Email drafts`
- Description line: `Drafts composed by the Agent for your team to send.`
- No header action buttons.

Filter chips: `All`, `Drafts`, `Opened`, `Sent`, `Discarded`.
Count line: `0 drafts`

Empty state:

- Title: `No drafts yet`
- Body: `Ask the Agent to draft a client recap or pitch. It lands here as a draft you can review and send.`
- Button: `Open Agent`

Network call:

```
GET api /agent/drafts?limit=100
```

---

## 7. /agency and all agency sub-routes - locked upsell state

- URLs: `/agency`, `/agency/pitches`, `/agency/compare`, `/agency/actions`, `/agency/reports`, `/agency/demos`, `/agency/slides`, `/agency/pdf-export`
- All eight routes render the same locked page. No sub-route has its own content for this account.
- Document title stays the default: `Trakkr | AI Visibility Platform for Brands & Agencies`
- Top bar shows an icon and the label `Agency portfolio`. The top-bar element is a link -> `/agency`, with the accessible text `Agency portfolio1 client`.

Page content, verbatim and in order:

```
[lock icon] AGENCY

Agency workspace

Run every client brand from one place: shared actions, scheduled reports, and branded pitches.

--- card ---
Agency workspace
Try free for 14 days

Clients, actions, reports, and pitches across your whole portfolio.

White-label client portals need the paid Scale plan, so a trial portal cannot go dark on your client.

WHAT YOU'LL GET
Unlimited team members and roles
REST API and Looker Studio connector
Narrative Intelligence (5 narratives)
200 diagnoses/month
Unlimited automations

[button] Try free for 14 days

No charge. All Scale features. Available once.

[button] or upgrade to Scale
--- end card ---

YOUR PORTFOLIO

The brand you already track appears here as a client.

Example Brand

Clients
Every client brand in one table, with what needs attention first.

Actions
One queue across the whole portfolio instead of brand by brand.

Reports
Scheduled sends and client-ready exports.

Pitches
Measured, branded reports for prospects.
```

Buttons on the page: `Try free for 14 days`, `or upgrade to Scale`. Neither was clicked.

The four feature blocks (Clients, Actions, Reports, Pitches) are static text, not links.

Unlocked agency screens were NOT OBSERVED, because the account does not have the Scale plan.

---

## 8. /settings

- URL: `https://trakkr.ai/settings`
- Document title: `Settings`
- H1: `Settings`
- Description line: `Manage your account, brands, and preferences`
- No header action buttons.

Tab bar. Every tab is an anchor with an icon:

| Label       | href                     | Icon        |
| ----------- | ------------------------ | ----------- |
| Profile     | /settings?tab=profile    | user        |
| Brands      | /settings?tab=brands     | building    |
| Billing     | /settings?tab=billing    | credit-card |
| Team        | /settings?tab=team       | users       |
| White-Label | /settings?tab=whitelabel | palette     |
| Custom      | /settings?tab=custom     | layers      |
| Security    | /settings?tab=security   | shield      |
| Developer   | /settings?tab=developer  | code        |

The active tab uses accent colour text and an accent underline.

### 8.1 Profile tab

Section title: `Account settings`
Section subtitle: `Manage your profile and preferences`

Card `Profile` - helper `Your name and email address`

- Field `First name`. Control: text input. Placeholder `Your first name`. Current value `Example User`. Side note `Required`.
- Field `Email address`. Control: text input, `type=email`. Current value `account@example.test`. Button `Change`.
- Helper under the email field: `Managed through your sign-in provider.`

Row `Submit feedback` - helper `Ideas, bugs, or feature requests` - button `Open`

Row `Weekly visibility report` - helper `Weekly email with scores and rankings` - control: checkbox toggle. Current value: on.

Collapsible row `Regional settings` - helper `Timezone and date format`. When open:

- Field `Timezone`. Control: select. Options in order:
  `Eastern Time (US)`, `Central Time (US)`, `Mountain Time (US)`, `Pacific Time (US)`, `Alaska Time`, `Hawaii Time`, `London`, `Paris`, `Berlin`, `Amsterdam`, `Brussels`, `Madrid`, `Rome`, `Stockholm`, `Vienna`, `Zurich`, `Athens`, `Helsinki`, `Moscow`, `Dubai`, `India (IST)`, `Singapore`, `Hong Kong`, `Shanghai`, `Tokyo`, `Seoul`, `Sydney`, `Melbourne`, `Auckland`, `UTC`
- Helper: `Dates and report schedules use this timezone.`
- Field `Date format`. Control: select. Options: `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`

Collapsible row `Danger zone`. When open:

- Row `Delete account` - helper `Permanently remove your account and all data` - button `Delete account`.
- The button was not clicked.

Row `Join referral program` - helper `Earn 20% commission when friends sign up` - button `Get started`

Row `Sign out` - helper `Sign out of your Trakkr account` - button `Sign out`. The button was not clicked.

### 8.2 Brands tab

Section title: `Brands`
Meta line: `1 of 1 tracked·0 groups·10.1% avg visibility`

Controls:

- Segmented control `Group` / `Brand`
- Filter chips: `All 1`, `Live 1`, `Paused 0`
- Search input, placeholder `Search brands`
- Icon buttons `List view` and `Groups view`
- Header icon button `More brand actions`
- A checkbox is present in the list (checked).

Brand row:

- Name `Example Brand`, badge `· Currently viewing`
- Domain `brand.example.test`
- Metric `10.1%`
- Icon button `Edit Example Brand`
- Icon button `More actions for Example Brand`

### 8.3 Billing tab

Trial banner:

- Title `Growth Trial`, badge `5 days left`
- Line `Ends Aug 11 · Then $100/mo`
- Button `Upgrade now`
- Note `Trial includes: Full Growth features except AI Crawler tracking (requires paid) and limited to 1 workflow.`

Plan card:

- Title `Growth Plan`, badge `TRIAL`
- Line `Billed monthly`
- Price `$100/mo`
- Line `Next charge: Aug 11`
- Helper `Update payment method, billing name, address, tax ID, or view invoices`
- Button `Manage billing`

Usage tiles (label / value / caption / action):

- `Brands` - `1 of 1` - `active` - `Add brands`
- `Prompts` - `50` - `per brand` - `See options`
- `Article credits` - `0 of 25` - `this month` - `Add credits`
- `Extra markets` - `0` - `Track additional regions` - `Add markets`
- `AI Pages 10K` - `2,500 requests/mo included`

Upsell card:

- Title `Upgrade to Scale`
- Price `$500/mo`
- Line `10 brands · Team access · API · White-label add-on options`
- Buttons `Try free for 14 days` and `Upgrade`

Footer controls:

- Button `Cancel subscription` (not clicked)
- Button `View invoices`
- Line `Last synced: 8/7/2026, 2:39:02 AM`

### 8.4 Team tab

Section title: `Team`
Subtitle: `Collaborate with your team`

Empty state:

- Title `Work together`
- Body `Invite your team to track brands together. Everyone sees the same data, insights, and reports.`
- Button `Create Team`

### 8.5 White-Label tab

The tab renders an empty content area. No heading, no text, no controls appear below the tab bar. The state was checked twice with a 4 second wait. No loading text and no error text appear.

### 8.6 Custom tab

Section title: `Custom setup`
Subtitle: `Configure Trakkr around how your organization works.`

Control `Custom setup type`. Two radio inputs: value `brand` (label `Brand`) and value `agency` (label `Agency`).

Block `01 What we customize for your org`
Subtitle: `Trakkr adapts to your brand architecture, stack, and team`
Four expandable rows (each is a button):

- `Map your brand architecture` - `Sub-brands, product families, categories, markets, business units - configured to match how you actually operate.`
- `Plug into your existing stack` - `Trakkr connects to what you already use. We build anything that is missing.`
- `Give the right people the right view` - `Stakeholders, clients, team members, and executives each get exactly what they need.`
- `Get help setting this up right` - `We configure it, we integrate it, we attend your meetings when it helps.`

Block `02 How rollout works`
Subtitle: `From first call to live platform in weeks, not months`

- `01 Architecture session` - `30 MIN` - `We map your org structure, integrations, and success metrics together.`
- `02 Platform spec` - `2-3 DAYS` - `You get a written configuration plan covering brands, prompts, access, and integrations.`
- `03 Implementation` - `1-2 WEEKS` - `We configure everything. SSO, data pipelines, custom reports - whatever you need.`
- `04 Quarterly evolution` - `ONGOING` - `Regular reviews. New recommendations as AI platforms and your needs change.`

Block `03 What each stakeholder gets`
Subtitle: `Help your champion carry a credible story to every decision-maker`

- `YOUR CMO` - `Executive scorecard, visibility trends, competitive positioning`
- `YOUR OPS LEAD` - `Brand architecture, prompt coverage, alerting rules`
- `YOUR IT TEAM` - `SSO/SCIM config, API docs, data residency, SLA`
  Badges: `SSO & security review`, `Custom SLA`, `99.9% Uptime`, `Dedicated Support`

Call to action:

- Title `Book an architecture session`
- Line `30 minutes to map your setup. No commitment.`
- Line `Custom plans start at $1,000/mo.`
- Button `Schedule call`
- Line `Or email contact@example.test - we respond within a day`
- Link `contact@example.test` -> `mailto:contact@example.test?subject=Custom%20Setup%20Inquiry`

### 8.7 Security tab

Card `Password` - subtitle `Update your account password`

- Row `Change password` - helper `Choose a strong, unique password` - the row is a button.

Card `Active sessions` - subtitle `Devices where you're signed in`
Each row: device string, an optional `This device` badge, and a location plus last-active line.

```
Electron 42 on Windows 10        This device   Wardha, India · Active now
Chrome Mobile 148 on Android 14                Wardha, India · 11 minutes ago
Chrome 150 on Windows 10                       Khāmgaon, India · 1 day ago
Chrome 150 on Windows 10                       Bhubaneswar, India · 3 days ago
Chrome 150 on Windows 10                       Wardha, India · 6 days ago
Electron 42 on Windows 10                      Wardha, India · 7/30/2026
Chrome 150 on Windows 10                       Wardha, India · 7/29/2026
Chrome 150 on Windows 10                       Multan, Pakistan · 7/28/2026
```

Row `Sign out of all other sessions` - button `Sign out all`. The button was not clicked.

Card `Email sending` - subtitle `Send citation outreach from your own inbox`

- Row `Gmail` - helper `Send outreach pitches from your own address` - button `Connect Gmail`
- Note `We only send - never read your inbox. You can disconnect anytime.`

### 8.8 Developer tab

Section title: `Developer`
Subtitle: `AI assistant integrations and API credentials`

Card `MCP Server`

- Subtitle `Connect Trakkr to ChatGPT, Claude, Cursor, Codex, and other AI assistants`
- Notice `Trakkr stores redacted MCP activity logs for security, support, and product improvement. Full assistant conversations are not stored.`
- Field `Your connect token` - helper `Links AI assistants to your Trakkr account. Teammates should generate their own from their own Settings.`
- Value shown: `account@example.test`
- Empty state text: `Generate a connect token to link AI assistants.`
- Button `Generate connect token`. The button was not clicked.
- Row `MCP configuration` - helper `Hosted connectors for ChatGPT and Claude, plus local setup for developer tools` - button `Set up`

Card `REST API Key`

- Subtitle `Authenticate requests to the Trakkr REST API`
- Locked upsell block:
  - Title `REST API`, badge `Try free for 14 days`
  - Body `REST API access and the Looker Studio connector for your visibility data. (The MCP server is already included on your plan.)`
  - `WHAT YOU'LL GET`: `Unlimited team members and roles`, `REST API and Looker Studio connector`, `Narrative Intelligence (5 narratives)`, `200 diagnoses/month`, `Unlimited automations`
  - Button `Try free for 14 days`
  - Note `No charge. All Scale features. Available once.`
  - Button `or upgrade to Scale`

Card `Resources`

- Button `MCP Server Guide`
- Button `API Documentation`

### /settings network calls

```
GET api /subscription/details
GET api /subscription/details?force=true
GET api /subscription/scale-trial-status
GET api /subscription/receipt-email-preference
GET api /subscription/article-credits?user_id=<userId>&brand_id=<brandId>
GET api /brand-groups
GET api /agency/settings
GET api /gmail/status
GET api /auth/sessions
GET api /users/me/mcp-token
GET supabase /rest/v1/reports?select=brand_id,visibility,created_at&brand_id=in.(<brandIds>)
    &created_at=gte.<isoDate>&order=created_at.desc&limit=1000
GET supabase /rest/v1/prompts?select=brand_id&brand_id=in.(<brandIds>)
```

---

## 9. /upgrade

- URL: `https://trakkr.ai/upgrade`
- Document title: `Upgrade`
- Back link: `Back to dashboard` -> `/dashboard`
- Logo link: (no anchor text) -> `/`
- H1: `Choose your plan`
- Description line: `Track how AI models see, cite, and recommend your brand. for brand.example.test` - the domain is a separate emphasised span.
- The page has no sidebar. It is a standalone layout.

### Billing-period toggle

Two buttons: `Monthly` and `Annual`. The `Annual` button carries a badge `-17%`. `Monthly` is the default.

### Plan cards

Only two cards are shown: Growth and Scale. A Free card is not shown.

Card 1 - Growth

- Badge `POPULAR`
- Sub-line `For growing brands`
- Monthly price `$100 /mo`
- Annual price `$83 /mo` with the sub-line `$100 billed annually`
- Feature list header `EVERYTHING IN FREE, PLUS:`
  - `50 prompts across 8 AI models`
  - `Citation tracking & perception analysis`
  - `Competitor intelligence`
  - `Site optimization & crawler tracking`
  - `Reports, CSV export, Sheets sync`
  - `Automations & Reddit monitoring`
  - `3 team seats with roles`
  - `MCP access for AI assistants`
- Action button `On trial` (this is the current plan state)

Card 2 - Scale

- Sub-line `For agencies and teams`
- Monthly price `$500 /mo`
- Annual price `$417 /mo` with the sub-line `$500 billed annually`
- Feature list header `EVERYTHING IN GROWTH, PLUS:`
  - `10 brands, 50 prompts per brand`
  - `Unlimited team seats`
  - `White-label client portal add-on`
  - `REST API access & Looker integration`
  - `Narrative intelligence`
  - `Priority support`
- Action button `Upgrade to Scale`. The button was not clicked.
- Fine print, monthly: `$500/mo · Cancel anytime`
- Fine print, annual: `$5000/yr · Cancel anytime`

### Compare all features

Button `Compare all features` expands a table. Columns: (feature), `Free`, `Growth`, `Scale`.

```
Brands included            1        1        10
Prompts per brand          5        50       50
AI models tracked          6        8        8
Data points                900      12,000   120,000
Historical data            30 days  1 year   Unlimited

INTELLIGENCE
Competitor tracking        yes      yes      yes
Citation sources           -        yes      yes
Perception analysis        -        yes      yes
Executive reports          -        yes      yes

SITE OPTIMIZATION
AI crawler optimization    -        yes      yes
Technical recommendations  -        yes      yes
Content suggestions        -        yes      yes

SHARING & EXPORT
Shared dashboards          -        yes      yes
CSV export                 -        yes      yes
Google Sheets sync         -        yes      yes
Automations                -        3        Unlimited

TEAM & AGENCY
Team seats                 -        3        Unlimited
MCP access                 -        yes      yes
REST API access            -        -        yes
White-label portal         -        -        +$49/client
```

"yes" is a check icon in the live page. "-" is a literal hyphen.

### Footer content

- Quote: "Trakkr has by far been the most impressive GEO platform we have used. Our citation-driven traffic from AI platforms has more than tripled in 60 days."
- Attribution: `Brandon Gillespie · Founder & CEO, Futuro Corporation`
- Logo strip caption: `Used by teams at`
- Trust line: `Cancel anytime · Secure checkout via Stripe · 2,500+ brands`

---

## 10. /inbox

`https://trakkr.ai/inbox` does not render its own page. The router redirects at once to `https://trakkr.ai/dashboard`. The document title becomes `Dashboard`. No inbox H1, no inbox copy and no inbox API call were observed.

---

## 11. /client - white-label portal

- URL: `https://trakkr.ai/client`
- Document title: `Portal`
- The page has no sidebar and no top bar.

State observed for this signed-in, non-client account:

```
Portal
[indeterminate progress bar]
Loading your brands...
```

The page stays in this loading state. It was checked after 5 seconds and after 11 seconds. No login form, no email field, no password field and no error message appeared. A login form was NOT OBSERVED. No log-in attempt was made.

Network calls on /client:

```
GET  api /subscription/effective
POST api /analytics/identify
GET  api /auth/session
GET  api /client/group-brands
GET  api /subscription/sync?force=false
```

---

## 12. Items not observed

- Agency workspace in the unlocked state (all sub-routes).
- Settings > White-Label tab content. The tab body renders empty for this account.
- The `/client` portal login form. The route stays on `Loading your brands...`.
- A `By Tag` filter on `/explore`. The brand has no tags, so the Tags row option is disabled.
- Explore Heatmap display mode rendering. The option name was read from the dropdown; the rendered heatmap was not captured.
- Activity severity values other than `High`.
- Any error state on any page in this slice. No error was produced during the session.
