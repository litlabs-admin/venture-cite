# 09 - Connected states, reconstructed from the official documentation

## Provenance and warning

This file is **documentation-derived**. It is **not observed**.

The live trakkr.ai account had every traffic connector disconnected. The connected
UIs could not be seen. Every claim below comes from the public docs at
`https://trakkr.ai/learn/docs/...`.

Labels used in this file:

- `[DOCS]` - the docs state this.
- `NOT DOCUMENTED` - the docs are silent. Do not invent a value.

Capture method note: the browser pane became unresponsive after the first two
pages. The remaining pages were read through a page-fetch tool that returns
structured extraction, not raw verbatim body text. So most quotes below are the
short phrases the extraction preserved. Long-form prose is summarised, and it is
marked as such. Two pages (`/traffic` and `/traffic/visitors`) were captured as
full body text before the pane failed. Those two are the most reliable.

Image note: on every page read, the only images found were the site logo
`/logo-mint.png` and the "Open in ChatGPT" button icon
`/images/ai-logos/chatgpt.svg`. **No documentation page contains a product
screenshot.** So the docs give no visual description of any connected screen.
Alt text on both images was empty.

---

## 1. `/learn/docs/features/traffic` - Traffic

Captured as full body text.

**Subtitle** `[DOCS]`: "How crawler reads and human arrivals fit into the page
journey from Available to Visited."

**Read time** `[DOCS]`: 2 min read. **Updated** `[DOCS]`: 10 days ago.

**Lead paragraph** `[DOCS]` (verbatim):

> AI traffic has two observable ends: crawlers read your site, and visitors are
> the humans whose analytics source shows they arrived from an AI tool. Pages
> connects those signals to the rest of the Journey.

**Journey stages shown as a numbered strip** `[DOCS]`:

1. Available
2. Reached
3. Understood
4. Relevant
5. Selected
6. Visited

**Table - three columns: Page / What it shows / When to open it** `[DOCS]`:

| Page | What it shows | When to open it |
|---|---|---|
| Visitors | Humans who landed on your site from ChatGPT, Perplexity, Gemini, Claude, and other AI tools | You want to know if AI visibility is producing actual traffic, conversions, and revenue |
| Crawlers | AI bots reading your site, classified by what they're doing (training, indexing, live conversations, agents) | You want to know if AI can actually read your content, which pages it's eating, and whether you're being blocked |
| Pages | Each URL moving from Available through Visited, with the first weak stage named | You want to turn traffic evidence into the next Page and Action to work on |

**Closing note** `[DOCS]` (verbatim):

> New to AI tracking? Start with Crawlers because bot visits often appear before
> human arrivals. Then open Pages to see which URLs are Reached, Selected, and
> Visited. Visitors only counts sessions that connected analytics can identify as
> AI referrals, so stripped referrers remain an undercount.

**SEE ALSO links** `[DOCS]`: Welcome to Trakkr, Quick Start, Core Concepts,
Perception, Visitors.

**Page footer controls** `[DOCS]`: "Leave feedback", "Open in ChatGPT", "Was this
helpful?".

---

## 2. `/learn/docs/features/traffic/visitors` - Visitors

Captured as full body text. 6 min read. Updated 10 days ago `[DOCS]`.

**Subtitle** `[DOCS]`: "AI referral sessions in connected Google Analytics:
sources, landing pages, engagement, conversions, revenue, limits, and the Visited
stage in Pages."

**Definition** `[DOCS]` (verbatim):

> A visitor, in the Trakkr sense, is a session whose connected analytics source
> identifies an AI referrer such as ChatGPT, Perplexity, Claude, Gemini, or
> Copilot. It is the arrival signal behind the Visited stage in a Page's Journey.

### Headings in order `[DOCS]`

1. What's actually different about AI referral traffic
2. Why it's hard to measure
3. How Trakkr measures it
4. Connecting Google Analytics
5. Reading the dashboard
6. What to do with the data
7. Common questions
8. Going further

### Comparison table `[DOCS]` (verbatim)

| Behaviour | Search visitor | AI visitor |
|---|---|---|
| Intent at the moment of click | Browsing a list of options | Already partway through making a decision |
| Time spent before clicking | Seconds | Often minutes inside the AI tool first |
| What they know about you | The headline and meta description | Whatever the AI synthesized from your content |
| How they arrived | Clean referrer, UTMs preserved | Referrer often missing or generic, UTMs frequently stripped |
| What Trakkr can measure | Search source and landing page | AI source and landing page when the referrer survives |

### The four measurement blockers `[DOCS]` (verbatim list)

1. "UTMs get stripped. ChatGPT in particular often removes query parameters from outbound links."
2. "Referrers go missing. Some AI clients open links in a way that drops the Referer header entirely. In GA4, those visits land in 'Direct / None.'"
3. "Source names are inconsistent. Sometimes you see chatgpt.com, sometimes openai.com, sometimes a fresh subdomain after a product launch."
4. "Multi-step journeys are common."

### How Trakkr measures it `[DOCS]`

- Data source: Google Analytics 4 property, read through the **GA4 Data API**.
- Connection type: **OAuth**, one click. Read-only at the GA4 level.
- "Nothing is intercepted in the browser, and Trakkr adds no script to your site."
- Pattern set covers: **ChatGPT, Perplexity, Claude, Gemini, Copilot, Meta AI, You.com, Phind, Poe**, and "the long tail".
- Groups ChatGPT and OpenAI hostnames under one readable source.
- Shows "landing pages, geography, devices, engagement, key events, and revenue fields returned by the connected property".

### Setup steps, in order `[DOCS]`

1. Open Visitors in the sidebar
2. Click **Connect Google Analytics**
3. Sign into the Google account that has access to the property
4. Pick the property that matches your brand's domain
5. Trakkr loads the selected date window and caches the report for up to four hours

Prerequisites `[DOCS]`: a GA4 property (not Universal Analytics), plus **editor or
admin** access. One GA4 property per brand.

Code snippet: **NOT DOCUMENTED** (no snippet on this page).

### Limits, delays, retention `[DOCS]`

- Report cache: **up to four hours**. A **Refresh** button requests a fresh report.
- GA4 itself lags recent activity.
- Retention period: **NOT DOCUMENTED** on this page.
- Row limits: **NOT DOCUMENTED** on this page.

