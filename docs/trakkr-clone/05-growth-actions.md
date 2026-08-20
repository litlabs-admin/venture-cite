# Trakkr replication spec - Growth action pages

Scope: `/create`, `/optimize`, `/automations` and their sub-routes.
Observed on 2026-08-07. Account brand: **Venture PR** (`venturepr.com`).
Brand id: `7d474cd4-0273-480c-8e85-cff6cf434cc8`. User id: `87fee514-646b-4ed7-a5e0-9463bd25f236`.
Viewport used: 1440 x 2200.

All copy in this file is transcribed from the live page. Where a control was not
opened (credit spend risk, blocked action), the text says **NOT OBSERVED**.

---

## 0. Shell chrome (present on every page in this slice)

Left sidebar (element: `complementary` > `navigation`). Links and hrefs:

| Anchor text | href | Tooltip / aria |
|---|---|---|
| Ask | (button, no href) | "Open Ask command", shortcut badge `⌘K` |
| Dashboard | `/dashboard` | - |
| Actions | `/actions` | - |
| Prompts (group header) | (button) | - |
| Prompts | `/prompts` | - |
| Research | `/research` | - |
| Diagnose | `/diagnose` | - |
| Visibility (group header) | (button) | - |
| Pages | `/pages` | - |
| Citations | `/citations` | - |
| Competitors | `/competitors` | - |
| Perception | `/perception` | - |
| Traffic (group header) | (button) | - |
| Visitors | `/traffic/analytics` | "Humans arriving via AI recommendations" |
| Crawlers | `/traffic/crawler` | "AI bots indexing your content" |
| Growth (group header) | (button) | - |
| Content | `/create` | - |
| Site Optimization | `/optimize` | - |
| AI Pages | `/ai-pages` | "Serve AI-optimized versions to crawlers" |
| Reddit | `/reddit` | - |
| Automations | `/automations` | - |
| Connect your AI | (button) | - |
| Integrations | `/integrate` | - |
| Settings | `/settings` | - |
| (help icon) | `/learn` | "Help & Learn" |

Sidebar also has a brand switcher button ("Venture PR") at the top and a
"Collapse sidebar" button at the bottom.

Bottom right: Intercom launcher, button "Open Intercom Messenger".

---

# 1. `/create`

- URL: `https://trakkr.ai/create`
- `document.title`: `Create`
- H1: **Create**
- Sub-line: `Venture PR · ● Updated just now` (relative age; later observed as
  `Updated 2 min ago`, `Updated 6 min ago`). The dot before the age is a status dot.

## 1.1 Header actions (left to right)

| Control | Type | aria-label | Note |
|---|---|---|---|
| Export | button | "Export 7 ideas rows as CSV" | label counts the visible rows of the active tab |
| Settings | button | "Settings" | opens the Settings modal (section 1.8) |
| Write | button with dropdown | - | primary style, leading `+` icon |

`Write` dropdown menu items:

| Item | Shortcut badges |
|---|---|
| Write article | `⇧ ⌘ W` |
| Write campaign | `⇧ ⌘ C` |

The composer that opens after "Write article" was **NOT OBSERVED** (the action
was blocked before it opened; it can spend article credits).

## 1.2 Tabs

`tablist` aria-label "Create view". Each tab shows a numeric badge.

| Tab label | Badge | URL when selected |
|---|---|---|
| Ideas | 8 | `/create?stage=ideas` |
| Drafts | 0 | `/create?stage=drafts` |
| Live | 0 | `/create?stage=live` |
| Campaigns | 0 | `/create?stage=campaigns` |

`/create` with no query string opens the Ideas tab.

## 1.3 Right-hand tab-row strip

Text: `0 cited · Try Agent →` then a small `×` dismiss control.

- `0 cited` is a button. Markup:
  `<button type="button" class="group inline-flex items-baseline gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/30">`
  with `<span class="font-mono tabular-nums text-primary">0</span>` and
  `<span class="text-muted decoration-dotted decoration-border underline underline-offset-[3px] ...">cited</span>`.
  Clicking it produced no visible menu, dialog or route change. Effect **NOT OBSERVED**.
- `Try Agent` is a button with a trailing 11 px arrow icon.
  Class: `inline-flex items-center gap-1 text-muted hover:text-primary transition-colors duration-250 ...`.
  Not clicked (agent runs can spend credits). Target **NOT OBSERVED**.
- `×` is a button, `aria-label="Dismiss"`, `title="Dismiss"`, class
  `opacity-0 group-hover:opacity-100 text-muted/60 hover:text-muted transition-opacity duration-200 text-[10px]`.
  It appears only when the strip is hovered.

## 1.4 Ideas toolbar

Order: search box, `Signal` menu, `View` menu, `View dismissed` toggle,
right-aligned `25 credits available`.

- Search: `input[type=text]`, placeholder `Search ideas`, aria-label "Search ideas".
- Credits counter: text `25` in mono type, then muted text `credits available`.

### Signal menu (role=menu)

| Item | Description line |
|---|---|
| All signals | (no description) |
| Citation gaps | Queries where competitors are cited before your brand. |
| Prompt weakness | Tracked prompts where your position is missing or low. |
| Query gaps | Search queries AI engines ran while answering without you. |
| Reddit demand | High-signal threads drawing competitor attention. |
| Crawler opportunities | Hot or orphaned pages on your site worth refreshing. |
| AI referral expansion | Pages already getting AI traffic and worth expanding. |
| Recommendations | Inferred ideas without observed evidence yet. |
| Custom entries | Titles you added directly in the composer. |

### View menu (role=menu)

| Item | Description line |
|---|---|
| By campaign | Organize work into campaign buckets. |
| By signal | Cluster by signal type: Citation gaps, Prompt weakness, Reddit demand, and so on. |
| Flat list | One uninterrupted list, sorted by score. |

The button label changes to the selected value (observed label `Flat list` after
a selection). Default label is `View`.

### View dismissed

A toggle button. When on:

- The `Ideas` badge changes to `0`.
- A filter-chip row appears: `Showing dismissed ideas`, `View: Flat list`, `Clear all`.
- The table area shows the empty state:
  - Title: **No matches**
  - Body: `Try a different search or signal filter.`
  - Button: `Clear filters`
- `Clear all` restores the default view.

## 1.5 TOP OPPORTUNITY hero card

Layout: two columns. Left column is copy. Right column is the score and the CTA.

Left column, top to bottom:
1. Eyebrow, uppercase, accent colour: `TOP OPPORTUNITY`.
2. Title, large, is a button: `top tech PR firms for high growth software companies`.
3. Description paragraph: `A decision-focused guide that ranks firms based on
   growth-stage fit, with Venture PR positioned as the senior-led choice for scale-ups.`
4. Meta row: signal chip `Recommended` (dot + label) | `500` + muted `AI VOL` |
   divider | campaign name `Own the Boutique Tech PR Conversation`.

Right column:
1. Score `75` in large mono type, then muted `/ 100`.
   The accessible name is "Priority score 75 out of 100".
   A horizontal segmented meter sits under the number; filled segments are green.
2. Button `Write article` with trailing arrow. **Not clicked** (spends credits).

## 1.6 Ideas table

Column headers, in order:

| # | Header | Sortable | Notes |
|---|---|---|---|
| 0 | (checkbox rail) | no | "Select all 7 visible · shift-click for a range · drag the checkbox rail to paint rows" |
| 1 | IDEA | yes (button "Idea") | - |
| 2 | SIGNAL | no | - |
| 3 | POTENTIAL | yes (button "Potential") | default sort, descending |
| 4 | AI VOL | yes (button "AI Vol") | - |
| 5 | Actions | no | right aligned |

Footer line, uppercase, centred: `SHOWING 7 OF 8`.

### Grouping (View = By campaign)

Rows are grouped under campaign header rows. A campaign header row contains:

- a disclosure chevron (collapsed `›`, expanded `⌄`),
- the campaign name (button, `title="Double-click to rename"`, plus a separate
  "Rename campaign" button),
- a muted sub-line `N articles`,
- SIGNAL cell: chip `Recommended` plus the count of ideas,
- POTENTIAL cell: the campaign roll-up number,
- Actions cell: button `Write N` (aria-label "Write N articles from this group").

Observed campaign rows:

| Campaign | Sub-line | Signal | Potential | AI Vol | Action button |
|---|---|---|---|---|---|
| Own the Boutique Tech PR Conversation | 2 articles | Recommended 2 | 46 | (blank) | Write 2 |
| Dominate CES and Product Launch PR | 3 articles | Recommended 3 | 18 | (blank) | Write 3 |
| Win the Funding Announcement Niche | 2 articles | Recommended 2 | 16 | (blank) | Write 2 |

The first campaign is expanded on load. The others are collapsed.
Click on the header row toggles the group.

### Idea rows

| Idea | Campaign | Signal | Potential | AI Vol |
|---|---|---|---|---|
| best public relations agencies for disruptive B2B SaaS startups | Own the Boutique Tech PR Conversation | Recommended | 75 | 500 |
| best alternatives to large PR firms for tech founders | Own the Boutique Tech PR Conversation | Recommended | 17 | 100 |
| best agencies for securing product in tech publications | Dominate CES and Product Launch PR | Recommended | 20 | n/a |
| top firms for managing CES media relations and strategy | Dominate CES and Product Launch PR | Recommended | 17 | 100 |
| best PR agencies for consumer electronics and hardware launches | Dominate CES and Product Launch PR | Recommended | 16 | 500 |
| top firms for managing global product launch media campaigns | Win the Funding Announcement Niche | Recommended | 16 | 500 |
| best PR agencies for series B funding announcement strategy | Win the Funding Announcement Niche | Recommended | 16 | 500 |

Cell formats:
- POTENTIAL is an integer, right aligned, mono. A thin horizontal bar sits under
  the number and scales with the value. The bar is green.
- AI VOL is an integer in mono, or the literal string `n/a` when there is no volume.
- Missing AI VOL on campaign roll-up rows renders as an empty cell.
- Some idea rows carry a small trailing sparkle icon after the title
  (observed on "best alternatives to large PR firms for tech founders").

Row behaviour:
- The whole row is a button, aria-label `Open idea <title>`. It opens the idea drawer.
- Hover reveals a checkbox on the left (aria-label "Select row. Drag to paint selection."),
  a "More actions" button, and a `Write` button
  (aria-label `Write <title>`).

Row overflow menu (role=menu):

| Item | Shortcut |
|---|---|
| Write article | `W` |
| Open detail | `↵` |
| Dismiss | `D` |
| Ask Agent about this | - |

## 1.7 Idea drawer

Opened from a row. Close button aria-label: `Close <idea title>`.
Observed content for "best public relations agencies for disruptive B2B SaaS startups":

```
best public relations agencies for disruptive B2B SaaS startups

Recommended · 75 priority · 500 monthly · 6 competitors

RECOMMENDED

Write a 1,600-word listicle for comparison-intent searchers.

Listicle · 1,600 words · comparison

THE ANGLE

A data-backed comparison that explicitly contrasts senior-led boutique agencies
(like Venture PR) with the junior-staffed models of larger firms, giving AI a
fresh, specific source to cite.

This is the highest-volume query where Venture PR is absent, and the current
cited pages are generic lists that don't address the senior-led differentiator.

PRIORITY BREAKDOWN
75  HIGH
Citation gap        +30
Demand              +5
Competitor density  +20
Format fit          +9
Reddit signal       +0
Crawler heat        +0

Sum of weighted signal contributions, capped at 100. Reddit and crawler signals
are skipped until those integrations are connected. They don't pull the score down.

WRITE THESE SECTIONS

The sub-questions AI expands this into - your outline and citation surface.

What makes a PR agency 'disruptive' for B2B SaaS?
How do senior-led agencies differ from junior-staffed firms?
What results can a B2B SaaS startup expect from a boutique PR firm?
How much does a senior-led PR agency cost vs. a large firm?
What should a B2B SaaS founder look for in a PR partner?
How do boutique agencies handle product launches and thought leadership?

EVIDENCE
SIGNAL        Recommended
ENGINES       No engine coverage observed yet.
POSITION      Unranked
AI VOLUME     500 monthly
COMPETITORS   6 brands cited
              Moxie Communications, Mission North, Hotwire, Outcast, InkHouse, BIG FISH PR
SOURCE CHAIN  Recommended
              Aug 4, 2026

[Talk to Agent]  [Dismiss]  [Write article]
```

Footer buttons:
- `Talk to Agent`, `title="⌥-click for full Agent workspace"`.
- `Dismiss`.
- `Write article` (primary). **Not clicked**, it spends credits.

Close behaviour: the close button removes the drawer and leaves the list state
unchanged. The URL does not change.

## 1.8 Settings modal (`/create`)

Opened by the header `Settings` button. Title: **Settings**.
Close button: aria-label `Close Settings`. There is no Save button in the modal;
the fields save in place.

Left navigation, with group headers:

- **BRAND**: Identity, Voice, Messaging, Audience
- **CONTENT**: Templates, Knowledge
- **PUBLISHING**: Destinations, Site index
- **AGENT**: Automation

### Identity

Header: `Identity`
Description: `Name, language, and the phrasing guardrails behind every draft.`

Fields:

| Field | Control | Placeholder | Observed value |
|---|---|---|---|
| Content name | text input | `Nike` | `Venture PR` |
| Default language | select | - | `en-US` |
| Description | textarea | `What the brand does, who it serves, and what it should be known for.` | `Venture PR is a strategic public relations agency that speci…` |
| Phrasing guardrails > Preferred | tag input | `AI visibility` | empty |
| Phrasing guardrails > Avoid | tag input | `game-changing` | empty |

Sub-copy under Phrasing guardrails: `Writing in English (US). Phrases to reach for, and ones to avoid.`
Under Preferred: `Press enter or comma to add.`
Under Avoid: `Tired or over-claimed language.`

Language select options, in order:
🌐 English, 🇺🇸 English (US), 🇬🇧 English (UK), 🇦🇺 English (Australia),
🇨🇦 English (Canada), 🇮🇳 English (India), 🇸🇬 English (Singapore),
🇮🇪 English (Ireland), 🇳🇿 English (New Zealand), 🇿🇦 English (South Africa),
🇩🇪 German, 🇦🇹 German (Austria), 🇨🇭 German (Switzerland), 🇫🇷 French,
🇨🇦 French (Canada), 🇧🇪 French (Belgium), 🇨🇭 French (Switzerland), 🇪🇸 Spanish,
🇲🇽 Spanish (Mexico), 🇦🇷 Spanish (Argentina), 🇨🇴 Spanish (Colombia),
🇨🇱 Spanish (Chile), 🇵🇹 Portuguese, 🇧🇷 Portuguese (Brazil), 🇮🇹 Italian,
🇳🇱 Dutch, 🇧🇪 Dutch (Belgium), 🇸🇪 Swedish, 🇩🇰 Danish, 🇳🇴 Norwegian,
🇫🇮 Finnish, 🇮🇸 Icelandic, 🇵🇱 Polish, 🇨🇿 Czech, 🇸🇰 Slovak, 🇭🇺 Hungarian,
🇷🇴 Romanian, 🇧🇬 Bulgarian, 🇬🇷 Greek, 🇭🇷 Croatian, 🇷🇸 Serbian, 🇸🇮 Slovenian,
🇪🇪 Estonian, 🇱🇻 Latvian, 🇱🇹 Lithuanian, 🇷🇺 Russian, 🇺🇦 Ukrainian,
🇯🇵 Japanese, 🇰🇷 Korean, 🇨🇳 Chinese (Simplified), 🇹🇼 Chinese (Traditional),
🇭🇰 Chinese (Hong Kong), 🇹🇭 Thai, 🇻🇳 Vietnamese, 🇮🇩 Indonesian, 🇲🇾 Malay,
🇵🇭 Filipino, 🇮🇳 Hindi, 🇸🇦 Arabic, 🇮🇱 Hebrew, 🇹🇷 Turkish, 🇮🇷 Persian.

### Voice

```
Voice
Bring in finished writing so drafts match your cadence and sentence shape.
[Re-analyze]

Samples  0
Bring in 3-8 finished pieces. Files, URLs, or pasted text.
[File] [URL] [Paste text]

No samples yet
Accepts PDF, DOCX, TXT, or Markdown. A voice profile builds automatically once a
few samples are processed.

Voice profile
A summary of what `/create` learned from your samples.
Add a few samples to generate a voice profile.
```

