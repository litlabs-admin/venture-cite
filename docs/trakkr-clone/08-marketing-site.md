# Trakkr Replication Spec — 08: Public Marketing Site and Programmatic Templates

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

Observation date: 2026-08-07. Host: `https://trakkr.ai`.
Method: browser session, logged in. Page HTML read by same-origin `fetch` (server-rendered HTML) and by live DOM read.
All content below is quoted from what was observed. Items not observed are marked "NOT OBSERVED".

---

## 0. Session and rendering notes

- The browser session was **logged in**. The header shows a **Dashboard** button. It does not show "Sign in" or "Start free". Record this: the logged-out header was NOT OBSERVED.
- The homepage hero CTA button reads **"Go to Dashboard"** in the logged-in state. The logged-out label was NOT OBSERVED.
- The homepage pricing block shows a **"Current plan"** button on the Growth card. This is a logged-in state.
- Two render modes exist:
  - **Server-rendered pages.** The HTML contains the real content.
  - **Client-rendered pages.** The server HTML contains only a fallback block. That block reads: `This page includes crawler-readable static content. Enable JavaScript for the interactive Trakkr experience.` Pages seen with this fallback: `/answers`, `/alternatives/profound-alternatives`, `/guides/how-to-get-cited-by-ai`, `/article/:slug`.
  - A second fallback exists. Some pages serve a shared SEO block with these H2s: `AI Visibility Tracking`, `Citation Source Discovery`, `Brand Perception Analysis`, `Competitor Tracking`, `How It Works`, `Supported AI Platforms`, `AI Visibility Guides`, `Free Tools`, `AI Search Research`. Pages seen with this block: `/guide`, `/guides`, `/ai-insights`. `/pricing` carries the same block in addition to its real content.
- Redirects observed:
  - `/enterprise` → `/trakkr-for/enterprise`
  - `/case-study` → `/double`
  - `/rankings`, `/rankings/ai-500`, `/rankings/methodology`, `/ai-500` → `/data/rankings`
  - `/observatory` → `/data`
  - `/prompt-bank` → `/resources`
- No page in the assigned list returned a 404. Every one returned HTTP 200.

---

## 1. Global chrome

### 1.1 Header nav (expanded, every item)

The header is a `<nav>` element. It is sticky, height 52px on mobile and 56px from the `sm` breakpoint. It has a bottom border and a blurred background.

Structure: logo link → 4 top-level items → right-side actions.

| Item          | Type                          | Child label            | Child sub-label                                         | href                                                             |
| ------------- | ----------------------------- | ---------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| (logo)        | link                          | —                      | —                                                       | `/`                                                              |
| **Product**   | dropdown button               | Citations              | See what AI reads about you                             | `/features#citations`                                            |
|               |                               | Perception             | How AI understands your brand                           | `/features#perception`                                           |
|               |                               | Competitors            | Track and outpace rivals                                | `/features#competitors`                                          |
|               |                               | Automations            | Automate your AI visibility                             | `/features#automations`                                          |
|               |                               | Agent                  | Your AI strategy assistant                              | `/features#agent`                                                |
|               |                               | Startups               | —                                                       | `/trakkr-for/startups`                                           |
|               |                               | Agencies               | —                                                       | `/trakkr-for/agencies`                                           |
|               |                               | Enterprise             | —                                                       | `/trakkr-for/enterprise`                                         |
|               |                               | AI Site Grader         | —                                                       | `/free-tools/ai-site-grader`                                     |
|               |                               | llms.txt Generator     | —                                                       | `/free-tools/llms-txt-generator`                                 |
|               |                               | Visibility Leaderboard | —                                                       | `/data/rankings`                                                 |
|               |                               | AI Traffic Index       | —                                                       | `/ai-search-traffic`                                             |
| **Resources** | dropdown button               | Documentation          | Platform guides, tutorials, and quickstarts / "Explore" | `/learn/docs`                                                    |
|               |                               | Data                   | Live AI visibility benchmarks                           | `/data`                                                          |
|               |                               | API Reference          | Build custom integrations                               | `/learn/api`                                                     |
|               |                               | MCP Server             | Connect Trakkr to Claude, ChatGPT & Cursor              | `/mcp`                                                           |
|               |                               | Research               | Original AI visibility research                         | `/trakkr-research`                                               |
|               |                               | About                  | —                                                       | `/about`                                                         |
|               |                               | Security               | —                                                       | `/security`                                                      |
|               |                               | Status                 | —                                                       | `https://trakkr.ai/status` (absolute URL)                        |
|               |                               | Roadmap                | —                                                       | `/roadmap`                                                       |
| **Pricing**   | link                          | —                      | —                                                       | `/pricing`                                                       |
| **Demo**      | link                          | —                      | —                                                       | `/demo`                                                          |
| **Dashboard** | button link (logged-in state) | —                      | —                                                       | `/dashboard`                                                     |
| (unnamed)     | button                        | —                      | —                                                       | (mobile menu toggle, inferred from position; label NOT OBSERVED) |

The `Product` dropdown groups its children into three unlabelled clusters: features (Citations…Agent), audiences (Startups, Agencies, Enterprise), free tools (AI Site Grader…AI Traffic Index).

### 1.2 Footer (every column, every link)

Footer tagline, verbatim:
`Be the brand AI recommends. Track and improve your visibility across every major AI platform.`

Social link: LinkedIn → `https://www.linkedin.com/company/trakkr-ai`
Logo link → `/`

| Column           | Link              | href                     |
| ---------------- | ----------------- | ------------------------ |
| **PRODUCT**      | Features          | `/features`              |
|                  | Pricing           | `/pricing`               |
|                  | Integrations      | `/integrations`          |
|                  | Data              | `/data`                  |
|                  | Live Workspace    | `/open-source`           |
|                  | Roadmap           | `/roadmap`               |
|                  | Free Tools        | (button, no href)        |
| **SOLUTIONS**    | For Agencies      | `/trakkr-for/agencies`   |
|                  | For Enterprise    | `/trakkr-for/enterprise` |
|                  | For Startups      | `/trakkr-for/startups`   |
| **LEARN**        | Blog              | `/blog`                  |
|                  | Documentation     | `/learn/docs`            |
|                  | API Reference     | `/learn/api`             |
|                  | Research          | `/trakkr-research`       |
|                  | AI Political Bias | `/bias`                  |
|                  | Resources         | `/resources`             |
|                  | Guides            | `/guides`                |
| **COMPANY**      | About             | `/about`                 |
|                  | Book Demo         | `/demo`                  |
|                  | Security          | `/security`              |
|                  | Privacy           | `/privacy`               |
|                  | Terms             | `/terms`                 |
|                  | Status            | `/status`                |
| **YOUR ACCOUNT** | Dashboard →       | `/dashboard`             |

Footer bottom bar, verbatim: `© 2026 Trakkr. All rights reserved.` · `All systems operational` (links to `/status`) · `Made in London`.

The homepage also carries a locale switcher row with these hrefs: `/`, `/fr`, `/de`, `/es`, `/pt-br`, `/pt-pt`, `/nl`, `/sv`, `/da`, `/no`, `/fi`. Link labels are empty (flags or icons; exact glyphs NOT OBSERVED).

### 1.3 Pages that do NOT use the global chrome

- **`/answers`** — 0 `<nav>` elements. It has its own minimal chrome. Top bar: `Docs`, `Data`, a search box `Search questions… ⌘K`, and `trakkr.ai`. Its own footer reads `Trakkr Answers. First-party, human-reviewed answers about AI visibility.` with links `All answers`, `Documentation`, `trakkr.ai`.
- **`/guide`** — 0 `<nav>`, 0 `<footer>`. Full-bleed scrollytelling page. Its only chrome is a `Back` link and a progress rail.
- **`/open-source`** — server HTML shows a bare workspace shell with no marketing chrome. Header/footer presence NOT OBSERVED beyond that.

---

## 2. Repeating section components

These components repeat across templates. They are described once here and referenced later.

### C1 — Numbered section band

Every marketing page divides into numbered sections. Each band opens with a duplicated index token, an eyebrow, and a slash sub-label. Pattern: `[01][01] Why now / The Shift`. The index runs `[01]`…`[07]`. This is the strongest shared signature of the whole site.

### C2 — Domain-capture hero form

An inline form in the hero. One text input, placeholder `yourbrand.com`, plus one submit button. It is not marked `required`. It appears on `/`, `/features`, `/about`, `/free-tools`, `/free-tools/ai-site-grader`, `/free-tools/llms-txt-generator`, `/data/rankings`. The homepage carries two instances (hero and closing CTA band). Sub-caption varies: `14-day free trial · Cancel anytime`, `No signup · No credit card`, `First fix before signup`.

### C3 — Live product mock

A non-interactive replica of the product UI, animated with CSS keyframes. It carries a brand name (usually `Nike`), a visibility score, a delta, a rank chip, a line chart with `7D / 14D / 30D` toggles, a rankings list, a crawler counter, a live conversation ticker, and an actions list. It appears on `/`, `/features`, `/trakkr-for/agencies`, `/trakkr-for/startups`, `/trakkr-for/enterprise`, `/looker-studio`, `/double`.

### C4 — Stat band

A row of large numbers with small captions. Values often render as `0` in the server HTML and count up on the client. Example set on `/`: `Brands Tracked`, `Prompts Analyzed`, `Citations Analyzed`, `Competitors Mapped`. Example set on `/trakkr-for/agencies`: `10 Brands included`, `Unlimited Team seats`, `30 sec To add a brand`, `None Commitment`.

### C5 — Pricing table

Plan cards side by side. Each card: plan name, optional badge (`POPULAR`, `POPULAR WITH AGENCIES`, `Popular`, `For agencies and multi-brand teams`), one-line positioning, price, billing note, a bullet list of feature lines, and one CTA button. Above the cards sit toggles. On `/pricing` the toggles are `Brand | Agency`, `USD | GBP | EUR`, and `Monthly | Annual −17%`. On `/` the toggle is `Monthly | Annual -17%` only. Full contents in §4.

### C6 — Comparison table

A row-per-attribute table with Trakkr in the first column and rivals in the rest. Seen on `/pricing` (`Trakkr | Profound | Athena | Peec`) and on every `/compare/:slug` and `/alternatives/:slug` page. Rows on `/pricing`: Approach, Access, Models included, Starting at, Evaluation, Content output, Actions, Multi-brand, White-label, Agency reports. It carries a dated verification stamp, e.g. `Verified 02 May 2026`.

### C7 — Feature-breakdown table

A long plan-versus-plan matrix, grouped by heading. On `/pricing` the groups are: (ungrouped head rows), `Intelligence`, `Site Optimization`, `Content`, `Sharing & Export`, `Team & Agency`. Full contents in §4.

### C8 — FAQ accordion

An `H2` such as `Common questions`, `Security FAQ.`, `Frequently asked questions`, or `FAQ`, then a list of question rows that expand. Rows show a `+` affordance on `/demo`. Every page carrying this component also emits `FAQPage` JSON-LD.

### C9 — Testimonial block

A pull-quote, then attribution as `Name` + `Role at Company`. The named people observed across the site: Brandon Gillespie (Founder & CEO, Futuro Corporation), Nick Harding (CEO & Founder, Fifty One Degrees), Paul Shepherd (Head of Marketing, Searchland), Jason West (Lead Generation Specialist, inThread), Ken Schaefer (Director, Beeby Clark Meyler), Leo Ubbiali (CEO, Visum Labs), John Auty Webster (Software Engineer, NatWest).

### C10 — Logo wall

A band captioned `USED BY TEAMS AT` on `/`. The logo images themselves were NOT OBSERVED as text.

### C11 — Model-roster chip row

A row of model names. Canonical set: `ChatGPT`, `Perplexity`, `Claude`, `Gemini`, `Google` / `Google AI Overviews`, `Grok`, `Meta AI`, `DeepSeek`. The site says "8 models" everywhere.

### C12 — Closing CTA band

The last section of nearly every page. An `H2`, a one-line sub-copy, one or two buttons, and a trust line `14-day free trial · Cancel anytime`. Examples: `Your competitors aren't checking a score. They're running a strategy.` (`/`), `Start tracking your AI visibility today.` (`/pricing`), `See what AI says about your brand.` (`/about`), `Launch your platform today.` (`/trakkr-for/agencies`), `Let's talk.` (`/trakkr-for/enterprise`), `See how AI talks about your brand` (reviews, compare, blog).

### C13 — Resource triptych

Three small cards: `Documentation / Guides & references → /learn/docs`, `API / Build integrations → /learn/api`, `MCP / Connect AI assistants → /mcp`. Seen on `/` (as section `[07]`) and on `/resources`.

### C14 — Data teaser grid

Four cards linking into the open data hub: `Rankings 9.3K — Leaderboard · industries · movers → /data/rankings`; `Citations 313K — Top domains · categories · by intent · trends → /data/citations`; `AI traffic 4.1K — Referrals by engine · growth · industry → /data/ai-traffic`; `Queries 11.5K — Rewrite patterns · aggregate injections · length changes → /data/query-fanout`. Heading: `See how AI search actually works`. Sub-copy: `Live, open data on what AI crawls, cites and recommends. Free to explore.`

### C15 — Sticky scan bar (content templates only)

A bar pinned above the article on `/reviews/:slug` and `/compare/:slug`. It carries a small title, one line of proof copy, and a `Start free trial` button with UTM-style query parameters.

### C16 — Cluster link grid

A grid of sibling links at the foot of a programmatic page, e.g. `All Profound alternatives`, `The cheapest Profound alternatives`, `Profound alternatives for small businesses`, `Profound alternatives for startups`, `Profound review`, `Profound pricing`, `Profound vs Trakkr`.

---

## 3. schema.org JSON-LD

JSON-LD is emitted as one or more `<script type="application/ld+json">` blocks. Most pages use a single `@graph`.

Baseline graph on nearly every page: `Organization` + `WebSite` + `WebPage` (+ `BreadcrumbList` on most).

Observed type sets by page:

| Page                                                                                                                                                                                     | Types in graph                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                                                                                                                                                                      | Organization, WebSite, … (graph truncated at read; full list NOT OBSERVED beyond `Organization` and its `ImageObject` logo)                |
| `/pricing`                                                                                                                                                                               | Organization, WebSite, WebPage, Product+SoftwareApplication, FAQPage, BreadcrumbList                                                       |
| `/features`                                                                                                                                                                              | Organization, WebSite, WebPage, Product+SoftwareApplication, BreadcrumbList                                                                |
| `/guide`, `/roadmap`, `/status`(+BreadcrumbList), `/security`, `/support`, `/partners`, `/demo`, `/playbooks`, `/market-reports`, `/looker-studio`, `/mcp`, `/learn/api`, `/open-source` | Organization, WebSite, WebPage (± BreadcrumbList)                                                                                          |
| `/about`, `/privacy`, `/terms`, `/changelog`, `/trakkr-for/*`, `/platforms`, `/insights`, `/fix`, `/industries`, `/resources`, `/guides`                                                 | Organization, WebSite, WebPage, BreadcrumbList (`/guides` adds a second script with `CollectionPage`)                                      |
| `/integrations`                                                                                                                                                                          | Organization, WebSite, WebPage, BreadcrumbList, ItemList                                                                                   |
| `/answers`                                                                                                                                                                               | Organization, WebSite, Thing ×8, CollectionPage, ItemList, BreadcrumbList                                                                  |
| `/glossary`                                                                                                                                                                              | Organization, WebSite, WebPage, BreadcrumbList                                                                                             |
| `/bots`                                                                                                                                                                                  | Organization, WebSite, CollectionPage, BreadcrumbList, ItemList, DefinedTermSet                                                            |
| `/blog`                                                                                                                                                                                  | Organization, WebSite, WebPage, Blog, BreadcrumbList                                                                                       |
| `/reviews`, `/compare`, `/alternatives`, `/ai-recommends`, `/free-tools`                                                                                                                 | Organization, WebSite, CollectionPage, BreadcrumbList, ItemList (`/free-tools` adds FAQPage)                                               |
| `/reviews/profound-review`                                                                                                                                                               | Organization, WebSite, WebPage, Article, FAQPage, Product+SoftwareApplication, Review, BreadcrumbList, ItemList                            |
| `/compare/profound-vs-trakkr`                                                                                                                                                            | Organization, WebSite, WebPage, Article, FAQPage, Product+SoftwareApplication, Review, Product+SoftwareApplication, Review, BreadcrumbList |
| `/alternatives/profound-alternatives`                                                                                                                                                    | Organization, WebSite, Person, SoftwareApplication ×10, WebPage, Article, Dataset, ItemList, FAQPage, BreadcrumbList                       |
| `/alternatives/profound-alternatives/for-agencies`                                                                                                                                       | Organization, WebSite, WebPage, Article, FAQPage, Product+SoftwareApplication, Review, Product+SoftwareApplication, Review, BreadcrumbList |
| `/guides/how-to-get-cited-by-ai`                                                                                                                                                         | Organization, WebSite, Person, WebPage, Article, FAQPage, BreadcrumbList                                                                   |
| `/article/:slug`                                                                                                                                                                         | Organization, WebSite, Person, WebPage, Article, HowTo, FAQPage, BreadcrumbList                                                            |
| `/data`                                                                                                                                                                                  | Organization, WebSite, CollectionPage, FAQPage, BreadcrumbList, Dataset, ItemList                                                          |
| `/data/rankings`, `/data/citations`, `/data/ai-traffic`                                                                                                                                  | Organization, WebSite, WebPage, FAQPage, BreadcrumbList, Dataset                                                                           |
| `/data/brands/:slug`                                                                                                                                                                     | WebPage, Dataset, BreadcrumbList                                                                                                           |
| `/trakkr-research`                                                                                                                                                                       | Organization, WebSite, WebPage, BreadcrumbList, DataCatalog, Dataset, Dataset                                                              |
| `/trakkr-research/citation-sources`                                                                                                                                                      | Organization, WebSite, WebPage, Article, FAQPage, BreadcrumbList, Dataset, ResearchProject                                                 |
| `/state-of-ai-search`                                                                                                                                                                    | Organization, WebSite, WebPage, Dataset                                                                                                    |
| `/bias`                                                                                                                                                                                  | Organization, WebSite, CollectionPage, FAQPage, BreadcrumbList, Dataset, ItemList                                                          |
| `/ai-search-traffic`                                                                                                                                                                     | Organization, WebSite, WebPage, FAQPage, BreadcrumbList, Dataset                                                                           |
| `/double` (from `/case-study`)                                                                                                                                                           | Organization, WebSite, WebPage, FAQPage                                                                                                    |
| `/free-tools/ai-site-grader`, `/free-tools/llms-txt-generator`                                                                                                                           | Organization, WebSite, WebPage, Product+SoftwareApplication, FAQPage, BreadcrumbList                                                       |
| `/learn/docs`                                                                                                                                                                            | Organization, WebSite, CollectionPage, BreadcrumbList                                                                                      |
| `/ai-insights`                                                                                                                                                                           | Organization, WebSite, WebPage, BreadcrumbList, ItemList, SoftwareApplication                                                              |

---

## 4. Pricing, verbatim

Two different price sets were observed. Record both.

### 4.1 `/pricing` — server default, GBP

URL: `https://trakkr.ai/pricing`
Title: `Pricing - 14-Day Free Trial | Trakkr`
Meta description: `AI visibility tracking from $100/mo with a 14-day free trial. Track your brand across ChatGPT, Claude, Gemini, Perplexity, and 4 more AI models.`
H1: `One price. Every AI model.`
Hero sub-copy: `Track ChatGPT, Perplexity, Gemini, Claude, Grok and more from one workspace. No add-ons, no per-model fees, every model included.`
Hero trust line: `14-day free trial · All AI models included · Cancel anytime`

Section order: `[01] Plans / Three plans, every model included` → `[02] Configure / Build your plan` → `[03] Compare / Full feature breakdown` → `[04] Alternatives / How Trakkr compares` → `[05] Customers / What customers say` → `[06] FAQ / Common questions` → closing CTA band.

Toggles above the plans: `Brand | Agency`, `USD | GBP | EUR`, `Monthly | Annual −17%`.
Agency strip: `Win pitches in 60s · Client portals · Brand Comparison` → CTA `See the agency platform` → `/trakkr-for/agencies`.

**Growth** — badge `Popular` — `For founders and growing brands` — `£79/mo` — `or £790/yr billed annually`

- `Track 1 brand daily`
- `50 prompts per brand`
- `All 8 models included`
- `25 articles per month`
- `3 seats included`
- `Citations & Perception`
- `Site optimization`
- `Exports & Sharing`
- `MCP access`
- `Executive reports`
- CTA: `Start free trial` → `/start?plan=growth&cycle=monthly&trial=true`

**Scale** — `For agencies and multi-brand teams` — `£395/mo` — `or £3,950/yr billed annually`

- `Track 10 brands daily`
- `50 prompts per brand`
- `All 8 models included`
- `100 articles per month`
- `Everything in Growth`
- `Unlimited team seats`
- `Add-on`
- `REST API access`
- CTA: `Start with Growth` → `/start?plan=growth&target_plan=scale&cycle=monthly`
- Note under CTA: `Free trial starts on Growth. Upgrade anytime.`

**Enterprise** — `For high-volume teams` — `From £790/mo` — `Billed annually`

- `Unlimited brands & prompts`
- `SSO & security review`
- `Custom contracts & terms`
- `Dedicated success manager`
- `Volume discounts`
- `Priority support SLA`
- `Custom integrations`
- `Onboarding & training`
- CTA: `Talk to sales` → `/trakkr-for/enterprise`

Footer of the plans block: `14-day free trial · Guided demo available · Cancel anytime` and `Shown in GBP · billed in USD`.

**[02] Configurator (C5 variant).** Rows: `Plan` (`Up to 10 brands`; options `Growth`, `Scale`), `Brands` (`Includes 10`, value `10`, `Included`), `Prompts per brand` (`50 included`; `Base`, `+50`, `+100`, `+200`; `Included`), `Article credits` (`100/mo`; `Base`, `+25`, `+50`, `+100`; `Included`), `Extra markets` (`0 additional regions per brand`, `0`, `Optional`), `White-label brands` (`0 branded portals`, `0`, `Optional`). Result: `Estimated total £395/mo or £3,950/yr billed annually`, `Scale base £395`. CTA `Start with Growth` → `/start?plan=growth&cycle=monthly&target_plan=scale`.

**[03] Compare plans (C7).** Columns `Growth | Scale`.

- `Brands included` — 1 | 10
- `Prompts per brand` — 50 | 50
- `AI models tracked` — 8 | 8
- `Refresh frequency` — Daily | Daily
- `Data points` — 12,000 | 120,000
- `Historical data` — 1 year | Unlimited
- _Intelligence_: `Competitor tracking`, `Citation sources`, `Perception analysis`, `Executive reports`
- _Site Optimization_: `AI crawler optimization`; `AI Pages requests` — 2,500/mo | 10,000/mo; `Technical recommendations`; `Content suggestions`
- _Content_: `Article credits` — 25/mo | 100/mo; `Extra credit packs` — `One-time top-ups`
- _Sharing & Export_: `Shared dashboards`, `CSV export`, `Google Sheets sync`, `Automations` — 3 | Unlimited
- _Team & Agency_: `Team seats` — 3 | Unlimited; `Client access`; `MCP access`; `REST API access`; `White-label portal` — `Add-on`
- Footer link: `Looking for more? See Enterprise→` → `/trakkr-for/enterprise`

**[04] Alternatives table (C6).** Columns `Trakkr | Profound | Athena | Peec`.

- `Approach` — Visibility & execution | Visibility-first | Execution-first | Visibility-first
- `Access` — Self-serve | Self-serve + demo | Self-serve | Self-serve
- `Models included` — 8 | 1–10 | 8 | 3 of 7
- `Starting at` — $100/mo | $99/mo annual | $295/mo | €85/mo
- `Evaluation` — 14 days | Free trial | Paid start | Free trial
- `Content output` — 25 articles/mo | — | 6 articles/mo | Content agent
- `Actions`, `Multi-brand` — Built in | $500+ | Enterprise | Enterprise $245+/mo
- `White-label` — +$49/client | Not listed | Not listed | —
- `Agency reports`
- Stamp: `Verified 02 May 2026`

**[06] FAQ questions, verbatim:** `How does the free trial work?`, `What counts as a data point?`, `What happens when I hit my limits?`, `Can I change plans anytime?`, `Which AI models do you track?`, `How does annual billing work?`, `What's the main difference between Growth and Scale?`, `Why choose Trakkr over Profound, Athena, or Peec?`, `What is white-labelling and how does it work?`, `Do prices change if I'm not in the US?`
Sample answer, verbatim (free trial): `Start a 14-day free trial with full access to Growth features: perception analysis, citation tracking, site optimization, and more. If you love it, you'll be charged $100/mo after 14 days. Cancel anytime before the trial ends and you won't be charged.`
Sub-CTA: `Still have questions? Get in touch` → obfuscated mailto via `/cdn-cgi/l/email-protection`.

Closing CTA band: H2 `Start tracking your AI visibility today.` sub `Set up in 2 minutes · 14-day free trial · Cancel anytime`; buttons `Start free trial` → `/start?plan=growth&trial=true` and `Book a demo` → `/demo`.

### 4.2 Homepage pricing block — USD

Section `[06] PRICING / Plans`. H2 `Simple pricing, scale as you grow.` Sub `Start with a 14-day free trial. Cancel anytime.` Toggle `Monthly | Annual -17%`.

**Growth** — badge `POPULAR` — `Deep insights for brand owners` — `$100 /mo`
`Track 1 brand, daily` · `50 prompts tracked` · `All 8 AI models` · `Citations & perception` · `Automatic site optimization` · `Executive reports & dashboards` · `Data export (CSV + Sheets)` · `Connect to ChatGPT & Claude` — CTA `Current plan` (logged-in state).

**Scale** — badge `POPULAR WITH AGENCIES` — `Multi-brand tracking at scale` — `$500 /mo`
`Everything in Growth` · `10 brands, 50 prompts each` · `Unlimited team & client seats` · `REST API + Looker Studio` · `White-label client portals (add-on)` · `Unlimited alerts & full history` · `Priority support` — CTA `Upgrade` → `/upgrade?plan=scale`.

Below: `14-day free trial` · `Cancel anytime` · `Compare features` → `/pricing`.

No Enterprise card appears on the homepage.

---

## 5. Core pages

### 5.1 `/` — Homepage

- Title: `Trakkr | AI Visibility Platform for Brands & Agencies`
- Meta: `AI is rewriting discovery. Trakkr tells you what to do about it. Track citations, perception, competitors, and actions across ChatGPT, Claude, Gemini,...`
- H1: `Build a website AI can recommend.`
- Hero sub-copy, verbatim: `See what eight AI models can read, trust and cite, then get the content and technical fixes that move your brand into more answers.`
- Hero form: C2, input placeholder `Brand domain`, button `Go to Dashboard`, caption `First fix before signup`.

Section order:

1. Hero + C3 live product mock (`Nike 82 +3.3 #2 OF 9`; panels `Visibility over time`, `Rankings`, `Crawlers`, `Conversations`, `Actions`).
2. `[01] WHY NOW / The Shift` — H2 `72% make AI their first stop before buying.` Sub `Once shoppers try AI, it's their go-to for research. A few brands per query, no second page. You're on the shortlist or you don't exist.` Source stamp `CAPITAL ONE SHOPPING, 2026`. Marquee of example buyer prompts.
3. `[02] PLATFORM / Features` — three numbered blocks.
   - `01 TRACK` H3 `See exactly where you show up across every AI platform` — `Monitor your visibility across ChatGPT, Claude, Perplexity, Gemini, and more. Know your position for every prompt that matters to your business.` CTA `Explore tracking` → `/features#track`.
   - `02 UNDERSTAND` H3 `See why you're winning or losing` — `Discover which sources AI cites when it mentions you. See the queries driving recommendations and the gaps in your coverage.` CTA `See how it works` → `/features#understand`.
   - `03 IMPROVE` H3 `Turn signals into actions, automatically` — `Every week, Trakkr synthesizes thousands of data points into prioritized actions with step-by-step playbooks. Hand the technical ones to your AI, and they apply themselves.` CTA `Start improving` → `/features#improve`.
   - Audience row `BUILT FOR`: `Brand teams`, `Marketing agencies` → `/trakkr-for/agencies`, `Startups` → `/trakkr-for/startups`, `Enterprise` → `/trakkr-for/enterprise`.
