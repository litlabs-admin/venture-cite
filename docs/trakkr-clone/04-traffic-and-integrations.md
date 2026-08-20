# Trakkr replication spec - Traffic and connector pages

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

Observed on 2026-08-07. Account: user `[EXAMPLE_USER_ID]`.
Active brand: **Example Brand**, brand_id `[EXAMPLE_BRAND_ID]`, domain `brand.example.test`.
All traffic connectors on this account are DISCONNECTED. Each page therefore shows a setup screen.

Rules used for capture:

- No OAuth button was clicked. No Connect, Authorize, Install, Delete or Pay button was clicked.
- Read-only wizard steps were opened where they do not authenticate or mutate.
- Text is verbatim. Where a thing was not seen, the entry says NOT OBSERVED.

---

## 0. Shared shell (present on every page in this slice)

Left sidebar, top to bottom:

| Item              | Type                                                  | href / behaviour     |
| ----------------- | ----------------------------------------------------- | -------------------- |
| Example Brand     | button (brand switcher)                               | NOT OBSERVED         |
| Ask (badge `⌘K`)  | button                                                | Opens Ask command    |
| Dashboard         | link                                                  | `/dashboard`         |
| Actions           | link                                                  | `/actions`           |
| Prompts           | group button                                          | expands              |
| Prompts           | link                                                  | `/prompts`           |
| Research          | link                                                  | `/research`          |
| Diagnose          | link                                                  | `/diagnose`          |
| Visibility        | group button                                          | expands              |
| Pages             | link                                                  | `/pages`             |
| Citations         | link                                                  | `/citations`         |
| Competitors       | link                                                  | `/competitors`       |
| Perception        | link                                                  | `/perception`        |
| Traffic           | group button                                          | expands              |
| Visitors          | link, title `Humans arriving via AI recommendations`  | `/traffic/analytics` |
| Crawlers          | link, title `AI bots indexing your content`           | `/traffic/crawler`   |
| Growth            | group button                                          | expands              |
| Content           | link                                                  | `/create`            |
| Site Optimization | link                                                  | `/optimize`          |
| AI Pages          | link, title `Serve AI-optimized versions to crawlers` | `/ai-pages`          |
| Reddit            | link                                                  | `/reddit`            |
| Automations       | link                                                  | `/automations`       |
| Collapse sidebar  | button                                                | collapses sidebar    |
| Connect your AI   | button                                                | NOT OBSERVED         |
| Integrations      | link                                                  | `/integrate`         |
| Settings          | link                                                  | `/settings`          |
| Help & Learn      | link                                                  | `/learn`             |

Mobile header: `Open navigation` button, brand name `Example Brand`, `Open Settings` button.
Bottom right: `Open Intercom Messenger` button.

Baseline API calls made on every page load (method GET unless stated):

- `GET https://example-project-ref.supabase.co/rest/v1/users?id=eq.<user_id>&select=<large column list>`
- `GET https://example-project-ref.supabase.co/rest/v1/brand_members?user_id=eq.<user_id>&select=role,brand_id,brands(*,brand_groups(id,name,color,position))`
- `GET https://example-project-ref.supabase.co/rest/v1/team_clients?user_id=eq.<user_id>&status=eq.active&select=brand_id,can_export,brands(*)`
- `POST https://example-project-ref.supabase.co/rest/v1/rpc/get_pending_team_invite_for_current_user` (method inferred from RPC path - NOT OBSERVED directly)
- `GET https://api.trakkr.ai/auth/session`
- `GET https://api.trakkr.ai/subscription/effective`
- `GET https://api.trakkr.ai/subscription/sync?force=false`
- `GET https://api.trakkr.ai/subscription/downgrade-changes`
- `GET https://api.trakkr.ai/users/admin-access`
- `GET https://api.trakkr.ai/users/me/mcp-token/sessions`
- `GET https://api.trakkr.ai/client/group-brands`
- `GET https://api.trakkr.ai/pages/config?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/double/run/<brand_id>`
- `GET https://api.trakkr.ai/agent/automations?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/agent/needs-you?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/analytics/identify`
- `GET https://api.trakkr.ai/internal/platform-stats`
- `GET https://e.trakkr.ai/flags/?v=2&_=<ts>&ver=1.407.0`
- `POST https://trakkr.ai/ingest/capture/` (PostHog, repeated)
- Third party: Google Tag Manager `AW-EXAMPLE`, Facebook Pixel `EXAMPLE_PIXEL_ID`, LinkedIn `pid=EXAMPLE_LINKEDIN_ID`, Intercom `example-intercom-app`, Sentry `example-sentry-org`.

Per-page API calls are listed under each page below.

---

## 1. `/traffic/analytics`

- URL: `https://trakkr.ai/traffic/analytics`
- Browser title: `Visitors`
- H1: `Visitors`
- Description line: `See who arrives at Example Brand from AI answers`
- Header action: a pill labelled `Setup` (state chip, top right)

### Disconnected state (this account)

- H2: `Who's arriving from AI?`
- Body: `We read your Google Analytics and separate the sessions that start inside an AI answer from everything else. Connecting takes one click.`

Preview panel behind the setup card:

- Label: `What you'll see`
- Badge: `Example data`
- Stat tiles:
  - `AI sessions` - `412`
  - `Top assistant` - `ChatGPT` (icon `/images/ai-logos/chatgpt.svg`)
  - `AI landing pages` - `37`
  - `Conversions` - `18`
- Sample rows:
  - `ChatGPT` | `/process` | `4 min ago` (icon `/images/ai-logos/chatgpt.svg`)
  - `Perplexity` | `/services` | `11 min ago` (icon `/images/ai-logos/perplexity.svg`)
- Footnote: `Example data. Yours appears about a minute after connecting.`