### FAQ `[DOCS]`

- "Why is my number lower in Trakkr than in GA4?" - different filters; raw GA4 "AI search" buckets mix AI tools with search engines that have an AI feature.
- "Can I track AI visitors without GA4?" - "Not through the standard Visitors connection."
- "Does Trakkr modify my GA4 setup?" - "No. The connection is read-only."
- "How fresh is the data?" - cached up to four hours; click Refresh.
- "What if AI traffic just shows as 'Direct'?" - Trakkr does not guess; the AI total is a lower bound.
- "Does this work in white-label client portals?" - "Yes. Visitors data is brand-scoped."

---

## 3. `/learn/docs/features/traffic/crawlers` - Crawlers

Structured extraction only. Verbatim body text could not be captured.

### Headings in order `[DOCS]`

1. Crawlers
2. The three kinds of bot, and why the distinction matters
3. The bots Trakkr identifies
4. Why blocking AI bots is almost always a mistake
5. How Trakkr tracks crawler activity
6. What's on the dashboard
7. What to do with the data
8. Common questions
9. Going further

### The three bot kinds `[DOCS]`

| Category | Definition (as the docs put it) |
|---|---|
| Training | "Scraping content for the next model training cycle" |
| Indexing | "Pre-fetching content for an AI search index" |
| Conversations | "Live retrieval during an active AI chat" |

A fourth label, **Agent**, appears on the `/traffic` overview page and on the bot
list (Google-Agent). Its own definition is **NOT DOCUMENTED**.

### Bots Trakkr identifies `[DOCS]`

| Company | Bots |
|---|---|
| OpenAI | GPTBot, ChatGPT-User, OAI-SearchBot |
| Anthropic | ClaudeBot, Claude-User, Claude-SearchBot, Claude-Web, Claude-Code, anthropic-ai |
| Perplexity | PerplexityBot, Perplexity-User |
| Google | Google-Agent, Google-Extended |
| Apple | Applebot, Applebot-Extended |
| Mistral | MistralAI-User |
| Amazon | Amazonbot |
| ByteDance | Bytespider |
| Common Crawl | CCBot |
| xAI | GrokBot |
| DeepSeek | DeepSeekBot |
| Cohere | cohere-ai |
| Allen AI | AI2Bot |
| Other | Diffbot, Omgili, Timpibot, ImagesiftBot, Scrapy |

Category assignment stated by the docs `[DOCS]`:

- Training: GPTBot, ClaudeBot, Bytespider, CCBot, Amazonbot
- Indexing: PerplexityBot, OAI-SearchBot, Claude-SearchBot, Applebot
- Conversations: ChatGPT-User, Claude-User, Perplexity-User, MistralAI-User
- Agent: Google-Agent

Category for the remaining bots: **NOT DOCUMENTED**.

### How Trakkr tracks crawler activity `[DOCS]`

- **18 first-class server-side connections.**
- CDN: Cloudflare, Vercel, Netlify.
- Self-hosted: Next.js, Node, Nginx, AWS CloudFront, Akamai, Fastly, custom.
- CMS: WordPress, Webflow, Shopify, HubSpot, Squarespace, Wix, Framer, Ghost.
- Each captures requests at the platform level, before application logic.
- Deduplication: per connection, by event hash.

### What's on the dashboard `[DOCS]`

Hero stats, four of them, each with a trend against the previous period:

1. **Total Visits**
2. **Conversations**
3. **Indexing**
4. **Training**

Activity chart: a **stacked bar chart of visits over time**, with a view toggle of
**Platform | Intent | Status**.

Four tabs:

| Tab | What the docs say it holds |
|---|---|
| Pages | URLs visited, totals, unique bots, last seen |
| Live | Real-time crawler event stream |
| Actions | Prioritised recommendations |
| Access | robots.txt / llms.txt analysis, per-page accessibility |

Exact column headers for the Pages tab beyond those four fields:
**NOT DOCUMENTED**. Columns for the Live, Actions and Access tabs:
**NOT DOCUMENTED**, except that the Live feed shows rows labelled **Verified** for
test pings.

### Verification `[DOCS]`

A **Send test ping** control (the install page calls it **Send verification**) in
the Crawlers header. It creates three synthetic visits: **GPTBot**,
**PerplexityBot**, **ChatGPT-User**. They appear labelled **Verified**.

### Limits, delays, retention `[DOCS]`

- Detailed visit history: **kept for 90 days**.
- Daily aggregates: **kept indefinitely**.
- Cloudflare: high-traffic zones may **sample** bot data.
- Refresh interval of the dashboard: **NOT DOCUMENTED**.

### What to do with the data `[DOCS]`

- Confirm bots can read the site, using the Access tab.
- Check robots.txt for accidental AI bot blocks.
- Add or improve llms.txt.
- Find the pages that convert and copy their structure.
- Watch for new bots appearing.

### FAQ `[DOCS]`

- Blocking GPTBot has knock-on effects on other crawlers and on citation likelihood. The surgical option is to block training only and allow indexing and conversations.
- A low Conversations count is normal. Conversation bots fire only when a real user asks a question the AI thinks your page answers.
- "Crawls mean AI is aware of you. Citations mean AI is recommending you."
- Retention: 90 days detailed, aggregates indefinite.
- Cloudflare: Trakkr reads the GraphQL Analytics API, including WAF-blocked visits.

---

## 4. `/learn/docs/features/traffic/crawlers/install` - Crawler install

Structured extraction only.

### Headings in order `[DOCS]`

Cloudflare, Vercel, Netlify, WordPress, Next.js self-hosted, Node and Express,
Nginx and OpenResty, AWS CloudFront, Akamai, Fastly, Other or custom edge,
Webflow, Shopify, HubSpot, Squarespace, Wix, Framer, Ghost, AI Pages, Verify any
connection.

Grouping `[DOCS]`: **Hosted and edge** (Cloudflare, Vercel, Netlify, CloudFront,
Akamai, Fastly); **Self-hosted** (Next.js, Node, Nginx, Other); **Hosted CMS**
(WordPress, Webflow, Shopify, HubSpot, Squarespace, Wix, Framer, Ghost).

### Cloudflare `[DOCS]`