4. `[03] WHY TRAKKR / Approach` — H2 `Other tools give you a dashboard. Trakkr gives you a playbook.` Three numbered cards: `01 8 models, not a sample` (CTA `See all features` → `/features`), `02 Actions, not dashboards` (CTA `See how actions work` → `/features`), `03 Connected to the AI you use` (CTA `See how it connects` → `/mcp`). Then C4 stat band.
5. `[04] REVENUE / Proof` — H2 `Trace every AI visitor to revenue.` Sub `Connect Google Analytics to see exactly which AI platforms send converting traffic. No code changes, 2-minute setup.` Chips `2-min setup`, `No code`, `GA4 integration`. CTA `Connect Analytics` → `/traffic/analytics`. Stat callout `$15.17 AVG. SESSION VALUE`.
6. `[05] CUSTOMERS / In their words` — C9 testimonials, then C10 logo wall `USED BY TEAMS AT`.
7. `[06] PRICING / Plans` — see §4.2.
8. `[07]` — C13 resource triptych, then C14 data teaser grid.
9. C12 closing band — H2 `Your competitors aren't checking a score. They're running a strategy.` Sub `Visibility, citations, perception, competitors, and prioritized actions across 8 AI models. One platform. Start your 14-day free trial.` C2 form, caption `14-day free trial · Cancel anytime`.

### 5.2 `/features`

- Title: `AI Brand Monitoring Features – Citations, Perception, Competitors & More | Trakkr`
- Meta: `Track AI brand visibility across ChatGPT, Claude, Gemini, Perplexity, and Grok. Monitor citations, compare competitors by prompt, and use automations to...`
- H1: `The complete AI visibility toolkit.`
- Hero sub: `Monitor how AI answers describe your brand, which sources get cited, and where competitors outrank you.` C2 form, button `Get started`, caption `14-day free trial · Cancel anytime`.
- Section order (H2s): `The screen you'll open every morning.` (`[01] Dashboard / Command Center`) → `Eighteen million conversations, watched live.` → `Trace every AI answer back to the sources behind it.` → `Understand how AI perceives you.` → `Know exactly where you stand.` → `When visibility moves, work moves.` → `Investigates first. Then answers.` → `Power tools for serious teams.` → C12 `Your competitors are already optimizing for AI.`
- In-page anchors used by the header nav: `#citations`, `#perception`, `#competitors`, `#automations`. Also `[02] Citations 142 sources discovered`, `[03] Perception 5 dimensions tracked`, `[04] Competitors 8 brands compared`, `[05] Automations 12 actions automated`.
- `Power tools` card grid: `Research` (`500+ prompts`) → `/learn/docs/features/research`; `Content hub` → `/learn/docs/features/content`; `Reports` → `/learn/docs/features/reports`; `Page audit` (`One-click`) → `/learn/docs/features/optimize`; `API access` → `/learn/api`; `Integrations` (`15+ apps`) → `/integrations`.

### 5.3 `/guide`

- Title: `How AI Search Actually Works, Interactive Guide | Trakkr`
- Meta: `A visual, interactive guide to understanding how AI search engines retrieve, synthesize, and cite content. Learn the mental model behind AI visibility in 14...`
- H1: `Something changed: 60% of informational queries now get AI-generated answers`
- No header nav, no footer. A `Back` link only.
- Format: scroll-driven story, ~22 numbered sections in five acts. Progress rail: `I The Shift [01-04] 4 min`, `II The Old Model [05-07] 4 min`, `III The New Model [08-14] 7 min`, `IV The Implications [15-18] 4 min`, `V The Path Forward [19-21] 3 min`, with a `YOU ARE HERE` marker.
- H2s: `The problem isn't information. It's altitude.` and `By the end of this guide, you'll have a working mental model.`
- Verbatim stat chips: `60 % of informational queries now get AI-generated answers`, `THEN`, `100 M+ DAILY CHATGPT QUERIES`, `800 % PERPLEXITY GROWTH · 18MO`, `This isn't coming. It's here.`, `GARTNER · OPENAI · SIMILARWEB`.
- `WHAT YOU'LL WALK AWAY WITH`: `Understand why certain sources appear in AI answers`, `Reason about what makes content likely to be included`, `Make decisions based on how the system actually works`. Closing line `14 minutes from now, the fog lifts.` and `~22 sections · scroll at your pace`.
- Sections `[04]`–`[08]` render as `Coming soon`.

### 5.4 `/demo`

- Title: `Start free or book a demo - Trakkr`
- Meta: `Two ways to start with Trakkr. Try it free for 14 days, or book a 30-minute demo to see how your brand appears across ChatGPT, Claude, Gemini, Perplexity and...`
- H1: `See how AI search sees your brand.`
- Hero sub: `Two ways to start. Try Trakkr free for 14 days, or book a guided demo with our team. Pick the one that fits.`
- Section order: two-card chooser → `[01] Trusted by brands and agencies / Live platform data` → `[02] Common questions / Before you start` → C12 `Ready to see where you stand?`
- Card A `Start free` badge `Recommended`: `14-day trial, full features.` Bullets `See your brand across all 8 AI models`, `Live in about 10 minutes`, `No call, no sales pitch`. CTA `Start free` → `/start`. Caption `14-day free trial · cancel anytime`.
- Card B `Book a demo`: `30 minutes, live. We walk through how your brand shows up across the AI models. Best for agencies and multi-brand teams.` **Form fields**: text `Company URL`; email `Work email`, placeholder `you@company.com`, required; text `Company website`, placeholder `company.com`, required; radio group `Which best describes you?` with options `One brand`, `Agency`, `Enterprise`, `Exploring`; submit `Continue`. Caption `30-minute call · no commitment`. The form was NOT submitted.
- FAQ rows: `Is it really free?`, `Do I need a demo to use Trakkr?`, `Which should I choose, trial or demo?`, `What happens on the call?`, `How many AI models do you track?`
- Closing band sub: `Start free in minutes, or book a demo if you would rather be walked through it.` Buttons `Start free`, `Book a demo`.

### 5.5 `/about`

- Title: `About | Trakkr`. Meta: `Trakkr was built to help brands understand and improve their AI visibility. Founded by Mack Grenfell. Independent, bootstrapped, and focused on shipping the...`
- H1: `AI is changing how people discover.` Eyebrow `About Trakkr`. Sub: `We built the platform to track it, understand it, and win it.`
- Sections: `[01] The Shift / The Paradigm Change` (H2 `The way people find products has fundamentally changed.`) → `[02] By the Numbers / Traction` (C4: `Brands Tracked`, `Prompts Analyzed`, `1,339,381 Citations Analyzed`, `Live Tracking`) → `[03] Our Approach / Philosophy` (H2 `Other tools give you a number. Trakkr gives you a path to #1.`; cards `01 End-to-end` → `/features`, `02 Always current` → `/changelog`, `03 Scales with you` → `/pricing`) → `[04] Founded By / The Team` → C12 `See what AI says about your brand.`
- Founder block: `Mack Grenfell`, `Founder`, links `mackgrenfell.com` → `https://mackgrenfell.com`, `byword.ai` → `https://byword.ai`, `LinkedIn` → `https://www.linkedin.com/company/trakkr-ai`. Chips `Independent`, `Bootstrapped`, `Shipping weekly`, `Made in London`.
- Closing band sub: `Enter your domain. Get visibility scores across 8 AI platforms in 60 seconds.` C2 form, button `Scan`.

### 5.6 `/partners`

- Title: `Experts - Certified Partners | Trakkr`. Meta: `Work with hand-selected agencies who specialize in AI visibility. Trakkr-certified experts help you implement, strategize, and grow.`
- H1: `Work with someone who knows the platform`. Eyebrow `Certified Experts`. Sub: `We certify a small number of agencies who understand AI visibility deeply enough to drive results. Not a directory - a quality bar.`
- Sections: `[01] What certified means / Our quality bar` (Platform proficiency, Verified results, Ongoing training) → `[02] Featured expert / Hand-selected` (`Visum Labs`, badge `Certified`, tags `AI Search Strategy`, `Content Architecture`, `Technical Implementation`, `Competitive Analysis`, CTA `Visit website` → `https://visumlabs.com`) → `[03] How it works / The engagement` (`01 Visibility audit` Week 1, `02 Strategy build` Week 2-3, `03 Implementation` Week 3-8, `04 Ongoing monitoring` Ongoing) → `[04] For agencies / Become certified` (What you get: `Referral pipeline`, `Partner resources`, `Public listing`; What we look for: `AI visibility expertise`, `Trakkr proficiency`, `Proven outcomes`) → C12 `Rather do it yourself?` CTA `Get started free` → `/login`.

### 5.7 `/trakkr-for/agencies`

- Title: `Trakkr for Agencies | White-Label AI Visibility Platform`. Meta: `Launch your own AI visibility platform. Custom domain, branded emails, client logins, zero Trakkr branding anywhere. Built for marketing and SEO agencies.`
- H1: `Launch your own AI visibility platform.` Eyebrow `For Agencies`. Sub: `Custom domain. Branded emails. Client logins. Zero Trakkr branding, anywhere.` CTA `Start free`. Caption `Setup in 5 minutes · 14-day free trial`.
- C3 mock is white-labelled: `ai.acme-digital.com`, `Acme Digital`, `Nike.com`, `Visibility 84`, `Rank #3`. Caption `Your clients see ai.youragency.com. They never see Trakkr.` C4 band: `10 Brands included`, `Unlimited Team seats`, `30 sec To add a brand`, `None Commitment`.
- Sections: `[01] The Opportunity / Why now` (H2 `The question every client is about to ask.`; pull-quote `"Why do our competitors show up when I ask ChatGPT about our industry, but we don't?"`; price comparison `Traditional SEO retainer $1.5K–$5K/mo` vs `AI visibility retainer $3K–$10K/mo`, caption `Premium positioning · Less competition`) → `[02] White-label / Your brand, their dashboard` (H2 `Your brand, their dashboard.`; feature list `Custom domain with SSL`, `Your logo, colors and favicon`, `Emails from your own domain`, `Unlimited client seats`, `White-label PDF reports`, `Custom login headline`) → `[03] Manage every client / Built for portfolios` (H2 `Run a hundred clients without losing the thread.`; H3s `Group brands by client`, `Access scoped to the brand`, `Bring your whole team`) → `[04] Pitch Reports / Win the c…` (H2 `Instant pitch reports.`) → H2 `Every client on one screen.` → H2 `Scale up and down, no commitment.` → C12 `Launch your platform today.`
- Extra links: `Compare per-client cost vs Profound` → `/alternatives/profound-alternatives/for-agencies`; `Need custom volume pricing?` → obfuscated mailto; `Get started free` → `/login`.

### 5.8 `/trakkr-for/enterprise` (also served at `/enterprise`)

- Title: `Trakkr for Enterprise — Built around you`. Meta: `AI visibility for organizations with many brands, many markets, and many stakeholders. We configure the platform, wire it into your stack, and send the first...`
- H1: `Built around you.` Sub, verbatim: `AI visibility for organizations with many brands, many markets, and many stakeholders. We configure the platform, wire it into your stack, and write the first executive briefing — before you finish onboarding.`
- CTAs: `Book a demo` → `https://cal.com/team/trakkr/trakkr-for-enterprise?utm_source=trakkr_enterprise_page`; `or email [email protected]` (obfuscated). Caption `30-minute call · Live in one week · From $1,000/mo`.
- C4 band: `Unlimited Brands`, `Unlimited Seats`, `1 week To first briefing`, `Named Account team`.
- Sections: `[01] Coverage / Every model. Every market.` (H2 `Every model. Every market. Every prompt that matters.`; model shares `ChatGPT 64% +12`, `Perplexity 18% +22`, `Claude 9% +7`, `Gemini 6% +4`, `Grok 1% +0`, plus `Google AIO Citations`, `Reddit Citations`; `Locale + market 15 markets · 9 languages`) → `[02] Integrations / Wired into your stack` (H2 `Wired into your stack.`; bullets `Warehouse sync — Snowflake, BigQuery, Databricks`, `REST + MCP, with your own quota`, `Webhook fan-out, sub-second`, `Reverse ETL into your CRM`; logo grid `12 of 40+`: Snowflake, BigQuery, Databricks, Tableau, Looker, Salesforce, HubSpot, Slack, Teams, Jira, Linear, ServiceNow) → `[03] Reporting / Board-ready, every Monday` (H2 `Reports that land in boardrooms.`) → H2 `We do the work.` (H3s `First 50 prompts written for you`, `A Slack channel with the founding team`, `Warehouse sync, set up together`, `Briefings written for stakeholders`, `Custom integrations in 5–10 days`, `We attend your meetings`) → H2 `Live in one week.` (H3s `Kickoff`, `Configuration`, `Integration`, `First briefing`) → C12 `Let's talk.`

### 5.9 `/trakkr-for/startups`

- Title: `Trakkr for Startups | Beat the Giants in AI Search`. Meta: `AI levels the playing field. See where you rank against incumbents in ChatGPT, Claude, and Perplexity. Get actionable insights to win AI visibility, no big...`
- H1: `The unfair advantage.` Eyebrow `For Startups`. Sub: `When buyers ask AI what to use, are you in the answer? Out-rank competitors with ten times your budget.` CTA `Check visibility`. Caption `14-day free trial · Setup in 2 minutes · Cancel anytime`.
- C4 band: `8 AI models tracked`, `2 min To set up`, `60 sec To your first score`, `$0 To start`.
- Sections: `[01] The Shift / Why now` (H2 `What changed under everyone's feet.`; two-column `The old game · SEO` [`Years to earn domain authority`, `Six-figure content budgets`, `Incumbents always on top`] vs `The new game · AI visibility` [`Relevance beats tenure`, `Citations beat backlinks`, `Startups can take the top spot`]) → `[02] See where you stand / One number, every model` (H2 `See your AI visibility in 60 seconds.`) → `[03] Find the gap / Where the giants are soft` (H2 `Find the prompts you can win.`; H3s `Gap analysis`, `Competitor watch`, `Rising threats`) → H2 `Clear moves you can make this afternoon.` (H3s `Optimize your site`, `Get cited`, `Content ideas`) → H2 `One plan. Everything included.` → C12 `Your competitors haven't figured this out yet.`
- Links: `Start free` → `/start`; `See the full plan ladder` / `See pricing` → `/pricing`; `For Agencies` → `/trakkr-for/agencies`; `For Enterprise` → `/trakkr-for/enterprise`.

### 5.10 `/changelog`

