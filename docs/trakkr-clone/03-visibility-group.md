# Trakkr.ai replication spec - Visibility group

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

Observed on 2026-08-07. Account brand = "Example Brand". Brand domain = `brand.example.test`.
Brand id used in all API calls = `[EXAMPLE_BRAND_ID]`.
User id = `[EXAMPLE_USER_ID]`.
Viewport used = 1600 x 1200.

All pages in this group share one document title: `Trakkr | AI Visibility Platform for Brands & Agencies`.
The title does not change per route.

---

## 0. Shell and sidebar (context for all four pages)

Sidebar order, top to bottom (exact text):

```
Example Brand            (brand switcher, top left)
Ask            (kbd hint) ⌘K
Dashboard             -> /dashboard
Actions               -> /actions
Prompts               (group, collapsible)
  Prompts             -> /prompts
  Research            -> /research
  Diagnose            -> /diagnose
Visibility            (group, collapsible, expanded)
  Pages               -> /pages
  Citations           -> /citations
  Competitors         -> /competitors
  Perception          -> /perception
Traffic               (group)
  Visitors            -> /traffic/analytics   title "Humans arriving via AI recommendations"
  Crawlers            -> /traffic/crawler     title "AI bots indexing your content"
Growth                (group)
  Content             -> /create
  Site Optimization   -> /optimize
  AI Pages            -> /ai-pages            title "Serve AI-optimized versions to crawlers"
  Reddit              -> /reddit
  Automations         -> /automations
(bottom)
Connect your AI       (button)
Integrations          -> /integrate
Settings              -> /settings
Help & Learn          -> /learn
Collapse sidebar      (button)
```

Top-right of the shell: "Open Settings" button. Bottom right: "Open Intercom Messenger" button.

---

## 1. /pages

### 1.1 Header

- URL: `https://trakkr.ai/pages`
- H1: `Pages`
- Description line, in the same row as H1: `70 pages across brand.example.test` then a separate muted chip `computed nightly`
- Header action buttons, left to right:
  - `Export` (download icon). Loads chunk `csv-*.js`. A CSV download was NOT triggered (download avoided).
  - `Add pages` (plus icon)

### 1.2 Banner

Exact copy, one line:

```
Most pages have 1 of 6 checks measured. Measure pages to fill in available, understood and relevant.
```

- Inline link/button at the end of the sentence: `Measure the top 25 →`
- Right of the banner: `Hide` button (dismisses the banner).
- The whole banner is itself a `<button>`; its accessible name is the banner sentence.

### 1.3 Toolbar row (below banner)

Left to right:

1. Searchbox, `aria-label="Search pages"`, placeholder `Search pages...`
2. Dropdown button `All pages` (chevron). Opens a `role="menu"` with counts:
   - `All pages · 70`
   - `Needs fixes · 53`
   - `Performing · 0`
   - `Not cited · 0`
   - `Not measured · 61`
3. Dropdown button `Filter` (chevron). Opens a `role="menu"` with 9 `role="menuitem"` buttons, `data-index` 0..8, in this order:
   - `Your pages`
   - `Everywhere else`
   - `Both`
   - `Stalls at Available`
   - `Stalls at Reached`
   - `Stalls at Understood`
   - `Stalls at Relevant`
   - `Stalls at Selected`
   - `Stalls at Visited`
     No group headings are rendered in the DOM.
4. Right side: result counter text `70 of 70`
5. Right side: icon button `aria-label="Columns and density"`. Opens a menu:
   - Section label `COLUMNS`, with a `Reset` action
   - Toggles: `Page`, `AI outcome`, `Journey`, `Work`, `Cited`, `Last cited`, `By`, `Bots`, `Clicks`
     (`Bots` and `Clicks` are hidden by default - they are not in the default header row)
   - Section label `DENSITY`, sub-label `Options`, choices `Regular`, `Compact`

The `All pages` and `Filter` selections did NOT change the URL query string during observation. No query param was set. (NOT OBSERVED: any param name for these two controls.)

### 1.4 Table

Container is a div grid, not a `<table>` element: `role="table"`, rows `role="row"` with `aria-rowindex` and `data-index`, cells `role="cell"`.
Row grid template (default density):

```
grid-template-columns: 20px minmax(280px, 3fr) minmax(170px, 1fr) 92px 132px 68px 96px 112px;
height: 48px;
```

Header row classes: `sticky top-0 z-20 grid h-10 items-center gap-3 border-b border-default bg-surface px-8`.
The list is virtualised. Only about 10-25 rows exist in the DOM at one time.

Column headers in DOM order:

| #   | Header text    | Sortable | Notes                                                |
| --- | -------------- | -------- | ---------------------------------------------------- |
| 1   | (blank)        | no       | select checkbox, `aria-label="Select first 25 rows"` |
| 2   | `PAGE ↕`       | yes      | sticky left at 32px                                  |
| 3   | `AI OUTCOME`   | no       |                                                      |
| 4   | `JOURNEY`      | no       | 6-segment rail                                       |
| 5   | `WORK`         | no       |                                                      |
| 6   | `CITED ↓`      | yes      | active sort, descending, right aligned               |
| 7   | `LAST CITED ↕` | yes      | right aligned                                        |
| 8   | `BY`           | no       |                                                      |

Default sort = `cited` descending. The API call confirms it: `sort=cited&direction=desc`.

Cell formats:

- PAGE: two stacked lines. Line 1 = path only, `font-mono text-data text-primary`, turns `text-accent` on row hover. Line 2 = `<title>` of the page, `text-caption text-secondary`. The home page shows path `/`.
- AI OUTCOME: plain text, `text-caption text-primary font-medium`. Observed values: `Slows at Relevant`, `Stalls at Selected`.
- JOURNEY: six small bars, each `h-[5px] w-[9px] rounded-[1px]`, gap 2px. Colours observed: `bg-accent` (green, pass), `bg-green-100` (pale green), `bg-warning` (orange, degraded), `bg-subtle` (grey, not measured), and red for stalled rows. The element is `role="img"` with a full aria-label, for example:
  `Slows at Relevant. Available: pass, Reached: not measured, Understood: pass, Relevant: degraded, Selected: pass, Visited: not measured`
- WORK: `–` (en dash, `text-tertiary`) for every observed row.
- CITED: right aligned, `font-mono tabular-nums`. Values observed: 18, 12, 9, 9, 6, then `–`.
- LAST CITED: right aligned mono. Values `8d ago`, `2d ago`, `3d ago`, `never`.
- BY: `text-caption text-secondary`. Observed value `Perplexity`, or `–`.

Row hover: `-translate-y-[0.5px]`, `bg-muted/30`, `shadow-sm`. Cursor pointer.

### 1.5 Row hover action cluster

Appears on hover or focus, absolutely positioned right, in a bordered card (`border-default bg-surface shadow-card`). Three controls, in order:

1. External link `<a>`, `aria-label="Open brand.example.test/<path>"`, `href="https://brand.example.test/<path>"`, `target="_blank" rel="noopener noreferrer"`, lucide `external-link` icon.
2. Button `aria-label="Measure now: <path>"`, lucide `scan-line` icon. NOT CLICKED - it starts a measurement.
3. Button `aria-label="Ask about <path>"`, lucide `bot` icon. NOT CLICKED - it starts the Ask agent. The chunk `useAskAgent-*.js` is loaded on this route.

Destination of `Measure now` and `Ask`: NOT OBSERVED.

### 1.6 Bulk selection bar

Selecting the header checkbox selects the first 25 rows and shows a floating bar at the bottom centre:

```
25  pages selected    25-page limit. Clear one to choose another.    [Measure now]   [×]
```

`Measure now` in that bar was NOT clicked.

### 1.7 Row click - page drawer

Clicking a row opens a right drawer and changes the URL to:

```
/pages?page=blog~best-pr-agencies-for-consumer-electronics-and-hardware-launches
      &pageUrl=https%3A%2F%2Fbrand.example.test%2Fblog%2F...
```

The `page` param uses `~` in place of `/` in the path.

Drawer contents in DOM order:

```
BLOG · YOURS                                   1 of 70
best PR agencies for consumer electronics and hardware launches | Example Brand
brand.example.test/blog/best-pr-agencies-for-consumer-electronics-and-hardware-launches   (link to https://brand.example.test/...)

AI understands this page but it doesn't match what people ask. (estimated)

AI CITATIONS   2    30 days
BOT FETCHES    0    30 days
AI VISITS      0    30 days

NEXT MOVE
No work on this page yet. Open the full record to inspect its journey.

[Open full record]
```

Drawer buttons: `Previous page (k)`, `Next page (j)`, `Close page`, `Watch this page`, one unlabelled icon button, `Open full record`.

### 1.8 Page full record (drawer -> Open full record)

URL pattern:

```
/pages/blog~best-pr-agencies-for-consumer-electronics-and-hardware-launches?url=https%3A%2F%2Fbrand.example.test%2F...
```