Prerequisite: an active zone with the orange cloud on (proxied DNS).

API token permissions, all read:

- Zone -> Analytics -> Read
- Account -> Account Analytics -> Read
- Zone -> Zone -> Read

Steps:

1. Cloudflare: **Create Token** -> **Create Custom Token**.
2. Add the three read permissions above.
3. Under Zone Resources, allow all zones or the target domain.
4. Create the token and copy it. It is shown once.
5. Trakkr: Traffic -> Crawlers -> Cloudflare.
6. Paste the token, click **Verify token**.
7. Pick the zone, click **Connect zone**.
8. Send verification from the Crawlers header.

Warnings `[DOCS]`: never use the Global API Key. Analytics may sample low-volume
bot traffic on busy zones. An optional Worker is offered after connection, for
complete request records.

### Vercel `[DOCS]`

Requires **Vercel Pro or Enterprise**.

1. Traffic -> Crawlers -> Vercel -> **Continue to Vercel**.
2. Authorise the Vercel team.
3. Return to Trakkr and select one project. Trakkr creates a **Log Drain**.
4. Send verification and check the Live feed.

Coverage: production traffic on the main domain and production aliases only. One
project per brand; choosing another replaces the existing one.

### Netlify `[DOCS]`

1. Traffic -> Crawlers -> Netlify -> **Continue to Netlify**.
2. Approve team access and select the site.
3. Trakkr shows the Edge Function file and the credentials.
4. Create the file in the repository:

```
netlify/edge-functions/trakkr-crawler.ts
```

5. Copy the template from the Trakkr connection card into that file.
6. Add three environment variables in Site configuration:

```
TRAKKR_CONNECTION_ID=<your connection id>
TRAKKR_WEBHOOK_SECRET=<your webhook secret>
TRAKKR_INGEST_URL=https://api.trakkr.ai/crawler-connect/ingest/netlify
```

7. Commit, push, and trigger a deploy.

The body of the Edge Function template: **NOT DOCUMENTED** (the docs say it is
generated in the connection card).

### WordPress `[DOCS]`

Prerequisite: an existing WordPress publishing connection with an admin account.

1. Connect WordPress in Sites, by OAuth or application password.
2. Traffic -> Crawlers -> WordPress, select the connected site.
3. Click **Enable tracking**.
4. Download the plugin ZIP if it is not detected.
5. WordPress: Plugins -> Add New -> Upload Plugin -> Install Now -> Activate.
6. Return to Crawlers and send verification.

WAF note: with Wordfence, Solid Security or Sucuri, allow authenticated access to
`/wp-json/` and `/wp-json/trakkr/*`.

### Next.js self-hosted `[DOCS]`

1. Choose Next.js in the Crawlers source picker and name the connection.
2. Copy the endpoint, bearer token and template.
3. Send a sample event from Trakkr. This tests authentication.
4. Add the template to the proxy or middleware path and deploy.
5. Send verification.

The template forwards matching crawler hits in the background. It does not delay
the page response.

### Node and Express `[DOCS]`

1. Choose Node / Express and create the connection.
2. Copy the endpoint, bearer token and middleware.
3. Send the built-in sample event.
4. Add the middleware before the routes, set the token as a server secret, deploy.

Note: set Express `trust proxy` correctly for accurate client IP.

### Nginx and OpenResty `[DOCS]`

1. Choose Nginx / OpenResty. Copy the endpoint, bearer token and configuration.
2. Send a sample event.
3. Add the hook to the request log phase. Reload and validate Nginx.
4. Send verification.

Note: set `real_ip_header` and the trusted proxy ranges when proxies are present.

### AWS CloudFront `[DOCS]`

1. Choose AWS CloudFront and create the connection.
2. Copy the Lambda@Edge template. The endpoint and bearer token are already in it.
3. Send a sample event.
4. Create the function in **us-east-1** and publish a numbered version.
5. Attach it to the distribution's **Viewer Request** event.
6. Wait for deployment, then send verification.

Note: environment variables are not supported. The values sit in the function
source. Restrict access and rotate the token if it leaks.

### Akamai `[DOCS]`

1. Choose Akamai.
2. Copy the template and send a sample event.
3. Configure **DataStream 2** to send request batches to the generated endpoint,
   with Basic Authentication credentials.
4. Check the connection health view for arriving events.

### Fastly `[DOCS]`

1. Choose Fastly.
2. Test a sample event.
3. Add an HTTPS log endpoint in Fastly.
4. Pass the bearer token in the `Authorization` header.
5. Activate the service version.

Tip: filter at the edge and forward only known crawler rows.

### Other or custom edge `[DOCS]`

Trakkr supplies a POST endpoint, a bearer token, a sample payload and a cURL
example. The payload is a small JSON list. Each item holds time, URL, user agent,
IP, status code and country when available. The exact JSON keys are
**NOT DOCUMENTED**.

### The Cloudflare-proxy CMS paths `[DOCS]`

Webflow, Shopify, HubSpot, Squarespace, Wix, Framer and Ghost all follow the same
shape. These platforms expose no server-side logs, so the site is fronted with
Cloudflare.

| Platform | Records to recreate in Cloudflare |
|---|---|
| Webflow | Custom-domain DNS records from Project Settings -> Publishing |
| Shopify | Shopify A and CNAME records from Settings -> Domains |
| HubSpot | Connected-domain CNAME records from Settings -> Website -> Domains & URLs |
| Squarespace | A and CNAME records; needs "Use a domain I own" |
| Wix | A and CNAME records from Settings -> Domains |
| Framer | CNAME pointing to `framer.website` |
| Ghost | A or CNAME record from Ghost Admin -> Settings -> Custom Domain |

Common steps for all seven `[DOCS]`: add the domain to Cloudflare, recreate the
records, keep the website record **Proxied**, point the registrar nameservers at
Cloudflare, then connect the Cloudflare zone in Trakkr.

Squarespace limit `[DOCS]`: the domain must be externally managed. Transfer it if
Squarespace manages it.

### AI Pages as a crawler source `[DOCS]`

Appears automatically when AI Pages is enabled and there is enough traffic data.
It creates a crawler source with no extra token, no DNS change and no code file.

### Verify any connection `[DOCS]`