- Title: `Changelog | Trakkr`. Meta: `New features, improvements, and fixes. We ship updates weekly. See what's new in Trakkr and stay up to date with our latest releases.`
- H1: `What's new in Trakkr`. Sub: `New features, improvements, and fixes. We ship updates weekly.`
- Section `[01] Updates / Timeline`. Filter chips with counts: `All 73`, `New 37`, `Improved 34`, `Fixed 2`. Entries group under a month heading (`August 2026`).
- Entry anatomy: badge (`Improved` / `New` / `Fixed`) · date (`Aug 4, 2026`) · H3 title · one-line summary · body paragraph · bullet list. Newest entry observed: `The Actions desk`.
- 73 entries observed by H3, from `The Actions desk` back to `Citation Tracking`.
- Closing band: H2 `Help us build what's next.`

### 5.11 `/roadmap`

- Title: `Roadmap - Vote on What We Build Next | Trakkr`. Meta: `Vote for the features you want to see in Trakkr. Shape the future of AI visibility tracking.`
- H1: `Shape the future of Trakkr.` Eyebrow `[00] Roadmap`. Sub: `Every feature below is up for a vote. The ones you care about most get built first.`
- Six voting cards, each with H3 + description + `Learn more`: `AI revenue & attribution`, `Conversation intelligence`, `Autonomous Agent`, `Agentic content`, `Autonomous outreach`, `AI accuracy monitor`.
- Voting link target: `/login?redirect=/roadmap`.
- Closing band: H2 `Try Trakkr today.` Sub `See how AI platforms mention your brand across ChatGPT, Claude, Gemini, and more.` CTA `Get started`. Caption `14-day free trial · Cancel anytime`.

### 5.12 `/status`

- Title: `System Status | Trakkr`. Meta: `Check the current status of Trakkr services and view uptime history.`
- H1: `Checking system status.` Eyebrow `Loading status`. Sub `Fetching latest snapshot`.
- Sections: `[01] Systems / Service status`, `[02] Incidents / Public updates`. Both load client-side. Live content NOT OBSERVED.

### 5.13 `/security`

- Title: `Security | Trakkr`. Meta: `Enterprise-grade security at Trakkr. Learn how we protect your data with SOC 2 certified infrastructure, encryption, and privacy-first practices.`
- H1: `Security at Trakkr.` Eyebrow `Enterprise-grade security`. Sub: `Enterprise-grade infrastructure. Industry-standard encryption. Your data is protected so you can focus on your brand.` Contact email is obfuscated.
- Sections: `[01] Infrastructure / The Trust Stack` (H2 `Your data is protected by industry leaders.`; `Database — Supabase — PostgreSQL database with row-level security — SOC 2 Type II, HIPAA`; `Backend — Google Cloud — Cloud Run serverless containers — SOC 2, ISO 27001, GDPR`; `Edge — Cloudflare — Global CDN and DDoS protection — SOC 2, ISO 27001, PCI DSS`; footer `All vendors SOC 2 certified`, `Data encrypted in transit and at rest`) → `[02] Data Protection / The Spec Sheet` (H2 `How we protect your data.`; six rows: `Encryption in transit — TLS 1.3`, `Encryption at rest — AES-256`, `Data isolation — Row-Level Security`, `Access control — Role-based (RBAC)`, `Authentication — MFA available`, `Secure sessions — JWT + HTTP-only`) → `[03] Privacy / Your Rights` (H2 `Privacy-first by design.`; link `Read privacy policy` → `/privacy`) → C8 `Security FAQ.` → C12 `Questions about security?`

### 5.14 `/privacy`

- Title: `Privacy Policy | Trakkr`. Meta: `Your data belongs to you. We collect only what we need, protect it with encryption, and never sell your information. Read our privacy policy in plain English.`
- H1: `Your data belongs to you.` Sub: `We wrote this policy in plain English because you deserve to know exactly what happens with your information. No legal gymnastics, no fine print tricks.`
- Meta strip: `Updated June 2, 2026`, `5 min read`, `Encrypted in transit and at rest`, `Delete your account anytime`, `We never sell your data`.
- Controller note: `Trakkr is the data controller responsible for your personal information. We are based in the United Kingdom, and this policy is governed by UK data protection law (the UK GDPR and Data Protection Act 2018).`
- `On this page` anchor list, then H2 sections in order: `What we collect` (`#what-we-collect`), `How we use it` (`#how-we-use-it`), `Who we share with` (`#who-we-share-with`), `How we protect it` (`#how-we-protect-it`), `How long we keep it` (`#how-long-we-keep-it`), `Your rights` (`#your-rights`), `Cookies` (`#cookies`), `International transfers` (`#international`), `Children` (`#children`), `Google user data` (`#google-data`), `Changes` (`#changes`). Closing H3 `Questions about your privacy?`
- Each section opens with a `TL;DR:` line, e.g. `TL;DR: Only what we need to run Trakkr`.
- Outbound links: ICO complaints, Meta, Google ad settings, LinkedIn retargeting opt-out, Google API Services User Data Policy.

### 5.15 `/terms`

- Title: `Terms of Service | Trakkr`. Meta: `Fair terms written in plain English. Your content belongs to you, cancel anytime, no penalties. Read our terms of service without needing a lawyer.`
- H1: `The rules of the road.` Sub: `Legal documents are usually painful. We wrote ours differently. These are the terms that govern your use of Trakkr, explained like we would explain them to a friend.`
- Meta strip: `Updated December 16, 2025`, `7 min read`, `Fair terms in plain English`, `Your content belongs to you`, `Cancel anytime, no penalties`.
- H2 order with anchors: `Accepting these terms` (`#acceptance`), `What Trakkr does` (`#the-service`), `Your account` (`#your-account`), `Payment & billing` (`#payment`), `Your content` (`#your-content`), `Acceptable use` (`#acceptable-use`), `Service availability` (`#service-level`), `Liability & warranties` (`#liability`), `Ending the relationship` (`#termination`), `General provisions` (`#general`). Closing H3 `Still have questions?`
- Same `TL;DR:` pattern as `/privacy`. Minimum age stated: `at least 16 years old`.

### 5.16 `/support`

- Title: `Support - Get Help with Trakkr`. Meta: `Find answers in our documentation, report bugs, or contact the Trakkr team directly. Support for Looker Studio, Google Sheets, API, and all platform features.`
- H1: `How can we help?` Eyebrow `Support`. Sub: `Find answers in our docs, report a bug, or reach out directly.`
- Sections: `[01] Self-Service / Start here` (`Documentation` → `/learn/docs` CTA `Browse docs`; `Getting started` → `/learn/docs/getting-started` CTA `Quick start guide`; `API reference` → `/learn/api` CTA `API docs`) → `[02] Contact Us / Direct support` (`Email support` — `We aim to respond within one business day.`; `Report a bug` CTA `Send bug report`, both obfuscated mailto) → `[03] Integration Help` (`Looker Studio` → `/looker-studio`; `Google Sheets` → `/learn/docs/features/integrations/google-sheets`).
- Footer of page shows `Status unavailable` and `Status page` → `/status`.

### 5.17 `/integrations`

- Title: `Integrations`. Meta: `Connect Trakkr to your favorite tools. Slack notifications, Google Sheets export, REST API, webhooks, and Zapier automation. Integrate AI visibility data...`
- H1: `Your visibility data, everywhere`. Hero rotator: `Connect to Zapier / Slack / Sheets`. Sub: `Build custom integrations with our API.` CTA `Get started`. Caption `14-day free trial · Cancel anytime · 6,000+ apps via Zapier`.
- Sections: `[01] Featured / Most Popular` (Zapier badge `Popular`, `6,000+ apps`; Slack) → `[02] Ecosystem / All Integrations` H2 `Browse the ecosystem.` `13 integrations available`, filter chips `All | Automation | Communication | Data | Sites | Project`. Entries: Zapier (automation), Slack (communication), Google Sheets (data), Make (automation), Webhooks (automation), Discord (communication), Linear (project), Notion (project), WordPress (sites), Shopify (sites), Webflow (sites), HubSpot (data), Airtable (data) → `[03] AI Workflows / Crawlers, attribution, llms.txt` H2 `Practical guides for the tools already in your stack.` Nine guide cards → `/integrations/cloudflare-ai-crawler-monitoring`, `/integrations/vercel-ai-crawler-logs`, `/integrations/netlify-ai-bot-tracking`, `/integrations/wordpress-llms-txt-generator`, `/integrations/shopify-ai-search-visibility`, `/integrations/webflow-ai-seo`, `/integrations/ga4-ai-search-attribution`, `/integrations/looker-studio-ai-visibility-dashboard`, `/integrations/google-search-console-ai-visibility` → H2 `Build anything with our API.` (`API documentation` → `/learn/api`, `Get API key` → `/exports/api-keys`, `Request integration` → mailto) → C12 `Start tracking in 60 seconds.`

### 5.18 `/looker-studio`

- Title: `Looker Studio Connector - AI Visibility Data | Trakkr`. Meta: `Pull AI visibility scores, citations, competitor rankings, perception metrics, AI crawler activity, and live visitor traffic from Trakkr into Google Looker...`
- H1: `Your AI visibility, in Looker Studio.` Eyebrow `Looker Studio Connector`. Sub: `Pull visibility scores, citations, competitor rankings, perception, crawler activity and live AI traffic from Trakkr straight into your Looker Studio reports. 17 datasets, live refresh, no code.`
- CTAs: `View plans` → `/pricing`; `Open in Looker Studio` → `https://lookerstudio.google.com/datasources/create?connectorId=AKfycbzLPBDYgKvKQbbzs0V52-3AYzmCj5U-pvgAt-MKBs3tZGKWCihxwHVzM7xtPLv3v5VRZw`. Caption `Scale plan · live refresh · no code.`
- Sections: `[01] How it works / Three steps` (`1 Generate an API key` — `Create a personal API key from Settings → API in your Trakkr dashboard.` sample `tk_live_••••••4f8a`; `2 Add the data source`; `3 Build your reports`) → `[02] What you can pull / 17 datasets` (H3 groups `Visibility`, `Citations`, `Competition`, `Perception`, `AI crawlers`, `Live visitors`) → `[03] Requirements / Three things` (H3s `Scale plan or higher`, `A personal API key`, `A Google account`) → H3s `Data privacy`, `Support` → C12 `Build your AI visibility dashboard.` CTA `Create free account` → `/start`.

### 5.19 `/case-study` → `/double`

- Title: `Double how often AI pulls your content, free | Trakkr`. Meta: `We'll do the work to double how often ChatGPT, Perplexity and Claude pull your pages into their answers. It's free, and you only become a case study if it...`
- H1: `We'll double how often AI pulls your content.` Eyebrow `Three spots open this round`.
- Hero sub, verbatim: `When someone asks ChatGPT or Perplexity a question, it goes and fetches real pages to answer them. We'll do the writing and the technical work to double how often it fetches yours, for free. The only thing we ask back is a case study, and only if it actually works.`
- CTAs: `Apply for a spot` → `#apply`; `How it works` → `#how`.
- C3 mock: `yourbrand.com`, `Day 34 of 90`, `Cited in AI answers`, `2× goal`, `1,236 Today`, `hits 2× · day 78`, `1,980 Day 0 → Day 90`, `Who's citing you: ChatGPT 58% / Perplexity 24% / Claude 18%`, `Pages published 11`, `Fixes shipped 16`, `Waiting on you 3` with `Approve` / `Later` buttons.
- H3 section order: `Connect your logs`, `We set the baseline`, `We do the work`, `We aim for 2×`, `Why it's free`, `The bet is ours, not yours`, `You approve the work` → C12 `Want one of the three spots?`
- Extra link: `Connect on LinkedIn` → `https://www.linkedin.com/in/mack-grenfell/`.

### 5.20 `/open-source`

- Title: `Trakkr Console: our own AI search analytics, open source`. Meta: `Trakkr's own crawler analytics, opened read-only. See conversation citations, crawls, coverage, platforms and health across trakkr.ai in one public workspace.`
- H1: `Overview`. Page heading `How AI uses trakkr.ai.`
- Body, verbatim: `You're looking at Trakkr's own workspace, opened read-only. This is the same crawler analytics every Trakkr customer gets, pointed at trakkr.ai itself. Conversation citations are pages cited in live AI conversations; crawls are training and search-index fetches. The log stream syncs hourly from Cloudflare.`
- The footer labels this page `Live Workspace`. The rest of the workspace renders client-side and was NOT OBSERVED.

### 5.21 `/answers`

- Title: `Answers: real questions about AI visibility | Trakkr`. Meta: `Clear, first-party answers to real questions about AI visibility, reviewed by a human before publishing.`
- H1: `Answers`. Eyebrow `KNOWLEDGE BASE`. Sub, verbatim: `Real questions about AI visibility, each with one clear answer. Every answer comes from a real support question and is reviewed by a human before it is published. Browse by topic, then open a category for the complete set.`
- Own chrome (see §1.3). Client-rendered.
- Category list with counts: `Visibility scoring 7`, `Prompts 5`, `Citations 6`, `Competitors 4`, `AI engines 5`, `Plans & billing 9`, `API & integrations 12`, `Site & crawler setup 10`, `Login & account access 4`, `Reports & exports 5`, `Team & seats 5`, `Agent & Actions 4`, `Cancellation & refunds 16`, `Trials & upgrades 4`, `Getting started 3`.
- `MOST ASKED` list. Each row is a question in lower case plus an `asked N times` counter. Examples: `how much does trakkr cost? asked 82 times`, `how is my visibility score calculated? asked 74 times`, `which AI engines does trakkr track? asked 71 times`.
- Each category block repeats the pattern: H2 name, `All N`, one-line description, then three sample questions with counters.

### 5.22 `/glossary`

- Title: `AI Visibility Glossary | Trakkr`. Meta: `172 terms explained: AI visibility, GEO, brand mentions, AI citations, and everything you need to understand how brands appear in ChatGPT, Claude, and...`
- H1: `AI visibility glossary`. Breadcrumb `Resources / Glossary`. Sub: `Everything you need to understand AI search, GEO, and brand visibility in the age of ChatGPT and Perplexity.` Counters `178 terms`, `8 categories`. The meta description says 172; the page says 178.
- Section `[01] All Terms / 178 definitions`. Level chips `Beginner | Intermediate | Advanced`. Category chips with counts: `All 178`, `AI Search 16`, `Optimization 19`, `Measurement & Analytics 26`, `AI Models 44`, `SEO Fundamentals 26`, `Strategy 22`, `Emerging Concepts 20`, `Companies 5`. A–Z index. Line `Showing 178 of 178 terms`.
- Term card anatomy: initial letter · term name · level badge · one-sentence definition · category label. Link pattern `/glossary/:slug`.
- Closing band: H2 `Ready to master AI visibility?`

### 5.23 `/bots`