### Messaging

```
Messaging
CTA, positioning, compliance, and comparison context for decision-stage content.

Primary CTA
The commercial motion `/create` threads into high-intent sections.
CTA text | CTA URL | Instructions

Positioning
The sharp edges to surface when alternatives show up.
Differentiators   (One per line.)
Notes

Comparison set  0
Competitors `/create` keeps in frame for decision-stage work.
<long alphabetical competitor picker; first entries: 10Fold, 10Fold Communications,
5WPR, Abel Communications, Abernathy MacGregor, Accesswire, Adobe, Agility PR
Solutions, Airbnb, Airfoil Group, AirPR ... last entries: WPP, WriterAccess,
ZDNet, Zeno Group>

Compliance
Turn on for regulated categories that need careful claim language.
Off - turn on for regulated categories
```

### Audience

```
Audience
Buyer profiles and country-specific guidance that shape hooks and objections.

Audiences  0
Compact buyer or stakeholder profiles that ground hooks and objections.
[Add audience]
No audiences yet
Add the real buyer or stakeholder types `/create` should keep in view.

Markets  0
Country-specific phrasing, currency, and compliance overrides - only when you
publish globally.
[Add market]
One global voice
Add a market when language, currency, or compliance differs from the default.
Skip this if you publish in one region.
```

### Templates

```
Templates
The structures `/create` reaches for. Presets work out of the box.

Built-in presets  7
Always available - `/create` reaches for these by default.
```

| Preset | Sections | Description |
|---|---|---|
| Comparison Roundup | 8 sections | Product or service comparisons with clear recommendations. The most effective structure for "best of" queries that drive purchase decisions. |
| How-To Guide | 7 sections | Step-by-step instructions that are easy for LLMs to extract and cite. Ideal for tutorials, processes, and actionable guides. |
| Authority Explainer | 7 sections | Comprehensive explainer content that establishes topical authority. Perfect for defining concepts, explaining complex topics, and building subject matter expertise. |
| FAQ | 3 sections | Question-and-answer format for high-intent informational queries. Best when users ask several related questions around the same topic. |
| Problem-Solution | 7 sections | Troubleshooting content that addresses specific problems with multiple solutions. Perfect for support content and common issues. |
| Research Brief | 7 sections | Data-driven content with quotable findings and credible sources. Ideal for industry reports, trend analysis, and statistical content. |
| Case Study | 7 sections | Success story content with concrete metrics and replicable insights. Perfect for showcasing results and building credibility. |

```
Custom templates  0
Your own section logic and format rules. Optional - presets cover most needs.
[New template]
No custom templates
Skip this if presets work for you. Add a custom template only when you want your
own section logic or tighter format control.
```

### Knowledge

```
Knowledge
Source material and structured evidence that ground every draft.

Sources 0    Facts 0

Source documents
Decks, briefs, research, or internal docs `/create` can quote from.
[File] [URL] [Paste text]
No documents yet
Upload PDFs, paste text, or link a URL. `/create` retrieves passages from these
to ground claims with real evidence.
```

### Destinations

```
Destinations
Where drafts ship. Connect a CMS or code repo and set publishing defaults.
Open integrations →

Connected sites  0
Where drafts ship. Pick a default - or set per-piece on publish.
[Connect]
No connected sites yet
Connect a CMS or code destination so `/create` can publish directly.
[Connect site]
```

`Connect` and `Connect site` were not clicked.

### Site index

```
Site index
The sitemap, filters, and rules `/create` uses for internal linking.

Sitemap
The pages `/create` reads when it weaves in internal links and context.
[Scan]  Sitemap URL
0 pages indexed · Last scan Never

URL filters  0
Include or exclude URL patterns before indexing.
Off - add a filter to limit which URLs are indexed

Link rules  0
Auto-link trigger phrases to specific URLs in every draft.
Off - add a rule to auto-link a phrase

Indexed pages  0
A sample of pages the retriever can draw from.
No indexed pages yet
Run the sitemap scan and a sample of indexed pages will show here.
```

### Automation (agent)

```
Automation
Drafts and publishes for you. The agent watches your signals continuously and
drafts when it spots an opportunity worth writing about.

Pace
Up to this many drafts per week. The agent picks the strongest opportunities first.
Drafts per week:  [1] [3] [5] [Daily]

Signals  4
What the agent watches. Recommended signals are pre-selected for most brands.
[Manage signals]  Watching 4 of 13 signals.

Quality
Only keep drafts likely to get cited. Anything below the bar is archived and the
credit refunded.
Strict    - Only the strongest drafts ship
Balanced  RECOMMENDED - A healthy mix
Loose     - Ship more, review more

When a draft is ready
Where new drafts go and whether anything publishes automatically.
Review before publishing (Recommended) - Drafts queue in your Drafts tab. You publish on your own schedule.
Auto-publish strong drafts - High-confidence drafts ship to your CMS without review.
Keep as drafts only - Drafts stay in /create. Nothing publishes automatically.

PUBLISH DESTINATION
No site connected
Drafts stay in /create until you connect WordPress, Webflow, Shopify, or GitHub.
[Connect a site]

Ad-hoc triggers
Draft outside the regular pace when something specific happens: a competitor wins
a citation, a page goes stale, or traffic spikes.
[Add trigger]
No triggers yet. The agent will only draft on the regular pace above.

Credit safety
Pause automatically if your credit balance falls too low. This protects against
unexpected runs draining the account.
Pause if balance falls below [___] credits
```

`Manage signals` expands to a list (button label toggles to `Hide`):

RECOMMENDED

| Signal | Sub-line |
|---|---|
| Citation gaps | Prompts where competitors get cited and you don't |
| Crawler hot pages going stale | Pages AI bots love but you haven't refreshed |
| Prompt gaps | Tracked prompts with no answer of yours |
| Reddit citation candidates | Reddit threads AI engines are citing |

ADVANCED SIGNALS

| Signal | Sub-line |
|---|---|
| GA4 LLM referrals | AI traffic patterns to expand on |
| GA4 rewrites | AI traffic to existing pages worth a rewrite |
| Citation sub-queries | Spin-outs from your existing citations |
| Programmatic extensions | Templated expansions of cited content |
| Stale citations | Cited pages going stale |
| Rising prompts | Prompts with growing volume |
| Orphan pages | AI-bot-visited pages with no internal links |
| Emerging prompts | Brand-new prompt opportunities |
| LLM suggestions | Topics suggested by your tracked LLMs |

`Add trigger` opens an inline picker, header `Pick a trigger`:

| Trigger | Sub-line |
|---|---|
| A competitor is cited | Draft a response when a tracked competitor wins citations |
| A page is stale | Refresh published articles that haven't been touched in N days |
| Visibility drops | Draft new content when your score falls by N points |
| LLM referrals spike | Capitalise when AI traffic to your site jumps |
| A citation is lost | Re-engage when an article that was cited stops being cited |
| Prompt activity spikes | Draft when a tracked prompt sees a sudden volume increase |
| A new competitor appears | Draft a positioning piece when a new rival is detected |
| Branded query drops | Draft when interest in your brand falls in AI search |
| A seasonal window opens | Draft on a recurring date range (e.g. Black Friday) |

## 1.9 Drafts tab (`?stage=drafts`)

Toolbar keeps search, `Signal`, `View` and the credits counter. `View dismissed`
is absent.

Empty state:
- Title: **No drafts yet**
- Body: `Articles you queue from Ideas land here while they are generating or in draft.`
- Button: `Browse Ideas`

## 1.10 Live tab (`?stage=live`)

Toolbar adds a segmented filter: `All` | `Cited` | `Awaiting citation`.

Table headers, in order: `ARTICLE`, `STATUS`, `LIFECYCLE`, `Actions`.
The table body is empty. No empty-state text renders under the header row.

## 1.11 Campaigns tab (`?stage=campaigns`)

No toolbar. Empty state:
- Title: **No campaigns yet**
- Body: `A campaign is a topic you want AI engines to cite you for. Select a few
  related ideas and write them as one campaign; Trakkr measures coverage before
  and after.`
- Button: `Browse ideas`

## 1.12 Article editor route