1. Click **Send verification** in the Crawlers header.
2. Labelled synthetic bot events pass through the measurement path.
3. **Verified** rows should appear in the Live feed.

If verification works but no real traffic arrives after **24 to 48 hours**:

1. Check the connection health message and the platform logs.
2. Confirm the connected source sees the production hostname.
3. Review `robots.txt` bot rules.
4. Check WAF, bot-management, rate-limit and security-plugin logs.
5. Confirm one source per origin. Two sources on one origin double-count.

---

## 5. `/learn/docs/features/ai-pages` - AI Pages

Structured extraction only.

### Headings in order `[DOCS]`

1. AI Pages
2. What an AI page actually contains
3. How Trakkr serves AI pages to crawlers (and only to crawlers)
4. Isn't this just SEO?
5. What you'll see in the dashboard
6. What you'll see in your AI visibility, eventually
7. What it costs
8. Common questions

### Mechanism `[DOCS]`

Middleware reads the `User-Agent` header. Humans go to the original site. AI
crawlers go to the Trakkr optimisation service. Crawlers named on this page:
**GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot (Perplexity), Gemini
crawler (Google), Copilot bot (Microsoft)**.

### Integration paths, nine `[DOCS]`

Cloudflare Workers, Vercel Edge Middleware, Netlify Edge Functions, Next.js
middleware, AWS Lambda@Edge, WordPress mu-plugin, Node.js / Express, Nginx with
OpenResty, Cloudflare DNS proxy for managed platforms (Shopify, Squarespace, Wix,
Webflow).

"The setup wizard on the AI Pages page generates the snippet for your stack with
your API key already baked in." `[DOCS]`

### Dashboard `[DOCS]`

**Overview tab**

- Live crawler activity
- Requests over time (chart)
- Crawler breakdown by company
- Response time chart
- Top pages
- Recent crawl log

Recent crawl log fields `[DOCS]`: **Status** with the values **Cache Served**,
**Cache Created**, **Error**; and **Response time**. Other columns:
**NOT DOCUMENTED**.

**Pages tab**

- Per-URL optimisation status and cache status
- Sortable by **visits** and by **last-crawled** time

**Usage tab**

- Monthly request count against the plan limit
- Overage settings
- Spending cap
- Billing detail

### Limits, delays, costs `[DOCS]`

| Item | Value |
|---|---|
| Middleware latency for humans | under 10 ms |
| Cache hit response for AI | about 100 ms |
| Cache miss response for AI | about 2 seconds |
| Cache TTL | 7 days |
| Growth plan included requests | 2,500 per month |
| Growth plus Prism add-on | 10,000 per month |
| Scale plan included requests | 10,000 per month |
| Overage | $5 per 1,000 requests |
| Crawl-to-visibility lag, Perplexity and ChatGPT Search | hours to days |
| Crawl-to-visibility lag, ChatGPT main | days to weeks |
| Crawl-to-visibility lag, Claude | weeks to months |
| Crawl-to-visibility lag, Gemini and Copilot | days to weeks |

Manual cache invalidation is described as "coming soon" `[DOCS]`.

### FAQ `[DOCS]`

- Not cloaking: SEO crawlers get the original content, and the AI version carries the same information in a machine-readable form.
- Fail open: if the Trakkr API is unreachable or errors, the original page is served to everyone.
- Path exclusions are supported, for example `/admin/*` or `/checkout/*`. Static assets and API routes are skipped by default.
- Humans are unaffected, because the User-Agent check gates the transform.
- Stale pages re-optimise after the seven-day expiry.
- Managed platforms need the Cloudflare DNS proxy.
- Optimize proposes real site changes. AI Pages serves a separate layer to crawlers only.

---

## 6. `/learn/docs/features/ai-pages/installation` - AI Pages installation

Structured extraction only.

### Headings in order `[DOCS]`

Installation; The setup wizard; Pick the right platform path; Before you start;
What each path actually deploys; Cloudflare Workers; Vercel / Next.js middleware;
Netlify Edge Functions; AWS Lambda@Edge; WordPress mu-plugin; Node.js / Express;
Nginx / OpenResty; Other (DNS proxy via Cloudflare); Verifying the install; When
things go wrong; The middleware isn't intercepting; The middleware runs but Trakkr
returns 401; Optimized HTML looks incomplete or wrong; The site is down after
install; Usage is climbing faster than expected; What to read next.

### Prerequisites `[DOCS]`

- A Trakkr brand on the **Growth or Scale plan**. A Scale trial also works.
- Ownership of the domain, apex or subdomain.
- Deploy access to the chosen platform.
- Estimated time: "About 15 minutes". The DNS proxy path takes longer.

### Platform paths and runtimes `[DOCS]`

| Path | Runtime |
|---|---|
| Cloudflare Workers | Cloudflare Edge (V8) |
| Vercel Edge Middleware | Vercel Edge Runtime |
| Netlify Edge Functions | Netlify Edge (Deno) |
| Next.js Middleware | Next.js Edge Runtime |
| AWS CloudFront | Lambda@Edge (Node.js) |
| WordPress | PHP mu-plugin |
| Node.js / Express | Node.js |
| Nginx / OpenResty | OpenResty (Lua) |
| Other | Cloudflare DNS in front |

### Middleware logic, in order `[DOCS]`

1. If the request is a non-HTML asset (`.js`, `.css`, image), pass it through.
2. Read `User-Agent` and compare it with the hard-coded AI crawler list.
3. No match, pass through to origin.
4. Match, POST to `https://prism.trakkr.ai` with the API key in the header.
   Time out after **1 to 1.5 seconds**.
5. Return the optimised HTML. On any failure, return the original page.

### Per-platform file paths and snippets `[DOCS]`

Cloudflare Workers routes:

```
yourdomain.com/*
www.yourdomain.com/*
```

Both DNS records must be proxied. The generated code uses the Module Worker
format.

Vercel / Next.js: save the generated code as `middleware.ts` at the project root,
next to `package.json`. Commit and push. Merge it into an existing middleware if
one is present.

Netlify: save as `netlify/edge-functions/prism.ts`, then add an
`[[edge_functions]]` block to `netlify.toml`. Deno-style imports.

AWS Lambda@Edge:

1. Create the function in **us-east-1** on **Node.js 20.x**.
2. Paste the generated code.
3. Publish a version. Do not use `$LATEST`.
4. Attach it to CloudFront as a **Viewer Request** trigger.
5. The IAM role must trust `edgelambda.amazonaws.com`.

Limit: 40 KB response body on viewer-request responses.

WordPress: save the generated PHP file to
`wp-content/mu-plugins/trakkr-prism.php`. It auto-loads. Check WP Admin ->
Plugins -> Must-Use. It hooks `send_headers` at priority 1.

Node.js / Express: save `prism-middleware.js`, then register it before the route
handlers.

```javascript
const prism = require('./prism-middleware')
app.use(prism)
```

Nginx / OpenResty: needs OpenResty with `lua-resty-http`.

```
opm get ledgetech/lua-resty-http
```

Then drop the generated `access_by_lua_block` into the `server {}` block and
reload Nginx.

Other (Cloudflare DNS proxy):

1. Sign up for the Cloudflare free plan and add the domain.
2. Cloudflare imports the existing DNS records.
3. Turn on the orange-cloud proxy on the main A or CNAME record.
4. Update the nameservers at the registrar.
5. Deploy the Worker from the wizard.
6. Add the routes `yourdomain.com/*` and `www.yourdomain.com/*`.

Propagation: "5 minutes to a few hours" `[DOCS]`.

### Headers and endpoint `[DOCS]`

- Request header to Trakkr: `X-API-Key`. Treat it as a deploy secret. Regenerate it if it leaks.
- Endpoint: `POST https://prism.trakkr.ai`, with URL, pathname and crawler name.
- Diagnostic query parameter: `__trakkr_prism_probe=manual`.

Response headers that prove the install works `[DOCS]`:

- `X-Prism-Optimized: true`
- `X-Prism-Cache: HIT` in steady state
- `X-Prism-Middleware: active`
- `X-Prism-Forwarding: optimized`

### Verifying the install `[DOCS]`

In the dashboard: click **Test connection** in settings, give a URL. Trakkr sends
a probe with a fake GPTBot user agent. It reports middleware reachability, API key
validity and the returned content.

Manual check:

```bash
curl -sS -D - -o /dev/null \
  -A "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)" \
  "https://yourdomain.com/?__trakkr_prism_probe=manual"
```

A correct optimised response shows `X-Prism-Optimized: true`, clean HTML, JSON-LD
in the head, and no JavaScript.

Real crawler visits take **24 to 48 hours** to appear in analytics `[DOCS]`.

### Troubleshooting table `[DOCS]`

| Symptom | Cause the docs give |
|---|---|
| Middleware is not intercepting | Worker not deployed, routes wrong, DNS not proxied, `middleware.ts` not at root, or file not in `mu-plugins/` |
| Trakkr returns 401 | API key mismatch. Regenerate and redeploy |
| Optimised HTML looks incomplete | JavaScript dependency, or anti-bot protection blocking the headless browser |
| Site down after install | Roll back at once. The middleware is meant to fail open |
| Usage climbing fast | Check the Pages tab for unintended crawlable paths and add them to the exclude list |

---

## 7. `/learn/docs/features/ai-pages/optimizations` - The five optimizations

Structured extraction only.

### Headings in order `[DOCS]`

Why raw HTML is hard for models; 1. Structured data injection; 2. Key facts
extraction; 3. Automated FAQ generation; 4. AI summary block; 5. Entity
recognition; How they combine; A note on what doesn't get generated; What to read
next.

### The five optimizations `[DOCS]`

1. **Structured data injection.** Detects the page type and injects schema.org
   JSON-LD into `<head>`. Mapping: homepage -> `Organization`; product detail ->
   `Product` with nested `Offer` and `AggregateRating`; blog post -> `Article`;
   FAQ -> `FAQPage`; category -> `ItemList`.
2. **Key facts extraction.** Wraps prices, percentages, dates, counts,
   measurements, ratings and statistics in semantic markup.

```html
<span itemtype="price">$130</span>
<span itemtype="date">March 2024</span>
<span itemtype="statistic">98% uptime</span>
```

3. **Automated FAQ generation.** Builds a small `FAQPage` block with **two to five**
   questions and answers, drawn from the page content.
4. **AI summary block.** A plain-language summary of **three or four sentences**,
   placed toward the top of the body.
5. **Entity recognition.** Wraps named entities. Tags: `Brand`, `Product`,
   `Person`, `Organization`, `Place`, `Technology`.

```html
<Technology>React</Technology>
<Organization>Vercel</Organization>
```

### UI elements `[DOCS]`

- A test tool that shows optimised HTML beside the original.
- AI Pages settings, where each of the five optimizations toggles on and off
  independently.

### What is not generated `[DOCS]`

AI Pages will not invent facts, will not translate pages, will not change
messaging, tone or positioning, and will not add external citations or backlinks.

---

## 8. `/learn/docs/features/live-visitors`

This URL resolves to the **Visitors** page. Title: "Visitors | Trakkr Docs".
Headings and content match section 2 above.

There is **no separate live-visitors documentation page**. The Visitors page
describes analytics reporting, not a real-time feed. The only real-time feed the
docs name is the **Live** tab inside Crawlers.

"Live Visitors" does appear as a name elsewhere `[DOCS]`:

- On the Integrations page, as a feature that requires an integration.
- On the Looker Studio page, as a dataset group with three datasets.

---

## 9. `/learn/docs/features/sites` - Sites

Structured extraction only.

### Headings in order `[DOCS]`

1. Brand vs site, and why both exist
2. Connecting a site
3. What Trakkr can do once a site is connected
4. How reverting works
5. Multiple sites under one brand
6. How Sites plumbs into the rest of Trakkr
7. Common questions

Key line `[DOCS]`: "A brand is the thing you track in AI. A site is the thing AI
is reading from."

### Connection methods `[DOCS]`

| Platform | Authentication | What it unlocks |
|---|---|---|
| WordPress | OAuth or application password | Read and write posts, pages, meta, media, robots.txt, llms.txt |
| Webflow | OAuth into the workspace, then site selection | Publish collections, update SEO fields, manage alt text mappings |
| Shopify | App Store installation | Publish pages and articles, update SEO title and description |
| GitHub | GitHub App install, then repo and branch selection | Pull requests for content, meta, schema and files |