- Title: `AI Crawler Bot Directory | Trakkr`. Meta: `A source-graded directory of AI crawler user agents, operators, robots.txt posture, verification links, and handling guidance for search, training, and live...`
- H1: `AI crawler bot directory`. Breadcrumb `Resources / AI crawler directory`. Sub: `Current, source-graded facts and practical handling guidance for crawlers, live fetchers, agents, and control tokens.` Counters `78 sourced entries`, `47 operator sources`, `14 with live data`.
- Section `[01] All Bots / 78 entries`. Filter chips: `All 78`, `Training crawler 19`, `AI search crawler 22`, `Live fetcher 17`, `SEO tool crawler 2`, `Social crawler 3`, `Other crawler 15`.
- Group heading anatomy, e.g. `Training crawler — Collects or controls access to content that can feed AI training data. — 19 bots`.
- Entry anatomy: bot name · category badge · optional `Live data` badge · description · operator · robots.txt posture (`Honors robots.txt` / `Partial or user-triggered`) · source label (`Operator source` / `Trusted crawler list`) · user-agent string. Link pattern `/bots/:slug`.
- Closing sections: H2 `How to use this directory` (H3s `Check the token`, `Open the source`, `Separate telemetry`) → C12 `See which AI crawlers actually visit your site`.

### 5.24 `/blog`

- Title: `Blog | Trakkr`. Meta: `Original insights on how AI talks about brands, and how to shape the conversation. Research, strategy, and product updates from the Trakkr team.`
- H1: `Thinking about AI visibility`. Eyebrow `Blog`. Sub: `Original insights on how AI talks about brands, and how to shape the conversation.`
- Sections: `[01] Latest / Featured` → `[02] Archive / All posts` → C12 `See how AI talks about your brand`.
- Featured card: category badge `Research` + `Featured`, title, dek, `11 min read`, `Mar 31, 2026`, CTA `Read article`, byline `Mack Grenfell · Founder`.
- Archive filters: `All 6`, `Research 6`, `Strategy 1`.
- Archive card anatomy: `Category · Date · N min` then title then dek. Link pattern `/blog/:slug`.

---

## 6. Programmatic template families

For every family: fixed chrome first, then variable slots.

### 6.1 `/reviews` (index) and `/reviews/:slug`

**Index `/reviews`**

- Title: `AI Visibility Tool Reviews | Trakkr`. Meta: `Browse Trakkr editorial reviews of AI visibility, GEO, and SEO platforms, with pricing, evidence, tradeoffs, and buyer fit checked before you buy.`
- H1: `Honest reviews of AI visibility tools`. Breadcrumb `Resources / Reviews`. Sub: `Editorial breakdowns of AI visibility platforms, SEO suites, and GEO workflows. Use this archive to compare pricing, tradeoffs, and best-fit buyer before you shortlist anything.` Counters `17 reviews`, `4.3 average score`, `7 specialist tools`.
- Sections: `[01] How we evaluate / Methodology` (H3 `What counts as an AI visibility tool`; scoring bullets `Platform coverage`, `Evidence depth`, `Pricing transparency`, `Agency and enterprise fit`, `Verification`; a `Best tool by need` table with columns `If you need | Start with`) → `Review Archive` (17 cards) → `Compare & alternatives` (per tool, three links: review, `X vs Trakkr`, `X alternatives`) → C12 `Want to compare your own brand instead?`
- Card anatomy: category label (`AI visibility` / `SEO suite` / `Hybrid workflow`) · score `/4.6/5` · `X Review` · one-line verdict. Link `/reviews/:slug`.
- Full list observed: AthenaHQ 4.6, Profound 4.6, Ahrefs 4.5, Semrush 4.5, Conductor 4.4, Evertune 4.4, LLM Pulse 4.4, LLMrefs 4.3, Peec AI 4.3, Writesonic 4.3, AIClicks 4.2, Mentions 4.2, Otterly 4.1, SE Ranking 4.1, BrightEdge 4.0, Nightwatch 4.0, Scrunch AI 3.9.

**Example `/reviews/profound-review`**

- Title: `Profound Review 2026: Features, Limits and Verdict | Trakkr`
- Meta: `Profound review verified August 2026: Prompt Volumes, Shopping, Agents, limitations, buyer fit, annual-plan context, and alternatives.`
- H1: `Profound Review 2026: Features, Limits and Verdict`
- Fixed chrome, top to bottom:
  1. C15 sticky bar: eyebrow `Trakkr vs Profound`, H3 `Run your own free AI visibility scan`, line `all 8 AI models on every plan. First scan in under 2 minutes. No demo call required. · 14-day free trial · Cancel anytime`, button `Start free trial`.
  2. Breadcrumb `All reviews` → `/reviews`.
  3. Kicker `Review` · tool name · `In-depth review`.
  4. H1, then a dek paragraph.
  5. Byline `Mack Grenfell — Founder, Trakkr` → `https://trakkr.ai/about/mack-grenfell`; `22 min read`; `Last updated: August 1, 2026`.
  6. `Quick answer` box, H2 phrased as a question (`Is Profound worth it in 2026?`).
  7. `Best for` / `Avoid if` pair.
  8. H2 `When Trakkr is better than [Tool]`, H3 `Break [Tool] down by buying intent`.
  9. H2 `How we verified [Tool]`.
  10. Body H2s: `What is [Tool]?`, `How much does [Tool] cost?`, `What [Tool] does well (pros)`, `Where [Tool] falls short (cons)`, `Is [Tool] good for startups?`, `Features deep-dive`, `Who should use [Tool]?`, `What real users say about [Tool]`, `[Tool] G2 and Capterra reviews: what buyers should know`, `[Tool] vs Trakkr: feature-by-feature comparison` (C6), `What are the best [Tool] alternatives?`, `The bottom line`.
  11. C8 `Quick answers about [Tool]` with 7 H3 questions.
  12. Child-page grid: `Pricing 8 min`, `Features 7 min`, `Who it's for 6 min`, `Limitations 7 min` → `/reviews/:slug/pricing`, `/features`, `/who-its-for`, `/limitations`.
  13. C16 cluster grid and an outbound source list.
  14. C12 `See how AI talks about your brand`.
- **Variable slots per slug:** tool name, review score, read time, `Last updated`, dek, `Best for` line, `Avoid if` line, pricing figures, pros, cons, competitor comparison rows, alternative cards, FAQ set, outbound source URLs, and the `cta_id` fragment inside every CTA link.
- **CTA URL pattern (variable):** `/start?content_slug=<slug>&route_family=reviews&content_intent=commercial-review&competitor=<tool>&cta_id=<slug>-<position>`. Observed `cta_id` positions: `sticky`, `answer`, `primary`, `alternative-card`, `decision`, `startup-fit`, `mid-article`, `comparison`, `product-context`.

### 6.2 `/compare` (index) and `/compare/:slug`

**Index `/compare`**

- Title: `Tool Comparisons | Trakkr`. Meta: `Head-to-head comparisons of AI visibility, SEO, and marketing tools. Find the right solution for tracking your brand in AI search.`
- H1: `Tool comparisons`. Breadcrumb `Resources / Compare`. Sub: `Head-to-head comparisons of AI visibility, SEO, and marketing tools. Find the right solution for your brand.` Counters `676 comparisons`, `39 featuring Trakkr`, `637 tool-vs-tool`.
- Sections: `[01] Featured head-to-heads / 6 bespoke comparisons` (blurb: `Hand-built side-by-sides with full pricing tables, cost-per-prompt math, platform coverage matrices, and use-case fit. Updated against public pricing pages within the last 30 days.`) → `[02] All Comparisons / 676 articles` with chips `All 676`, `Trakkr vs... 39`, `Tool vs Tool 637` → C12 `Ready to compare your AI visibility?`
- Featured cards: `Profound vs Trakkr`, `AthenaHQ vs Trakkr`, `Conductor vs Trakkr`, `Otterly AI vs Trakkr`, `Writesonic vs Trakkr`, `AIClicks vs Trakkr`. Each has badge `Featured`, one-line hook, and tag `Head-to-head`.
- Archive card: title, badge `Trakkr`, generic dek (`A detailed comparison of AI visibility tracking platforms. See how Trakkr stacks up against <Tool> for monitoring your brand across AI search.`), read time (`9 min`).
- Slug shapes differ. Bespoke pages use `<tool>-vs-trakkr`. Bulk pages use `trakkr-vs-<tool>`.

**Example `/compare/profound-vs-trakkr`**

- Title: `Profound vs Trakkr: Cost, Plans & Cheaper Alternative`
- Meta: `Compare Profound and Trakkr on real cost, AI platform coverage, free trial, setup time, enterprise gates, and which tool fits your team.`
- H1: `Profound vs Trakkr: cost, plans & cheaper alternative`
- Fixed chrome: C15 sticky bar (`Run a free AI visibility scan` · `All 8 AI models on every Trakkr plan. First scan in under 2 minutes. No demo call. · 14-day free trial · From $100/mo · Cancel anytime`) → breadcrumb `All comparisons` → kicker `vs` + `Head-to-head` → H1 → dek → byline + `16 min read` + `Last updated: August 1, 2026`.
- Section order (H2): `[Tool] vs Trakkr: which is better in 2026?` (quick answer) → three summary chips (`Trakkr entry price`, `[Tool] pricing`, `When [Tool] wins`) plus a `Verified` stamp → `Evidence checked` (sub-rows `Sources`, `Pricing`, `Method`, `Updated`) → `[Tool] pricing in 2026 at a glance` → `TL;DR: [Tool] vs Trakkr at a glance` → `[Tool] pricing vs Trakkr pricing: where the gap actually lives` → `What would [Tool] cost for your team?` with H3 `Price check: [Tool] vs Trakkr for your spec` → `Platform coverage: [Tool]'s tiers vs Trakkr's 8` → `Use-case fit: which tool wins for your team?` (H3s `Agencies and consultants`, `In-house brand and growth teams (mid-market)`, `Startups and founders`, `Enterprise brands with dedicated analytics teams`, `E-commerce and retail brands`) → `When [Tool] is the right answer (and we mean it)` (three H3 cases) → `The bottom line` → `More on [Tool], Trakkr, and AI visibility tools` → C8 `Frequently asked questions` → C12.
- **Variable slots:** rival name, entry price, coverage figures, trial length, verification date, read time, the three `use-case fit` verdicts, the `when the rival wins` list, the related-links grid, and the CTA ref `?ref=<slug>`.

### 6.3 `/alternatives` (index), `/alternatives/:slug`, `/alternatives/:slug/:modifier`

**Index `/alternatives`**

- Title: `Software Alternatives | Trakkr`. Meta: `Find the best alternatives to popular software tools. Compare features, pricing, and AI visibility performance of top tools in every category.`
- H1: `Tool alternatives`. Breadcrumb `Resources / Alternatives`. Sub: `Find the best alternatives to popular SEO, AI visibility, and marketing tools. Each guide includes detailed comparisons, pricing, and recommendations.` Counters `43 tools covered`, `386 alternatives reviewed`, `12 categories`.
- Section `[01] All Alternatives / 43 guides`. Category chips: `All`, `AI Visibility`, `Competitive Intelligence`, `Content Generation`, `Content & GEO`, `Content SEO`, `Enterprise SEO`, `Free Tools`, `Platform-Specific`, `SEO`, `SEO + AI Hybrid`, `SEO Automation`, `Social Listening`.
- Card anatomy: category label · `<Tool> Alternatives` · dek · `N options`. Link `/alternatives/<tool>-alternatives`.
- Closing band: H2 `Looking for AI visibility specifically?` CTA `Try Trakkr free` → `/login`.

**Example `/alternatives/profound-alternatives`** (client-rendered)

- Title: `8 Profound Alternatives Compared by Price and Engine Coverage (2026) | Trakkr`
- Server meta description (differs from the client title): `Profound publishes Starter at a $99 monthly equivalent and Growth at a $399 monthly equivalent, both billed annually. Growth has a 7-day trial; Enterprise is a custom quote.`
- H1: `8 Profound Alternatives Compared by Price and Engine Coverage (2026)`
- Fixed chrome: breadcrumb `All alternatives` → eyebrow `ALTERNATIVES TO <Tool>` + counter `N ALTERNATIVES` → H1 → dek → byline + read time + `Last updated`.
- Section order (H2): `What are the best [Tool] alternatives in 2026?` (`QUICK ANSWER`) → three chips (`CHEAPEST PICK`, `MOST ENGINES PER DOLLAR`, `PROFOUND PRICING`) → a disclosure paragraph (`Trakkr is one of the alternatives here, so we have done the opposite…`) → `[Tool] alternatives compared (2026)` (C6) → `The pattern in the data: transparency and engine gating` → `[Tool] pricing: public plans vs the custom quote` → `What [Tool] does well` → `Who should stay on [Tool]` → `Why teams look for [Tool] alternatives` → `Find the right pick for your situation` (H3 modifier links) → `The N best [Tool] alternatives in 2026` (one H3 per alternative) → `How to choose the right [Tool] alternative` → `The Trakkr case (our product)` → `Trakkr vs [Tool]: feature by feature` → `The bottom line` → `Everything on [Tool], in one place` (C16) → C12.
- Alternatives listed on this slug: Trakkr, SE Ranking, Otterly AI, Peec AI, Ahrefs Brand Radar, Scrunch, Rankability, Conductor.
- CTA refs: `?ref=profound-alternatives-answer`, `-hub`, `-bottomline`, `-cta`.

**Nested modifier `/alternatives/:slug/:modifier`** — example `/alternatives/profound-alternatives/for-agencies`

- Modifiers observed for this slug: `for-agencies`, `cheap`, `small-business`, `startups`.
- Title: `Profound Alternatives for Agencies: Compare Agency Workflows | Trakkr`
- Meta: `Compare Profound with agency-ready AI visibility tools across white-label client portals, multi-client reporting, evaluation paths, and published pricing.`
- H1: `Profound Alternatives for Agencies: Compare Agency Workflows`
- Chrome: breadcrumb `Profound alternatives` → eyebrow `Agency buyer guide` → mini-title `Profound alternatives for agencies` → badge `Agency shortlist` → H1 → dek → byline + `Last updated`.
- Section order (H2): `What is the best [Tool] alternative for [audience]?` (`Quick answer`) → three chips (`Best agency pick`, `[Tool] agency pricing`, `[Tool] per client`, `White-label`) → `The agency math: published price versus custom quote` → `What agencies should score first` (H3s `Per-client economics`, `White-label dashboards and reports`, `Exports and reporting workflow`, `Client switching and seats`) → `White-label and multi-client, the way Trakkr actually does it` → `Agency comparison: the rows that decide it` (C6) → `When an agency should still put a client on [Tool]` → `Keep comparing` → `Everything on [Tool], in one place` (C16) → C12 `Run the agency math on your own roster`, CTA `Start your agency trial` → `/start?ref=profound-agencies`.
- **Variable slots:** the audience token drives the eyebrow, H1 suffix, the quick-answer question, the four scoring H3s, and the CTA ref.
- Verbatim pricing claim on this page: `Trakkr bundles 10 client brands into Scale at $500/mo, adds an optional $49 per brand for a fully white-labeled client portal, and lets you self-serve with a 14-day trial.`