Actions:

- Primary button: `Connect Google Analytics` (NOT CLICKED - starts Google OAuth)
- Helper under button: `First data in about a minute`
- Privacy line: `Read-only access to your analytics. We never change or write anything.`
- Outbound link: `Read how it works` -> `/learn/docs/features/visitors`

### Connected state

NOT OBSERVED. The account has no Google Analytics connection.

### Loading / error states

NOT OBSERVED.

### Page API calls

- `GET https://api.trakkr.ai/ga/status?brand_id=<brand_id>&user_id=<user_id>`
- `GET https://api.trakkr.ai/brands/<brand_id>/sample-paths`
- `GET https://example-project-ref.supabase.co/rest/v1/reports?select=id&brand_id=eq.<brand_id>&status=eq.completed`

---

## 2. `/traffic/crawler`

- URL: `https://trakkr.ai/traffic/crawler`
- Browser title: `Crawlers`
- H1: `Crawlers`
- Description line: `See which AI bots read your pages and cite them in live answers`
- Header action: pill labelled `Setup`

### Disconnected state

- H2: `Who's reading brand.example.test?`
- Body: `Trakkr captures AI crawler hits at the edge of your site. Pick the option closest to your stack and we handle the rest.`

Preview panel:

- Label: `What you'll see`
- Badge: `Example data`
- Stat tiles:
  - `Crawls this week` - `284`
  - `Top crawler` - `GPTBot` (icon `/images/ai-logos/chatgpt.svg`)
  - `Pages read` - `1,102`
  - `Cited in answers` - `31`
- Sample rows:
  - `GPTBot` | `/process` | `2 min ago` (icon `/images/ai-logos/chatgpt.svg`)
  - `ClaudeBot` | `/services` | `9 min ago` (icon `/images/ai-logos/claude.png`)
- Footnote: `Example data. Yours appears within an hour of connecting.`

Footer of the page:

- `We only see the bot fingerprint and the URL it touched, never your page content or visitor data. Most sites see their first hit within an hour.`
- Outbound link: `Read how it works` -> `/learn/docs/features/traffic/crawlers/install`

### `?tab=connections` view

`https://trakkr.ai/traffic/crawler?tab=connections` renders exactly the same setup screen as `/traffic/crawler`.
The tab parameter has no visible effect while the brand has zero crawler connections.
A separate connections list is NOT OBSERVED.

### Connector picker

Section heading: `Where does brand.example.test live?`

#### Group `Hosting platform`

| Card       | One-line description                    | Icon                                  |
| ---------- | --------------------------------------- | ------------------------------------- |
| Vercel     | `Real-time Log Drain. Two-click OAuth.` | `/images/integrations/vercel.png`     |
| Netlify    | `Edge Function logs. OAuth + one file.` | `/images/integrations/netlify.png`    |
| Cloudflare | `API token + zones. Worker optional.`   | `/images/integrations/cloudflare.png` |

#### Group `Self-hosted runtime`

| Card              | One-line description                          | Icon                                                             |
| ----------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Next.js           | `Drop-in middleware. Self-hosted.`            | `https://www.google.com/s2/favicons?domain=nextjs.org&sz=64`     |
| Node / Express    | `Lightweight middleware. ~10 lines.`          | `https://www.google.com/s2/favicons?domain=nodejs.org&sz=64`     |
| Nginx / OpenResty | `Async log hook on request phase.`            | `https://www.google.com/s2/favicons?domain=nginx.org&sz=64`      |
| AWS CloudFront    | `Lambda@Edge on Origin Request.`              | `https://www.google.com/s2/favicons?domain=aws.amazon.com&sz=64` |
| Akamai            | `DataStream 2 or HTTPS forwarder.`            | letter avatar `A`                                                |
| Fastly            | `Log streaming over HTTPS.`                   | letter avatar `F`                                                |
| Other / Custom    | `Generic HTTPS forwarder for your own stack.` | letter avatar `O`                                                |

#### Group `HOSTED CMS`

Group subtitle: `No server access? Pair Cloudflare in front of your CMS.`

| Card        | Icon                                                              |
| ----------- | ----------------------------------------------------------------- |
| Webflow     | `https://www.google.com/s2/favicons?domain=webflow.com&sz=64`     |
| Shopify     | `https://www.google.com/s2/favicons?domain=shopify.com&sz=64`     |
| HubSpot     | `https://www.google.com/s2/favicons?domain=hubspot.com&sz=64`     |
| Squarespace | `https://www.google.com/s2/favicons?domain=squarespace.com&sz=64` |
| Wix         | `https://www.google.com/s2/favicons?domain=wix.com&sz=64`         |
| Framer      | `https://www.google.com/s2/favicons?domain=framer.com&sz=64`      |
| Ghost       | `https://www.google.com/s2/favicons?domain=ghost.org&sz=64`       |

CMS cards carry no description text on the card itself. The description appears in the modal.

### Modal opened by each connector card

Selecting a card opens a centred modal. The modal is a plain overlay div, not `role="dialog"`.
Overlay class observed: `fixed top-0 left-0 right-0 bottom-0 h-screen w-full z-[100] bg-black/40 transition-opacity duration-200`.
Modal container class observed: `fixed inset-0 z-[100] pointer-events-none`.
Every modal has a `Close` icon button in the header and a `Cancel` button in the footer.

#### Vercel

Title: `Connect Vercel`

Body copy:

```
Connect Vercel to receive AI crawler visits in real time via Log Drains.

METHOD
Log Drain · Real-time

SETUP
Pick a project after you authorize, then we create the Log Drain for you.

REQUIRES
Vercel Pro or Enterprise. On Hobby plans the connection still works but the drain may fail to install.
```