### Supported fixes by platform `[DOCS]`

| Platform | Meta | Schema | Alt text | Robots.txt | Canonical | Social tags | Headings |
|---|---|---|---|---|---|---|---|
| WordPress | yes | yes | yes | yes | yes | yes | no |
| Webflow | yes | no | yes (mapped) | yes | yes | yes | no |
| Shopify | yes | no | no | no | no | no | no |
| GitHub | yes | yes | no | yes | yes | yes | yes |

### UI elements `[DOCS]`

- **Connected Sites** tab
- **Connect destination** button
- **Publishing** tab
- **Pending Fixes** tab
- **History** tab
- A **capabilities check**, run as a live verification round-trip

### WordPress requirements `[DOCS]`

- REST API must be enabled.
- Editor or Administrator role for publishing and fixes.
- Administrator (`manage_options`) for crawler tracking.
- Security plugins must allow `/wp-json/wp/v2/*` for authenticated requests and
  `/wp-json/trakkr/v1/*` for crawler tracking.

### Reverting `[DOCS]`

- Trakkr records the value before it writes. A revert restores the captured value.
- New content must be deleted instead. Deletion is supported on WordPress and
  Webflow only.
- GitHub fixes revert through a second pull request.
- History records the capture, the write and the restoration.

### Cardinality `[DOCS]`

One brand can hold several sites. One site belongs to exactly one brand.
Disconnecting a site leaves the applied fixes in place on the website.

### Ties to other features `[DOCS]`

Optimize turns audit findings into fix proposals. Content shows a Publish button
only for connected sites. Agent suggests and applies fixes, with confirmation.
Automations can trigger fixes and publishes through the site connection.

Limits, delays and refresh intervals: **NOT DOCUMENTED**.

---

## 10. `/learn/docs/features/optimize` - Optimize

Structured extraction only.

### Headings in order `[DOCS]`

1. AI optimization is not SEO
2. How a scan works
3. Reading Findings
4. Counts, missing data, and scan states
5. Render dependency
6. AI-specific files and controls
7. Four common mistakes
8. Common questions

### How a scan works `[DOCS]`

1. Crawl the site.
2. Check each fetched page.
3. Read the most important pages closely.
4. Compose Findings, Pages and History.

Recorded per page `[DOCS]`: status codes, redirects, indexing rules, titles,
descriptions, headings, structured data, image text, canonical links, response
time, and whether the text survives a non-JavaScript fetch.

Page crawl cap: the docs say there is a set limit but do not give the number.
**NOT DOCUMENTED**.

### Checks `[DOCS]`

Page-level checks, in severity order:

- Serve full content to non-JS bots
- Blocked crawler access
- Page-journey bottleneck
- Structured data coverage
- Meta descriptions
- Heading structure
- Image alt text
- Canonical links
- Indexing rules compliance

Site-level checks:

- `robots.txt` - AI user agent access
- `sitemap.xml` - URL discoverability
- `llms.txt` - presence and validity at the root
- `mcp.json` - presence of the machine interface descriptor

### Scores and stages `[DOCS]`

**Checks score**: "weighted 0 to 100 summary across technical health, content
structure, structured-data coverage, crawler access, and AI-specific site
signals". Median benchmark 82. 57% of brands score 80 or more.

Site journey stages: Available, Reached, Understood, Relevant, Selected, Visited.
**Relevant is always marked Estimated.**

### Tabs and table columns `[DOCS]`

Tabs: **Findings**, **Pages**, **History**.

All checks table columns:

- Work - the human instruction
- Evidence - the measured fact, with its base
- Wrong if - the reason to dismiss a false alarm
- Affected URLs
- Full explanation
- Paste-ready ticket
- Supported fix

Findings structure, in order: a verdict sentence; the "How AI uses your pages"
band with six stages and measured counts; the All checks table; the Site facts
line.

Site facts line fields: platform, crawler access, AI-specific files, render mode.

### Defaults and routing `[DOCS]`

- Default check slice: **"What to fix first"**.
- Secondary grouping: by severity.
- Legacy URLs: `?tab=issues` redirects to Findings. `?issue=` focuses the matching
  row.

### Honesty rules `[DOCS]`

1. Every row states its own base.
2. Unmeasured stages leave the table and collect in a footer.
3. Fewer than two measured stages shows a banner instead of a hollow table.

### FAQ topics `[DOCS]`

How this differs from an SEO audit; where the Issues tab went; what the Checks
score measures; why "How AI uses your pages" is missing; scanning competitor
sites; why a JavaScript framework is flagged; how often to scan; whether llms.txt
guarantees citations; whether clearing every check guarantees citations; what to
do when a finding is wrong.

Stated answers `[DOCS]`: "A page can rank in search while a non-rendering bot sees
an empty shell." Google can execute JavaScript, but many AI crawlers read the
first HTML response and stop. The Relevant stage is inferred from detected
questions and tracked prompts, not observed. Clearing every check does not
guarantee citations. To dismiss a finding, open the row and match the "Wrong if"
exception.

Scan frequency and scheduled-scan intervals: **NOT DOCUMENTED**.

---

## 11. `/learn/docs/features/integrations` - Integrations

Structured extraction only.

### Headings in order `[DOCS]`

1. Integrations
2. Data in, actions out
3. How to connect an integration
4. What integrations unlock
5. The directory
6. Inbound, bring data in
7. Outbound, push actions out
8. Security and permissions
9. Common questions

### Connection flow `[DOCS]`

1. Open Integrations from the sidebar to reach the hub at `/integrate`, or use the
   inline Connect button near a feature's empty state.
2. Pick the service. Most use OAuth.
3. Pick the destination. Slack asks for a channel. Sheets asks for a spreadsheet.
   Linear asks for a team.
4. Test it. Most cards have a **Test connection** button that sends a sample event.

### Inbound directory `[DOCS]`