### 6.4 `/guides` (index) and `/guides/:slug`

- `/guides` title: `AI Visibility & Brand Monitoring Guides - ChatGPT, Claude, Gemini | Trakkr`. Meta: `Data-backed guides for tracking and improving your brand's visibility across ChatGPT, Claude, Gemini, Perplexity, and more. Based on research across 7.` H1: `AI Visibility Guides`. JSON-LD carries a second script with `CollectionPage`.
- The `/guides` index served only the shared SEO fallback in server HTML. Its rendered card grid was NOT OBSERVED.
- The fallback exposes guide links in two shapes: root-level `/track-brand-mentions-in-<model>` and `/guides/<slug>` (`/guides/deepseek-brand-monitoring`, `/guides/how-to-appear-in-chatgpt`, `/guides/how-to-get-cited-by-perplexity`, `/guides/how-to-get-cited-by-ai`, `/guides/citation-gap-analysis`, `/guides/ai-visibility-roi-attribution`).
- `/guides` also accepts a topic query: `/guides?topic=procurement` (linked from `/resources` as `Procurement templates`, `9 guides`).
- Example `/guides/how-to-get-cited-by-ai`: title `How to Get Cited by AI: The Complete Data-Backed | Trakkr`; meta `The top 10 domains capture 34% of all AI citations. Learn exactly what sources AI trusts, how crawlers evaluate your site, and how to earn citations across 8 models.`; H1 `How to Get Cited by AI: The Complete Data-Backed`; JSON-LD `Organization, WebSite, Person, WebPage, Article, FAQPage, BreadcrumbList`. Body is client-rendered and was NOT OBSERVED.

### 6.5 `/free-tools` (index) and tool pages

**Index `/free-tools`**

- Title: `Free AI Visibility Tools | Trakkr`. Meta: `Free tools to audit your AI visibility, benchmark your brand, compare pricing, and track AI search traffic across ChatGPT, Claude, Perplexity and Gemini.`
- H1: `Free AI visibility tools.` Eyebrow `Free tools`. Sub: `Audit your site, benchmark your brand, compare costs and watch how AI search sends traffic across ChatGPT, Claude, Perplexity and Gemini.` C2 form, button `Run audit`, caption `No signup · No credit card`.
- Section `[01] Pick a tool / Run it on your domain`. Nine cards. Card anatomy: type badge (`Audit` / `Benchmark` / `Traffic` / `Compare`), optional status badge (`Start here`, `New`, `Live`, `15,000+ brands`), H3 name, one-line dek, CTA label.

| Tool                        | Badges                    | Dek                                                                                                              | CTA             | href                                      |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------- |
| AI Site Grader              | Audit, Start here         | `See how ChatGPT, Claude and Perplexity read your site, with the fixes that matter most.`                        | Run audit       | `/free-tools/ai-site-grader`              |
| AI Rank Tracker             | Benchmark, New            | `See where your brand ranks when buyers ask ChatGPT for a recommendation, with the model's own answer as proof.` | Check my rank   | `/free-tools/ai-rank-tracker`             |
| ChatGPT Ads Context Hints   | Audit, New                | `The ChatGPT buyer moments you are losing, each with an OpenAI Ads planning pack.`                               | Find the gaps   | `/free-tools/chatgpt-ads-context-hints`   |
| AI Share of Voice           | Benchmark                 | `Score your brand against competitors across ChatGPT, Claude and Perplexity.`                                    | Run analysis    | `/free-tools/ai-share-of-voice`           |
| AEO Checker                 | Audit                     | `Check entity clarity, citation readiness and coverage before AI decides to recommend you.`                      | Check readiness | `/free-tools/aeo-checker`                 |
| llms.txt Generator          | Audit                     | `Generate a clean llms.txt telling AI crawlers which pages matter most on your site.`                            | Generate file   | `/free-tools/llms-txt-generator`          |
| Visibility Index            | Benchmark, 15,000+ brands | `See where thousands of brands rank for AI visibility, and where your category is moving.`                       | Browse rankings | `/data/rankings`                          |
| AI Search Traffic Index     | Traffic, Live             | `How much real traffic ChatGPT, Claude, Perplexity and Gemini send to the web, daily.`                           | View index      | `/ai-search-traffic`                      |
| Profound Pricing Calculator | Compare                   | `Compare the real monthly cost of Profound versus Trakkr, by platform and team size.`                            | Compare cost    | `/free-tools/profound-pricing-calculator` |

- Then `[02] Common questions / FAQ`, H2 `Simple by design.` with the line `The tools are meant to be quick snapshots. They stay free because the deeper product is continuous monitoring, not a locked calculator`, then C12 `Run the free tools once, or monitor every model continuously.` CTAs `Start free` → `/start`, `See how it works` → `/features`.

**`/free-tools/ai-site-grader`** — no scan was run.

- Title: `AI Site Grader — Free AI SEO & ChatGPT Visibility Checker | Trakkr`
- Meta: `Free AI site grader — see exactly how ChatGPT, Claude and Perplexity read your website, then get a graded brief with fixes to improve AI visibility.`
- H1: `What ChatGPT, Claude and Perplexity actually see when they read your site.`
- Sub: `60 seconds. One brief. Every finding linked to the evidence.`
- **Form:** one `<form>`, one text input with placeholder `yourbrand.com`, one submit button labelled `Audit`. No name attribute, not marked required. Caption `Free · No signup · About 60 seconds`.
- Shortcut row: `Or audit one of these` → `Stripe`, `Linear`, `Notion`, `Vercel`, `Figma`.
- Section `[01] See one in action / Real audits`. Four sample result cards, each with domain, category, verdict line, a two-part score (`1 35`, `2 43`, `3 52`, `4 44`), and an `Audit→` link. Verbatim verdicts: `Stripe ships the cleanest AI-ready surface of any developer brand audited.`; `Linear treats llms.txt as a release artifact, but its blog still ships behind JS.`; `Notion blocks GPTBot but allows Perplexity — an inconsistent crawler policy.`; `Figma's two-tier allowlist is the most nuanced AI crawler strategy in tech.`
- Section `[02] What it checks / AI Visibility Factors`. Six output categories, each with a machine key:
  - `crawler` — **Crawler access** — `Fetches your site as GPTBot, ClaudeBot and PerplexityBot. Flags UA-based blocks.`
  - `content` — **Content surface** — `Extracts what AI actually reads: title, headings, JSON-LD schema, visible text.`
  - `declared` — **Declared map** — `robots.txt rules, llms.txt presence, sitemap depth, internal link graph.`
  - `cold` — **Cold knowledge** — `Polls a frontier LLM with no search — what models know about your brand cold.`
  - `off-site` — **Off-site signals** — `External mentions, Wayback snapshots, hosting and CDN fingerprint.`
  - `evidence` — **Evidence trail** — `Every finding linked to the underlying tool result — verifiable, not invented.`
- Section `[03] Common questions / FAQ`: `What is an AI SEO checker?`, `Is this really free?`, `Why does AI visibility matter for my business?` and more.

**`/free-tools/llms-txt-generator`** — no generation was run.

- Title: `Free llms.txt Generator — Create an llms.txt for Your Site | Trakkr`
- Meta: `Generate a clean, spec-compliant llms.txt for any website in seconds. Free, no signup — watch the file get written live, then copy or download it for your site...`
- H1: `Generate a clean llms.txt for your site — and watch it get written.`
- Eyebrow `Free llms.txt generator`. Sub: `Trakkr maps your site, reads the key pages, and writes a spec-compliant llms.txt you can copy or download. The file AI models read to understand you.`
- **Form:** one `<form>`, one text input with placeholder `yourbrand.com`, one submit button labelled `Generate`. Caption `Free · No signup · About 15 seconds`.
- Shortcut row: `Or try one of these` → `Stripe`, `Vercel`, `Linear`, `Notion`, `Anthropic`.
- Section `[01] What is an llms.txt? / The spec`. Explainer, plus an annotated file skeleton: `# Your Brand` (`An H1 with the site name — the one strictly required line.`), `> What the company is and does.` (`A blockquote summary: plain facts, not a tagline.`), `## Product` (`Named sections that mirror your real site structure.`), `- [Pricing](/pricing): plans and limits.` (`Each link with a specific one-line description.`), `## Optional` (`Secondary pages a model can skip under tight context.`). Outbound link `llmstxt.org` → `https://llmstxt.org`.
- Section `[02] How it works / Discover · Read · Write`. Three steps: `Discover — Map the site`, `Enrich — Read the key pages`, `Compose — Write llms.txt`.
- Section `[03] Common questions / FAQ`.
- **Outputs described, not run:** a copyable and downloadable spec-compliant llms.txt with grouped sections and grounded one-line descriptions, written live. Actual output was NOT OBSERVED.

### 6.6 Rankings family — `/data/rankings` (canonical) and entity pages

`/rankings`, `/rankings/ai-500`, `/rankings/methodology`, and `/ai-500` all redirect to `/data/rankings`. A separate `/rankings/methodology` template does not exist; the methodology is a block inside `/data/rankings`.

**`/data/rankings`**

- Title: `AI Rankings - The Brands AI Recommends Most | Trakkr Data`. Meta: `Brands ranked by how often ChatGPT, Gemini, Perplexity and other AI engines recommend them. Updated daily. Open dataset.`
- H1: `Rankings`. Sub: `The brands AI recommends most, ranked by a cross-model visibility score across ChatGPT, Gemini, Perplexity and more. Movement shows the shift over the last 24 hours and 7 days.`
- Tabs: `Rankings` → `/data/rankings`, `Industries` → `/data/industries`, `Agencies` → `/data/agencies`, `Investors` → `/data/investors`. Filter `All sectors`. View toggle `Table | Chart`.
- `Methodology` block, verbatim: `Built from how often ChatGPT, Gemini, Perplexity and other AI engines name each brand across the prompts Trakkr tracks, scored into a 0-100 cross-model visibility index and recounted daily. Movement is the change in that score over the last 24 hours and 7 days.`
- `Open data` block: `GitHub repository` → `https://github.com/trakkr-aisearch/ai-500`; `Latest JSON` → `https://raw.githubusercontent.com/trakkr-aisearch/ai-500/main/latest.json`; `Rankings API` → `https://api.trakkr.ai/public/rankings/global?limit=500`; labels `Trakkr AI 500 · Citations`, licence `CC BY 4.0`.
- C12: H2 `Put the data to work for your brand.` Sub `See where AI leaves you out, what drives the gap, and the actions that can improve your visibility.` C2 form, button `Check my brand`, caption `See your first finding before you sign up.`
- C8 `Common questions`: `How are AI rankings calculated?`, `Which AI models do the rankings cover?`, `Can I download the rankings data?`

**Entity page pattern — `/data/brands/:Name`** (slug is the display name, URL-encoded; e.g. `/data/brands/Adidas`, `/data/brands/Ableton%20Live`)

- Sibling entity families in the same sitemap: `/data/brands/*` (485), `/data/industries/*` (500), `/data/agencies/*` (102), `/data/investors/*` (199), `/data/sectors/*` (7: `b2b`, `b2c`, `finance`, `hardware`, `health`, `media`, `platform`). Total 1,293 URLs in `sitemap-data-entities.xml`.
- Example `/data/brands/Adidas`:
  - Title: `Adidas AI visibility profile | Trakkr Data`
  - Meta: `Adidas designs innovative athletic footwear and apparel. AI assistants like ChatGPT and Claude frequently recommend Adidas for queries related to sports gear,...`
  - H1: `Adidas`
  - Breadcrumb `Trakkr Data / Rankings / Adidas`. Kicker `Brand profile`.
  - Metric row: `Global rank #25`, `Visibility score 90.5`, `Live mentions 30`, `Industries present 12`.
  - H2 `Top category signals` — one line per category: `fashion-apparel: visibility 91.3, contribution 726.1.` Each links to `/data/industries/<slug>`.
  - H2 `Related agencies` — `Brainlabs: 16 tracked clients.` Each links to `/data/agencies/<slug>`.
  - H2 `Methodology`, verbatim: `Trakkr Data measures how AI engines recommend, cite and describe brands across tracked prompts and public crawl observations. Entity pages update daily and are published as open datasets for crawler-readable citation and comparison.`
  - Footer links: `Canonical page` → `https://trakkr.ai/data/brands/Adidas`; `Public JSON feed` → `https://api.trakkr.ai/public/rankings/brand/Adidas`; `Rankings` → `/data/rankings`.
  - JSON-LD: `WebPage`, `Dataset`, `BreadcrumbList`. This page does **not** carry the site-wide `Organization` + `WebSite` graph.
- **Variable slots:** entity name, description sentence, the four metrics, the category signal list, the agency list, and both feed URLs. Everything else is fixed chrome.

### 6.7 `/data` hub and dataset pages

- `/observatory` redirects to `/data`.
- **`/data`** — Title: `Trakkr Data - The State of AI Search, in Numbers`. Meta: `A live, explorable picture of how AI search discovers, crawls, and recommends the web - rankings, citations, crawlers, models and adoption. Open data by Trakkr.` H1: `How AI discovers, crawls, and recommends the web.` Sub: `Trakkr tracks how brands appear across ChatGPT, Gemini, Perplexity, Claude and more. Trakkr Data opens that telemetry up: rankings, citations, crawlers, models and web adoption, as live, explorable datasets.`
  - Stat band: `AI citations tracked 19M across 8 AI models`; `Brands ranked 9.3K the AI 500, and beyond`; `Domains seen in answers 38K cited sources`; `Crawler visits logged 575K AI bots, observed`.
  - Sections: `Most-recommended brands` (`View all` → `/data/rankings`) → `Biggest movers` (`View all` → `/data/movers`) → `Explore the datasets` (`8 datasets`) → C8 `Common questions` (`What is Trakkr Data?`, `Is Trakkr Data free to use?`, `How often is the data updated?`, `Where does the data come from?`) → C12 `Put the data to work for your brand.`
  - Eight dataset cards: `Rankings 9.3K`, `Citations 313K`, `Content 1.5K`, `Models 8`, `Queries 11.5K`, `Crawlers 700K`, `Web adoption 834K`, `AI traffic 4.1K` → `/data/rankings`, `/data/citations`, `/data/content`, `/data/models`, `/data/query-fanout`, `/data/crawlers`, `/data/web`, `/data/ai-traffic`.