- Link: `Setup guide` -> `/learn/docs/features/traffic/crawlers/install#vercel`
- Buttons: `Cancel`, `Continue to Vercel` (NOT CLICKED - leaves trakkr.ai into Vercel OAuth)
- No inputs. No code snippet at this step.
- Post-authorize screens: NOT OBSERVED.

#### Netlify

Title: `Connect Netlify`

```
Connect Netlify to detect AI crawlers via an Edge Function deployed to your site.

METHOD
Edge Function · Real-time

SETUP
Pick a site, then add our one-file edge function to your repo. Trakkr never pushes code for you.

PERMISSIONS
Read access so we can list the sites on your team. We don't read your site's content, deploy code, or change DNS.
```

- Link: `Setup guide` -> `/learn/docs/features/traffic/crawlers/install#netlify`
- Buttons: `Cancel`, `Continue to Netlify` (NOT CLICKED - OAuth)
- No inputs. No code snippet at this step.
- Post-authorize screens: NOT OBSERVED.

#### Cloudflare

Title: `Connect Cloudflare`
Step rail: `TOKEN` -> `ZONE`

```
Create a Cloudflare API token with three read permissions: Zone > Analytics > Read, Account > Account Analytics > Read, and Zone > Zone > Read. The token template below adds all three for you.

The fastest way: open the pre-filled token template - Cloudflare prepares the right permissions for you.

Cloudflare analytics are aggregate. On very busy zones, low-volume crawler traffic can be truncated. Deploy the optional worker after setup if you want per-request capture.

API TOKEN
```

- Link `Open Cloudflare token template` ->
  `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22analytics%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%5D&name=Trakkr+Crawler+Tracking&accountResources=include%3A*&zoneResources=include%3Aall`
- Link `Full setup guide` -> `/learn/docs/features/traffic/crawlers/install#cloudflare`
- Input: `<input type="password">`, placeholder `Paste your Cloudflare API token`
- Buttons: `Cancel`, `Verify token` (NOT CLICKED - submits a credential)
- `ZONE` step: NOT OBSERVED.

#### Next.js (self-hosted)

Title: `Connect Next.js self-hosted`
Step rail: `NAME` -> `CREDENTIALS` -> `TEST` -> `DEPLOY`

```
Install a Proxy or middleware file that forwards AI crawler hits to Trakkr without blocking page responses.

CONNECTION NAME (OPTIONAL)

TARGET
Next.js self-hosted

Trakkr will generate a bearer token and show a copy-paste template for this runtime.
```

- Input: `<input type="text">`, placeholder `e.g. Production Next.js app`
- Buttons: `Cancel`, `Get credentials` (NOT CLICKED - creates a connection and a bearer token)
- `CREDENTIALS`, `TEST`, `DEPLOY` steps and their code snippets: NOT OBSERVED.

#### Node / Express

Title: `Connect Node / Express`
Step rail: `NAME` -> `CREDENTIALS` -> `TEST` -> `DEPLOY`

```
Add lightweight Express middleware that sends crawler requests to Trakkr after the response finishes.

CONNECTION NAME (OPTIONAL)

TARGET
Node / Express

Trakkr will generate a bearer token and show a copy-paste template for this runtime.
```

- Input placeholder: `e.g. API + app server`
- Buttons: `Cancel`, `Get credentials` (NOT CLICKED)
- Later steps and code snippets: NOT OBSERVED.

#### Nginx / OpenResty

Title: `Connect Nginx / OpenResty`
Step rail: `NAME` -> `CREDENTIALS` -> `TEST` -> `DEPLOY`

```
Deploy an OpenResty log hook that asynchronously forwards AI crawler hits from the request log phase.

CONNECTION NAME (OPTIONAL)

TARGET
Nginx / OpenResty

Trakkr will generate a bearer token and show a copy-paste template for this runtime.
```

- Input placeholder: `e.g. Edge gateway`
- Buttons: `Cancel`, `Get credentials` (NOT CLICKED)
- Later steps and code snippets: NOT OBSERVED.

#### AWS CloudFront

Title: `Connect AWS CloudFront`
Step rail: `NAME` -> `CREDENTIALS` -> `TEST` -> `DEPLOY`

```
Attach a Lambda@Edge function to CloudFront so crawler requests stream straight into Trakkr.

CONNECTION NAME (OPTIONAL)

TARGET
AWS CloudFront

Trakkr will generate a bearer token and show a copy-paste template for this runtime.
```

- Input placeholder: `e.g. Primary distribution`
- Buttons: `Cancel`, `Get credentials` (NOT CLICKED)
- Later steps and code snippets: NOT OBSERVED.

#### Akamai, Fastly and Other / Custom

All three cards open the SAME modal. The modal title observed was `Connect Other / Custom` for all three.
Step rail: `NAME` -> `CREDENTIALS` -> `TEST` -> `DEPLOY`

```
Use the generic webhook with your own edge stack or log forwarder.

CONNECTION NAME (OPTIONAL)

SOURCE PLATFORM
```

The `SOURCE PLATFORM` selector holds three options, each its own button:

| Option           | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `Other / Custom` | `Use the generic webhook with your own edge stack or log forwarder.` |
| `Akamai`         | `Send DataStream 2 batches or HTTPS connector payloads into Trakkr.` |
| `Fastly`         | `Forward Fastly log streaming payloads into Trakkr over HTTPS.`      |

- Input placeholder: `e.g. Other / Custom production edge`
- Buttons: `Cancel`, `Get credentials` (NOT CLICKED)
- Later steps and code snippets: NOT OBSERVED.

#### Hosted CMS modals (Webflow, Shopify, HubSpot, Squarespace, Wix, Framer, Ghost)

All seven use one template. Step rail: `OVERVIEW` -> `DNS` -> `CONNECT`.