`/content/articles/:id` redirects to `/create/articles/:id`.
With an unknown id the page shows:

- Title: **Article not found**
- Body: `It may have been deleted, or you might not have access to it.`
- Button: `Back to Create`

The account has 0 drafts and 0 live articles, so a populated editor was
**NOT OBSERVED**.

## 1.13 `/create` network surface

Host `api.trakkr.ai` unless stated. `{b}` = brand id, `{u}` = user id.

| Method | Path | Query | Response shape (inferred from the view) |
|---|---|---|---|
| GET | `/subscription/effective` | - | plan and entitlement object |
| GET | `/internal/platform-stats` | - | platform counters |
| POST | `/analytics/identify` | - | ack |
| GET | `/auth/session` | - | session object |
| GET | `/pages/config` | `brand_id={b}` | page config |
| GET | `/double/run/{b}` | - | run status |
| GET | `/users/me/mcp-token/sessions` | - | list |
| GET | `/users/admin-access` | - | boolean flags |
| GET | `/subscription/downgrade-changes` | - | list |
| GET | `/client/group-brands` | - | brand list |
| GET | `/subscription/sync` | `force=false` | subscription |
| GET | `/create/agent/settings` | `brand_id={b}` | agent settings (pace, signals, quality, publish mode, triggers, credit floor) |
| GET | `/create/agent/runs` | `brand_id={b}&limit=1` | last run |
| GET | `/competitors/{b}` | - | competitor list |
| GET | `/create/pipeline-counts` | `brand_id={b}` | `{ideas, drafts, live, campaigns}` counts for tab badges |
| GET | `/create/dashboard` | `brand_id={b}&days=30` | cited stat, headline metrics |
| GET | `/create/opportunities` | `brand_id={b}&state=gap&group_by=campaign&sort=priority&sort_dir=desc&limit=50` | idea rows, grouped by campaign |
| GET | `/create/campaigns` | `brand_id={b}` | campaign list |
| GET | `/sites/` | `brand_id={b}` | connected destinations |
| GET | `/subscription/article-credits` | `user_id={u}&brand_id={b}` | credits available (25) |
| GET | `/agent/automations` | `brand_id={b}` | automations list |
| GET | `/agent/needs-you` | `brand_id={b}` | items needing review |

Supabase REST (`https://vhdphutoswgscnkskrcj.supabase.co/rest/v1/...`):

| Table | Query |
|---|---|
| `users` | `id=eq.{u}&select=<~50 columns incl. plan, trial, onboarding_checklist>` |
| `rpc/get_pending_team_invite_for_current_user` | - |
| `brand_members` | `user_id=eq.{u}&select=role,brand_id,brands(*,brand_groups(id,name,color,position))` |
| `team_clients` | `user_id=eq.{u}&status=eq.active&select=brand_id,can_export,brands(*)` |
| `content_settings` | `select=*&brand_id=eq.{b}` |
| `templates` | `select=*&or=(user_id.eq.{u},is_default.eq.true)&order=updated_at.desc` |
| `reports` | `select=id&brand_id=eq.{b}&status=eq.completed` |

Analytics hosts also called: `trakkr.ai/ingest/capture/` (PostHog proxy, POST),
`e.trakkr.ai/*` (PostHog assets, flags, `/i/v0/e/`), `widget.intercom.io`,
Google Ads / GTM, Facebook pixel, LinkedIn Insight.

---

# 2. `/optimize`

- URL: `https://trakkr.ai/optimize`
- `document.title`: `Optimize`
- H1: **Optimize**
- Sub-line: `venturepr.com · 53 pages scanned · 3d ago · next scan Mon 07:00 UTC`.
  `venturepr.com` is a link, href `https://venturepr.com`.

## 2.1 Header actions

| Control | Type | Note |
|---|---|---|
| Settings | button | opens the Scan settings modal (2.9) |
| Export | button | not clicked, downloads a file |
| Inspect URL | button | opens the inspect palette (2.8) |

## 2.2 Tabs

| Tab | Badge | URL |
|---|---|---|
| Findings | 7 | `/optimize` (default) |
| Pages | - | `/optimize?tab=pages` |
| History | - | `/optimize?tab=history` |

## 2.3 Findings tab - priority banner

```
PRIORITY FINDING

29 pages have a missing or duplicate title or description. Fix titles and
descriptions first, it is the biggest thing holding this site back.

Evidence: 29 pages have a missing or duplicate title or description

[Read the summary]  [Fix it for me]
```

`Fix it for me` spends agent credits. It was recorded and **not clicked**.

## 2.4 AI JOURNEY gate cards

Section heading: `AI JOURNEY`, with the qualifier `4 of 6 stages measured`.
Six cards, in order. Each card is `LABEL / value / caption`.

| Card | Value | Caption |
|---|---|---|
| AI CAN REACH | `31 / 31` | `all pass` |
| BOTS FETCH | `–` | `not measured yet` |
| AI CAN READ | `31 / 31` | `all pass` |
| MATCHES ASKS | `0 / 31` | `estimated, not observed` |
| AI CITES | `5 / 68` | `63 never cited` |
| PEOPLE ARRIVE | `–` | `not measured yet` |

Footnote under the cards:
`This journey has reusable evidence for 70 of the 53 pages in this scan. Each
stage uses the pages measured there.`

Two links follow:
- `Connect crawler tracking` -> `/traffic/crawler?tab=connections`
- `Connect Search Console` -> `/traffic/search-console`

## 2.5 "What to fix first"

Toolbar: search box (placeholder `Search checks...`), `Filter` button
(aria-label "Narrow the checks"), count `7 of 7`, `Priority` sort menu,
`Prompts` view toggle.

Column headers, in order: `WORK ↕`, `EVIDENCE`, `SEVERITY ↓`, `PAGES ↕`, `POINTS ↕`,
then an unlabelled action column.
Sort buttons carry aria-labels "Sort by work", "Sort by what matters first",
"Sort by pages", "Sort by points".

| WORK | EVIDENCE | SEVERITY | PAGES | POINTS | Action |
|---|---|---|---|---|---|
| Fix titles and descriptions | 29 pages have a missing or duplicate title or description | High | 29 | +3.9 | Fix it for me |
| Add substance to thin pages | 39 pages carry too little text for a bot to quote | Medium | 39 | +5.2 | How to fix |
| Answer questions directly on the page | 9 pages have no question-shaped passage an AI can lift | Medium | 9 | +1.2 | How to fix |
| Simplify the writing on dense pages | 7 pages read above grade 14 | Medium | 7 | +0.9 | How to fix |
| Add Open Graph tags | 10 pages have no Open Graph tags | Low | 10 | +1.3 | Fix it for me |
| Fix the heading order | 2 pages skip a heading level or have no H1 | Low | 2 | +0.3 | How to fix |
| Add Twitter card tags | 1 page has no Twitter card | Low | 1 | +0.1 | Fix it for me |

Row behaviour: the row is a button, aria-label `Open <Severity> · <Work>`.
It opens the finding drawer. Rows with an automatic fix show `Fix it for me`;
the rest show `How to fix`.

Footer of the list:
`Checks score 87` (button) and the line `clearing these 7 takes it to 100  +13`.
The `Checks score 87` button switches the page to the History tab.

Below the list:

```
NOTES ON THIS SCAN  1
llms.txt is present
No AI platform reads this file today. It is a bet on the standard, not a result.

PLATFORM     Next.js
ROBOTS.TXT   Open to AI
SITEMAP      Found
LLMS.TXT     Published  (no AI platform reads it yet)
CDN          Vercel
```

### Filter menu ("Narrow the checks")

```
SEVERITY
Critical 0 | High 1 | Medium 3 | Low 3

FUNNEL STAGE
AI can read 3 | Matches asks 2 | People arrive 2

CATEGORY
Discoverability 3 | Content quality 2 | AI readiness 1 | Content structure 1
```

### Priority menu

Items: `Priority`, `Points`, `Pages`, `Name`.

### Prompts toggle

The button aria-label is "The tracked prompts this site can already answer".
It replaces the checks list with a prompts table.

- Button back to the checks list: `Back to checks`.
- Column headers: `TRACKED PROMPT`, `BEST PASSAGE`, `MATCH`.
- Empty state: title **No prompts scored yet**, body `Once a scan stores its
  passages, every tracked prompt shows the best answer your site holds for it.`