- **Dataset page template** (`/data/citations`, `/data/ai-traffic`, and by pattern the rest): H1 = dataset name · sub-paragraph · stat band of four counters · a titled chart with range toggles (`30d | 90d`, or `7d | 90d | 6m | 1y`) and a source caption (`Source: Trakkr Citation Index · per-day new citations · CC BY 4.0`) · one or more ranked tables with `Table | Chart` toggles · narrative H2 blocks · C12 · C8. JSON-LD adds `Dataset` and `FAQPage`.
  - `/data/citations` H2 order: `Citation activity` → `The most-cited sources` → `Where AI gets its answers` → `How long a citation lasts` (H3 `Survival curve`) → `What people ask` → `What earns a citation` → `Put the data to work for your brand.` → `Common questions`.
  - `/data/ai-traffic` H2 order: `AI referral traffic over time` → `Who sends the traffic` → `How the mix is shifting` → `Where AI traffic lands` → `Common questions`.

### 6.8 `/trakkr-research` and study pages

- **Index** — Title: `AI Search Research - Citation Data, Crawler Analysis & Model Behavior | Trakkr`. Meta: `Original research on AI search behavior, citation patterns, and brand visibility across ChatGPT, Claude, Gemini, and Perplexity. Based on 7.5M+ AI responses.` H1: `Research & data`. Eyebrow `Research`. Sub: `Original research on AI search behavior, citation patterns, and brand visibility. Insights from millions of AI-generated responses.`
- Sections: `[01] Current Research / Studies` (the newest study, full width, badge `New`) → `[02] Current Research / Studies` (the archive) → `Further Reading` (six outbound arXiv papers).
- Study card anatomy: three-digit index (`011`…`001`) · title · dek · one headline metric with a caption · CTA `Explore study` · optional extra metrics.
- Numbered study list observed: `011 Cited, not chosen` → `/trakkr-research/cited-not-chosen`; `010 Do AI crawlers prefer Markdown?` → `/trakkr-research/markdown-crawler-experiment`; `009 The half-life of AI citations` → `/trakkr-research/citation-decay`; `008 The anatomy of an AI citation` → `/trakkr-research/anatomy-of-an-ai-citation`; `007 Hidden prompts in AI search` → `/ai-poison` (breaks the path pattern); `006 AI crawls your product pages. It cites your blog.` → `/trakkr-research/page-type-performance`; `005 The llms.txt effect` → `/trakkr-research/llmstxt-effect`; `004 The model divergence report` → `/trakkr-research/model-divergence`; `003 When AI comes to your website` → `/trakkr-research/crawler-behavior`; `002 How AI translates your questions` → `/trakkr-research/query-translation`; `001 Where AI gets its answers` → `/trakkr-research/citation-sources`.
- **Study template — `/trakkr-research/citation-sources`**
  - Title: `Where AI Gets Its Answers: 1.3M Citation Analysis | Trakkr Research`. Meta: `An analysis of 1.3M+ AI citations reveals Wikipedia captures 17% of all AI references while 60,000+ domains compete for visibility. Interactive data explorer.`
  - H1: `Where AI gets its answers`. Kicker `Research` + `Study 001`. Sub: `An analysis of citation patterns across AI-generated responses. Which sources do AI systems trust? Which domains appear most frequently? Explore the data.`
  - Numbered section order: `[01] Key Findings / What the Data Reveals` → `[02] Source Trends / Over Time` → `[03] The Power Law / Distribution` → `[04] Categories / Source Types` (H3 `Not all sources are equal`) → `[05] The Reddit Paradox / Myth vs Reality` (H3 `The great overestimation`) → `[06] Query Intent / Pro…` → `Methodology` → `Related Research` → `Continue with this study`.
  - `Continue with this study` links: `Answers — 12 answer pages` → `/trakkr-research/citation-sources/answers`; `Facts — 8 reference facts` → `…/answers#facts`; `Trackers — 2 benchmark trackers` → `…/answers#trackers`.
  - JSON-LD adds `Dataset` and `ResearchProject`.
  - **Variable slots:** study index, title, dek, headline metric, the numbered analysis sections, the methodology text, and the child answer-hub counts.

### 6.9 `/state-of-ai-search`

- Title: `The State of AI Search — Live Data on ChatGPT, Gemini, Perplexity & More | Trakkr`. Meta: `The live picture of how AI search discovers, crawls, and recommends the web — 18.6M citations across 4,086 properties and 8 AI models, plus the AI 500 brand...`
- H1: `The state of AI search`. Eyebrow `STATE OF AI SEARCH`. Freshness chip `Live · Updated 1d ago` plus a `Copy` action.
- Headline stat: `18.6M citations tracked`. Sub: `Every day, AI engines crawl, cite, and recommend millions of pages across 5,085 properties and 8 models. This is the live picture of what they are doing — and who is winning.`
- Stat band: `Properties 5,085`, `Models tracked 8`, `Brands ranked 9,273`, `Crawler visits 576K`, `Domains scanned 37.9K`. Plus a scrolling `Live wire` ticker (`Listening for activity…`).
- Chapter rail with nine numbered chapters: `01 Rankings`, `02 Traffic`, `03 Citations`, `04 Models`, `05 Crawlers`, `06 Content`, `07 Markdown`, `08 llms.txt`, `09 Translation`.
- Each chapter is an H2 pair: label then a question. Order: `Rankings` / `Who's winning right now?` → `Traffic` / `Who's sending the traffic?` (H3 `AI referral traffic by source`) → `Citations` / `Who gets recommended?` → `Model agreement` / `Do AI models agree?` → `Crawlers` / `How do they find you?` → `Content` / `What content wins?` → `Markdown` / `Do crawlers prefer Markdown?` → `llms.txt` / `Does llms.txt actually help?` → `Translation` / `What happens to your search?` → `How we measure this` → `The research behind this page` → C12 `You've seen the whole map. Now find your brand on it.`
- `What the data says right now / The three biggest shifts`, verbatim: `01 Attention is concentrating — 92% of all AI referral traffic now comes from ChatGPT alone — more than every other model combined.` `02 The models rarely agree — Ask eight models the same question and their answers overlap just 43% of the time.` `03 Crawlers read once and leave — 88.5% of pages are fetched exactly once, then never crawled again — first impressions are e…`
- Open-data footer: `AI 500 leaderboard JSON`, `AI 500 snapshot CSV` (`.../snapshots/2026-05.csv`), `AI 500 API REST`, `Awesome GEO Index` → `https://github.com/trakkr-aisearch/awesome-geo`.

### 6.10 Directory templates (shared shape)

`/playbooks`, `/market-reports`, `/platforms`, `/insights`, `/fix`, `/industries`, `/ai-recommends` all use one template. Fixed chrome: breadcrumb `Resources / <Label>` → eyebrow → H1 → sub-paragraph → counter chips → `[01] <Section> / N items` → optional filter chips → a card grid → C12.

| Page              | Title                                                        | H1                            | Sub                                                                                                                                                | Counters                                             | Card link pattern                                                     |
| ----------------- | ------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| `/playbooks`      | `AI Visibility Playbooks - Step-by-Step Guides \| Trakkr`    | `AI visibility playbooks`     | `Step-by-step strategies to improve how AI chatbots recommend and discuss your brand. Phased approaches with clear metrics and deliverables.`      | `50 Playbooks`, `4-5 phases each`                    | `/playbooks/:category`                                                |
| `/market-reports` | `AI Visibility Reports 2026 - Market Intelligence \| Trakkr` | `AI visibility reports`       | `Comprehensive market intelligence reports on AI visibility by category. Brand scorecards, platform behavior analysis, and actionable strategies.` | `49 Reports`, `2026 Edition`                         | `/reports/:category`                                                  |
| `/platforms`      | `Platform Deep Dives \| Trakkr`                              | `Platform deep dives`         | `Comprehensive analysis of how each AI platform works under the hood. Understand their recommendation logic, data sources, and unique patterns.`   | `20 deep dives`                                      | `/platforms/:slug`                                                    |
| `/insights`       | `AI Visibility Research \| Trakkr`                           | `AI visibility research`      | `Original research and data-driven insights on how AI platforms recommend brands. Understand the trends shaping AI search behavior.`               | `50 research reports`                                | `/insights/:slug`                                                     |
| `/fix`            | `AI Visibility Problems & Fixes \| Trakkr`                   | `AI visibility problems`      | `Diagnose and fix common AI visibility issues. Step-by-step guides to improve how AI platforms talk about your brand.`                             | `90 problem guides`                                  | `/fix/:slug`                                                          |
| `/industries`     | `AI Visibility by Industry \| Trakkr`                        | `AI visibility by industry`   | `Discover how AI platforms recommend brands in your industry. Deep analysis across 300+ niches.`                                                   | `6 sectors`, `20 industries`, `300 sub-industries`   | `/industries/:sector/:industry`                                       |
| `/ai-recommends`  | `AI Recommendations \| Trakkr`                               | `What AI actually recommends` | `We asked ChatGPT, Claude, Gemini, and Perplexity what software they recommend. See the consensus across AI models for common business queries.`   | `298 queries tested`, `4 AI models`, `13 categories` | `/ai-recommends/:query-slug` and `/ai-recommends/:category/:audience` |

Template-specific details:

- `/playbooks` card: `<Category> Playbook` · category dek · `4-5 phases` · `8-12 weeks`.
- `/market-reports` card: badge `2026 Report` · `<Category> AI Visibility` · dek · `N+ brands analyzed` · `4 AI platforms`. Sections `Featured Reports` (6 cards) then `All Reports` (a flat link list of 55 categories).
- `/fix` filter chips: `All | Critical | High | Medium | Low`. Card title always begins `Fix: `. Each card shows a severity badge and a fixed dek shape: `Step-by-step guide to diagnose and fix when <problem>. Includes causes, solutions, and prevention.`
- `/insights` card carries a date chip (`Jan 2026`) and the dek shape `Data and research on <topic>. Includes statistics, benchmarks, and expert analysis.`
- `/platforms` dek shape: `Deep analysis of <topic>. Research-backed insights for brand marketers.`
- `/industries` groups by six sectors: `Software & Technology` (6 industries · 90 sub-industries), `Commerce & Retail` (4 · 60), `Financial Services` (4 · 60), `Healthcare & Wellness` (2 · 30), `Travel & Hospitality`, `Professional Services`. Extra sections: `Tool buying guides`, `Industry AI visibility tool guides` → `/resources/industry-tools`.
- `/ai-recommends` has an extra lead section `[00] AI Category Reports / 2,249 best-for pages` with per-category strips (`Video Conferencing`, `Inventory Management`, `Product Analytics`, `Email Marketing`, `Project Management`, `Document Management`), each showing `N pages` and three example reports. Below it, the `All Recommendations` grid uses card titles that are quoted queries, e.g. `"1Password alternatives"` with `Top pick: Bitwarden`. Methodology line, verbatim: `each query is run across 4 models with standardized prompts, then normalized into a consensus view. Updates are batch-refreshed monthly, and each query detail page shows where models agree and where they diverge.`

### 6.11 `/resources` — the hub of hubs

- Title: `AI Visibility Resources, AEO Guides & Tool Comparisons | Trakkr`. Meta: `Compare AI visibility tools, explore AEO and GEO guides, and see what AI platforms recommend across industries, categories, and competitors.`
- H1: `Learn about AI visibility`. Sub: `Comparisons, guides, and insights to help you understand and improve how AI platforms represent your brand.`
- Section `[01] Content Hubs / Browse by topic`. Nineteen cards, each with an item count:

| Card                    | Count          | href                                    |
| ----------------------- | -------------- | --------------------------------------- |
| Tool comparisons        | 666 articles   | `/compare`                              |
| Tool alternatives       | 37 articles    | `/alternatives`                         |
| Tool reviews            | 17 articles    | `/reviews`                              |
| Procurement templates   | 9 guides       | `/guides?topic=procurement`             |
| AI recommendations      | 2,249 articles | `/ai-recommends`                        |
| AI visibility glossary  | 172 articles   | `/glossary`                             |
| Industry insights       | 326 articles   | `/industries`                           |
| Industry tool guides    | —              | `/resources/industry-tools`             |
| AEO guides              | —              | `/aeo`                                  |
| Google AI Mode          | —              | `/google-ai-mode`                       |
| ROI & attribution       | —              | `/guides/ai-visibility-roi-attribution` |
| AI visibility playbooks | —              | `/playbooks`                            |
| Market reports          | —              | `/market-reports`                       |
| Brand analysis          | —              | `/ai-analysis`                          |
| AI visibility guides    | —              | `/ai-visibility`                        |
| How-to guides           | —              | `/learn/how-to`                         |
| Platform deep dives     | —              | `/platforms`                            |
| AI visibility research  | —              | `/trakkr-research`                      |
| Problem & fix guides    | —              | `/fix`                                  |

- Then H2 `Level up your AI game.` with C13, an outbound link to `Visum Labs` → `https://www.visumlabs.com`, `Browse all` → `/learn/docs`, and C12 `Ready to track your AI visibility?` CTA `Get started free` → `/login`.
- Counts here disagree with the index pages: `/compare` says 676, `/resources` says 666; `/alternatives` says 43 tools, `/resources` says 37; `/glossary` says 178, `/resources` says 172.

### 6.12 `/article/:slug`

- Sitemap `sitemap-articles.xml` holds **1,316** URLs, all under `/article/`.
- Example `/article/ai-overviews-citation-alerts`:
  - Title: `How to Set Up AI Overviews Citation Alerts | Trakkr`
  - Meta: `Get notified when AI Overviews mentions or cites your brand.`
  - H1: `How to Set Up AI Overviews Citation Alerts`
  - JSON-LD: `Organization, WebSite, Person, WebPage, Article, HowTo, FAQPage, BreadcrumbList`. The `HowTo` type is the marker of this family.
  - Body is client-rendered. Section order and CTAs were NOT OBSERVED.