Breadcrumb link `Pages` returns to `/pages?page=...&pageUrl=...`.

Header block:

```
best PR agencies for consumer electronics and hardware launches | Example Brand
brand.example.test/blog/... · blog · yours · last seen Aug 3
AI understands this page but it doesn't match what people ask. (estimated)

AI CITATIONS  2   last 30 days · 8d ago · Perplexity
BOT FETCHES   –   needs crawler tracking
AI VISITS     –   needs traffic data
```

Section `HOW AI USES THIS PAGE`, sub-line `3 of 6 checks pass, 2 not measured`, with a `Connect crawler` button.
The six checks, each a button, exact copy:

| Check      | Question                       | Result line                                                             | Status         |
| ---------- | ------------------------------ | ----------------------------------------------------------------------- | -------------- |
| Available  | Can a request reach it?        | `200, indexable · Measured Aug 6`                                       | `Ok`           |
| Reached    | Do AI bots fetch it?           | `Connect crawler tracking` (link -> `/traffic/crawler?tab=connections`) | `Not measured` |
| Understood | Does a bot get the text?       | `100% of the browser text · Measured Aug 6`                             | `Ok`           |
| Relevant   | Does it match what people ask? | `no citable queries · Measured Aug 6`                                   | `Estimated`    |
| Selected   | Is it cited as evidence?       | `cited in the last 30 days · Latest citation run, Aug 5`                | `Ok`           |
| Visited    | Do people arrive?              | `Connect traffic data` (link -> `/traffic/search-console`)              | `Not measured` |

Below: `No work on this page yet. Measurement will show what would help.`

`CITED FOR` with badge `2`, listing prompt links:

- `best PR agencies for consumer electronics and hardware launches` -> `/prompts/p/7482b68e-a916-4150-934b-6c9862022608`
- `top firms for managing CES media relations and strategy` -> `/prompts/p/e535338b-5451-4bdf-b8ee-4231645a31c4`

`HISTORY` accordion, badge `1`. Expanded: `Jul 28 | Found | Added to the registry`.

`ANALYSIS` accordion, sub-label `checked 6 Aug`. Expanded:

```
OVERALL        25/100
TECHNICAL      60/100
CITATION FIT   WEAK FIT     high confidence

The page is a placeholder shell that fails to load any article content. While the title,
headings, and schema are present, the actual content body contains only 'Loading article…'
and cannot be used to answer substantive queries about hardware PR.

BEST NEXT FIX
Fix Dynamic Client-Side Content Hydration
Ensure that the dynamic blog post content renders on the server side (SSR) or is statically
generated (SSG) in Next.js instead of relying on a client-side API call that leaves a
'Loading article…' placeholder.
Helps: best PR agencies for consumer electronics and hardware launches · how to choose a
consumer electronics PR firm · CES PR strategy for hardware startups
```

Sub-accordions with counts, expanded contents:

- `Query opportunities` 3 - each item: query text, an explanation, and a status badge `MISSING`.
- `Evidence and caveats` 0 - empty copy: `No page wording was strong enough to treat as grounded evidence.`
- `Entity clarity` 2 - each item: entity name, explanation, badge `CLEAR` or `AMBIGUOUS`.
- `What to verify` 2 - plain sentences.
- `Google queries` 0 - empty copy: `Connect Search Console to see these.`
- `Technical issues` 7 - lines:
  - `Meta Tags: Title long (76 chars); Description long (162 chars)`
  - `Readability: Not enough prose to grade reliably`
  - `JS Dependency: Page is mostly invisible without JavaScript (2 words survive)`
  - `Answer Formats: Limited AI-friendly formatting`
  - `Content Density: Thin (2 readable words)`
  - `Answer Structure: Not enough sectioned content to grade`
  - `Heading Structure: Skipped levels (h1→h3)`
- Footer button: `Refresh analysis` (NOT clicked).

### 1.9 Add pages modal

`role="dialog" aria-modal="true"`. Contents:

```
Add pages                                              [× Close]
Key pages are found and measured each night. Add any you want checked now.

Page URLs
[textarea rows=8, placeholder:
   https://example.com/pricing
   https://example.com/product ]
One URL per line, from this brand’s website.                    0 / 25

                                        [Cancel]  [Add and measure]
```

`Add and measure` is `disabled` while the textarea is empty. Icon on that button is lucide `link`.
The form was NOT submitted.

### 1.10 Empty / zero / loading / error states

- Zero-value cells render an en dash `–`, `text-tertiary`.
- `never` is used for a missing Last cited date.
- Chunks loaded for states: `EmptyState-*.js`, `EmptyStates-*.js`, `ErrorState-*.js`, `StateNotice-*.js`, `NoBrandState-*.js`, `FirstScan-*.js`, `RefreshPaused-*.js`, `PausedBrandBanner-*.js`, `PausedSubscriptionBanner-*.js`.
- Actual empty, loading and error screens: NOT OBSERVED (the account has data).

### 1.11 Network - /pages

Same-origin app requests logged for the route load (host `api.trakkr.ai` unless noted):

| Method | Endpoint                                                                                       | Params                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `https://api.trakkr.ai/pages`                                                                  | `brand_id`, `ownership=owned`, `sort=cited`, `direction=desc`, `limit=300`                 |
| GET    | `https://api.trakkr.ai/pages/config`                                                           | `brand_id`                                                                                 |
| GET    | `https://api.trakkr.ai/subscription/effective`                                                 | -                                                                                          |
| GET    | `https://api.trakkr.ai/subscription/sync`                                                      | `force=false`                                                                              |
| GET    | `https://api.trakkr.ai/subscription/downgrade-changes`                                         | -                                                                                          |
| GET    | `https://api.trakkr.ai/auth/session`                                                           | -                                                                                          |
| POST   | `https://api.trakkr.ai/analytics/identify`                                                     | -                                                                                          |
| GET    | `https://api.trakkr.ai/internal/platform-stats`                                                | -                                                                                          |
| GET    | `https://api.trakkr.ai/double/run/{brand_id}`                                                  | -                                                                                          |
| GET    | `https://api.trakkr.ai/users/me/mcp-token/sessions`                                            | -                                                                                          |
| GET    | `https://api.trakkr.ai/users/admin-access`                                                     | -                                                                                          |
| GET    | `https://api.trakkr.ai/client/group-brands`                                                    | -                                                                                          |
| GET    | `https://api.trakkr.ai/agent/automations`                                                      | `brand_id`                                                                                 |
| GET    | `https://api.trakkr.ai/agent/needs-you`                                                        | `brand_id`                                                                                 |
| GET    | `https://example-project-ref.supabase.co/rest/v1/users`                                        | `id=eq.{user}`, long `select=` list                                                        |
| GET    | `https://example-project-ref.supabase.co/rest/v1/brand_members`                                | `user_id=eq.{user}`, `select=role,brand_id,brands(*,brand_groups(id,name,color,position))` |
| GET    | `https://example-project-ref.supabase.co/rest/v1/team_clients`                                 | `user_id=eq.{user}`, `status=eq.active`, `select=brand_id,can_export,brands(*)`            |
| GET    | `https://example-project-ref.supabase.co/rest/v1/reports`                                      | `select=id`, `brand_id=eq.{brand}`, `status=eq.completed`                                  |
| POST   | `https://example-project-ref.supabase.co/rest/v1/rpc/get_pending_team_invite_for_current_user` | -                                                                                          |
| GET    | `https://e.trakkr.ai/flags/`                                                                   | `v=2`, `_`, `ver=1.407.0` (PostHog feature flags)                                          |
| POST   | `https://trakkr.ai/ingest/capture/`                                                            | PostHog events, many                                                                       |
| POST   | `https://example-sentry-org.ingest.de.sentry.io/api/.../envelope/`                             | Sentry                                                                                     |

Response bodies: NOT OBSERVED (bodies were not captured).

Route code-split chunks for /pages: `PagesIndex`, `PageComposition`, `NavigationControls`, `ModelEvidenceGrid`, `models`, `DropdownMenu`, `EmptyState`, `FilterBar`, `FilterToolbar`, `BulkActionBar`, `NoBrandState`, `JourneyRail`, `Dot`, `Popover`, `InstrumentTable`, `Checkbox`, `ErrorState`, `PageDrawer`, `VerdictLine`, `pageWords`, `useAskAgent`, `csv`.

---

## 2. /citations

### 2.1 Header

- URL: `https://trakkr.ai/citations`
- Document title after load: `Citations`
- Top info banner, full width, globe icon, dismissible (`Ã—` button, `aria-label="Dismiss"`):
  `Citations show which websites AI models reference when answering questions about your brand.`
- H1: `Citations`
- Meta line beside H1: `Updated just now Â· 408 sources` then a muted `cursor-help` chip `Partial history` (hover tooltip: NOT OBSERVED - no tooltip node appeared).
- Description line under H1 - it CHANGES per main tab:
  - Sources: `Which websites AI models cite most when answering questions about your industry`
  - Queries: `The search queries that surface citations about your brand`
  - Videos: `Videos AI cites when answering questions about your industry, including which mention you`
  - Outreach: `Sites that cite your competitors but not you yet`