| Integration | Purpose | Auth |
|---|---|---|
| Google Analytics 4 | Traffic and conversions attributed to ChatGPT, Perplexity, Gemini and Claude referrals | OAuth |
| Cloudflare | Server-side AI crawler hits via the Cloudflare Analytics API | API token |
| Vercel | Real-time crawler events via Log Drains. Vercel Pro or Enterprise | OAuth |
| Netlify | Real-time crawler events via an Edge Function | OAuth |
| WordPress | Crawler events from the Trakkr WordPress plugin, plus read access for fix publishing | OAuth |
| Webflow | Crawler tracking via Cloudflare proxy, plus the native Sites connection | OAuth |
| Shopify | Crawler tracking via Cloudflare proxy, plus a content adapter | OAuth |
| HubSpot, Squarespace, Wix, Framer, Ghost | Crawler tracking through Cloudflare | Cloudflare proxy |
| Next.js, Node/Express, Nginx, AWS CloudFront, Akamai, Fastly | Self-hosted webhooks that POST crawler hits from your own edge | Bearer token |

### Outbound directory `[DOCS]`

| Integration | Capability | Auth |
|---|---|---|
| Slack | Automation alerts, approval requests, action buttons, weekly digests | OAuth |
| Microsoft Teams | Automation alerts as Adaptive Cards | OAuth |
| Discord | Automation alerts to server channels | OAuth |
| Linear | Open an issue from a finding, action or workflow trigger | OAuth |
| Jira | The same, into a Jira project | OAuth |
| GitHub Issues | File a finding as an issue against a repo | OAuth |
| Asana | Turn an action into a task in a project | OAuth |
| Trello | Drop an action card on a board | OAuth |
| Notion | Create a page in a database | OAuth |
| Google Sheets | Append rows on a schedule, or on every workflow event | OAuth |
| Looker Studio | Live BI dashboards across 17 datasets. Scale plan | Personal API key |
| CSV Export | One-click downloads from any table, no setup | none |
| Webhooks | Send any event payload to any HTTPS endpoint | Bearer, Basic or API Key |
| Zapier, Make | Trakkr as a source or a sink | OAuth |
| REST API | Build it yourself. Scale plan | API key |
| MCP Server | Expose the brand to ChatGPT, Claude, Cursor, Codex or any MCP-aware assistant | Token |

### Security and permissions `[DOCS]`

- Connections are scoped per brand, not per workspace.
- The same provider can connect more than once per brand.
- Connected-site credentials use **AES-256-GCM** encryption.
- Automation integration responses return safe connection details, not tokens.
- Secret fields inside an exact rule are write-only after saving.
- Hosted MCP clients get short-lived connector tokens, not a raw API key.
- Trakkr stores redacted MCP activity logs: tool names, timing, status and safe
  input.
- Expired OAuth tokens show a yellow **Reconnect** state on the card. One click
  restores them.
- Every dispatch writes to the Actions audit log, with who triggered it, the
  payload sent and the destination response.

### UI elements `[DOCS]`

Integrations hub at `/integrate`; Connect button; Test connection button;
Reconnect state; View Logs action; Actions audit log; Settings -> Developer for
MCP revocation.

### FAQ `[DOCS]`

- No integration is required to use Trakkr.
- A missing tool can be reached through Webhooks, Zapier/Make or the REST API.
- CMSes route through Cloudflare because they expose no server-side request logs.
- One Slack install can serve several brands.
- Disconnecting keeps the data and only stops new dispatches.
- Each integration card has a View Logs action.
- Disconnecting breaks dependent Automations, Actions and scheduled exports. The
  panel shows what is wired up before you confirm.

Rate limits and refresh intervals on this page: **NOT DOCUMENTED**.

---

## 12. `/learn/docs/features/integrations/looker-studio` - Looker Studio

Structured extraction only.

### Headings in order `[DOCS]`

1. Requirements
2. Setup
3. Available datasets
4. Building effective dashboards
5. Managing your connection
6. Troubleshooting

### Requirements `[DOCS]`

- **Scale plan.**
- A personal Trakkr API key. Each team member needs their own.
- Brand access follows Trakkr permissions, not the key.
- Report viewers do not need Trakkr access.

### Setup steps, in order `[DOCS]`

1. Open the Looker Studio integration page and click **Generate API key**. Copy it
   at once. It is only fully visible once.
2. Click **Open in Looker Studio**.
3. Paste the API key when prompted. The connector validates it against the Trakkr
   API.
4. Select the brand, then select one of the 17 datasets.
5. Click **Create Report**.

Code snippet: **NOT DOCUMENTED**.

### The 17 datasets, with fields `[DOCS]`

**Visibility**

| Dataset | Description | Fields |
|---|---|---|
| Visibility over time | Daily visibility and presence scores for your brand | date, visibility score, presence score, average rank, mentions, models mentioned |
| Visibility by AI model | Scores per model | model name, visibility score, presence score, trend direction |
| Visibility by prompt | Scores per tracked query | prompt ID, prompt text, visibility score, presence score, average rank |

**Citations**

| Dataset | Description | Fields |
|---|---|---|
| Citation list | Every citation URL with metadata, up to 5,000 rows | URL, domain, page title, source type, search model, mentions brand, sentiment, appearance count, first seen, last seen, competitors |
| Citation analytics | Top cited domains and share percentages | domain, times cited, unique pages, citation share percentage, source type |
| Citations by AI model | Citation counts per model | model, total citations, brand mentions, unique sources |

**Competition**

| Dataset | Description | Fields |
|---|---|---|
| Competitive rankings | Competitor leaderboard with visibility scores | rank, competitor name, visibility score, visibility change, is your brand, head-to-head win rate |
| Competitor heatmap | Brand-by-model visibility grid | brand name, model, visibility score, average rank, mentions, is your brand |

**Perception and Prompts**

| Dataset | Description | Fields |
|---|---|---|
| Perception metrics | 20+ perception dimension scores over time | date, overall score, trust, reliability, transparency, safety, quality, innovation, value, customer service, sustainability, expertise, accuracy, comprehensiveness, timeliness, objectivity, technical depth, accessibility, thought leadership, data support, uniqueness |
| Model performance | AI model efficiency comparisons | model, total queries, mentions, visibility rate, average position, top-3 rate |
| Prompts | Tracked queries and metadata | prompt ID, text, active status, focus area, intent, created date |

**AI Crawlers**

| Dataset | Description | Fields |
|---|---|---|
| Crawler visits over time | Daily total bot visits, up to 90 days | date, total visits |
| Crawler visits by bot | Per-bot breakdown | bot name, visits, share percentage |
| Crawler top pages | Most-crawled URLs | URL, visits, unique bot count, comma-separated bot list |