Common blocks in step `OVERVIEW`:

```
You’ll put Cloudflare in front of your <CMS> site as a free proxy. It sees every request, forwards AI crawler hits to Trakkr, and doesn’t change how visitors experience the site.

AI BOT
CLOUDFLARE
<CMS IN CAPS>
TRAKKR
bot hits only

WHAT YOU’LL NEED

A Cloudflare account, the free plan works.
Access to your domain's DNS at your registrar.
About 10 minutes.
```

- Checkbox: `I already have Cloudflare in front of this domain, skip the DNS step.`
- Buttons: `Cancel`, `Continue`
- Steps `DNS` and `CONNECT`: NOT OBSERVED. The tool that drives the browser refused the `Continue` click, so the later steps could not be reached.

Per-CMS first line, verbatim:

| CMS         | Modal title           | First line                                                                                                        | Diagram middle label |
| ----------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| Webflow     | `Connect Webflow`     | `Webflow doesn't expose access logs or edge code, so Trakkr can't read crawler hits directly.`                    | `WEBFLOW`            |
| Shopify     | `Connect Shopify`     | `Shopify doesn't expose request logs to merchants on standard plans, and edge code isn't supported.`              | `SHOPIFY`            |
| HubSpot     | `Connect HubSpot`     | `HubSpot CMS doesn't expose raw edge request logs, so Trakkr can't read crawler hits directly from HubSpot.`      | `HUBSPOT`            |
| Squarespace | `Connect Squarespace` | `Squarespace doesn't surface server logs or run third-party edge code, so AI crawlers are invisible to it.`       | `SQUARESPACE`        |
| Wix         | `Connect Wix`         | `Wix doesn't expose raw request logs or run third-party edge code, so client-side scripts miss many AI crawlers.` | `WIX`                |
| Framer      | `Connect Framer`      | `Framer doesn't expose logs or edge code on its hosting plans.`                                                   | `FRAMER`             |
| Ghost       | `Connect Ghost`       | `Ghost(Pro) doesn't give you raw access logs and doesn't run third-party code at the edge.`                       | `GHOST`              |

### Connected state

NOT OBSERVED.

### Page API calls

- `GET https://api.trakkr.ai/crawler/dashboard?brand_id=<brand_id>&days=30&granularity=day`
- `GET https://api.trakkr.ai/crawler/citation-correlation?brand_id=<brand_id>&days=30`
- `GET https://api.trakkr.ai/crawler/submit-to-search/status?brand_id=<brand_id>&days=1&status=success`
- `GET https://api.trakkr.ai/crawler/submit-to-search/summary?brand_id=<brand_id>&days=30`
- `GET https://api.trakkr.ai/crawler-connect/features?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/crawler-connect/connections?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/crawler-connect/platforms?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/crawler-connect/prism/status?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/ga/status?brand_id=<brand_id>&user_id=<user_id>`
- `GET https://api.trakkr.ai/sites/?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/brands/<brand_id>/sample-paths`
- `GET https://example-project-ref.supabase.co/rest/v1/reports?select=id&brand_id=eq.<brand_id>&status=eq.completed`

---

## 3. `/traffic/crawler/sources`

- URL: `https://trakkr.ai/traffic/crawler/sources`
- Browser title: `Sources`
- Breadcrumb: `Crawlers` (link -> `/traffic/crawler`) then `Sources`
- H1: `Crawler sources`
- Subtitle / empty line: `No sources connected yet.`
- Header action: `Add source` button

### Empty state

- H2: `Connect your first source`
- Body: `Pick a hosting platform, server runtime, or CMS to start tracking crawler visits.`
- Then the identical connector picker as `/traffic/crawler`: groups `Hosting platform`, `Self-hosted runtime`, `HOSTED CMS` with the same cards, same descriptions and same icons.
- The privacy footer line and the `Read how it works` link are NOT present on this page.

### Populated state

NOT OBSERVED.

### Page API calls

- `GET https://api.trakkr.ai/crawler-connect/connections?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/crawler-connect/platforms?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/crawler-connect/prism/status?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/sites/?brand_id=<brand_id>`

---

## 4. `/traffic/search-console`

- URL: `https://trakkr.ai/traffic/search-console`
- Browser title: `Search Console`
- H1: `Search Console`
- Description line: `Connect Google Search Console to see Google performance next to AI visibility.`
- Header actions: none observed

### Disconnected state

- H2: `Connect Google Search Console`
- Body: `See how your pages perform in Google search, side by side with how AI assistants cite you.`
- Button: `Connect with Google` (NOT CLICKED - Google OAuth)
- Footnote: `Read-only access to your Search Console performance data.`
- No outbound links. No preview or sample data on this page.

### Connected state

NOT OBSERVED.

### Page API calls

- `GET https://api.trakkr.ai/gsc/status?brand_id=<brand_id>`

---

## 5. `/ai-pages`

- URL: `https://trakkr.ai/ai-pages`
- Browser title: `AI Pages`
- H1: `AI Pages`
- Description line: `Serve crawlers a version of your site built for how models read`
- Header action: pill labelled `Setup`

### Wizard frame (shown on every step)

- H2: `What do AI crawlers see on brand.example.test?`
- Body: `When an AI crawler visits, we serve your pages the way models read best: clean structure, schema, no JavaScript required. Human visitors see your normal site, unchanged.`
- Step rail: `1 Configure`, `2 Platform`, `3 Crawlers`, `4 Features`, `5 Install`. Completed steps show a tick instead of a number.
- Page footer: `Human visitors always see your normal site, unchanged.` plus link `Read the full documentation` -> `/learn/docs/features/ai-pages`

### Step 1 - Configure

- Panel heading: `How AI Pages work`
- Panel subtitle: `four stages, fully automatic`
- The four stages, verbatim:

| Stage       | Copy                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `Detect`    | `GPTBot, ClaudeBot and twelve more crawlers identified at the edge.` |
| `Transform` | `Schema, metadata and clean structure added server-side.`            |
| `Serve`     | `The optimized version, delivered in under 100 milliseconds.`        |
| `Track`     | `Every request logged, tied back to reads and citations.`            |

- Field label: `Domain`
- Input: `<input type="text">`, placeholder `example.com`, prefilled value `brand.example.test`, enabled
- Helper: `About five minutes end to end`
- Button: `Continue`

### Step 2 - Platform

- Panel heading: `Choose your platform`
- Body: `AI Pages works with any hosting platform. Select where your site runs.`
- Nine option cards. Each has a difficulty badge. Only Cloudflare Workers carries the extra `POPULAR` badge.

| Card                   | Badges            | Description                                                                                           |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| Cloudflare Workers     | `POPULAR`, `Easy` | `Edge worker that intercepts requests at Cloudflare's network. Best for sites already on Cloudflare.` |
| Vercel Edge Middleware | `Easy`            | `Runs at Vercel's edge before your app. Perfect for Next.js sites deployed on Vercel.`                |
| Netlify Edge Functions | `Easy`            | `Deno-based edge functions that intercept requests. Ideal for sites hosted on Netlify.`               |
| Next.js Middleware     | `Easy`            | `Drop-in middleware.ts for any Next.js app. Works on any hosting provider.`                           |
| AWS CloudFront         | `Medium`          | `Lambda@Edge function for CloudFront distributions. Enterprise-grade edge optimization.`              |
| WordPress Plugin       | `Easy`            | `PHP must-use plugin. Drop one file into wp-content/mu-plugins/ and you're done.`                     |
| Node.js / Express      | `Easy`            | `Express middleware for any Node.js server. Works with Express, Fastify, Koa, and more.`              |
| Nginx / OpenResty      | `Advanced`        | `Lua-based request handler for Nginx with OpenResty. For self-hosted infrastructure.`                 |
| Other / Manual         | `Medium`          | `Use Cloudflare as a proxy in front of any platform (Shopify, Squarespace, Webflow, Wix).`            |

- Buttons: `Back`, `Continue`
- Default selection: none pre-selected on first entry.

### Step 3 - Crawlers

- Panel heading: `Select AI crawlers`
- Counter, top right of panel: `17/17`
- Body: `Choose which AI crawlers AI Pages should optimize for`
- Default: all 17 selected.

| Crawler                | Vendor label                |
| ---------------------- | --------------------------- |
| OpenAI GPTBot          | OpenAI                      |
| ChatGPT Browser        | OpenAI                      |
| OpenAI SearchBot       | OpenAI                      |
| ClaudeBot              | Anthropic                   |
| Claude User            | Anthropic                   |
| Claude SearchBot       | Anthropic                   |
| Perplexity Bot         | Perplexity                  |
| Meta Crawler           | Meta                        |
| Google Extended Bot    | Google                      |
| Google Agent           | Google                      |
| Cohere AI Bot          | Cohere                      |
| Apple Intelligence Bot | Apple                       |
| Amazon Bot             | Amazon                      |
| Mistral AI Bot         | Mistral (letter avatar `M`) |
| DeepSeek Bot           | DeepSeek                    |
| Grok Bot               | xAI                         |
| Bing AI Bot            | Microsoft                   |

- Buttons: `Back`, `Continue`

Note: step 1 copy says "twelve more crawlers" after GPTBot and ClaudeBot, but step 3 lists 17. Copy this discrepancy as-is.

### Step 4 - Features

- Panel heading: `Optimization features`
- Body: `Select which optimizations to enable for AI crawlers`
- Five toggle cards. All five are ON by default (green tick, tinted card).

| Feature                     | Copy                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Structured Data Injection` | `Automatically detects if your page is an article, product, service, or guide and adds the appropriate technical markers. This helps AI systems understand your content type and trust it as a legitimate source.`                                |
| `Key Facts Extraction`      | `Pulls out specific data points like prices, percentages, dates, and statistics from your content and makes them explicitly readable by AI systems. When ChatGPT or Perplexity needs a specific fact, this ensures they can find and cite yours.` |
| `Automated FAQ Injection`   | `Analyzes your page and generates relevant Q&A pairs based on what information you actually provide. AI systems prefer citing content that directly answers user questions - this makes your content match their query format.`                   |
| `AI Summary Block`          | `Generates a clean, factual summary of your page stripped of promotional language and filler. AI systems use this to quickly understand what your page actually says versus what it's trying to sell.`                                            |
| `Entity Recognition`        | `Identifies and marks every entity you reference - from company names to technologies to people. This helps AI understand the "who" and "what" in your content, crucial for proper attribution.`                                                  |

- Buttons: `Back`, `Save and continue`

### Step 5 - Install

NOT OBSERVED. Reaching it needs `Save and continue`, which writes the configuration. It was not clicked.
Install instructions and code snippets for each platform: NOT OBSERVED.

### Connected / active state

NOT OBSERVED.

### Page API calls

- `GET https://api.trakkr.ai/prism/status?brand_id=<brand_id>`

---

## 6. `/reddit`

- URL: `https://trakkr.ai/reddit`
- Browser title: `Reddit`
- H1: `Reddit monitoring`
- Description line: `The threads that shape AI's answers`
- Header action: pill labelled `Setup`

### Pre-start state

- H2: `Which threads teach AI about Example Brand?`
- Body: `We watch the subreddits your buyers read, flag the threads AI cites, and draft replies grounded in your site.`

Three promise blocks:

| Title            | Copy                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| `Track mentions` | `Every mention of Example Brand across the subreddits your buyers read.` |
| `Spot the gaps`  | `Threads AI already cites, where rivals show up and you don't.`          |
| `Draft replies`  | `Authentic responses grounded in your site, ready for review.`           |

- Button: `Start monitoring` (NOT CLICKED - starts a monitoring job)
- Helper under button: `About two minutes. We suggest subreddits, you approve them.`
- Footer: `We never post anything without your approval.`
- Outbound link: `Read how it works` -> `/learn/docs/features/reddit`

### Active state

NOT OBSERVED.

### Page API calls

- `GET https://api.trakkr.ai/reddit/state?brand_id=<brand_id>`

---

## 7. `/integrate`

- URL: `https://trakkr.ai/integrate`
- Browser title: `Integrations`
- H1: `Integrations`
- Description line: `Connect your tools and services`
- Header action: `API keys` button. It navigates to `/exports/api-keys`.

### Category filter tabs

Order, left to right: `All`, `Your website`, `AI traffic`, `Advertising`, `Alerts & tasks`, `Export`, `Developer`.
Default: `All`. In `All` the cards are grouped under the same category headings.

### Cards

Every card in this account shows the state `Connect`, except Airtable which shows `Soon` and is not clickable.
`Looker Studio` is the only card with a plan badge: `SCALE`.

#### Category `YOUR WEBSITE` - subtitle `Connect a site to publish fixes`

| Name      | Description                              | Badge | State   | Icon                                 |
| --------- | ---------------------------------------- | ----- | ------- | ------------------------------------ |
| WordPress | `Connect for automated visibility fixes` | none  | Connect | `/images/integrations/wordpress.png` |
| Shopify   | `Optimize your store for AI search`      | none  | Connect | `/images/integrations/shopify.png`   |
| Webflow   | `Enhance for AI visibility`              | none  | Connect | `/images/integrations/webflow.png`   |
| GitHub    | `Open visibility fixes as pull requests` | none  | Connect | `/images/integrations/github.png`    |

#### Category `AI TRAFFIC` - subtitle `Track and serve AI crawlers`

| Name                  | Description                                           | Badge | State   | Icon                                             |
| --------------------- | ----------------------------------------------------- | ----- | ------- | ------------------------------------------------ |
| AI Crawler Tracking   | `See which AI bots hit your pages`                    | none  | Connect | vector icon, no image file                       |
| AI Pages              | `Serve AI-optimized versions to crawlers`             | none  | Connect | vector icon, no image file                       |
| Google Search Console | `See Google search performance next to AI visibility` | none  | Connect | `/images/integrations/google-search-console.svg` |
| Google Analytics      | `Track visits from AI assistants in your traffic`     | none  | Connect | `/images/integrations/google-analytics.png`      |

#### Category `ADVERTISING` - subtitle `Connect ad accounts to act on what you find`

| Name       | Description                       | Badge | State   | Icon                              |
| ---------- | --------------------------------- | ----- | ------- | --------------------------------- |
| OpenAI Ads | `Connect your ChatGPT ad account` | none  | Connect | `/images/integrations/openai.png` |

#### Category `ALERTS & TASKS` - subtitle `Notifications and automations`

| Name            | Description                                            | Badge | State   | Icon                                                              |
| --------------- | ------------------------------------------------------ | ----- | ------- | ----------------------------------------------------------------- |
| Zapier          | `Connect to 6,000+ apps`                               | none  | Connect | `/images/integrations/zapier.png`                                 |
| Make            | `Visual automation builder`                            | none  | Connect | `/images/integrations/make.png`                                   |
| Slack           | `Approval requests, notifications, and action buttons` | none  | Connect | `/images/integrations/slack.png`                                  |
| Discord         | `Server notifications`                                 | none  | Connect | `/images/integrations/discord.png`                                |
| Linear          | `Create Linear issues from Trakkr findings`            | none  | Connect | `/images/integrations/linear.png`                                 |
| GitHub Issues   | `Create GitHub issues from audits and Agent`           | none  | Connect | `/images/integrations/github.png`                                 |
| Trello          | `Turn Trakkr findings into Trello cards`               | none  | Connect | `/images/integrations/trello.png`                                 |
| Notion          | `Create Notion pages from Trakkr actions`              | none  | Connect | `/images/integrations/notion.png`                                 |
| Asana           | `Turn Trakkr actions into Asana tasks`                 | none  | Connect | `/images/integrations/asana.png`                                  |
| Jira            | `Create Jira issues from Trakkr findings`              | none  | Connect | `/images/integrations/jira.png`                                   |
| Microsoft Teams | `Post workflow alerts to a Teams channel`              | none  | Connect | `/images/integrations/teams.png`                                  |
| Gmail           | `Send Trakkr reports from your own address`            | none  | Connect | `https://www.google.com/s2/favicons?domain=mail.google.com&sz=64` |

#### Category `EXPORT` - subtitle `Spreadsheets and databases`

| Name          | Description                                         | Badge   | State             | Icon                                     |
| ------------- | --------------------------------------------------- | ------- | ----------------- | ---------------------------------------- |
| CSV Export    | `Download data in multiple formats`                 | none    | Connect           | vector icon, no image file               |
| Google Sheets | `Sync visibility data automatically`                | none    | Connect           | `/images/integrations/google-sheets.svg` |
| Looker Studio | `Build reusable AI visibility dashboards in Google` | `SCALE` | Connect           | `/images/integrations/looker-studio.png` |
| Airtable      | `Build custom views and automations`                | none    | `Soon` (disabled) | `/images/integrations/airtable.png`      |

#### Category `DEVELOPER` - subtitle `APIs and webhooks`