## 2.6 Finding drawer

Header line: `<SEVERITY> · <FUNNEL STAGE>` plus a pager `N of 7`.
Navigation buttons: `Previous check (k)`, `Next check (j)`, `Close check`.

Common blocks: title, evidence line, three stat tiles
(`PAGES <n> of 53 crawled`, `POINTS +<n> of your checks score`,
`TIME <range> typical fix`), one or more explanation paragraphs, an optional
"wrong if" caveat, `WHERE IT SHOWS UP` with an `Open these pages` button and a
path breakdown, `HOW TO FIX` with numbered steps, a file-path chip, and a code
block with a `Copy to clipboard` button.

Footer: `Copy for a ticket · Send to dev · Mark in progress · Ignore`, then
`Mark fixed`, then `Fix it for me` on findings that support it.

### 1 of 7 - HIGH · MATCHES ASKS - Fix titles and descriptions

```
29 pages have a missing or duplicate title or description
PAGES 29 of 53 crawled | POINTS +3.9 of your checks score | TIME 1-2 hours typical fix

Most of the 29 pages failing meta tags are simply over- or under-length, a
template correction, not a content problem. Fix the homepage, case studies, and
blog patterns once and they apply site-wide.

Homepage description is 163 chars (over 160); case study titles are 17-24 chars
(e.g. 'GuRu | Venture PR'); blog titles run 86-105 chars (over 70). No repeated
titles/descriptions were found.

Wrong if these pages are paginated variants that share a title on purpose.

WHERE IT SHOWS UP        [Open these pages]
/blog/*                  19 pages
/case-studies/*          7 pages
/published-articles/*    3 pages
[Show the 29 pages]

HOW TO FIX  Next.js guidance
1 Use the metadata export in your page files
2 Or use generateMetadata for dynamic pages
3 Ensure meta tags are rendered server-side
app/[page]/page.tsx
  // app/page.tsx
  export const metadata = {
    title: 'Page Title | Brand Name',
    description: 'Your compelling 150-160 character description here.',
  }

  // For dynamic pages
  export async function generateMetadata({ params }) {
    const product = await getProduct(params.id)
    return {
      title: product.name,
      description: product.description.slice(0, 160)
    }
  }
```

### 2 of 7 - MEDIUM · AI CAN READ - Add substance to thin pages

```
39 pages carry too little text for a bot to quote
PAGES 39 of 53 crawled | POINTS +5.2 | TIME 3-6 hours typical fix

39 pages flag as sparse, but several are substantial guides reporting just 2
readable words, the body text is loaded client-side, invisible to non-JS crawlers
and many AI bots.

https://venturepr.com/blog/tech-pr-services-complete-guide-for-2026 returns ratio
12.5 (2 readable words) yet 14 headings, 5 FAQ headers, BlogPosting schema and a
detailed 2026 PR guide, body content hydrates via JS, not server HTML.

Wrong if these are index or navigation pages with nothing to say.

Content Density: shown as Thin (2 readable words) on ~39 pages, likely
Substantial content present but delivered via client-side hydration · The crawler
can't read JS-hydrated body text, so substantive guides register near-zero word
counts despite rich content in headings, schema, and FAQ sections.

WHERE IT SHOWS UP        [Open these pages]
/blog/*                  31 pages
/published-articles/*    7 pages
/contact-us              1 page
[Show the 39 pages]

HOW TO FIX  Next.js guidance
1 Ensure content is rendered server-side, not client-only
2 Add more textual content to your pages
3 Use MDX for rich content in documentation/blog pages
4 Verify content is in the initial HTML with View Source
Where: Page components and MDX files
```

### 3 of 7 - MEDIUM · MATCHES ASKS - Answer questions directly on the page

```
9 pages have no question-shaped passage an AI can lift
PAGES 9 of 53 crawled | POINTS +1.2 | TIME 2-4 hours typical fix

AI systems love content formatted as direct answers: FAQs, how-to lists, and
clear definitions. These formats make it easy for AI to extract and cite your
content in responses.

WHERE IT SHOWS UP        [Open these pages]
/published-articles/*    5 pages
/blog                    1 page
/case-studies/guru       1 page
/contact-us              1 page
/our-work                1 page
[Show the 9 pages]

HOW TO FIX  Next.js guidance
1 Create FAQ component with proper semantic markup
2 Include FAQPage schema as JSON-LD
3 Use dl/dt/dd elements for definition lists
4 Ensure content renders server-side
components/FAQ.tsx   <FAQ component with FAQPage JSON-LD and dl/dt/dd markup>
```

### 4 of 7 - MEDIUM · AI CAN READ - Simplify the writing on dense pages

```
7 pages read above grade 14
PAGES 7 of 53 crawled | POINTS +0.9 | TIME 1-2 hours typical fix

Readability issues affect how AI systems and users understand your content. Poor
heading structure (missing H1s, wrong hierarchy) and typography issues make it
harder for AI crawlers to extract key information and may cause your content to
be skipped or misinterpreted.

Wrong if the audience is technical and expects the density.

WHERE IT SHOWS UP    [Open these pages]
/case-studies/*      5 pages
/our-work            1 page
/privacy-policy      1 page
[Show the 7 pages]

HOW TO FIX  Next.js guidance
1 Use semantic HTML heading tags (h1, h2, h3) in your JSX
2 Create reusable heading components with proper styling
3 Use CSS modules or Tailwind for consistent typography
4 Consider using a typography scale system
components/ directory  <Heading.tsx sample with H1 and H2 components>
```

### 5 of 7 - LOW · PEOPLE ARRIVE - Add Open Graph tags

```
10 pages have no Open Graph tags
PAGES 10 of 53 crawled | POINTS +1.3 | TIME 1-2 hours typical fix

Ten pages, the homepage and every case study, go out without a social-preview
image, so LinkedIn and X shares render as bare text links instead of rich cards.

Homepage and case-study pages report 'Missing: og:image' while the /blog landing
page serves a default og-default.png properly. Case-study URLs each include only
og:title and og:description.

Cosmetic in chat apps. No known effect on whether AI cites the page.

WHERE IT SHOWS UP    [Open these pages]
/case-studies/*      8 pages
/                    1 page
/published-articles/the-brand-as-publisher-playbook-why-editorial-discipline-is-your-only-defense-in-the-ai-era  1 page
[Show the 10 pages]

HOW TO FIX  Next.js guidance
1 Use the metadata export in your page files
2 Include openGraph property in metadata
3 Ensure images are absolute URLs
4 Verify with Facebook debugger after deployment
app/[page]/page.tsx  <metadata export with full openGraph block>
```

### 6 of 7 - LOW · AI CAN READ - Fix the heading order

```
2 pages skip a heading level or have no H1
PAGES 2 of 53 crawled | POINTS +0.3 | TIME 2-4 hours typical fix

AI systems use heading tags (H1, H2, H3) to understand your content hierarchy.
Without proper headings, your pages may be misinterpreted or skipped entirely
when AI crawlers analyze your site.

Wrong if these are app screens where the H1 is set after the page loads.

WHERE IT SHOWS UP  [Open these pages]
https://venturepr.com/privacy-policy
https://venturepr.com/cookie-policy

HOW TO FIX  Next.js guidance
1 Audit your page components for heading usage
2 Ensure only one <h1> per page (usually in your layout or page component)
3 Use heading components to enforce hierarchy
4 Consider using eslint-plugin-jsx-a11y for heading validation
Page and layout components  <correct heading hierarchy sample>
```

### 7 of 7 - LOW · PEOPLE ARRIVE - Add Twitter card tags

```
1 page has no Twitter card
PAGES 1 of 53 crawled | POINTS +0.1 | TIME 30 min - 1 hour typical fix

Twitter Cards control how your content appears when shared on X (Twitter).
Similar to Open Graph, these meta tags help define your content's appearance and
can improve click-through rates.

Cosmetic in chat apps. No known effect on whether AI cites the page.

WHERE IT SHOWS UP  [Open these pages]
https://venturepr.com/published-articles/the-brand-as-publisher-playbook-why-editorial-discipline-is-your-only-defense-in-the-ai-era

HOW TO FIX  Next.js guidance
1 Include twitter property in your metadata export
2 Next.js can auto-generate from openGraph if not specified
3 For control, explicitly define twitter metadata
4 Verify with Twitter Card Validator
app/[page]/page.tsx  <metadata export with twitter card block>
```