**Live Visitors**

| Dataset | Description | Fields |
|---|---|---|
| Live visitors over time | Daily AI-source sessions | date, AI sessions |
| Live visitors by AI source | Sessions per referrer | source (chatgpt.com, claude.ai, and so on), sessions, share percentage |
| Live visitors top landing pages | Top landing pages from AI traffic | page path, sessions, engagement rate |

### Limits `[DOCS]`

- Citation list: paginated, up to **5,000 rows**.
- Crawler visits: date range up to **90 days**.
- Time-scoped datasets: a **7 to 365 day** range control.
- Rate limit: **60 requests per minute**.
- The Looker Studio native date picker controls the window.

### Dependencies `[DOCS]`

Crawler datasets need crawler tracking connected. Live Visitors datasets need the
GA4 connection.

### Troubleshooting `[DOCS]`

One FAQ is recorded: "Is the Looker Studio connector still supported? It just
loads forever when I click it." The stated answer text was not captured.
**NOT DOCUMENTED** in this capture.

---

# Connected-state UI, reconstructed

Everything in this part is `[DOCS]`. Nothing here was observed. The docs contain
no screenshots, so no layout, colour, spacing or control placement can be stated.
Layout for every screen below: **NOT DOCUMENTED**.

## `/traffic/analytics` - Visitors, connected

`[DOCS]` The screen carries a date range, a source filter, and one shared AI
taxonomy. Two tabs sit on top of that shared state.

**Traffic tab** `[DOCS]`, the default view:

- Hero stats: total AI visits; change against the previous period; share of
  overall traffic.
- A stacked chart of sources, with a source filter. Sources named: ChatGPT,
  Perplexity, Claude, Gemini, Copilot, "and the rest". Clicking a source isolates
  it.
- Top pages, ranked by AI sessions, with a source breakdown for each page.
- A **Geo panel**, showing where visitors come from globally.
- A **Devices and sources** breakdown.
- A **Refresh** button, which requests a fresh report.

**Conversions tab** `[DOCS]`:

- Hero stats: total AI-driven conversions; conversion rate; AI-attributed revenue.
- A multi-step funnel, built from the customer's own GA4 events, with conversion
  percentages at each step, broken out by AI source.
- **Sources by revenue**.

Exact column headers of the Top pages table and the Sources by revenue table:
**NOT DOCUMENTED**.

Empty-state and error-state copy: **NOT DOCUMENTED**.

Data behaviour `[DOCS]`: reports cache for up to four hours. Direct sessions are
never relabelled as AI. The AI total is a lower bound.

## `/traffic/crawler` - Crawlers, connected

`[DOCS]` Header carries a **Send verification** (also called **Send test ping**)
control.

Four hero stats, each with a trend against the previous period `[DOCS]`:

1. Total Visits
2. Conversations
3. Indexing
4. Training

One activity chart `[DOCS]`: a stacked bar chart of visits over time, with a view
toggle of **Platform | Intent | Status**.

Four tabs `[DOCS]`:

| Tab | Contents per the docs |
|---|---|
| Pages | URLs visited, with totals, unique bots and last seen |
| Live | A real-time stream of crawler events. Verified test rows appear here |
| Actions | Prioritised recommendations |
| Access | robots.txt and llms.txt analysis, plus per-page accessibility |

Bot classification shown in the UI `[DOCS]`: Training, Indexing, Conversations,
and Agent. The full bot roster is in section 3 above.

Retention behind the view `[DOCS]`: 90 days of detailed visit history; daily
aggregates kept indefinitely.

Sort order, pagination, row counts and filter controls: **NOT DOCUMENTED**.

## `/traffic/search-console` - Search Console

**NOT DOCUMENTED.** No documentation page for a Search Console connector was found
at any of the URLs read. Google Search Console does not appear in the Integrations
directory. The docs name only GA4 as the analytics inbound integration. Do not
reconstruct this screen from the docs.

## `/ai-pages` - AI Pages, connected

`[DOCS]` Three tabs.

**Overview tab** `[DOCS]`:

- Live crawler activity
- Requests over time, a chart
- Crawler breakdown by company
- Response time, a chart
- Top pages
- Recent crawl log, with a **Status** field whose values are **Cache Served**,
  **Cache Created** and **Error**, plus a **Response time** field

**Pages tab** `[DOCS]`:

- One row per URL, showing optimisation status and cache status
- Sortable by visits and by last-crawled time

**Usage tab** `[DOCS]`:

- Monthly request count against the plan limit
- Overage settings
- Spending cap
- Billing detail

**Settings** `[DOCS]`:

- A **Test connection** control that takes a URL and probes it as GPTBot
- Independent on/off toggles for each of the five optimizations
- A path exclusion list, for example `/admin/*` and `/checkout/*`
- An API key, regenerable

**Setup wizard** `[DOCS]`: generates a platform-specific snippet with the API key
already inserted, for the nine integration paths.

Cache TTL 7 days. Manual invalidation is "coming soon". Included requests: 2,500
per month on Growth, 10,000 on Growth plus Prism, 10,000 on Scale. Overage $5 per
1,000 requests.

Exact column headers on the Pages tab and the Recent crawl log:
**NOT DOCUMENTED**.

## `/sites` - Sites, connected

`[DOCS]` Tabs: **Connected Sites**, **Publishing**, **Pending Fixes**, **History**.
A **Connect destination** button starts a new connection.

Each connected site shows a **capabilities check** result `[DOCS]`. The check runs
a live verification round-trip and decides which fixes the platform supports. The
support matrix is in section 9.

**History** records, per change `[DOCS]`: the captured value before the write, the
write itself, and any restoration.

**Pending Fixes** holds proposals from Optimize and from Agent, which are applied
after confirmation `[DOCS]`.

Column headers, row counts, status labels and empty-state copy:
**NOT DOCUMENTED**.

---

## Gaps to close by observation, not by guessing

1. All column headers in every table listed above.
2. Every empty state, loading state and error state.
3. Any layout, chart type detail, colour or icon.
4. `/traffic/search-console` in full. The docs never mention it.
5. Date-range presets and default range on any screen.
6. Optimize scan page cap and scheduled scan frequency.
7. Sites row schema and status vocabulary.