- Header right controls:
  - `All AI` dropdown, `title="Filter by AI platform"`. Menu heading `FILTER BY AI PLATFORM`, options:
    - `All AI` (selected)
    - `Google AI Overviews` + bar + `285`
    - `Perplexity` + bar + `586`
    - `Claude` + badge `Soon` (disabled)
  - `Export` dropdown. Present on Sources and Queries. ABSENT on Videos and Outreach. Menu items:
    - `All sources` `146` - `One row per domain, with every source in scope, not the filtered view`
    - `Detailed citations` `274` - `One row per query Ã— cited page`

### 2.2 Main tabs

`role="tab"` elements. All four set the same URL param `view`.

| Label    | element id               | URL                              |
| -------- | ------------------------ | -------------------------------- |
| Sources  | `citations-tab-sources`  | `/citations` (default, no param) |
| Queries  | `citations-tab-queries`  | `/citations?view=queries`        |
| Videos   | `citations-tab-video`    | `/citations?view=video`          |
| Outreach | `citations-tab-outreach` | `/citations?view=outreach`       |

No badge counts on the main tabs.

### 2.3 Sources tab

Sub-tabs (`role="tab"`), also on the `view` param:

| Label   | element id                      | URL                     |
| ------- | ------------------------------- | ----------------------- |
| Domains | `citations-sources-tab-sources` | `/citations` (default)  |
| Pages   | `citations-sources-tab-pages`   | `/citations?view=pages` |
| Feed    | `citations-sources-tab-feed`    | `/citations?view=feed`  |

#### 2.3.1 Domains sub-tab

Search box placeholder: `Search sources...`

Filter chips - two groups on one line.

Group A (state chips):

| Chip     | Count | Filtered result                               | Note                                           |
| -------- | ----- | --------------------------------------------- | ---------------------------------------------- |
| `All`    | 75    | `75 of 75 sources`                            | default                                        |
| `Citing` | 1     | `1 of 75 sources` - only `brand.example.test` | domains that cite your brand                   |
| `Gaps`   | 74    | `74 of 75 sources`                            | tooltip `Sites citing competitors but not you` |

Group B (source-type chips). Each chip has a small colour square, a label, and a count. The count is the CITATION count, not the domain count. Example: `Media` shows 117 but filters the list to `20 of 75 sources`.

| Chip      | Count | Swatch colour        |
| --------- | ----- | -------------------- |
| `Media`   | 117   | `rgb(16, 185, 129)`  |
| `Social`  | 123   | `rgb(139, 92, 246)`  |
| `Reviews` | 10    | `rgb(244, 63, 94)`   |
| `Inst.`   | 29    | `rgb(100, 116, 139)` |
| `PR`      | 3     | `rgb(6, 182, 212)`   |
| `Other`   | 565   | `rgb(156, 163, 175)` |

None of these chips writes to the URL. When any chip is active a `Clear filters` link appears next to the `N of 75 sources` counter.

Below the chips is a horizontal stacked proportion bar, coloured with the same six type colours.

Sort dropdown, `title="Sort"`, default `Most cited`. Options:
`Most cited`, `Highest authority`, `Best sentiment`, `Most pages`, `Most competitors`.

Domain row markup (left rail, virtual scroll, `75 of 75 sources` footer):

```
[status dot 8px, rounded-full, border]
[favicon 20x20 box, img src=https://www.google.com/s2/favicons?domain=<domain>&sz=32, 16x16]
[domain name, 13px, text-secondary -> text-primary on hover]
[type badge: 5x5 colour square + 11px label, title=<Type>]
[optional competitor badge: icon + count, title=<competitor name>, e.g. title="Crackle PR" 1]
[citation count, 11px font-mono tabular-nums]
```

Under each row a thin coloured share bar is drawn. Row hover: `bg-muted`. Row is a div, `cursor-pointer`.

Observed order (Most cited): linkedin.com 58 Social, the-square.co 45 Other, clutch.co 38 Other,
cracklepr.com 34 Other (comp 1), reddit.com 31 Social, directiveconsulting.com 28, beantownmv.com 27,
odwyerpr.com 24, vaultcommunications.com 24, youtube.com 22 Social, properpropaganda.net 20,
competitor-one.example.test 20 (comp 1), brand.example.test 18, competitor-two.example.test 17 (comp 13), competitor-three.example.test 17,
shadow.inc 15, salientpr.com 15, prlab.co 15, avaansmedia.com 15 Media, famehero.com 15,
blazonagency.com 15 (comp 1), prezly.com 14, observer.com 14 Media, jiveprdigital.com 13,
avenuez.com 12, webtonic.io 12, provokemedia.com 12 Media, 50pros.com 10, amworldgroup.com 10 Media,
themarketingagency.ca 9, pressfeatured.com 9 Media, corporateink.com 9, ie.edu 9 Inst.,
worldmetrics.org 9 Media, firstpagesage.com 9 (comp 6), influencermarketinghub.com 9,
designrush.com 9, mexc.com 9, vivaldigroup.com 8, 5wpr.com 7, gartner.com 7 Reviews,
gothamghostwriters.com 6, leveragewithmedia.com 6 Media, panblastpr.com 6 (comp 1),
globalstrategygroup.com 6, obapr.com 6, welcometoprofile.com 6, slicedbrand.com 6 (comp 2),
businessplusai.com 6, iresearchservices.com 6, medium.com 6 Social, inc.com 6 Media,
then a block of 3-count domains, ending online.hbs.edu 2 Inst.

Right pane, nothing selected (empty state): globe icon, then

```
Select a source to explore
You're cited on 1 of 75 influential sources
```

Right pane, source selected (linkedin.com):

```
linkedin.com   [Opportunity badge]   Visit site   (a href="https://linkedin.com")
AI CITATIONS    58
PAGES           16
CITATION SHARE  4%
Loading detailed profile...
```

The detailed profile never resolved during observation (over 12 s). No profile API request was issued.
Chunks loaded on selection: `SourceExplorer`, `DomainRating`, `SourceTypeTag`, `SourceTypeConfig`, `SourceTypeBadge`.
Full profile body: NOT OBSERVED.

#### 2.3.2 Pages sub-tab (`?view=pages`)

Chips: `Pages 200`, `Citing you 2`, `Gaps 198`, `Domains 146`, `Type`, `Topics`, `First cited`.
Counter `200 of 200`. Sort `Most cited`.
Column headers: `PAGE` | `QUERIES` | `CITED`.
Row format: page title or slug on line 1; line 2 = `<domain> Â· <Type> Â· [model name] Â· <queries>`; right = cited count.
Example rows:

```
best-pr-agencies-for-startups               beantownmv.com Â· Other Â· 6              27
leading-pr-agencies-for-high-growth-brands  vaultcommunications.com Â· Other Â· 7     24
best-tech-pr-agencies                       the-square.co Â· Other Â· 6               21
Checking your browser - reCAPTCHA           linkedin.com Â· Social Â· 5               15
hightech.htm                                odwyerpr.com Â· Other Â· Perplexity Â· 4   12
91362348                                    inc.com Â· Media Â· AI Overviews Â· 2       6
```

#### 2.3.3 Feed sub-tab (`?view=feed`)

Chips: `Events 176`, `New 147`, `Lost 0`, `Sentiment 1`, `Competitor 28`, `Net +147`, `Type`.
Counter `176 of 176`.
A range control labelled `Changes in last` with options `7d`, `14d`, `30d`.
Column headers: `EVENT` | `WHEN`.
Row format:

```
<page title>
<domain> Â· <Type> Â· <model>
Gap Â· via "<prompt text>"                      Today
```

### 2.4 Queries tab (`?view=queries`)

Chips: `Queries 23`, `Citing you 3`, `Gaps 20`, `New 23`, `Coverage 13%`.
Search box placeholder `Search queriesâ€¦`. Counter `23 of 23`.

`Filters` popover:

```
VIEW
  [ List | Group by intent ]        (segmented, List selected)
AUDIENCE
  All audiences        (selected)
  Hardware Launch Lead
  B2B SaaS Growth Marketer
  Founder Brand Builder
  Enterprise Tech Evaluator
```

Sort dropdown default `Opportunity score`. Options:
`Opportunity score`, `Gaps first`, `Most frequent`, `Most competitors`, `Most citations`, `Newest`.

Column headers: `QUERY` | `MODELS` | `FREQ.` | `COMP.`
Row: quoted query text, then intent badge (`Comparison`, `Best For`, `Alternative`), `New` badge, opportunity level (`High`, `Med`, `Low`), FREQ number, COMP number, and a `Create` action. Rows already covered by your brand show no `Create` action and no opportunity level.

Row click expands INLINE (URL does not change). Expanded contents:

```
Comparison   106 citations   24 appearances   First seen Jul 29, 2026
AI Overviews   Perplexity          View prompt

CITED PAGES
  best-tech-pr-agencies                    the-square.co
  the-top-10-ai-pr-agencies-...            businessplusai.com
  Best Technology PR Agencies 2026 - ...   competitor-two.example.test
  compare leading robotics and AI ...      brand.example.test
  robotics-pr-agency                       prlab.co

COMPETITORS (33)
  Influence Tech PR, PAN Communications, Amazon, Example Competitor B, Hotwire,
  Interpublic Group, +27 more

SIMILAR QUERIES
  "compare leading public relations agencies for enterprise technology brands"  26  Gap  Med

Create content to cover this + 1 related gap        Plan with Agent ->
```

### 2.5 Videos tab (`?view=video`)

Chips: `Videos 0`, `Mention you 0`, `Yours 0`.
Button: `Link your channel`.
Sort: `Most cited`.
Rows (all identical shape):

```
Untitled video
Unknown channel   Cited 9x  Â·  1 prompt   [Analysing]  [Industry]
```

Ten rows observed, cited counts 9, 9, 9, 9, 6, 5, 3, 3, 3, 1.
Note the contradiction that is really on the page: the `Videos` chip reads `0` while ten rows are listed.

### 2.6 Outreach tab (`?view=outreach`)

Summary line above the controls:

```
Google, InkHouse & Bolt PR are cited on pages you're not, across 35 publishers and 19 prompts Â· top 12 cover 73% of the gap
```

Grouping control, label `Outreach grouping`, three radio inputs with values `publisher`, `prompt`, `competitor`, labels `Publisher`, `Prompt`, `Competitor`. Grouping does NOT change the URL.

#### Publisher grouping (default)

Status chips: `All 35`, `New 35`, `Contacted 0`, `Won 0`.
Search box placeholder `Search publishersâ€¦`. Footer counter `35 of 35 publishers`.

Left rail row format:

```
<domain>  <Type badge>  <competitor count>   <score 0-100>
<n> pages Â· <n> prompts  Â·  DR <number>
[optional QUICK WIN badge]
```

Observed rows in order: competitor-two.example.test Media 21 / 100 / 3 pages Â· 4 prompts Â· DR 59;
firstpagesage.com Other 9 / 65 / 3 pages Â· 3 prompts Â· DR 82; blazonagency.com Comp. 6 / 64 / DR 17;
competitor-one.example.test Other 5 / 58 / DR 26; pr.plus Other 9 / 51 / DR 36 (QUICK WIN);
amworldgroup.com 7 / 50 / DR 56; aimers.io 6 / 50 / DR 49 (QUICK WIN);
inbeat.agency Media 8 / 49 / DR 75; slicedbrand.com 4 / 48 / DR 52; magnt.com 7 / 47 / DR 51;
deviatelabs.com 6 / 46 / DR 37; cracklepr.com 1 / 40 / DR 30; pitchkitchen.com Media 5 / 40 / DR 16;
voloevents.com 4 / 38 / DR 20; markets.businessinsider.com Media 3 / 35 / DR 92;
panblastpr.com 1 / 34 / DR 42; builtin.com Media 4 / 32 / DR 86; treblepr.com 2 / 32 / DR 38;
wynter.com 1 / 31 / DR 73; blackunicornpr.com 3 / 30 / DR 29; salesduo.com 1 / 27 / DR 54;
prnewswire.com PR 1 / 27 / DR 92; flyingcatmarketing.com Media 1 / 23 / DR 57;
percepture.com 1 / 21 / DR 36; coynepr.com 1 / 21 / DR 33; marketingbeyondborders.com 1 / 21 / DR 4;
bospar.com 2 / 19 / DR 52; 5wpr.com 1 / 16 / DR 71; adobe.com 1 / 15 / DR 96;
bluetext.com 1 / 15 / DR 58; meltwater.com Media 1 / 15 / DR 87; prlab.co 1 / 15 / DR 57;
cnet.com Media 1 / 12 / DR 91; qwoted.com 1 / 12 / DR 73; youtube.com Social 1 / 12 / DR 99.

Right pitch panel for `competitor-two.example.test` (full contents, nothing sent):

```
competitor-two.example.test   [Media]

Best Technology PR Agencies 2026 - Top Firms for SaaS, AI, and Enterprise Tech
Visit  Â·  Top page  Â·  Ask Agent

100                    IMPACT
[WINNABLE]   DR 59

21 rivals are cited on 3 pages here where you're absent. They answer 4 of your tracked
prompts, cited 28x in all.

LIVE
The page is part of an annually refreshed PR Firm Rankings Series with sibling sector
indexes, and the article was modified as recently as August 2026, so the list is actively
maintained and a pitch timed to the next refresh cycle has a realistic window.

YOUR PITCH   [proof verified]
TO   [high confidence]
  input placeholder "recipient@publisher.com", value "publisher@example.test"
  subject input value "Example Brand for your Best Technology PR Agencies list"
  textarea value:
    Hi Example Recipient,

    I'm reaching out about your 'Best Technology PR Agencies in 2026' list. It's a sharp,
    well-maintained roundup, and I noticed Example Brand isn't included. Given the page's
    emphasis on technical fluency, trade-press relationships, and GEO capability, Example Brand
    fits squarely.

    Founded in 2017, Example Brand specializes in earned media for disruptive tech, B2B SaaS,
    and consumer brands, with senior-led accounts. We focus on high-growth companies, and our
    clients get direct senior attention, not junior handoffs.

    In case it's useful, I can share examples of our GEO work and client roster for your next
    refresh. We'd welcome the chance to be considered for inclusion.

    Best,
    [Your Name]

Connect your Gmail to send from your own address. We only send, never read your inbox.

[Redraft]   [Open inâ€¦]   [Connect Gmail & send]

How they pick
  Editorial selection by the Everything-PR editorial team, not a public submit form. The page
  states selection basis as technical fluency, trade-press relationships, AI-engine citation
  capability (GEO), and demonstrated client roster. There is no 'submit a firm' form for the
  ranking itself, but the /contact page explicitly welcomes editorial submissions, op-eds,
  press releases, and corrections to publisher@example.test, so a pitch with evidence of GEO
  capability and client roster is the realistic path.

Why you're out            3 pages Â· 4 prompts

[Not a fit]  [Snooze]  [Mark contacted]
```

While the pitch generates, the panel shows a streaming status line:
`Â· reading competitor-two.example.test/top-technology-pr-agencies-in-2026â€¦`

`Open inâ€¦` menu items: `Open in Gmail`, `Open in Outlook`, `Open in Apple Mail`, `Copy to clipboard`.
`Connect Gmail & send`, `Redraft`, `Not a fit`, `Snooze`, `Mark contacted` were NOT clicked.

#### Prompt grouping

Rail sub-title: `Queries where you're most absent. Open one to win it.`
Row format: prompt text, then `on <n> of <m>` and `<n> rivals`.
Footer: `19 prompts you're absent from`.
Right panel:

```
WIN THIS PROMPT
compare leading robotics and AI hardware public relations firms
You appear on 1 of 35 cited pages        3%
Win your top 8 battlegrounds below and you'd be cited on ~31% of pages for this prompt.

WHO'S WINNING IT        11 gap pages
Google 5 pg | InkHouse 2 pg | Method Communications 2 pg | Highwire 2 pg |
Boston Dynamics 2 pg | TechCrunch 2 pg | Salesforce 2 pg | Crackle PR 2 pg

THE PLAN
Â· reading the battlefieldâ€¦        (streaming status)
```

Final content of `THE PLAN`: NOT OBSERVED (it was still streaming).

#### Competitor grouping

Rail sub-title: `Who's cited where you're not. Open one to displace them.`
Row format: competitor name, score, `<n> pages Â· <n> publishers`. Competitors without a logo show a letter avatar.
Footer: `24 competitors ahead of you`.
Right panel for `Google`:

```
Google                Cited where you're absent
100                   PRESENCE
Google is cited on 8 pages you're missing from, across 7 publishers and 4 of your tracked
prompts, pulled 51x in all.

WHERE GOOGLE BEATS YOU
  compare leading robotics and AI hardware public relations firms        5 pg
  top firms for brand narrative development and competitive messaging    1 pg
  top firms for managing global product launch media campaigns           1 pg
  best public relations partners for category creation and storytelling  1 pg

TOP BATTLEGROUNDS      7 publishers
Publishers citing Google where you're absent. Open one to research it and draft a pitch.
  youtube.com                  2 pages Â· 6x    [Research]
  markets.businessinsider.com  1 page Â· 6x     [Research]
  treblepr.com                 1 page Â· 6x     [Research]
  wynter.com                   1 page Â· 18x    [Research]
  deviatelabs.com              1 page Â· 9x     [Research]
  blackunicornpr.com           1 page Â· 3x     [Research]
  competitor-two.example.test            1 page Â· 3x     [Research]
```

### 2.7 Network - /citations

Route-specific requests, on top of the shell requests listed in section 1.11:

| Method | Endpoint                                           | Params                                                                                                                                                                          |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `https://api.trakkr.ai/citations/{brand_id}/all`   | `limit=200`, `provider_schema=providers-v5`, `cache_policy=empty-no-store-v1`                                                                                                   |
| GET    | `https://api.trakkr.ai/citations/{brand_id}/gsc`   | -                                                                                                                                                                               |
| GET    | `https://api.trakkr.ai/brands/{brand_id}/personas` | `range=30d`                                                                                                                                                                     |
| POST   | `https://api.trakkr.ai/tracking/page-viewed`       | -                                                                                                                                                                               |
| POST   | `https://api.trakkr.ai/api/activation/track`       | -                                                                                                                                                                               |
| GET    | `supabase /rest/v1/prompts`                        | `brand_id=eq.{brand}`, `text=neq.`, `order=created_at.desc`; select includes `priority_score,search_volume,llm_affinity,estimated_volume,volume_confidence,persona_id,topic_id` |
| GET    | `supabase /rest/v1/tags`                           | `brand_id=eq.{brand}`, `order=name.asc`, select `id,brand_id,name,colour,created_by,created_at,updated_at`                                                                      |
| GET    | `supabase /rest/v1/prompt_tags`                    | `select=prompt_id,tag_id`, `prompt_id=in.(...)`                                                                                                                                 |
| GET    | `https://www.google.com/s2/favicons`               | `domain=<domain>`, `sz=32` (one per row)                                                                                                                                        |

The outreach pitch generation call and the source-profile call were NOT captured. NOT OBSERVED.
Response bodies: NOT OBSERVED.

---

## 3. /competitors

### 3.1 Header

- URL: `https://trakkr.ai/competitors`
- Document title after load: `Competitors`
- Top info banner, dismissible: `See how your brand ranks against competitors across AI search engines.`
- H1: `Competitors`
- Meta line beside H1: `Data through Aug 6, 2026`
- Header right controls, left to right:
  1. Dropdown `Latest + 14-day his...` (truncated; full label `Latest + 14-day history`). Menu options:
     - `Latest + 7-day history`
     - `Latest + 14-day history` (selected)
     - `Latest + 30-day history`
     - `Latest + 90-day history`
       Changing this changes the `days` parameter of the rankings and competitors API calls (observed `days=14`).
  2. `Compare` toggle button. When on, a caption `vs 14 days earlier` appears next to it. The URL does not change.
  3. `Export` button. No menu appeared on click. A CSV download is the likely behaviour but this was NOT confirmed.

### 3.2 KPI strip

Five cards in one row. Some have an info icon.

| Label        | Value  | Sub-value        |
| ------------ | ------ | ---------------- |
| `YOUR RANK`  | `#80`  | `/ 443`          |
| `VISIBILITY` | `10.1` | `+0.8 pts`       |
| `WIN RATE`   | `25`   | `%`              |
| `TREND`      | `+0.8` | `improving`      |
| `WATCHING`   | `22`   | `active threats` |

In `Matrix` mode only `YOUR RANK` and `VISIBILITY` are rendered.

### 3.3 Competitive trend chart

Section label `COMPETITIVE TREND`. Empty state, exact copy:

```
Not enough data yet
Check back after a few days of tracking
```

Chart type when populated: NOT OBSERVED.

### 3.4 Tabs

`role="tab"`. Param is `mode`.

| Label         | Badge | element id                            | URL                         |
| ------------- | ----- | ------------------------------------- | --------------------------- |
| `Competitors` | `50`  | `competitor-analysis-tab-competitors` | `/competitors` (default)    |
| `Prompts`     | `23`  | `competitor-analysis-tab-prompts`     | `/competitors?mode=prompts` |
| `Matrix`      | none  | `competitor-analysis-tab-matrix`      | `/competitors?mode=matrix`  |

URL params that DO NOT work (verified):

- `/competitors?tab=head-to-head&rival=Example Competitor A` - the params are kept in the URL but the page renders the default Competitors tab. There is no head-to-head route. The duel layout is reached only by expanding a competitor row (see 3.6).
- `/competitors?mode=prompts&model=Perplexity` - `model` is STRIPPED from the URL on load. The final URL is `/competitors?mode=prompts`. The model filter is a dropdown only, not a URL param.

### 3.5 Filter row (Competitors tab)

Left to right: search box `Search competitors...`, then chips, then `Model` dropdown, then `Groups` button on the right.

| Chip      | Count | Effect                                                                     |
| --------- | ----- | -------------------------------------------------------------------------- |
| `All`     | 50    | default, ranks 1..50                                                       |
| `Threats` | 20    | keeps the ORIGINAL rank numbers; observed ranks 1-16, 18, 27, 31, 37       |
| `Rising`  | 30    | observed ranks 17, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 32, 33, ... |

Chips do not write to the URL.

`Model` dropdown - a checkbox list:

```
All models   (checked)
AI Overviews
ChatGPT
Claude
DeepSeek
Gemini
Grok
Meta AI
Perplexity
```

`Groups` button opens the alias / grouping modal (see 3.8).

### 3.6 Competitors table

Column headers in order: `#` | `COMPETITOR` | `MENTIONS` | `VISIBILITY` | `TREND` | `H2H` | `WIN RATE`
`#` is sortable (a sort caret is drawn next to it). Default order is VISIBILITY descending.

Cell formats:

- `#` - integer rank.
- `COMPETITOR` - favicon or logo, else a single letter avatar (observed for Example Competitor C `F`, SHIFT Communications `S`, The Hoffman Agency `T`, PRLab `P`, Proper Propaganda `P`).
- `MENTIONS` - integer with thousands separator, e.g. `1,041`.
- `VISIBILITY` - one decimal, e.g. `60.9`.
- `TREND` - one decimal, `0.0` on every observed row.
- `H2H` - `wins-losses`, e.g. `3-0`, `0-9`, `8-18`, or `-` when there is no head-to-head. Wins are drawn green, losses red.
- `WIN RATE` - a horizontal bar plus a coloured dot marker (red on all observed rows).
- Each row ends with a chevron button that expands the row.

Observed rows 1-22:

```
1  Example Competitor A                 1,041  60.9  0.0  3-0
2  Example Competitor B           918  53.3  0.0   -
3  Example Competitor D                   793  46.6  0.0   -
4  Example Competitor C          817  45.4  0.0   -
5  Highwire PR               345  39.7  0.0  9-0
6  Walker Sands              366  35.0  0.0  0-9
7  Bospar                    286  32.1  0.0  8-18
8  Ogilvy                    392  31.4  0.0   -
9  LaunchSquad               281  29.6  0.0  8-9
10 Brunswick Group           320  26.5  0.0   -
11 Finn Partners             204  23.1  0.0  0-9
12 Apple                     112  22.1  0.0   -
13 Ruder Finn                363  22.1  0.0   -
14 SHIFT Communications      142  22.1  0.0  0-1
15 InkHouse                  165  20.8  0.0  0-9
16 PAN Communications        143  20.1  0.0   -
17 Golin                     345  19.3  0.0   -
18 Crackle PR                 86  19.1  0.0  0-10
19 BLASTmedia                147  19.0  0.0  0-9
20 The Hoffman Agency        118  19.0  0.0  0-8
21 Microsoft                  83  18.8  0.0   -
22 BCW                       106  18.4  0.0   -
```

#### Expanded row - the duel layout

Row click expands INLINE. The URL does not change. Contents for `Example Competitor A`:

```
VISIBILITY VS YOU
  Example Brand   0.0
  Example Competitor A     60.9

HEAD-TO-HEAD
  3  wins    -    0  losses
  100% win rate across 3 prompts

TREND
  line chart
  x axis ticks: Jul 24, Jul 26, Jul 29, Jul 31, Aug 1, Aug 2, Aug 4, Aug 6
  y axis ticks: 0, 20, 40, 60, 77
  two series, legend: "You", "Example Competitor A"
  (tooltip contents: NOT OBSERVED)

WHERE THEY WIN     10
  compare executive positioning strategies for tech industry leaders      98.0
  best public relations strategies for viral consumer product launches    98.0
  top public relations partners for global consumer tech brands           97.9
  +7 more

WHERE YOU WIN      1
  best alternatives to large PR firms for tech founders                  +89.0

BY MODEL
  AI Overviews  â€“  â€“
  ChatGPT       â€“  â€“
  Claude        â€“  â€“
  DeepSeek      â€“  â€“
  Gemini        â€“  â€“
  Grok          â€“  â€“
  Meta AI       â€“  â€“
  Perplexity    â€“  â€“

[View full profile]  [Copy Link]  [Export]
```

`View full profile` is an `<a href="/competitors/Example Competitor A">`. The competitor name is used raw in the path.

### 3.7 Prompts tab (`?mode=prompts`)

Chips: `All 23`, `Losing 23`.
Column headers: `PROMPT` | `AI VOL` | `POSITION` | `MODELS` | `14D` | `LEADER` | `GAP` | `TREND`