## 2.7 "Read the summary" modal

```
VENTUREPR.COM
A quick read
Your latest audit, in plain English

Venture PR has a genuinely strong foundation: 100% structured data and
accessibility scores, an explicitly open robots.txt welcoming every major AI
crawler, and a polished llms.txt. The one thing holding the site back is that
article and case-study body content is hydrated by JavaScript after the initial
page load - so any crawler that doesn't execute JS, including several AI bots,
sees an almost-empty shell. The fix is a delivery change, not a content rewrite:
push your article bodies into the server-rendered HTML, then tighten meta lengths
on the 29 affected pages.

Your robots.txt and llms.txt welcome every major AI crawler - no blocks declared.

Your robots.txt explicitly allows GPTBot, ClaudeBot, PerplexityBot,
Google-Extended, and CCBot on all public pages, and llms.txt is present and
clean. We couldn't confirm live crawler reachability from our own servers (our
requests were rejected at the edge), but there is no declared block and no
evidence of an intentional AI-crawler exclusion. If you want certainty, check
your CDN logs for verified-bot traffic from OpenAI's confirmed IP range.

WHERE TO START
1 Server-render blog article bodies so crawlers see them            [Plan]
2 Standardize meta title and description lengths in your templates  [Plan]
3 Host og:image assets on your own domain, not Airtable's CDN       [Plan]

Want to dig into any of this?  [Ask the Agent]
```

Each `Plan` button has aria-label "Add to plan". Close button aria-label: `Close`.

## 2.8 "Inspect URL" palette

```
INSPECT ANY PUBLIC URL
[input placeholder: venturepr.com/path]   [Inspect]  (submit, disabled while empty)
```

Before the recent list loads the palette shows:
`No recent inspections yet. Type a path from venturepr.com or paste another public URL.`

After it loads, a section `Other sites` lists recent inspections. Each row is a
button with URL, relative time, and a score. Observed rows:

| URL | Age | Score |
|---|---|---|
| www.venturepr.com/ | 10 minutes ago | 84 |
| www.venturepr.com/blog/compare-executive-positioning-strategies-for-tech-industry-leaders | about 7 hours ago | 36 |
| www.venturepr.com/blog/top-firms-for-placing-op-eds-in-tier-one-publications | about 7 hours ago | 25 |

## 2.9 Scan settings modal

```
Scan settings
How this site gets crawled, and how often

AUDIT URL   venturepr.com

CRAWL
Pages per scan   Growth plan   [100] [250] [500]
Priority URLs 0/20   Always included in every scan.   [Add]
Exclude patterns 0/30   Skip URLs matching these paths.
  /tag/*  /author/*  /page/*  /category/*   [Add]

SCHEDULE
Weekly scans   Every Monday at 12:30 PM
Day   <Sunday..Saturday select>
Time  <24 options, 5:30 AM (00:00 UTC) .. 4:30 AM (23:00 UTC)>
Next: In 4 days     Last: 3d ago
Times shown in your local timezone

[Scan now]   [Cancel]   [Save changes]
```

## 2.10 Pages tab (`?tab=pages`)

Four stat tiles:

| Tile | Value | Caption |
|---|---|---|
| AVERAGE SCORE | 87/100 | across all 53 pages in this view |
| PAGES | 53 | 7 deep-analyzed |
| ISSUES ON PAGES | 172 | 86 critical · 86 warning |
| CRAWLS 30D | `–` | `Connect tracking →` link to `/traffic/crawler?tab=connections` |

Loading state (observed for about 2 seconds): the same tiles render with `–`,
captions `across all 0 pages in this view`, `none deep-analyzed yet`, and the
row count `0 of 0`.

Toolbar: search box (placeholder `Search pages...`), `All pages` scope menu,
`Filter` button (aria-label "Narrow the pages"), count `53 of 53`,
`Impact` sort menu, `Add pages` button.

`All pages` menu: `All pages 53`, `Needs work 53`, `Passing 0`.

`Impact` menu items: `Impact`, `Score`, `Issues`, `Words`, `URL`, `Type`.

`Filter` menu:

```
TYPE
Blog 31 | Other 9 | Case-study 8 | Legal 2 | Contact 1 | Homepage 1 | Service 1

SCORE
80 and above 52 | 60 to 79 1 | 40 to 59 0 | Below 40 0

ANALYSIS
AI analyzed 7 | Not analyzed yet 46
```

Column headers, in order: `URL ↕`, `WHAT'S WRONG`, `TYPE ↕`, `SCORE ↕`,
`WORDS ↕`, `ISSUES ↕`.
Sort aria-labels: "Sort by url", "Sort by type", "Sort by score", "Sort by words",
"Sort by issues".

Rows are of two kinds.

**Single page row** - aria-label `Open <page title>`. Cells: page title on line 1,
path on line 2; a comma list of short issue names with a `+N more` suffix; type
chip; score; word count with thousands separator; issue count.

**Template group row** - aria-label `Expand N pages under <pattern>`. Cells:
pattern (for example `/case-studies/*`), sub-line `N pages on one template`, a
comma list of sample slugs; then the aggregate type, score, words and issues.

Observed rows:

| URL / pattern | WHAT'S WRONG | TYPE | SCORE | WORDS | ISSUES |
|---|---|---|---|---|---|
| `Public Relations for Disruptive Companies \| Venture PR` `/` | title or description, hard to read, no Open Graph +1 more | Homepage | 88 | 2,544 | 4 |
| `/case-studies/*` (8 pages on one template; guru, audyence, loomly) | - | Case-study | 82 | 408 | 5 |
| `/published-articles/*` (6 pages; momentum-over-moments…, the-future-of-pr…, the-brand-as-publisher…) | - | Other | 82 | 2 | 4 |
| `/*` (3 pages; our-work, published-articles, process) | - | Other | 89 | 931 | 3 |
| `/blog/*` (30 pages; what-is-a-public-relations-agency…, best-agencies-for-executive-thought-leadership…, top-public-relations-partners…) | - | Blog | 88 | 2 | 3 |
| `PR Insights & Strategy Notes \| Venture PR` `/blog` | thin text, no answer format, hard to read | Blog | 87 | 6 | 3 |
| `Contact Venture PR \| Venture PR` `/contact-us` | thin text, no answer format, hard to read | Contact | 87 | 57 | 3 |
| `PR Services for Disruptive Tech & SaaS Brands \| Venture PR` `/services` | hard to read, no answer format | Service | 94 | 2,544 | 2 |
| `Privacy Policy \| Venture PR` `/privacy-policy` | heading order, hard to read, title or description | Legal | 84 | 5,103 | 3 |
| `Cookie Policy \| Venture PR` `/cookie-policy` | heading order, title or description, hard to read | Legal | 88 | 1,349 | 3 |

Footer line: `53 of 53 pages · 4 groups collapsed`.

`Add pages` modal:

```
Add pages
Paste blog or product URLs, one per line, or upload a CSV.
[textarea]   [Upload CSV]   0 valid
[Cancel]  [Analyze pages]
```

### Page drawer

Opening a page row shows a drawer. Buttons: `Previous page (k)`, `Next page (j)`,
`Close page`, `Watch this page`, an unlabelled icon button, and `Open full record`.

```
HOMEPAGE · YOURS          1 of 10
Public Relations for Disruptive Companies | Venture PR
venturepr.com   (link to https://venturepr.com)

AI understands this page but it doesn't match what people ask. (estimated)

AI CITATIONS  –   30 days
BOT FETCHES   0   30 days
AI VISITS     0   30 days

NEXT MOVE
No work on this page yet. Open the full record to inspect its journey.
[Open full record]
```

`Open full record` navigates out of `/optimize` to
`/pages/home?url=https%3A%2F%2Fventurepr.com` (title `Trakkr`). That page is
outside this slice; its head content is:

```
Pages
Public Relations for Disruptive Companies | Venture PR
venturepr.com · homepage · yours · last seen Aug 3
AI understands this page but it doesn't match what people ask. (estimated)
AI CITATIONS – / BOT FETCHES – / AI VISITS –
HOW AI USES THIS PAGE  3 of 6 checks pass, 2 not measured
```