- Slug shape observed: `<surface>-<topic>-<qualifier>`, e.g. `ai-overviews-citation-alerts`, `ai-overviews-citation-analytics-platform`, `ai-overviews-citation-attribution-analysis`, `ai-overviews-citation-attribution`, `ai-overviews-citation-audit-report`.

### 6.13 `/ai-insights`

- URL returns 200 and does not redirect. Server HTML carries the shared SEO fallback only.
- Title and meta are the **homepage** values: `Trakkr | AI Visibility Platform for Brands & Agencies` and `AI is rewriting discovery. Trakkr tells you what to do about it. Track citations, perception, competitors, and actions across ChatGPT, Claude, Gemini, and more.`
- No H1 in server HTML. JSON-LD: `Organization, WebSite, WebPage, BreadcrumbList, ItemList, SoftwareApplication`.
- Rendered content NOT OBSERVED.

---

## 7. Other pages in scope

### 7.1 `/mcp`

- Title: `Trakkr MCP - Your AI Visibility Data Inside Claude, ChatGPT & Cursor`. Meta: `Connect Trakkr to Claude, ChatGPT, Cursor and any MCP assistant. Ask about your AI search visibility, competitors, citations and crawlers in plain English -...`
- H1: `Trakkr, inside your AI.` Sub: `Ask ChatGPT, Claude or Cursor about your brand's AI visibility, and get real answers from your live Trakkr data, in plain English.`
- CTAs: `Add to Claude`, `Add to ChatGPT`. Caption `Included on every paid plan.` Both destinations NOT OBSERVED (they are buttons, not hrefs, in the server HTML).
- Prompt chips: `How am I doing?`, `Who's gaining on me?`, `What should I write?`, `Where should I show up?`, `Fix my biggest issue`.
- Client list: `Claude`, `ChatGPT`, `Cursor`, `VS Code`, `Codex`, `Claude Code`, `and more`.
- Two tiers: `Public Knowledge MCP` — H2 `Let agents read Trakkr's public corpus.` — endpoint `https://api.trakkr.ai/public/mcp` — CTA `View public MCP docs` → `/learn/api/mcp#public-knowledge-mcp`. And `Authenticated Trakkr MCP` — H2 `Let assistants work with your account.` — CTA `Connect private data`.
- Section `[01] How it works / Connect, ask, act` with step `01 Connect`.
- Closing band: H2 `Stop opening the dashboard. Just ask your assistant.`

### 7.2 `/learn/docs`

- Title: `Documentation | Trakkr`. H1: `Welcome to the Trakkr Docs`. Sub: `Everything you need to track and improve your brand's visibility across AI-powered search. Start with the Quick Start guide, then explore features as you need them.`
- Sections: `Start Here` (4 numbered cards with read times: `Quick Start 5 min 01`, `Core Concepts 8 min 02`, `Prompts 12 min 03`, `FAQ 6 min 04`) → `Feature Guides` (H3 groups `Track`, `Create`, `Automate`, `Connect`) → `Account & Reference` (H3 groups `Workspace`, `Reference`) → H3 `Have a question?` with `Or browse answers to common questions` → `/answers`.
- Full doc route tree observed under `/learn/docs/…` (quick-start, concepts, features/_, account/_, faq, glossary, api).

### 7.3 `/learn/api`

- Title: `API Reference - REST API Documentation | Trakkr`. H1: `Build with the Trakkr API`. Sub: `Access AI search visibility data, manage brands and prompts, and automate research programmatically.`
- Access note, verbatim: `REST API access is included on Scale and Enterprise. The MCP server is available on every paid plan.` Base URL `https://api.trakkr.ai`.
- Sections: `Getting started` (`Introduction`, `Authentication`, `Rate limits`, `Error handling`, `MCP server` badge `New`) → `Machine-readable discovery` (`OpenAPI 3.1 contract` → `/openapi.json`; `MCP server card` → `/.well-known/mcp/server-card.json`; `MCP manifest` → `/mcp.json`; `llms.txt` → `/llms.txt`; `llms-full.txt` → `/llms-full.txt`) → `Core data` → `Visibility` → `Intelligence` → `Actions` → `Try it out`.
- Endpoint rows carry a method badge, path, and one-line label, e.g. `GET /get-scores Visibility metrics`, `GET /get-perception Perception analysis [Paid]`, `GET /narratives Narrative intelligence [Scale]`, `POST /commit-opportunity`, `POST /diagnose`, `POST /webhooks`.

### 7.4 `/ai-search-traffic`

- Title: `AI Search Traffic: Live Index and Measurement Guide (2026) | Trakkr`. Meta: `See live AI referral trends across 4,813 GA4 properties, then measure your own AI traffic in GA4 or PostHog by source, landing page, and conversion.`
- H1: `AI search traffic: live data and measurement.` Freshness stamp `Updated August 5, 2026 · 4,813 GA4 properties`.
- Two hero cards: `View live market data` → `#market-data`; `Measure your own AI traffic` → `#measure-your-ai-traffic`. Sibling links `ChatGPT Traffic Index` → `/chatgpt-traffic`, `Industry benchmarks` → `/ai-traffic-benchmarks-by-industry`, `Crawler market share` → `/ai-crawler-market-share`.
- Sections: `[01] Overview / Key Metrics` (`AI Traffic Index 68% of peak`, `30-Day Change +1.7%`, `Top Source ChatGPT 92% share`, `Fastest Growing Claude +24.1% 30d`; movers `Rising Claude +24.1%`, `Declining CCopilot -24.8%`, `Perplexity -11.1%`) → `[02] Measure Your Site / GA4 & PostHog` → the H2 chain `Find AI referral traffic in your own GA4` → `Measure AI landing pages and conversions in PostHog` → `AI referral traffic by source` → `Who sends the most AI traffic?` → `Which sectors get the most AI traffic?` → `What is the AI search traffic index?` → a 13-question C8 → C12 `Track AI search traffic to your website`.
- Per-engine child pages: `/chatgpt-traffic`, `/gemini-traffic`, `/claude-traffic`, `/perplexity-traffic`.
- Final CTA href carries full attribution: `/start?source=seo-traffic-index&landing=%2Fai-search-traffic&content_slug=ai-search-traffic&route_family=ai_traffic_index&cta_id=ai_traffic_footer&content_intent=measure+AI+referral+traffic`.

### 7.5 `/bias`

- Title: `Political bias in AI · Where the AI models stand | Trakkr`. Meta: `Political bias in AI measures where every major AI model stands on charged political and ethical questions: run many times, no web search, plotted with error...`
- H1: `Where the models stand.` Stamp `June 2026 · 6 models · 4.4K answers · no web search`. Link `Methodology` → `/bias/method`.
- View toggles: `Overall | Civil liberties | Foreign policy | Speech & tech | Environment | Nationalism` and `Map | Spectrum`.
- Sections: `Every model, ranked` (6 rows, each linking to `/bias/models/:slug` with a nearest-figure label and a lean label, e.g. `5 Grok near Emmanuel Macron Leans right +0.21`) → `Where they split` (question links to `/bias/questions/:slug`) → `Closest reference point` → H3 `Where do you land?` → `What they say vs what they do` → `Keep exploring` → C8 `Common questions`.
- `Keep exploring` sub-routes: `/bias/findings`, `/bias/models`, `/bias/questions`, `/bias/figures`, `/bias/worldview`, `/bias/compare`, `/bias/quiz`, `/bias/method`. Licence `CC BY 4.0`.

---

## 8. CTA inventory

Every distinct CTA observed, with its label, style, and destination.

**Primary buttons (filled)**

| Label                                             | Destination                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Go to Dashboard                                   | (form submit, logged-in state; logged-out target NOT OBSERVED)                                                                        |
| Get started                                       | `/start` (form submit on `/features`, `/integrations`)                                                                                |
| Get started free                                  | `/login`                                                                                                                              |
| Start free                                        | `/start`                                                                                                                              |
| Start free trial                                  | `/start?plan=growth&cycle=monthly&trial=true`; `/start?plan=growth&trial=true`; `/start?ref=<slug>`; `/start?content_slug=…&cta_id=…` |
| Start with Growth                                 | `/start?plan=growth&target_plan=scale&cycle=monthly` and `/start?plan=growth&cycle=monthly&target_plan=scale`                         |
| Upgrade                                           | `/upgrade?plan=scale`                                                                                                                 |
| Talk to sales                                     | `/trakkr-for/enterprise`                                                                                                              |
| Book a demo                                       | `/demo`; also `https://cal.com/team/trakkr/trakkr-for-enterprise?utm_source=trakkr_enterprise_page` on `/trakkr-for/enterprise`       |
| Continue                                          | (demo form submit; not submitted)                                                                                                     |
| Create free account                               | `/start`                                                                                                                              |
| Check visibility                                  | (form submit on `/trakkr-for/startups`)                                                                                               |
| Check my brand                                    | (form submit on `/data/rankings`)                                                                                                     |
| Scan                                              | (form submit on `/about`)                                                                                                             |
| Audit                                             | (form submit on `/free-tools/ai-site-grader`)                                                                                         |
| Generate                                          | (form submit on `/free-tools/llms-txt-generator`)                                                                                     |
| Run audit                                         | (form submit on `/free-tools`)                                                                                                        |
| Run free scan / Start free scan / Run Trakkr scan | `/start?…` with per-position `cta_id`                                                                                                 |
| Apply for a spot                                  | `#apply`                                                                                                                              |
| Start a 14-day trial                              | `/start?ref=profound-alternatives-hub` / `-cta`                                                                                       |
| Start your agency trial                           | `/start?ref=profound-agencies`                                                                                                        |
| Add to Claude / Add to ChatGPT                    | NOT OBSERVED (buttons without href)                                                                                                   |
| Open in Looker Studio                             | `https://lookerstudio.google.com/datasources/create?connectorId=AKfycbz…`                                                             |

**Secondary buttons and text links**

| Label                                                                              | Destination                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Compare features                                                                   | `/pricing`                                                |
| View plans / See pricing / See the full plan ladder                                | `/pricing`                                                |
| See how it works                                                                   | `/features#understand`; also `/features` on `/free-tools` |
| Explore tracking                                                                   | `/features#track`                                         |
| Start improving                                                                    | `/features#improve`                                       |
| See all features / See how actions work                                            | `/features`                                               |
| See how it connects                                                                | `/mcp`                                                    |
| Connect Analytics                                                                  | `/traffic/analytics`                                      |
| See the agency platform / Explore Trakkr for agencies                              | `/trakkr-for/agencies`                                    |
| See Enterprise→                                                                    | `/trakkr-for/enterprise`                                  |
| How it works                                                                       | `#how`                                                    |
| Browse docs / Browse all                                                           | `/learn/docs`                                             |
| Quick start guide                                                                  | `/learn/docs/getting-started`                             |
| API docs / API documentation                                                       | `/learn/api`                                              |
| Get API key                                                                        | `/exports/api-keys`                                       |
| View public MCP docs                                                               | `/learn/api/mcp#public-knowledge-mcp`                     |
| Learn more (roadmap cards)                                                         | (in-page; target NOT OBSERVED)                            |
| View all (rankings)                                                                | `/data/rankings`                                          |
| View all (movers)                                                                  | `/data/movers`                                            |
| Explore study                                                                      | `/trakkr-research/:slug`                                  |
| Find your brand                                                                    | `/start`                                                  |
| Visit website                                                                      | `https://visumlabs.com`                                   |
| Send bug report / Get in touch / Request integration / Need custom volume pricing? | obfuscated mailto via `/cdn-cgi/l/email-protection#…`     |
| Read privacy policy                                                                | `/privacy`                                                |
| Status page                                                                        | `/status`                                                 |
| Try Trakkr free                                                                    | `/login`                                                  |
| Still unsure? Start free                                                           | `/start`                                                  |
| Compare per-client cost vs Profound                                                | `/alternatives/profound-alternatives/for-agencies`        |
| Connect on LinkedIn                                                                | `https://www.linkedin.com/in/mack-grenfell/`              |

**CTA URL parameter grammar** (used on programmatic content templates):
`/start?content_slug=<page-slug>&route_family=<family>&content_intent=<intent>&competitor=<tool>&cta_id=<page-slug>-<position>`
Observed values: `route_family` ∈ {`reviews`, `ai_traffic_index`}; `content_intent` ∈ {`commercial-review`, `measure AI referral traffic`}; a shorter form `?ref=<slug>` is used by `/compare/*` and `/alternatives/*`.

---

## 9. Sitemap map (template inventory)

`/sitemap.xml` is a sitemap index with 32 children:

`sitemap-main.xml`, `sitemap-localized.xml`, `sitemap-data-entities.xml`, `sitemap-bias.xml`, `sitemap-best.xml`, `sitemap-ai-search-tools.xml`, `sitemap-answers.xml`, `sitemap-data-citations.xml`, `sitemap-guides.xml`, `sitemap-articles.xml`, `sitemap-blog.xml`, `sitemap-compare.xml`, `sitemap-alternatives.xml`, `sitemap-glossary.xml`, `sitemap-bots.xml`, `sitemap-docs.xml`, `sitemap-api.xml`, `sitemap-reviews.xml`, `sitemap-industries.xml`, `sitemap-industry-tools.xml`, `sitemap-ai-recommends.xml`, `sitemap-ai-search.xml`, `sitemap-research-answer-hubs.xml`, `sitemap-research-answers.xml`, `sitemap-research-facts.xml`, `sitemap-research-trackers.xml`, `sitemap-ai-visibility.xml`, `sitemap-prompts.xml`, `sitemap-how-to.xml`, `sitemap-platforms.xml`, `sitemap-insights.xml`, `sitemap-fix.xml`.

Counted: `sitemap-data-entities.xml` = 1,293 URLs; `sitemap-articles.xml` = 1,316 URLs. Other counts NOT OBSERVED.

---

## 10. Gaps

- Logged-out header, logged-out hero CTA labels, and logged-out pricing CTAs: NOT OBSERVED.
- Mobile menu contents: NOT OBSERVED.
- Rendered content of `/status`, `/open-source`, `/ai-insights`, `/guides` index, `/guides/:slug` body, `/article/:slug` body: NOT OBSERVED.
- Free-tool result screens: NOT OBSERVED by choice. No scan or generation was started.
- Demo form: NOT submitted.
- Homepage JSON-LD graph beyond the leading `Organization` node: NOT OBSERVED.
- `Add to Claude` / `Add to ChatGPT` destinations on `/mcp`: NOT OBSERVED.
- Logo-wall brand names, locale-switcher labels, and all image assets: NOT OBSERVED.
- Colour tokens, typography, and spacing values: NOT OBSERVED (out of scope for this read).