Cell formats:

- `PROMPT` - the query in double quotes.
- `AI VOL` - a bucket string: `50-200`, `200-1K`, `1K-5K`.
- `POSITION` - integer, or `-` when absent.
- `MODELS`, `14D` - `-` on every observed row.
- `LEADER` - competitor name, with logo or letter avatar.
- `GAP` - negative number, e.g. `-5.2`, `-6`, `-8.8`, `-9`, `-98`.
- `TREND` - blank on every observed row.

Observed rows:

```
"compare leading robotics and AI hardware public relations firms"          50-200   6  Crackle PR          -5.2
"best public relations agencies for disruptive B2B SaaS startups"          200-1K   7  Outcast             -6
"best PR agencies for consumer electronics and hardware launches"          200-1K   9  Bolt PR             -8.8
"best alternatives to large PR firms for tech founders"                    50-200  10  Bamboo PR           -9
"top public relations partners for global consumer tech brands"            200-1K   -  Example Competitor A             -98
"compare leading public relations agencies for enterprise technology brands" 200-1K -  Ketch               -98
"compare executive positioning strategies for tech industry leaders"       200-1K   -  Example Competitor A             -98
"compare leading agencies for trade show and event PR"                     50-200   -  Mosaic              -98
"best public relations services for building founder brand authority"      200-1K   -  Burson              -98
"best agencies for earned media coverage versus paid placements"           200-1K   -  Linkifi             -98
"top firms for managing CES media relations and strategy"                  50-200   -  Walker Sands        -98
"best public relations partners for category creation and storytelling"    200-1K   -  Ketch               -98
"compare strategic PR agencies focused on organic media growth"            50-200   -  DMR.agency          -98
"top firms for placing op-eds in tier one publications"                    200-1K   -  Muck Rack           -98
"top firms for managing global product launch media campaigns"             200-1K   -  Wieden+Kennedy      -98
"best agencies for executive thought leadership and ghostwriting services" 200-1K   -  Otter PR            -98
"top firms for brand narrative development and competitive messaging"      200-1K   -  Narrative           -98
"top agencies for securing expert commentary in business media"            50-200   -  The Pollack Group   -98
"top tech PR firms for high growth software companies"                     200-1K   -  Westwood PR         -98
"top boutique firms for securing top tier editorial coverage"              200-1K   -  Amra & Elma         -98
"best agencies for securing product reviews in tech publications"          200-1K   -  The Hoffman Agency  -98
"best public relations strategies for viral consumer product launches"     1K-5K    -  Example Competitor A             -98
"best PR agencies for series B funding announcement strategy"              200-1K   -  Crackle PR          -98
```

### 3.8 Matrix tab (`?mode=matrix`)

A heat map. No search box, no chips, no Model dropdown.
Column headers, in order: `AI OVERVIEWS`, `CHATGPT`, `CLAUDE`, `DEEPSEEK`, `GEMINI`, `GROK`, `META AI`, `PERPLEXITY`.
Row headers = competitor names with logo or letter avatar, top 20 by visibility.
Cell = a score to one decimal, drawn in a rounded pill. Colour = a single green scale. Higher score = darker green. `0.0` cells are unfilled.
Legend at the bottom left: label `SCORE`, five swatches from pale to dark, then `Low` and `High`.
Values observed (rows 1-20 x 8 models) start:

```
Example Competitor A            39.6 48.0 68.8 53.7 55.2 80.8 68.8 60.8
Example Competitor B    26.4 34.3 64.9 39.9 48.9 74.0 64.9 51.5
Example Competitor D             0.0 31.6 53.2 29.7 39.0 67.9 70.1 36.1
Example Competitor C   22.8 26.4 58.2 39.9 40.1 65.6 54.0 36.1
Highwire PR        34.3  0.0 52.8 54.2 68.2  0.0  0.0 37.9
Walker Sands       38.4 35.5 45.7 20.3 58.6  0.0  0.0 30.2
Bospar             36.7 34.9 48.5  0.0 50.2  0.0  0.0 22.8
Ogilvy             14.7 18.7 18.7  0.0  9.3 34.3 69.8 24.7
LaunchSquad        33.6 11.4 35.5 38.3 44.2  0.0  0.0 34.9
Brunswick Group     0.0 28.7 16.2 17.1  0.0 52.3 37.3  0.0
Finn Partners       0.0 20.9 11.4 56.9  0.0  0.0  0.0 34.3
Apple               0.0 28.7 19.8 24.3 20.9 32.3 16.2 19.8
Ruder Finn          0.0  6.6  0.0  0.0  0.0 32.3 45.7 24.7
SHIFT Comms         0.0 23.8 17.4 28.7 37.3  0.0 18.7 23.8
InkHouse           31.6 30.9 27.2  0.0  0.0  0.0  0.0 25.5
PAN Communications 19.8 20.9  0.0 29.7 36.1  0.0  0.0 18.7
Golin               0.0  0.0 37.3 13.3 13.2 17.4 22.8 18.7
Crackle PR         27.2 41.2  0.0  0.0  0.0  0.0  0.0 19.8
BLASTmedia          0.0 34.9 18.7 36.8 14.7  0.0  0.0  0.0
The Hoffman Agency  0.0 42.2  0.0 36.8  0.0  0.0  0.0  0.0
```

Tooltip contents: NOT OBSERVED.

### 3.9 Manage brands modal (the `Groups` button)

`role="dialog"`. Title `Manage brands`, sub-title `Group related brand names together`.
Two internal tabs: `Your Brand` and `Competitors`.

`Your Brand` tab:

```
PRIMARY BRAND
Example Brand

No aliases configured yet
Add aliases like "Example Brand Pro" or "Example Brand Max" to aggregate their mentions into your
visibility score.

[Add alias manually]   [Auto-detect aliases]
```

`Competitors` tab:

```
Ungrouped              442
Hidden competitors       0

No hidden competitors
Group related competitors to simplify your view

[Auto-Detect Groups]   [Create Custom Group]
```

Nothing in this modal was saved.

### 3.10 Network - /competitors

| Method | Endpoint                                              | Params                                  |
| ------ | ----------------------------------------------------- | --------------------------------------- |
| GET    | `https://api.trakkr.ai/competitors/{brand_id}/all`    | `days=14`                               |
| GET    | `https://api.trakkr.ai/competitors/{brand_id}/hidden` | -                                       |
| GET    | `https://api.trakkr.ai/competitor-groups/{brand_id}`  | -                                       |
| GET    | `https://api.trakkr.ai/rankings/{brand_id}`           | `days=14`, `include_all=true`           |
| GET    | `https://api.trakkr.ai/brands/{brand_id}/aliases`     | -                                       |
| GET    | `https://api.trakkr.ai/volume/brand/{brand_id}`       | `calculate_missing=false`               |
| POST   | `https://api.trakkr.ai/api/activation/track`          | -                                       |
| GET    | `supabase /rest/v1/tags`                              | `brand_id=eq.{brand}`, `order=name.asc` |

Plus the shared shell requests from section 1.11. `days` follows the `Latest + N-day history` control.
Response bodies: NOT OBSERVED.

---

## 4. /perception

### 4.1 Header

- URL: `https://trakkr.ai/perception`
- Document title after load: `Perception`
- No info banner on this page.
- H1: `Perception`
- Meta line beside H1: `Example Brand Â· Jul 28 â€“ Aug 3 Â· 6 brands`
- Header buttons: `Refresh` (NOT clicked - it starts a run) and `Configuration`.

### 4.2 Tabs

`role="tab"`. Param is `tab`.

| Label       | element id                   | URL                           |
| ----------- | ---------------------------- | ----------------------------- |
| Overview    | `perception-tab-overview`    | `/perception` (default)       |
| Competitors | `perception-tab-competitors` | `/perception?tab=competitors` |
| Claims      | `perception-tab-claims`      | `/perception?tab=claims`      |
| Tracked     | `perception-tab-tracked`     | `/perception?tab=tracked`     |

No badge counts on these tabs.
Switching tabs in the SPA sometimes leaves the previous panel rendered. A hard navigation to the tab URL renders it correctly.

### 4.3 Overview tab

Header block:

```
PERCEPTION SCORE      66
How AI models perceive your brand

RANK          #6     of 6
VS AVERAGE   -11.3   below competitors
7-DAY CHANGE  +2.7   improving

Example Brand is a specialized boutique agency for tech and venture-backed brands, focusing on earned media.
```

#### HOW AI DESCRIBES YOU

Two columns.

`PRAISED` claim chips, each with an optional `NEW` badge:

```
Specialized                 NEW
Boutique/Mid-Sized          NEW
Deep Understanding          NEW
Securing Earned Media       NEW
Works With Startups         NEW
Strategic Approach          NEW
```

Caption under the column: `The words AI actually uses Â· click any for evidence`
Link/button on the right: `See all claims` (goes to the Claims tab).

`QUESTIONED` claim chips:

```
Limited Scope/Scale                          NEW
Dependence On Specific Media Relationships   NEW
Cost Vs. Perceived Value                     (no NEW badge)
Capacity For Large Clients                   NEW
Limited Public Proof Of Scale                NEW
Narrower Breadth                             NEW
```

`MOVED THIS WEEK` list:

```
Specialized - new â€” 1 model
Boutique/Mid-Sized - new â€” 1 model
Deep Understanding - new â€” 1 model
Securing Earned Media - new â€” 1 model
```

Clicking any claim chip opens an evidence drawer (`role="dialog"`, one button `aria-label="Close details"`):

```
EVIDENCE
Specialized      Positive      1 mention across models      NEW
RAISED BY
Gemini
WHAT THEY ACTUALLY SAID
"specializing in public relations for disruptive technology, B2B SaaS, and consumer brands."
Gemini
```

#### CATEGORY SCORES - the five score visualisations

They are NOT radial dials. Each is a full-width button with three parts:

1. Label, `text-[10px] font-semibold text-muted uppercase tracking-wider`
2. Score, `text-[20px] font-semibold tabular-nums text-primary`
3. A 3px bar: track `h-[3px] bg-subtle rounded-sm`, fill `bg-accent/60`, width set from the score.

| Label        | Score | Expanded title        |
| ------------ | ----- | --------------------- |
| `TRUST`      | 63    | Trust & Reliability   |
| `QUALITY`    | 67    | Quality & Performance |
| `VALUE`      | 69    | Value & Experience    |
| `MARKET`     | 62    | Market Position       |
| `INNOVATION` | 70    | Innovation & Appeal   |

Each expands INLINE (no URL change) to `Score breakdown by attribute`. A `FOCUS` badge marks one attribute per category.

```
TRUST 63 - Trust & Reliability
  Overall trust        General trustworthiness perception   63
  Reliability score    Consistency and dependability        65
  Transparency level   Openness about practices             65
  Safety perception    Security and risk perception  FOCUS  62

QUALITY 67 - Quality & Performance
  Overall quality      Product/service excellence           65
  Problem resolution   Issue handling effectiveness  FOCUS  64
  Responsiveness       Speed of support and updates         72
  User satisfaction    Customer happiness signals           68

VALUE 69 - Value & Experience
  Value for money      Perceived price-value ratio          73
  Ease of interaction  Simplicity of engagement             76
  Accessibility        Availability and reach               69
  Necessity level      Perceived essentialness       FOCUS  57

MARKET 62 - Market Position
  Brand recognition    Awareness and recall          FOCUS  46
  Professional image   Corporate credibility                65
  Recommendation likelihood  Word-of-mouth potential        66
  Uniqueness           Differentiation from competitors     71

INNOVATION 70 - Innovation & Appeal
  Forward thinking     Innovation leadership                73
  Adaptability         Flexibility and evolution            74
  Likability           Emotional appeal                     70
  Confidence inspiring Assurance and authority       FOCUS  65
```

#### PERCEPTION OVER TIME

A line chart. Legend chips at the top with the current value:
`Example Brand 66`, `Example Competitor A 80`, `Example Competitor B 80`, plus a `Compare` control to add a series.
X axis: one tick, `Aug 3`.
Y axis ticks: `61`, `67`, `73`, `79`, `84`.
Tooltip contents: NOT OBSERVED.

#### AI MODEL BREAKDOWN

Sub-title `2 of 4 recognize you`.

```
ChatGPT       doesn't recognize the brand
Claude        doesn't recognize the brand
Gemini    85  Specialized boutique for disruptive tech, B2B SaaS, and consumer brands.
Perplexity 6  88   Boutique PR for tech and venture-backed brands, strong in earned media.
```

(The `6` on the Perplexity row is a rank badge.)

### 4.4 Competitors tab (`?tab=competitors`)

Five sub-tabs. None of them changes the URL; the URL stays `?tab=competitors`.

| Label        | element id                               |
| ------------ | ---------------------------------------- |
| Overview     | `perception-competitors-tab-summary`     |
| Positioning  | `perception-competitors-tab-positioning` |
| Score Matrix | `perception-competitors-tab-matrix`      |
| Trends       | `perception-competitors-tab-trends`      |
| Head-to-Head | `perception-competitors-tab-gaps`        |

#### Overview sub-tab

KPI strip: `BRANDS TRACKED 6`, `YOU LEAD IN 2 of 20`, `NEED IMPROVEMENT 16 metrics`, `WIN RATE 10%`, `TOP COMPETITOR Example Competitor A`.

Table headers: `BRAND` | `LEADS IN` | `TRAILS IN` | `SCORE`

```
Example Brand                  2   16   10%     (own row is highlighted, crown icon)
Example Competitor A                    14    1   70%
Example Competitor C            0    0    0%
Example Competitor E    0    3    0%
Example Competitor D                     0    0    0%
Example Competitor B             4    0   20%
```

#### Positioning sub-tab

KPI strip: `YOUR QUADRANT Hidden`, `ATTRIBUTES YOU OWN 6 of 8`, `ATTRIBUTES TO WIN 2 gaps`, `BIGGEST GAP Public Affairs - Example Competitor C leads`.

`PERCEPTION MAP`, sub-title `Visibility Ã— narrative strength Â· vs your set average`.
A 2x2 scatter quadrant chart. Quadrant labels: `LEADING`, `HIDDEN`, `GENERIC`, `LOSING`.
Axis labels: `Visibility in AI â†’` (x) and `Narrative strength â†’` (y).
Points: Example Brand, Example Competitor A, Example Competitor B, Example Competitor C, Example Competitor D, Example Competitor E.
Legend: `You`, `Competitor`.

`ATTRIBUTE OWNERSHIP`, sub-title `Your share of AI's voice, per attribute`:

```
Specialized             you 100%
Boutique/Mid-Sized      you 100%
Deep Understanding      you 100%
Securing Earned Media   you 100%
Works With Startups     you 100%
Strategic Approach      you 100%
Public Affairs          Example Competitor C leads
Global Reach            Example Competitor A leads
```

Footer sentence:
`You own "specialized". Example Competitor C owns "public affairs" (you're at 0%) - a gap keeping Example Brand out of those answers.`

#### Score Matrix sub-tab

KPI strip: `YOUR AVERAGE 66 / 100, -10 vs avg`; `YOUR RANK #6 of 6`; `METRICS YOU LEAD 2 of 20 (10%)`; `BIGGEST OPPORTUNITY Brand recognition -47 vs Example Competitor A`.
Caption: `Comparing Example Brand against 5 competitors`. Filter control: `All Categories`.

Columns: `METRIC`, `VENTURE PR #6`, `EDELMAN #1`, `FLEISHMANHILLARD #3`, `HILL+KNOWLTON STRATEGIES #5`, `KETCHUM #4`, `WEBER SHANDWICK #2`.
Rows are grouped by category heading.

```
TRUST & RELIABILITY
  Overall trust               63  80  78  74  76  80
  Reliability score           65  85  80  75  77  82
  Transparency level          65  72  71  68  70  74
  Safety perception           62  79  77  73  75  79
QUALITY & PERFORMANCE
  Overall quality             65  88  81  77  79  84
  Problem resolution          64  82  79  75  75  79
  Responsiveness              72  78  76  72  75  77
  User satisfaction           68  82  79  74  76  81
VALUE & EXPERIENCE
  Value for money   LEADING   73  62  65  64  66  66
  Ease of interaction LEADING 76  68  69  67  70  70
  Accessibility               69  71  71  69  71  72
  Necessity level             57  81  74  71  71  77
MARKET POSITION
  Brand recognition           46  93  81  76  79  86
  Professional image          65  92  85  80  81  88
  Recommendation likelihood   66  82  79  73  76  82
  Uniqueness                  71  75  69  68  69  72
INNOVATION & APPEAL
  Forward thinking            73  84  77  74  77  83
  Adaptability                74  81  77  73  75  82
  Likability                  70  74  74  71  76  77
  Confidence inspiring        65  88  82  77  78  84

Overall Average               66  80  76  72  75  79
```

Legend at the bottom: `LEADING  You lead this metric` and `Your brand column`.

#### Trends sub-tab

KPI strip: `CURRENT SCORE 63 / 100`, `CHANGE +0.5`, `YOUR RANK #3 of 3`, `DATA POINTS 2 snapshots`.
Metric selector: `Overall trust`.
Range control: `7d`, `30d`, `90d`, `All`.
`COMPARE` chips: `Example Competitor A`, `Example Competitor B`, `Example Competitor C`, `Example Competitor D`, `Example Competitor E`.
Line chart. X ticks `Jul 28`, `Aug 3`. Y ticks `55`, `64`, `73`, `82`, `90`. An `Avg` reference line is drawn.
Series legend with values:

```
Example Brand       63  +0.5   Rank #3
Example Competitor A          80  -0.5   Rank #1
Example Competitor B  80  +0.5   Rank #2
```