### `/optimize/audits/:auditId/pages/:pageId`

The route exists. `document.title` becomes `Page Analysis`.
No link to it was found in the observed UI; the Pages tab opens the drawer instead.
With `auditId=9af6b34b-51c8-48b1-a2f3-804000ed097f` and `pageId=1` the page shows:

```
Back to pages
Page not found
This page may have been removed, or the link may be out of date.
[Back to Optimize]
```

The populated form of this route is **NOT OBSERVED**.

## 2.11 History tab (`?tab=history`)

Four stat tiles:

| Tile | Value | Caption |
|---|---|---|
| CHECKS SCORE | 87/100 | - |
| CHANGE | Steady | - |
| BEST | 87 | over the last 90 days |
| SCANS | 2 | over the last 90 days |

```
SCORE TREND   Last 90 days
Steady at 87
87 → 87
[See what changed]
x-axis: 28 Jul .. 3 Aug     y-axis: 80, 85, 90
```

```
PAST SCANS  2
[All scans]  [Filter]  2 of 2  [Date]
```

Column headers, in order: `DATE ↓`, `WHAT CHANGED`, `SCORE ↕`, `CHANGE ↕`,
`PAGES`, `OPEN CHECKS`, then an action column.

| DATE | WHAT CHANGED | SCORE | CHANGE | PAGES | OPEN CHECKS | Action |
|---|---|---|---|---|---|---|
| 3 Aug 2026 (chip `Latest`) | Ran automatically, the score held | 87 | 0 | 53 | 7 | Compare |
| 28 Jul 2026 | Run by hand, the first scan in this range | 87 | `–` | 53 | 7 | Compare |

Row aria-label: `Open the scan from <date>`.

## 2.12 `/optimize` network surface

Audit id observed: `9af6b34b-51c8-48b1-a2f3-804000ed097f`.
Previous audit id: `f8e66193-1382-4342-b342-2c4e0bd497df`.

| Method | Path | Query |
|---|---|---|
| GET | `api.trakkr.ai/api/site-optimization/audit/{auditId}` | `brand_id={b}` |
| GET | `api.trakkr.ai/api/site-optimization/synthesis/{auditId}` | `brand_id={b}` (the "quick read" text) |
| GET | `api.trakkr.ai/api/site-optimization/delivery-health/{auditId}` | `brand_id={b}` |
| GET | `api.trakkr.ai/api/site-optimization/prompt-coverage/{auditId}` | `brand_id={b}` (Prompts view) |
| GET | `api.trakkr.ai/api/site-optimization/crawler-state` | `brand_id={b}&site_url=https%3A%2F%2Fventurepr.com` |
| GET | `api.trakkr.ai/optimise/brands/{b}/destinations` | - |
| GET | `api.trakkr.ai/optimise/brands/{b}/proposal-summary` | - |
| GET | `api.trakkr.ai/opportunity-pool` | `brand_id={b}&kind=audit_fix,audit_issue,audit_check&limit=6` |
| GET | `api.trakkr.ai/crawl-profiles/{b}` | - |
| GET | `api.trakkr.ai/pages/funnel` | `brand_id={b}` (the six gate cards) |
| GET | `api.trakkr.ai/sites/platforms` | - |
| POST | `api.trakkr.ai/pages/materialize-audit` | - |
| GET | `api.trakkr.ai/api/page-analysis/manual-pages` | `brand_id={b}&limit=200` |
| GET | `api.trakkr.ai/crawler/submit-to-search/status` | `brand_id={b}&days=1&status=success` |
| GET | `api.trakkr.ai/pages/record` | `brand_id={b}&url=<page url>` (fires when a page drawer opens) |
| GET | `api.trakkr.ai/proof/feed` | `brand_id={b}` |
| POST | `api.trakkr.ai/api/activation/track` | - |

Supabase REST:

| Table | Query |
|---|---|
| `audits` | `brand_id=eq.{b}&status=in.(pending,crawling,analyzing,generating)&order=created_at.desc&limit=1` |
| `audits` | `brand_id=eq.{b}&status=in.(complete,failed)&archived_at=is.null&order=created_at.desc&limit=1` |
| `audits` | `select=id,overall_score,created_at,pages_crawled,critical_issues,high_issues&…&id=neq.{auditId}&limit=1` |
| `audits` | `select=id,overall_score,pages_crawled,critical_issues,high_issues,medium_issues,low_issues,url,runtime_seconds,config,created_at&…&limit=20` |
| `audits` | `select=id,overall_score,critical_issues,high_issues,medium_issues,created_at&…&order=created_at.asc` (trend chart) |
| `audit_issues` | `select=*&audit_id=eq.{auditId}` |
| `audit_issues` | `select=check_name,category,severity,title&audit_id=eq.{auditId}` (both audits, for compare) |
| `audit_schedules` | `select=*&brand_id=eq.{b}` |

---

# 3. `/automations`

- URL: `https://trakkr.ai/automations`
- `document.title`: `Automations`
- H1: **Automations**
- Sub-line: `0 running · 1 draft · 0 found this month`
- Header action: `New automation` button.

## 3.1 Automation table

Column headers, in order: `NAME`, `FLOW`, `FOUND`, `LAST`, `AUTONOMY`.

| NAME | FLOW | FOUND | LAST | AUTONOMY |
|---|---|---|---|---|
| ChatGPT or Claude saw your launch | Draft | `–` | `–` | Tells you |

Row behaviour: the row is a button with the automation name as its aria-label.
It navigates to `/automations/rules/<id>`.
A trailing overflow button carries aria-label
`Actions for ChatGPT or Claude saw your launch`.

Row overflow menu:

| Item | Shortcut |
|---|---|
| Open | `↵` |
| Rename | - |
| Duplicate | - |
| Rehearse last 30 days | - |
| Delete | - |

`Delete` was recorded and **not clicked**.

## 3.2 Pattern gallery

```
Start with a draft Agent
Choose a setup. Nothing runs until you review and turn it on.
[Build your own]
```

Four pattern cards. Each card has the link text `Use pattern →`, a title, and a
description. aria-labels are `Use <name> pattern`.

| Pattern | Description |
|---|---|
| Citation guard | Checks the pages AI already trusts and suggests a fix when one becomes unhealthy. |
| Comparison watcher | A competitor moves. Trakkr brings you the comparison page most worth improving. |
| Weekly digest | Every Monday, checks tracked prompts and external sources for the best citation wins. |
| Crawler health | Each morning, check whether AI crawlers are failing or going quiet on your site. |

## 3.3 `/automations/new`

- `document.title`: `New automation`
- Breadcrumb: `Automations` (button) | `Untitled automation`
- Eyebrow: `NEW AUTOMATION`
- H1: **What should Trakkr keep an eye on?**
- Body: `Describe it, or start from a pattern. Either way you land on the canvas,
  and nothing turns on until you say so.`
- Text input, placeholder `Watch my compare pages and tell me in Slack when one slips`.
- Button `Draft the flow` (aria-label "Draft the flow").
- Section heading `START FROM A PATTERN` with the same four pattern cards.
- Bottom button: `Or start empty and build block by block.`

### Pattern presets, as they load on the canvas

| Pattern | Schedule line | WATCH | CHECK | ACT | TELL |
|---|---|---|---|---|---|
| Citation guard | `daily · 06:00 UTC` | Top cited pages / 5 pages | Material change / material | Suggest the improvement / suggest only | In-app / 1 channel |
| Comparison watcher | (none) | Competitors and comparison pages / 305 competitors | A competitor moves / it moves more than 5% | Suggest the improvement / suggest only | In-app / 1 channel |
| Weekly digest | `weekly · Monday · 06:00 UTC` | Tracked prompts / 23 prompts | Material change / the result changed since the last check | (no ACT step) | In-app / 1 channel |
| Crawler health | `daily · 06:00 UTC` | AI crawler activity / ready | Material change / material | Fix what is broken / tells you | In-app / 1 channel |

Each loads with the status chip `Draft` and the header buttons `Cancel` and
`Review & turn on`. `Review & turn on` was **not clicked**.

## 3.4 Builder canvas ("Build your own" / "start empty")