| Name       | Description                                                 | Badge | State   | Icon                           |
| ---------- | ----------------------------------------------------------- | ----- | ------- | ------------------------------ |
| Webhooks   | `Send events to any HTTP endpoint`                          | none  | Connect | vector icon, no image file     |
| REST API   | `Build custom integrations with full API access`            | none  | Connect | vector icon, no image file     |
| MCP Server | `Connect Trakkr to Claude, Cursor, and other AI assistants` | none  | Connect | `/images/integrations/mcp.png` |

### Page footer

- `Need help?` plus link `Read the docs` -> `/learn/docs/features/integrations`
- Link `Request an integration` -> `mailto:contact@example.test?subject=Integration Request`

### API keys panel (`/exports/api-keys`)

The `API keys` header button navigates to `https://trakkr.ai/exports/api-keys`. Browser title becomes `Trakkr`.

- Breadcrumb button: `Integrations` (returns to `/integrate`)
- H1: `REST API`
- Description: `Manage your API credentials and access brand data programmatically`
- Section label: `API KEY`
- Gate heading: `REST API requires Scale plan`
- Gate body: `Generate API keys to authenticate requests and build custom integrations with the Trakkr REST API. Looking to connect an AI assistant? The MCP server is included on every paid plan.`
- Button: `Upgrade to Scale` (NOT CLICKED - payment path)
- Section label: `YOUR BRANDS` with helper `Use these IDs in API requests` and a `Copy ID` button per brand
- Card: `API documentation` / `Learn how to authenticate and use the API`
- Upsell block: `Build with API data for Example Brand` - `Build custom integrations with programmatic access to your visibility data - rankings, citations, competitors, and more via REST API.` - `Included with the Scale plan.`
- Buttons: `Upgrade to Scale`
- Links: `View plans` -> `/pricing`, `Learn more` -> `/learn/docs/features/api`

No generated key is shown on this account. Key-list, create-key and revoke-key UI: NOT OBSERVED.

### Page API calls (`/integrate`)

- `GET https://api.trakkr.ai/workflow-integrations/?user_id=<user_id>`
- `GET https://api.trakkr.ai/work-item-integrations/accounts?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/sites/connection-statuses?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/sites/platforms`
- `GET https://api.trakkr.ai/prism/status?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/crawler-connect/connections?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/integrations/openai-ads?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/gsc/status?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/ga/status?brand_id=<brand_id>&user_id=<user_id>`
- `GET https://api.trakkr.ai/gmail/status`

---

## 8. `/sites`

- URL: `https://trakkr.ai/sites`
- Browser title: `Sites`
- H1: `Site connections`
- Description line: `Connect a destination to publish content and apply fixes automatically.`
- Header actions: `Refresh` button, `Connect destination` button

### Tabs

`role="tab"` buttons: `Sites` (default selected) and `Changes`.

- `Sites` tab, empty state:
  - Heading: `No sites connected`
  - Body: `Connect a supported publishing destination if you want Trakkr to publish content or apply fixes directly. If your CMS is not supported yet, keep using guided action steps and apply changes manually.`
  - Button: `Connect destination`
- `Changes` tab: selecting it keeps `aria-selected=true` on `Changes`, but the panel renders the same `No sites connected` empty state and the same body copy and button. A separate change list is NOT OBSERVED.

### Connect destination dialog

Opened by either `Connect destination` button. Rendered as an overlay div, not `role="dialog"`.

- Title: `Connect a site`
- Body: `Choose where Trakkr should publish content or apply supported fixes. This is separate from crawler tracking.`
- Four destination buttons:

| Destination | Icon                                                            |
| ----------- | --------------------------------------------------------------- |
| GitHub      | `https://www.google.com/s2/favicons?domain=github.com&sz=40`    |
| Shopify     | `https://www.google.com/s2/favicons?domain=shopify.com&sz=40`   |
| Webflow     | `https://www.google.com/s2/favicons?domain=webflow.com&sz=40`   |
| WordPress   | `https://www.google.com/s2/favicons?domain=wordpress.org&sz=40` |

- Sub-heading: `Using HubSpot or another CMS?`
- Body: `Native publishing is not available for every CMS yet. You can still use Actions as the implementation checklist, apply the changes in your CMS, or connect GitHub if your team ships site changes through pull requests.`
- Line: `More publishing destinations are on the way`
- Footer: `Optional. Manual action steps continue to work without a site connection.`
- No text inputs. No links. Close button only in the header.
- Each destination button starts an OAuth or install flow. None was clicked.

### Page API calls

- `GET https://api.trakkr.ai/sites/?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/sites/platforms`
- `GET https://api.trakkr.ai/sites/proposals?brand_id=<brand_id>&status=proposed`
- `GET https://api.trakkr.ai/sites/proposals?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/sites/history?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/crawler-connect/connections?brand_id=<brand_id>`

---

## 9. `/integrate/work-items`

- URL: `https://trakkr.ai/integrate/work-items`
- Browser title: `Work Items`
- Eyebrow label: `WORK-ITEM ROUTING`
- H1: `Send Trakkr actions to your tools`
- Description line: `Connect provider accounts, sync their destinations, and choose where Trakkr creates issues, cards, pages, and notifications across Linear, GitHub, Slack, Trello, Notion, Asana, and Jira.`
- Reassurance line under the description: `Trakkr never writes to a destination until you've configured a route for it.`

### Provider selector

Label: `Integration provider`. Seven provider tiles. Each tile shows two counters and a `Connect` button.
On this account every counter reads `0`.