#### Head-to-Head sub-tab

Selector: `Comparing Example Brand vs` with a `Head-to-head competitor` picker.
Rival chips: `Example Competitor A`, `Example Competitor B`, `Example Competitor C`, `Example Competitor D`, `Example Competitor E`.
KPI strip: `YOUR WINS 2 metrics`, `THEIR WINS 5 metrics`, `WIN RATE 29%`, `BIGGEST LEAD Value for money +11.2`.

`CATEGORY PROFILE` - a radar / spider chart with two series (`Example Brand`, `Example Competitor A`) over the five axes `TRUST`, `QUALITY`, `VALUE`, `MARKET`, `INNOVATION`. Tooltip contents: NOT OBSERVED.

```
WHERE YOU LEAD (2)
  Higher value for money
  Higher ease of interaction
BIGGEST LEAD
  Value for money   +11.2

WHERE THEY LEAD (5)
  Better overall trust
  Better reliability score
  Better transparency level
  Better safety perception
  Better overall quality
GAP TO CLOSE
  Brand recognition   -46.5
```

The requested URL form `?tab=head-to-head&rival=Example Competitor A` is a /competitors URL, not this one. On /competitors it has no effect (see 3.4). On /perception the head-to-head view is a sub-tab with no URL param.

### 4.5 Claims tab (`?tab=claims`)

Header block:

```
HOW AI DESCRIBES YOU
Mostly positive
2 of 4 models know you Â· high confidence
22 praised Â· 7 questioned Â· 24 new this week
"Example Brand is a specialized boutique agency for tech and venture-backed brands, focusing on earned media."
Updated weekly Â· last run Aug 3
```

Filter row: `All`, `Praised`, `Questioned`, `Rising`, then dropdowns `Any model`, `Any trend`, `Any source`, then `All claims`, `Needs work`. None of these writes to the URL.

`PRAISED` (22), each chip may carry a `NEW` badge:

```
Specialized NEW, Boutique/Mid-Sized NEW, Deep Understanding NEW, Securing Earned Media NEW,
Works With Startups NEW, Strategic Approach NEW, Niche Expertise NEW, Results-Oriented NEW,
Personalized Approach NEW, Earned-Media Coverage NEW, Executive Thought Leadership NEW,
Product Launches NEW, Visibility NEW, High-Growth Companies NEW, Founder-Friendly NEW,
Specialization NEW, Hands-On Service NEW, Relevant Vertical Experience NEW,
Agility, Responsiveness, Boutique, Tech-Focused        (last four have NO NEW badge)
```

`QUESTIONED` (7), caption `click any for evidence`:

```
Limited Scope/Scale NEW, Dependence On Specific Media Relationships NEW,
Capacity For Large Clients NEW, Limited Public Proof Of Scale NEW, Narrower Breadth NEW,
Reputation Data Is Thin NEW, Cost Vs. Perceived Value    (no NEW badge)
```

`MOVED THIS WEEK`: same four rows as the Overview tab.

### 4.6 Tracked tab (`?tab=tracked`) - the goal table

Chips: `All 4`, `Needs attention 0`, `Improving 0`, `Achieved 4`.
Table headers: `THEME` | `VALUE` | `TREND` | `STATUS`

```
Reliable      64%   â†’   50%   Achieved
Innovative    72%   â†’   50%   Achieved
Trusted       63%   â†’   50%   Achieved
Expert        65%   â†’   50%   Achieved
```

`VALUE` is the current percentage. The number after the arrow is the goal target. `TREND` is a flat arrow `â†’` on every row.
Footer copy: `Perception goals update as new analysis is processed.`

The four themes match the `PERCEPTION GOALS` set in the Configuration panel.

### 4.7 Configuration panel

Opened by the `Configuration` header button. A right drawer. Title `Configuration`, sub-title `Example Brand`, close `Ã—`.
Contents, in DOM order:

```
COMPETITORS                                       [Edit]
  Example Competitor A
  Example Competitor B
  Example Competitor C
  Example Competitor D
  Example Competitor E

PERCEPTION GOALS                                  [Edit]
  Expert    Trusted    Innovative    Reliable

UPDATE FREQUENCY
  Weekly
  Last updated: Never

AI MODELS TRACKED
  ChatGPT   Claude   Gemini   Perplexity
```

Nothing was edited or saved. The `Edit` panels were not opened: NOT OBSERVED.

### 4.8 Network - /perception

| Method | Endpoint                                         | Params                                                     |
| ------ | ------------------------------------------------ | ---------------------------------------------------------- |
| GET    | `https://api.trakkr.ai/api/perception/dashboard` | `brand_id`, `days=90`                                      |
| GET    | `https://api.trakkr.ai/api/perception/story`     | `brand_id`                                                 |
| POST   | `https://api.trakkr.ai/api/activation/track`     | -                                                          |
| GET    | `supabase /rest/v1/perception_goals`             | `select=*`, `brand_id=eq.{brand}`, `order=created_at.desc` |

Plus the shared shell requests from section 1.11.
Response bodies: NOT OBSERVED.
Route chunks: `perception-api`, `perception-story-api`.

---

## 5. Cross-page notes

### 5.1 URL parameter summary

| Route          | Param     | Values                                                                  |
| -------------- | --------- | ----------------------------------------------------------------------- |
| `/pages`       | `page`    | page path with `/` replaced by `~`; opens the drawer                    |
| `/pages`       | `pageUrl` | full URL-encoded page URL; goes with `page`                             |
| `/pages/:slug` | `url`     | full URL-encoded page URL                                               |
| `/citations`   | `view`    | (none)=Sources/Domains, `pages`, `feed`, `queries`, `video`, `outreach` |
| `/competitors` | `mode`    | (none)=Competitors, `prompts`, `matrix`                                 |
| `/perception`  | `tab`     | (none)=Overview, `competitors`, `claims`, `tracked`                     |

Params that do NOT work: `/competitors?tab=head-to-head&rival=...` (ignored) and `/competitors?mode=prompts&model=Perplexity` (`model` is stripped).

### 5.2 Outbound link graph observed in this group

| From                      | Anchor text                 | href                                | Host element                               |
| ------------------------- | --------------------------- | ----------------------------------- | ------------------------------------------ |
| /pages table row          | (icon only)                 | `https://brand.example.test/<path>` | hover action cluster `<a target="_blank">` |
| /pages drawer             | `brand.example.test/<path>` | `https://brand.example.test/<path>` | drawer header                              |
| /pages/:slug              | `Pages`                     | `/pages?page=...&pageUrl=...`       | breadcrumb                                 |
| /pages/:slug              | `Connect crawler tracking`  | `/traffic/crawler?tab=connections`  | Reached check                              |
| /pages/:slug              | `Connect traffic data`      | `/traffic/search-console`           | Visited check                              |
| /pages/:slug              | prompt text                 | `/prompts/p/{uuid}`                 | CITED FOR list                             |
| /citations source panel   | `Visit site`                | `https://<domain>`                  | source explorer header                     |
| /competitors expanded row | `View full profile`         | `/competitors/{CompetitorName}`     | duel panel footer                          |

No other `<a href>` elements were present in `<main>` on these routes. Everything else is a button with JS navigation.

### 5.3 Shared analytics / third-party calls seen on every route

PostHog (`https://trakkr.ai/ingest/capture/`, `https://e.trakkr.ai/flags/`, `https://e.trakkr.ai/i/v0/e/`),
Sentry (`https://example-sentry-org.ingest.de.sentry.io/api/4511047627505744/envelope/`),
Google Ads / gtag (`www.google.com/ccm/collect`, `www.google.com/rmkt/collect/18151051758/`),
LinkedIn Insight (`px.ads.linkedin.com/attribution_trigger`, `px.ads.linkedin.com/collect`, `px.ads.linkedin.com/wa/`),
Meta Pixel (`connect.facebook.net/signals/config/EXAMPLE_PIXEL_ID`),
Google favicons (`www.google.com/s2/favicons`),
Intercom (the `Open Intercom Messenger` launcher).

### 5.4 Things not observed

- Empty, first-run, error and paused states for all four routes. The account has data. The code chunks exist (`EmptyState`, `EmptyStates`, `ErrorState`, `StateNotice`, `NoBrandState`, `FirstScan`, `RefreshPaused`, `PausedBrandBanner`, `PausedSubscriptionBanner`, `BrandLimitModal`).
- All response bodies.
- Chart tooltips on every chart.
- The result of any mutating button: `Measure now`, `Add and measure`, `Refresh`, `Refresh analysis`, `Connect Gmail & send`, `Redraft`, `Mark contacted`, `Snooze`, `Not a fit`, `Link your channel`, `Auto-detect aliases`, `Auto-Detect Groups`, `Create Custom Group`, `Edit` in the Configuration panel, `Export`.
- The linkedin.com source profile body (it stayed in `Loading detailed profile...`).
- `THE PLAN` output in the Outreach prompt grouping (it stayed streaming).