Empty start produces a four-step flow named `Watch 5 cited pages`.

Header: breadcrumb `Automations` | automation name (editable button) |
status chip `Draft` | `Cancel` | `Review & turn on` (disabled until setup is done).
A validation line sits under the header: `Finish setting up Top cited pages.`
A schedule chip shows `daily · 06:00 UTC`.

Canvas: four node cards on one horizontal row, joined by connector lines.
Between each pair there is a small `+` button, aria-label `Insert a step`.
Bottom left: a command input `Describe a change: "also watch Puma"` with a `⌘J` badge.
Bottom right: `−` (Zoom out), zoom percentage (`71%`), `+` (Zoom in), `Fit`.
Top right of the canvas there are two view buttons, `Flow` and `Settings`; both
render at viewport top 0 and their panels were **NOT OBSERVED**.

Node card layout: kind label (`WATCH`, `CHECK`, `ACT`, `TELL`), a `set up`
warning chip when incomplete, the current selection in bold, and a mono sub-line.

Selecting a node opens the right inspector. Each inspector ends with
`Use these settings` / `You can change them later.`, a `DRY RUN your real data`
block with `Run with real data` (disabled while setup is incomplete, helper text
`Finish setup to test with real data.`), and `Remove this step`.

### WATCH inspector

`Set` options:

- your top cited pages
- all owned pages
- tracked prompts
- competitors and comparison pages
- AI crawler activity
- tracked subreddits

`Top` sub-control lists the matched pages, for example:

| Path | Citations |
|---|---|
| /blog/best-pr-agencies-for-consumer-electronics-and-hardware-launches | 18 citations |
| /blog/compare-leading-robotics-and-ai-hardware-public-relations-firms | 12 citations |
| /blog/best-alternatives-to-large-pr-firms-for-tech-founders | 9 citations |

### CHECK inspector

`Runs` options (17):

Every day, Every Monday, Every month, When visibility moves, When a rank moves,
When perception shifts, When the audit score drops, When a citation appears,
When a prompt has no answer from you, When something worth doing turns up,
When a competitor moves, When a competitor is added, When research finishes,
When a report is ready, When an article is written, When an article goes live,
When a campaign finishes, When work is created, When work is finished.

`Condition` options (schedule-driven check): `the check is due`,
`the result changed since the last check`.
`Condition` options (event-driven check, seen on the saved rule):
`the configured rule matches`, `the event occurs`.

### ACT inspector

`Work` options:

- Technical fixes
- Page improvements
- Content refreshes
- New content
- Getting listed
- Community replies

`Focus` control follows `Work`. Its option list was **NOT OBSERVED**.

`AUTONOMY` ladder, caption `trust earns the next rung`:

| Level | Description |
|---|---|
| Tells you | It tells you what it saw. Nothing else happens. |
| Suggest only | It brings findings. Nothing changes without you. |
| Prepare drafts | It prepares the work. You approve before anything ships. |
| *(divider)* | `everything below changes your site` |
| Do it, then tell me | It makes the change, tells you right away, and you can revert. |
| Handle it | Unlocks after ten clean runs. |

Current value renders under the ladder (observed: `Suggest only`).

### TELL inspector

- `In-app` - `Always on`
- `+ Slack`
- `+ Email`
- `+ Webhook`

### "Insert a step" menu

```
WATCH
Pages        Your pages, ranked how you choose
Competitors  Rival pages and moves
Prompts      Tracked answers across platforms
Crawlers     AI bots on your site

CHECK
New citation      A source starts citing the brand
New compare page  A rival ships a versus page
Daily check       Inspect the selected set each morning

ACT
Draft a fix       A content change, ready to review
Refresh content   Update stale facts on a page

TELL
Slack    A channel you choose
Email    Morning, batched
Webhook  Anywhere else
```

## 3.5 `/automations/rules/:id`

Observed id: `f034ab7c-fadf-4a47-87c9-83731cab7a5b`.
`document.title` becomes the automation name.

```
Automations | ChatGPT or Claude saw your launch
View only · some settings need the legacy editor
[Open legacy editor]
on change

WATCH  AI crawler activity          ready
CHECK  A new AI crawler shows up    the configured rule matches
ACT    Report it                    tells you
TELL   In-app + Slack               2 channels
```

The canvas is read-only. The inspector shows the same `Runs` list as the builder,
`Condition` options `the configured rule matches` / `the event occurs`, and a
`DRY RUN your real data` block with `Run with real data`.
The legacy editor was **NOT OBSERVED**.

## 3.6 `/automations/agent/:id`

The route exists. With an unknown id
(`00000000-0000-0000-0000-000000000000`) `document.title` is `New automation`
and the page renders the breadcrumb `Automations`, the name `New automation`,
and the chip `Draft`, with no flow steps. The account has no agent automation,
so a populated view is **NOT OBSERVED**.

## 3.7 `/automations` network surface

| Method | Path | Query | Purpose |
|---|---|---|---|
| GET | `api.trakkr.ai/automations` | `brand_id={b}` | table rows |
| GET | `api.trakkr.ai/automations/patterns` | `brand_id={b}` | the four pattern cards |
| GET | `api.trakkr.ai/automations/scope-preview` | `brand_id={b}` | WATCH counts (5 pages, 305 competitors, 23 prompts) and the top-cited page list |
| GET | `api.trakkr.ai/agent/automations` | `brand_id={b}` | agent automations |
| GET | `api.trakkr.ai/agent/needs-you` | `brand_id={b}` | review queue |
| GET | `api.trakkr.ai/workflows/{ruleId}` | `user_id={u}` | rule detail (`/automations/rules/:id`) |
| GET | `api.trakkr.ai/workflows/{ruleId}/runs` | `user_id={u}&limit=30` | run history |

---

# 4. Link graph for this slice

| From (host element) | Anchor text | To |
|---|---|---|
| Sidebar | Content | `/create` |
| Sidebar | Site Optimization | `/optimize` |
| Sidebar | Automations | `/automations` |
| `/create` Drafts empty state | Browse Ideas | `/create?stage=ideas` (button) |
| `/create` Campaigns empty state | Browse ideas | `/create?stage=ideas` (button) |
| `/create` Settings > Destinations | Open integrations → | `/integrate` (observed as a link-styled control) |
| `/optimize` sub-line | venturepr.com | `https://venturepr.com` |
| `/optimize` gate cards | Connect crawler tracking | `/traffic/crawler?tab=connections` |
| `/optimize` gate cards | Connect Search Console | `/traffic/search-console` |
| `/optimize` Pages tab, CRAWLS 30D tile | Connect tracking → | `/traffic/crawler?tab=connections` |
| `/optimize` page drawer | Open full record | `/pages/home?url=<encoded url>` |
| `/optimize` page drawer | venturepr.com | `https://venturepr.com` |
| `/optimize` Checks score footer | Checks score 87 | `/optimize?tab=history` (button) |
| `/optimize` page-not-found | Back to Optimize | `/optimize` |
| `/create` article-not-found | Back to Create | `/create` |
| `/automations` table row | (automation name) | `/automations/rules/:id` |
| `/automations` pattern card | Use pattern → | `/automations/new` with the pattern loaded |
| `/automations` header | New automation | `/automations/new` |
| `/automations/new` breadcrumb | Automations | `/automations` |

---

# 5. Controls recorded but not clicked

These controls spend credits, mutate data, or publish. They were observed and
left alone.

| Page | Control |
|---|---|
| `/create` | `Write` menu items, hero `Write article`, row `Write`, campaign `Write N`, drawer `Write article`, drawer `Talk to Agent`, `Try Agent`, row-menu `Dismiss`, drawer `Dismiss`, `Export` |
| `/create` Settings | `Re-analyze`, `Connect`, `Connect site`, `Connect a site`, `Scan`, `Add trigger` commit, any save |
| `/optimize` | `Fix it for me` (banner and 3 rows), `Export`, `Scan now`, `Save changes`, `Mark fixed`, `Mark in progress`, `Ignore`, `Send to dev`, `Analyze pages`, `Ask the Agent`, `Add to plan` |
| `/automations` | `Delete`, `Duplicate`, `Rehearse last 30 days`, `Review & turn on`, `Run with real data`, `Draft the flow` |