| Provider      | Counters                       | Action    | Icon                              |
| ------------- | ------------------------------ | --------- | --------------------------------- |
| Linear        | `0 ACCOUNTS`, `0 DESTINATIONS` | `Connect` | `/images/integrations/linear.png` |
| GitHub Issues | `0 ACCOUNTS`, `0 DESTINATIONS` | `Connect` | `/images/integrations/github.png` |
| Slack         | `0 ACCOUNTS`, `0 DESTINATIONS` | `Connect` | `/images/integrations/slack.png`  |
| Trello        | `0 ACCOUNTS`, `0 DESTINATIONS` | `Connect` | `/images/integrations/trello.png` |
| Notion        | `0 ACCOUNTS`, `0 DESTINATIONS` | `Connect` | `/images/integrations/notion.png` |
| Asana         | `0 ACCOUNTS`, `0 DESTINATIONS` | `Connect` | `/images/integrations/asana.png`  |
| Jira          | `0 ACCOUNTS`, `0 DESTINATIONS` | `Connect` | `/images/integrations/jira.png`   |

### Sub-tabs

`Connections 0`, `Destinations 0`, `Routing 0`. Default selected: `Connections`.
Selecting `Destinations` shows the same empty state. `Routing` panel content: NOT OBSERVED as a distinct view.

### Empty state (all sub-tabs)

- Context label: `FOR LINEAR` (follows the selected provider)
- H2: `Route Trakkr actions to your tools`
- Body: `Connect the tools your team works in. Trakkr will open issues, pull requests, cards, pages, and notifications from audits, agent actions, and workflow events, exactly where you expect them.`
- Numbered steps:
  1. `Connect a provider` - `Pick a tool above and authorize Trakkr to talk to it on your behalf.`
  2. `Sync destinations` - `Trakkr lists the repos, channels, projects, or boards it can reach.`
  3. `Route triggers to a destination` - `Bind audits, fixes, and alerts to specific places in the Routing tab.`
- Button: `Connect Linear` (label follows the selected provider; NOT CLICKED - OAuth)
- Footer: `You can revoke any connection at any time. Trakkr never writes to a destination until you've configured a route for it.`
- No outbound links on this page.

### Connected state

NOT OBSERVED.

### Page API calls

- `GET https://api.trakkr.ai/work-item-integrations/oauth/status`
- `GET https://api.trakkr.ai/work-item-integrations/accounts?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/work-item-integrations/accounts?brand_id=<brand_id>&provider=linear`
- `GET https://api.trakkr.ai/work-item-integrations/destinations?brand_id=<brand_id>`
- `GET https://api.trakkr.ai/work-item-integrations/destinations?brand_id=<brand_id>&provider=linear`
- `GET https://api.trakkr.ai/work-item-integrations/routes?brand_id=<brand_id>`

The `provider=` query parameter changes with the selected provider tile.

---

## 10. Outbound links collected in this slice

| Anchor text                    | href                                                                         | Page                     |
| ------------------------------ | ---------------------------------------------------------------------------- | ------------------------ |
| Read how it works              | `/learn/docs/features/visitors`                                              | /traffic/analytics       |
| Read how it works              | `/learn/docs/features/traffic/crawlers/install`                              | /traffic/crawler         |
| Setup guide                    | `/learn/docs/features/traffic/crawlers/install#vercel`                       | Vercel modal             |
| Setup guide                    | `/learn/docs/features/traffic/crawlers/install#netlify`                      | Netlify modal            |
| Full setup guide               | `/learn/docs/features/traffic/crawlers/install#cloudflare`                   | Cloudflare modal         |
| Open Cloudflare token template | `https://dash.cloudflare.com/profile/api-tokens?...` (full URL in section 2) | Cloudflare modal         |
| Crawlers                       | `/traffic/crawler`                                                           | /traffic/crawler/sources |
| Read the full documentation    | `/learn/docs/features/ai-pages`                                              | /ai-pages                |
| Read how it works              | `/learn/docs/features/reddit`                                                | /reddit                  |
| Read the docs                  | `/learn/docs/features/integrations`                                          | /integrate               |
| Request an integration         | `mailto:contact@example.test?subject=Integration Request`                    | /integrate               |
| View plans                     | `/pricing`                                                                   | /exports/api-keys        |
| Learn more                     | `/learn/docs/features/api`                                                   | /exports/api-keys        |

---

## 11. Buttons recorded but never clicked

| Page                    | Button                                      | Reason                                  |
| ----------------------- | ------------------------------------------- | --------------------------------------- |
| /traffic/analytics      | `Connect Google Analytics`                  | Google OAuth                            |
| /traffic/search-console | `Connect with Google`                       | Google OAuth                            |
| /traffic/crawler        | `Continue to Vercel`                        | Vercel OAuth, leaves trakkr.ai          |
| /traffic/crawler        | `Continue to Netlify`                       | Netlify OAuth, leaves trakkr.ai         |
| /traffic/crawler        | `Verify token`                              | Submits a credential                    |
| /traffic/crawler        | `Get credentials` (5 runtime modals)        | Creates a connection and a bearer token |
| /traffic/crawler        | `Continue` (7 CMS modals)                   | Blocked by the browser-control policy   |
| /ai-pages               | `Save and continue`                         | Writes the AI Pages configuration       |
| /reddit                 | `Start monitoring`                          | Starts a monitoring job                 |
| /integrate              | every `Connect` button                      | OAuth or install                        |
| /exports/api-keys       | `Upgrade to Scale`                          | Payment path                            |
| /sites                  | `GitHub`, `Shopify`, `Webflow`, `WordPress` | OAuth or install                        |
| /integrate/work-items   | `Connect <provider>`                        | OAuth                                   |

---

## 12. States not seen anywhere in this slice

- Loading skeletons: NOT OBSERVED. Pages rendered before the capture ran.
- Error states: NOT OBSERVED. No request returned a visible error.
- Any connected-state dashboard for Visitors, Crawlers, Search Console, AI Pages, Reddit, Sites or Work Items: NOT OBSERVED. Every connector on this account is disconnected.
