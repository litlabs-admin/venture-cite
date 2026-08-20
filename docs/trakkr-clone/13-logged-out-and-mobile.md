# 13 - Logged-out marketing site and mobile experience

Capture date: 2026-08-10. Target: `https://trakkr.ai`.

This file closes two gaps in the replication spec:

1. The logged-out marketing site.
2. The mobile and tablet experience.

## 1. Method and safety

The user session stayed live. No logout, no cookie change, no storage change.

Two capture methods were used:

- **Logged-out HTML**: `curl` from the shell, with no cookies. A first test used
  `fetch(url, {credentials:'omit'})` in the browser. Both returned the same bytes.
- **Behaviour and CSS**: the shipped production bundles were downloaded and read.
  Files: `/assets/index-FXwgnpwI.css`, `/assets/index-Dguo47UF.js`,
  `/assets/TrakkrNav-D_nZI4o8.js`, `/assets/nav-data-BFYMJzoH.js`,
  `/assets/Pricing-DX1Iwt2j.js`, `/assets/Landing-CSzPysGj.js`.

The bundle is the source of truth. It gives exact class names, exact copy and
exact breakpoints.

### NOT OBSERVED: live mobile screenshots

`resize_window` and `javascript_tool` failed repeatedly with
"the Browser pane is currently hidden". Other agents share the same browser
window and kept taking focus. A window resize would also change the viewport for
those agents. Live screenshots at 375px, 768px and 1280px are therefore
`NOT OBSERVED`.

Tried: `tabs_create`, `tabs_select`, `computer{screenshot}`, `resize_window`
(preset and explicit width/height), `javascript_tool`. All timed out except a
few early `javascript_tool` calls.

Everything reported below comes from the shipped code, which is deterministic.
The window was not resized, so no restore was needed.

## 2. The site IS prerendered

**Verdict: prerendered, not an empty SPA shell.**

`GET https://trakkr.ai/pricing` with no cookies returns 184,068 bytes. The
`<div id="root">` element already contains the full rendered page: the `<nav>`,
the plan cards, the prices, the FAQ and the footer.

Evidence, first bytes inside `#root` on `/pricing`:

```html
<div id="root"><div class="min-h-screen bg-surface relative">
<nav class="h-[52px] sm:h-[56px] flex items-center bg-surface/95 backdrop-blur-sm sticky top-0 z-50 border-b border-default px-4 lg:px-0">
```

So every logged-out marketing page can be captured with a plain HTTP request.

Important consequence: **the prerendered HTML is identical for logged-in and
logged-out users.** The server does not know the session. The Supabase JWT lives
in the browser only. The logged-in header and the "Current plan" label appear
after hydration, on the client. See section 5.

## 3. Page-by-page logged-out capture

Status codes are from the logged-out request.

| Requested path | Status | Note |
|---|---|---|
| `/` | 200 | |
| `/pricing` | 200 | |
| `/features` | 200 | |
| `/guide` | 200 | |
| `/demo` | 200 | |
| `/about` | 200 | |
| `/enterprise` | 301 | to `/trakkr-for/enterprise` |
| `/trakkr-for/agencies` | 200 | |
| `/trakkr-for/startups` | 200 | |
| `/blog` | 200 | |
| `/reviews` | 200 | |
| `/compare` | 200 | |
| `/alternatives` | 200 | |
| `/free-tools` | 200 | |
| `/rankings` | 301 | to `https://trakkr.ai/data/rankings` |
| `/answers` | 200 | |
| `/status` | 200 | |
| `/open-source` | 200 | |
| `/ai-insights` | 200 | serves the home shell, see below |
| `/guides` | 200 | |
| `/article/:slug` | 200 | **route does not exist**, see below |

`/article/:slug` and `/ai-insights` both return the home page shell: title
"Trakkr | AI Visibility Platform for Brands & Agencies", canonical
`https://trakkr.ai/`, no `<h1>`. The real article route is `/blog/:slug`. A
sample was captured: `/blog/why-ai-picks-winners`.

Every page carries the same OG and Twitter block shape:

- `og:image` = `https://trakkr.ai/og-image.png`
- `og:type` = `website` (articles keep `website` too)
- `og:site_name` = `Trakkr`
- `twitter:card` = `summary_large_image`
- `og:title` and `og:description` mirror `<title>` and the meta description.
- `og:url` mirrors the canonical.

Only the home page has a different `twitter:title`:
"Trakkr: Change your AI visibility".

### 3.1 Per page: title, description, canonical, H1, JSON-LD

Every page emits one `<script type="application/ld+json">` that holds an
`@graph`. The types below are the members of that graph.

**`/`**
- Title: `Trakkr | AI Visibility Platform for Brands & Agencies`
- Desc: `AI is rewriting discovery. Trakkr tells you what to do about it. Track citations, perception, competitors, and actions across ChatGPT, Claude, Gemini, and more.`
- Canonical: `https://trakkr.ai/`
- H1: `Don't just track your AI visibility, change it.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `["Product","SoftwareApplication"]`, `FAQPage`, `ResearchProject`, `ItemList`

**`/pricing`**
- Title: `Pricing - 14-Day Free Trial | Trakkr`
- Desc: `AI visibility tracking from $100/mo with a 14-day free trial. Track your brand across ChatGPT, Claude, Gemini, Perplexity, and 4 more AI models.`
- Canonical: `https://trakkr.ai/pricing`
- H1: `One price. Every AI model.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `["Product","SoftwareApplication"]`, `FAQPage`, `BreadcrumbList`

**`/features`**
- Title: `AI Brand Monitoring Features – Citations, Perception, Competitors & More | Trakkr`
- Canonical: `https://trakkr.ai/features`
- H1: `The complete AI visibility toolkit.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `["Product","SoftwareApplication"]`, `BreadcrumbList`

**`/guide`**
- Title: `How AI Search Actually Works, Interactive Guide | Trakkr`
- Canonical: `https://trakkr.ai/guide`
- H1: `Something changed: 60% of informational queries now get AI-generated answers`
- JSON-LD: `Organization`, `WebSite`, `WebPage`
- This page has no `TrakkrNav` header and no footer. It is a standalone
  interactive guide. Zero `<button>` elements in the prerender.

**`/demo`**
- Title: `Start free or book a demo - Trakkr`
- Canonical: `https://trakkr.ai/demo`
- H1: `See how AI search sees your brand.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`
- Segment picker: `One brand`, `Agency`, `Enterprise`, `Exploring`, then `Continue`.

**`/about`**
- Title: `About | Trakkr`
- Canonical: `https://trakkr.ai/about`
- H1: `AI is changing how people discover.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`

**`/trakkr-for/enterprise`** (target of `/enterprise`)
- Title: `Trakkr for Enterprise — Built around you`
- Canonical: `https://trakkr.ai/trakkr-for/enterprise`
- H1: `Built around you.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`

**`/trakkr-for/agencies`**
- Title: `Trakkr for Agencies | White-Label AI Visibility Platform`
- Canonical: `https://trakkr.ai/trakkr-for/agencies`
- H1: `Launch your own AI visibility platform.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`
- CTA: `Start free`. Billing toggle: `Monthly` / `Annual -17%`.

**`/trakkr-for/startups`**
- Title: `Trakkr for Startups | Beat the Giants in AI Search`
- Canonical: `https://trakkr.ai/trakkr-for/startups`
- H1: `The unfair advantage.`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`
- CTAs: `Check visibility`, `Get started free`.

**`/blog`**
- Title: `Blog | Trakkr`
- Canonical: `https://trakkr.ai/blog`
- H1: `Thinking about AI visibility`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `Blog`, `BreadcrumbList`
- Filter chips: `All 6`, `Research 6`, `Strategy 1`.

**`/blog/why-ai-picks-winners`** (sample article)
- Title: `Why AI Picks Winners: The Research Behind LLM Brand Bias | Trakkr Blog`
- Canonical: `https://trakkr.ai/blog/why-ai-picks-winners`
- H1: `Why AI Picks Winners: The Research Behind LLM Brand Bias`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `Article`, `BreadcrumbList`
- In-page anchors: `The research landscape`, `Three kinds of bias`,
  `Why this is measurable`, `What this series covers`.

**`/reviews`**
- Title: `AI Visibility Tool Reviews | Trakkr`
- Canonical: `https://trakkr.ai/reviews`
- H1: `Honest reviews of AI visibility tools`
- JSON-LD: `Organization`, `WebSite`, `CollectionPage`, `BreadcrumbList`, `ItemList`
- Filters: `All 17`, `AI visibility 7`, `SEO suites 6`, `Hybrid 4`.

**`/compare`**
- Title: `Tool Comparisons | Trakkr`
- Canonical: `https://trakkr.ai/compare`
- H1: `Tool comparisons`
- JSON-LD: `Organization`, `WebSite`, `CollectionPage`, `BreadcrumbList`, `ItemList`
- Filters: `All 676`, `Trakkr vs... 39`, `Tool vs Tool 637`, plus
  `Load more (656 remaining)`.

**`/alternatives`**
- Title: `Software Alternatives | Trakkr`
- Canonical: `https://trakkr.ai/alternatives`
- H1: `Tool alternatives`
- JSON-LD: `Organization`, `WebSite`, `CollectionPage`, `BreadcrumbList`, `ItemList`
- Category chips: `All`, `AI Visibility`, `Competitive Intelligence`,
  `Content Generation`, `Content & GEO`, `Content SEO`, `Enterprise SEO`,
  `Free Tools`, `Platform-Specific`, `SEO`, `SEO + AI Hybrid`,
  `SEO Automation`, `Social Listening`, plus `Load more (23 remaining)`.

**`/free-tools`**
- Title: `Free AI Visibility Tools | Trakkr`
- Canonical: `https://trakkr.ai/free-tools`
- H1: `Free AI visibility tools.`
- JSON-LD: `Organization`, `WebSite`, `CollectionPage`, `FAQPage`,
  `BreadcrumbList`, `ItemList`
- CTA: `Run audit`.

**`/data/rankings`** (target of `/rankings`)
- Title: `AI Rankings - The Brands AI Recommends Most | Trakkr Data`
- Canonical: `https://trakkr.ai/data/rankings`
- H1: `Rankings`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `FAQPage`, `BreadcrumbList`, `Dataset`
- This page uses a different shell. It has no `TrakkrNav`. Its own controls are
  `Search datasets ⌘K`, `All sectors`, `Check my brand`.

**`/answers`**
- Title: `Answers: real questions about AI visibility | Trakkr`
- Canonical: `https://trakkr.ai/answers`
- H1: `Answers`
- JSON-LD: `Organization`, `WebSite`, eight `Thing` nodes, `CollectionPage`,
  `ItemList`, `BreadcrumbList`
- No `TrakkrNav`, no buttons in the prerender.

**`/status`**
- Title: `System Status | Trakkr`
- Canonical: `https://trakkr.ai/status`
- H1: `Checking system status.` (the prerender shows the loading state)
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`

**`/open-source`**
- Title: `Trakkr Console: our own AI search analytics, open source`
- Desc: `Trakkr`
- Canonical: `https://trakkr.ai/open-source`
- H1: `Overview`
- JSON-LD: `Organization`, `WebSite`, `WebPage`
- No `TrakkrNav`.

**`/guides`**
- Title: `AI Visibility & Brand Monitoring Guides - ChatGPT, Claude, Gemini | Trakkr`
- Canonical: `https://trakkr.ai/guides`
- H1: `AI Visibility Guides`
- JSON-LD: `Organization`, `WebSite`, `WebPage`, `BreadcrumbList`, plus a second
  standalone `CollectionPage` block
- Category chips: `All 59`, `Procurement toolkit 9`, `Monitoring 18`,
  `Analysis 14`, `Buyer guide 12`, `Strategy 12`, `Industry 3`.
- Model chips: `All models`, `AI Overviews`, `ChatGPT`, `Claude`, `Copilot`,
  `DeepSeek`, `Gemini`, `Google AI Mode`, `Grok`, `Llama`, `Perplexity`.

## 4. The logged-out header

Component: `TrakkrNav` in `/assets/TrakkrNav-D_nZI4o8.js`.

Bar element:

```html
<nav class="h-[52px] sm:h-[56px] flex items-center bg-surface/95 backdrop-blur-sm
            sticky top-0 z-50 border-b border-default px-4 lg:px-0">
```

Inner container: `max-width: 1120px`, centred.

Left: the logo, 26x26, `/logo-mint.png`, link to `/`, `aria-label="Trakkr home"`.

Centre (`hidden lg:flex`, absolutely centred): two dropdown buttons and two
plain links.

- Button `Product`, `aria-controls="trakkr-product-menu"`
- Button `Resources`, `aria-controls="trakkr-resources-menu"`
- Link `Pricing` -> `/pricing`
- Link `Demo` -> `/demo`

Nav link class: `h-9 px-4 text-[13px] font-medium text-secondary hover:text-primary hover:bg-muted transition-all duration-250 rounded inline-flex items-center`.

### 4.1 Product menu contents

| Label | Href | Description |
|---|---|---|
| Citations | `/features#citations` | See what AI reads about you |
| Perception | `/features#perception` | How AI understands your brand |
| Competitors | `/features#competitors` | Track and outpace rivals |
| Automations | `/features#automations` | Automate your AI visibility |
| Agent | `/features#agent` | Your AI strategy assistant |

Solutions column: `Startups` -> `/trakkr-for/startups`,
`Agencies` -> `/trakkr-for/agencies`, `Enterprise` -> `/trakkr-for/enterprise`.

Tools column: `AI Site Grader` -> `/free-tools/ai-site-grader`,
`llms.txt Generator` -> `/free-tools/llms-txt-generator`,
`Visibility Leaderboard` -> `/data/rankings` (external),
`AI Traffic Index` -> `/ai-search-traffic`.

### 4.2 Resources menu contents

Panel width `w-[560px]`, grid `grid-cols-[220px_1fr]`. The first item takes the
left promo cell.

| Label | Href | Description |
|---|---|---|
| Documentation | `/learn/docs` | Platform guides, tutorials, and quickstarts |
| Data | `/data` | Live AI visibility benchmarks |
| API Reference | `/learn/api` | Build custom integrations |
| MCP Server | `/mcp` | Connect Trakkr to Claude, ChatGPT & Cursor |
| Research | `/trakkr-research` | Original AI visibility research |

Footer row of the panel: `About` -> `/about`, `Security` -> `/security`,
`Status` -> `https://trakkr.ai/status`, `Roadmap` -> `/roadmap`.

The menus open on hover and on focus. They close after a 150 ms timeout on
mouse leave, or on `Escape`. Item reveal uses a staggered transition:
`transitionDelay: 80 + index*30` ms, `transitionDuration: 300ms`,
`cubic-bezier(0.16, 1, 0.3, 1)`.

### 4.3 The exact logged-out vs logged-in difference

This is the key delta versus `08-marketing-site.md`.

Source, `TrakkrNav-D_nZI4o8.js`, desktop right cluster:

```js
r ? <Link to="/dashboard" ...>Dashboard</Link>
  : <><Link to="/login" ...>Sign in</Link>
      <Link to="/start" ...>Get started</Link></>
```

`r` is `user` from the auth context.

| State | Right side of the header |
|---|---|
| Logged in | one button, `Dashboard` -> `/dashboard` |
| **Logged out** | `Sign in` -> `/login`, then `Get started` -> `/start` |

Logged-out classes:

- `Sign in`: `h-9 px-4 text-[13px] font-medium text-secondary hover:text-primary transition-colors duration-150 rounded inline-flex items-center`
- `Get started`: `h-9 px-4 bg-accent-subtle text-accent text-[13px] font-medium rounded hover:bg-accent hover:text-white transition-all duration-150 inline-flex items-center`

The `Dashboard` button reuses the `Get started` class exactly.

## 5. The logged-out pricing page

### 5.1 CTA labels

Source, `Pricing-DX1Iwt2j.js`:

```js
const G = m && I.plan === t.name;          // m = user, I = entitlements
if (m) {
  if (G)      { u = "Current plan";        g = "/settings?tab=billing"; }
  else if (b) { u = "Start free trial";    g = startUrl(plan); }
  else        { u = `Upgrade to ${t.name}`; g = startUrl(plan); }
} else {
  u = t.cta;
  const x = r ? "annual" : "monthly";
  g = v ? `/start?plan=growth&cycle=${x}&trial=true`
        : `/start?plan=growth&target_plan=scale&cycle=${x}`;
}
```

So the four possible labels are:

| State | Label | Href |
|---|---|---|
| Logged in, on this plan | `Current plan` | `/settings?tab=billing` |
| Logged in, trial offer live, Growth card | `Start free trial` | `/start?plan=growth` |
| Logged in, other plan | `Upgrade to <Plan>` | `/start?plan=<plan>` |
| **Logged out, Growth** | **`Start free trial`** | `/start?plan=growth&cycle=monthly&trial=true` |
| **Logged out, Scale** | **`Start with Growth`** | `/start?plan=growth&target_plan=scale&cycle=monthly` |
| **Logged out, Enterprise** | **`Talk to sales`** | `/demo` |

The `cycle` value flips to `annual` when the annual toggle is on.

Under the Scale card, logged out, the helper line reads:
`Free trial starts on Growth. Upgrade anytime.`

### 5.2 Logged-out pricing content

Sub-head: `Track ChatGPT, Perplexity, Gemini, Claude, Grok and more from one
workspace. No add-ons, no per-model fees, every model included.`

Trust line: `14-day free trial · All AI models included · Cancel anytime`.

Audience toggle: `Brand` / `Agency`. Currency toggle: `USD` / `GBP` / `EUR`.
Billing toggle: `Monthly` / `Annual −17%`.

Prices in the captured response were shown in GBP, and the page printed
`Shown in GBP · billed in USD`. The currency default is geo-derived, so a US
request will show USD. The meta description quotes `$100/mo`.

| Plan | Price | Sub-line | Key rows |
|---|---|---|---|
| Growth (`Popular`) | £79/mo | or £790/yr billed annually | 1 brand daily, 50 prompts per brand, all 8 models, 25 articles/mo, 3 seats, Citations & Perception, Site optimization, Exports & Sharing, MCP access, Executive reports |
| Scale | £395/mo | or £3,950/yr billed annually | 10 brands daily, 50 prompts per brand, all 8 models, 100 articles/mo, everything in Growth, unlimited seats, white-label add-on, REST API access |
| Enterprise | From £790/mo | Billed annually | unlimited brands and prompts, SSO and security review, custom contracts, dedicated success manager, volume discounts, priority SLA, custom integrations, onboarding and training |

Section markers: `[01] Plans / Three plans, every model included`,
`[02] Configure / Build your plan`, `[03] Compare / Full feature breakdown`,
`[04] Alternatives / How Trakkr compares`.

Configurator add-on steps: prompts `Base / +50 / +100 / +200`,
article credits `Base / +25 / +50 / +100`, extra markets, white-label brands.

FAQ questions, logged out: `How does the free trial work?`,
`What counts as a data point?`, `What happens when I hit my limits?`,
`Can I change plans anytime?`, `Which AI models do you track?`,
`How does annual billing work?`,
`What's the main difference between Growth and Scale?`,
`Why choose Trakkr over Profound, Athena, or Peec?`,
`What is white-labelling and how does it work?`,
`Do prices change if I'm not in the US?`

## 6. The footer

The footer ships in two variants. The compact one is `sm:hidden`. The full one
is `hidden sm:grid`.

### 6.1 Compact footer, below 640px

Wrapper: `<div class="sm:hidden py-6">`, then
`grid grid-cols-4 gap-4 mb-5 pb-5 border-b border-default`.

| Column | Items |
|---|---|
| Product | Features, Pricing, Integrations, Free Tools |
| Solutions | For Agencies, For Enterprise, For Startups |
| Learn | Blog, Documentation, API Reference |
| Company | About, Book Demo, Security |

Then a full-width CTA `Get started →` -> `/start`, with the caption
`14-day free trial · Cancel anytime`.

### 6.2 Full footer, 640px and up

Wrapper: `hidden sm:grid grid-cols-3 lg:grid-cols-[180px_1fr_1fr_1fr_1fr_160px]
gap-6 lg:gap-0 py-10 lg:py-0`.

So it is 3 columns from `sm` to `lg`, then a 6-track row at `lg` and up. The
brand cell is `col-span-3 lg:col-span-1`.

| Column | Items and hrefs |
|---|---|
| (brand) | Tagline: `Be the brand AI recommends. Track and improve your visibility across every major AI platform.` |
| Product | Features `/features`, Pricing `/pricing`, Integrations `/integrations`, Data `/data`, Live Workspace `/open-source`, Roadmap `/roadmap`, Free Tools `/free-tools` |
| Solutions | For Agencies `/trakkr-for/agencies`, For Enterprise `/trakkr-for/enterprise`, For Startups `/trakkr-for/startups` |
| Learn | Blog `/blog`, Documentation `/learn/docs`, API Reference `/learn/api`, Research `/trakkr-research`, AI Political Bias `/bias`, Resources `/resources`, Guides `/guides` |
| Company | About `/about`, Book Demo `/demo`, Security `/security`, Privacy `/privacy`, Terms `/terms`, Status `/status` |
| (CTA) | `Get started →` -> `/start`, caption `14-day free trial · Cancel anytime` |

Bottom bar: `py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between
gap-2 sm:gap-3`. It stacks below `sm` and goes to a row at `sm`.

Bottom bar content: `© 2026 Trakkr. All rights reserved.`, a live status pill
(prerender shows `Status unavailable`, link `/status`), `Made in London`, and a
language picker.

Language picker options and hrefs: English `/`, Français `/fr`, Deutsch `/de`,
Español `/es`, Português (Brasil) `/pt-br`, Português (Portugal) `/pt-pt`,
Nederlands `/nl`, Svenska `/sv`, Dansk `/da`, Norsk `/no`, Suomi `/fi`.

A second, plain SEO footer sits below on the home page:
`© 2024-2026 Trakkr. AI Brand Visibility Tracking.` with links Pricing,
Features, Guides, Research, Blog, Documentation, API, About, Privacy, Terms.

## 7. The app mobile gate

### 7.1 The exact breakpoint

The gate is not a Tailwind class. It is a `matchMedia` hook.

```js
const qA = "(max-width: 767px)";
```

So the gate is active at **767px and below**. It clears at **768px**. This
matches the reported "about 768px". The Tailwind `md` breakpoint is `48rem`
(768px), so the gate covers everything below `md`.

The gate mounts around the whole router tree, so it also covers marketing
routes. See section 7.5.

### 7.2 Gate copy and markup

Container:

```html
<div role="dialog" aria-modal="true" tabindex="-1"
     class="print:hidden fixed inset-0 z-[9999] flex flex-col items-center
            justify-center overflow-y-auto bg-surface p-6">
```

- Logo, top left: `<img src="/logo-mint.png" class="h-6 w-6 rounded">` inside
  `absolute left-6 top-6`.
- Content column: `flex w-full max-w-sm flex-col items-center py-10 text-center`.
- Icon tile: `mb-6 flex h-14 w-14 items-center justify-center rounded border
  border-default bg-surface`, with a 24px lucide icon at `strokeWidth 1.5`,
  colour `text-tertiary`.
- H1: **`Built for bigger screens`**, class `text-dialog font-semibold text-primary`.
- Paragraph: **`Open Trakkr on a laptop or desktop to use the full workspace.`**,
  class `mb-8 mt-2 text-body text-secondary`.
- Divider: `mb-6 w-full border-t border-subtle`.
- Caption: **`Send yourself a desktop sign-in link`**, class
  `mb-4 text-caption text-tertiary`.

### 7.3 The escape path is a magic link, not a link out

There is no "continue anyway" link. The only escape offered to a user is a
magic-link email.

- If a user is already signed in, the form shows the stored email as plain text.
- If not, it shows a label `Email address`, an input with placeholder
  `you@example.com`, `autoComplete="email"`, class `input w-full`
  (plus `input-error` on failure).
- Submit button: `btn btn-primary btn-lg w-full justify-center gap-2`, label
  **`Send magic link`**, with a spinner while sending. It is disabled while the
  email is empty.

Success state: `Link sent to <email>` with a check icon, plus a text button
`Use a different email`.

Error strings, exact:

- `Enter a valid email address.`
- `Too many attempts. Wait a few minutes, then retry.`
- `We can't send a link to this address. Try another email.`
- `Couldn't send the link. Check the address and retry.`
- `Couldn't send the link. Check your connection and retry.`

### 7.4 Behaviour

- The page behind gets `aria-hidden` and `inert`.
- `document.body.style.overflow = "hidden"` and
  `overscrollBehavior = "none"` while the gate is open. Both are restored on
  unmount.
- Focus moves to the first focusable element inside the dialog.
- `Tab` is trapped inside the dialog, both directions.
- Focus returns to the previously focused element on close.

### 7.5 Routes that are exempt from the gate

```js
function isExempt(pathname, search) {
  const view = new URLSearchParams(search).get("view");
  if (pathname === "/results/quarter" || pathname === "/client/actions") return true;
  if (pathname === "/actions")        return view === "results" || view === "proof" || view === "measuring";
  if (pathname === "/agency/actions") return view === "results" || view === "proof";
  return false;
}
```

These are the client-facing report views. They are designed to open on a phone.

### 7.6 The developer bypass

- Session key: `trakkr_devBypass` in `sessionStorage`, value `"true"`.
- Query param: `?devBypass=true` sets the key and enables the bypass.
- Keyboard: `Cmd/Ctrl + Shift + M` toggles it. It logs `[DevBypass] Mobile gate
  bypass ENABLED` or `DISABLED`.
- The login URL builder can add the param: `/login?devBypass=true`.

Do not use the bypass in a shared session. It writes to `sessionStorage`.

## 8. The tablet app layout, 768px to 1023px

Component gate:

```js
const dN = "(max-width: 1023px)";
```

So the tablet shell is active from **768px** (above the mobile gate) to
**1023px**. At **1024px** and up the fixed sidebar returns.

### 8.1 The sticky header

```html
<header class="sticky top-0 z-40 flex h-14 items-center gap-2
               border-b border-default bg-white px-2 print:hidden">
```

`h-14` is 56px. This confirms the reported 56px sticky header.

It holds exactly three things, left to right:

1. A menu button. Class
   `inline-flex size-11 flex-shrink-0 items-center justify-center rounded
   text-secondary transition-colors hover:bg-muted/50 hover:text-primary
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30`.
   `aria-label="Open navigation"`, `aria-controls="tablet-app-navigation"`,
   `aria-expanded` bound to the drawer state. Icon 20px, `strokeWidth 1.5`.
2. The brand block: `flex min-w-0 flex-1 items-center gap-2.5 px-1`, with the
   brand avatar and then the brand name in
   `truncate text-[13px] font-semibold text-primary`.
3. A settings button, same 44px square shape, `aria-label="Open Settings"`,
   icon 18px, `strokeWidth 1.5`. It closes the drawer and opens settings.

Both buttons are `size-11`, that is 44px. That meets the touch target minimum.

### 8.2 The 280px drawer

The drawer reuses the shared overlay component:

```js
placement: "left", modal: true, closeOnBackdrop: true, closeOnEscape: true,
role: "dialog", ariaLabel: "Application navigation", returnFocusRef: menuButton,
panelClassName: "fixed inset-y-0 left-0 flex w-[280px] max-w-[calc(100vw-48px)]
                 flex-col overflow-hidden border-r border-default bg-white
                 shadow-[var(--shadow-overlay)]"
```

- Width 280px, capped at `100vw - 48px` on narrow screens.
- Full height, left edge, right border, overlay shadow token.
- The inner scroll container is `<div id="tablet-app-navigation"
  class="min-h-0 flex-1">`. It renders the same sidebar tree as desktop.
- The drawer closes on backdrop click, on `Escape`, and on every route change
  (`useEffect` on `routeKey`).
- It also closes when the viewport grows past 1023px.
- Focus returns to the menu button.

### 8.3 How the sidebar collapses

The desktop sidebar is a fixed `<aside data-sidebar data-sidebar-mode="fixed">`.

```js
const Ae = collapsed ? "w-[60px]" : "w-[200px]";
// aside: fixed inset-y-0 left-0 ${Ae} z-30 bg-white border-r border-default
//        flex flex-col transition-all duration-300 ease-out print:hidden
const re = collapsed ? "lg:pl-[60px]" : "lg:pl-[200px]";
```

So there are three states, not two:

| Width | Sidebar |
|---|---|
| 0 - 767px | replaced by the "Built for bigger screens" gate |
| 768 - 1023px | 56px sticky header, sidebar moves into a 280px modal drawer |
| 1024px and up | fixed sidebar, 200px expanded or 60px collapsed; main content gets `lg:pl-[200px]` or `lg:pl-[60px]` |

Inside the drawer the sidebar switches to
`data-sidebar-mode="embedded"` with `relative h-full w-full`, and it forces
`[&_button]:min-h-11 [&_a]:min-h-11`, that is 44px touch targets.

The sidebar's own brand selector header is `h-[56px] px-2.5 flex items-center
border-b border-default`, so it lines up with the tablet header height.

## 9. The marketing site at 375px

Marketing pages are **not** exempt from the app gate in code. The gate wraps the
whole router. Treat this as a caveat: at 375px the gate matches
`(max-width: 767px)` on every route, and only the report routes in section 7.5
are exempt.

`NOT OBSERVED`: whether a production flag or a route-level guard suppresses the
gate on marketing routes at runtime. The live check could not run, see section 1.
The mobile marketing menu below is fully built and reachable at 768-1023px,
where the desktop nav is still hidden (`lg:hidden`).

### 9.1 The mobile menu trigger

```html
<button class="lg:hidden w-9 h-9 flex items-center justify-center
               text-secondary hover:text-primary transition-colors"
        aria-label="Open menu">
```

`aria-label` flips to `Close menu` when open. The icon swaps from a 20px
hamburger to a 20px X. It appears below `lg`, that is below 1024px.

### 9.2 The mobile menu panel

```html
<div class="lg:hidden fixed inset-0 top-[52px] sm:top-[56px]
            bg-surface z-40 overflow-y-auto">
  <div class="px-4 py-3"> ... </div>
</div>
```

- It is a full-screen sheet, not a slide-in drawer.
- It starts under the nav bar: `top-[52px]`, and `top-[56px]` at `sm` and up.
  Those match the nav heights `h-[52px] sm:h-[56px]`.
- **Animation: none.** The panel is mounted or unmounted with `{open && ...}`.
  There is no transform, no opacity transition, no motion component. Only the
  child links carry `transition-colors`.
- While it is open, `document.body.style.overflow = "hidden"`. The value is
  cleared on close and on unmount.
- `Escape` closes it.
- It closes automatically on every route change.
- Every item calls `setOpen(false)` on click.

### 9.3 Every mobile menu item, top to bottom

**Primary list.** Class per item:
`block px-4 py-2.5 text-[15px] font-medium rounded transition-colors`.
The first item is highlighted: `text-accent bg-accent-subtle`. The rest are
`text-secondary hover:bg-muted hover:text-primary`.

| Label | Href |
|---|---|
| Features | `/features` |
| Pricing | `/pricing` |
| Demo | `/demo` |
| Documentation | `/learn/docs` |
| Changelog | `/changelog` |

**Section `Solutions`.** Heading class
`px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-2`,
inside `mt-5 pt-4 border-t border-default`.

| Label | Href |
|---|---|
| Startups | `/trakkr-for/startups` |
| Agencies | `/trakkr-for/agencies` |
| Enterprise | `/trakkr-for/enterprise` |

**Section `Tools`.** Inside `mt-4 pt-4 border-t border-default`.

| Label | Href |
|---|---|
| AI Site Grader | `/free-tools/ai-site-grader` |
| llms.txt Generator | `/free-tools/llms-txt-generator` |
| Visibility Leaderboard | `/data/rankings` (plain `<a>`, external) |
| AI Traffic Index | `/ai-search-traffic` |

Row class in both sections:
`flex items-center gap-3 px-4 py-2.5 text-[14px] text-secondary hover:bg-muted
hover:text-primary rounded transition-colors`, with a 28px icon tile
(`w-7 h-7 rounded bg-muted flex items-center justify-center flex-shrink-0`) and a
14px lucide icon at `strokeWidth 1.5`.

The desktop `Product` and `Resources` dropdowns are **not** reproduced as
accordions. The mobile menu flattens them into the two static sections above.
The desktop Resources items (Data, API Reference, MCP Server, Research) and the
Product feature anchors are therefore **absent from the mobile menu**.

### 9.4 Mobile CTA placement

The CTAs sit at the very bottom of the sheet, inside
`mt-5 pt-4 border-t border-default space-y-2`. They are full width and stacked.

| State | Buttons |
|---|---|
| Logged in | one button `Dashboard` -> `/dashboard`, class `w-full px-4 py-2.5 text-center text-[14px] font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors` |
| **Logged out** | `Sign in` -> `/login`, class `block w-full px-4 py-2.5 text-center text-[14px] font-medium text-secondary border border-default rounded hover:border-accent hover:text-accent transition-colors`, then `Get started` -> `/start`, class `block w-full px-4 py-2.5 text-center text-[14px] font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors` |

So the logged-out mobile menu ends with an outlined `Sign in` above a solid
`Get started`.

### 9.5 Reflow of the main blocks

**Nav bar.** `h-[52px]` below 640px, `h-[56px]` at 640px and up. Horizontal
padding `px-4` below `lg`, then `lg:px-0` because the 1120px container takes
over. The two decorative full-height rules at `calc(50% ± 560px)` are
`hidden lg:block`, so they disappear below 1024px.

**Home hero.** The H1 scales in three steps:

```html
<h1 class="text-[22px] sm:text-[26px] lg:text-[32px] font-semibold text-primary
           tracking-[-0.025em] leading-[1.2] mb-4 max-w-[820px] mx-auto">
```

22px at 375px, 26px at 640px, 32px at 1024px. It stays centred and capped at
820px.

**Pricing plan cards.**

```html
<div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0
            md:divide-x divide-default">
```

One column below 768px, three columns at 768px and up. The dividers flip from
horizontal to vertical at the same point. So at 375px the three plans stack, in
order Growth, Scale, Enterprise, separated by horizontal rules.

**Pricing comparison table.** It is wrapped in `overflow-x-auto` with an inner
`min-w-[480px]`. So at 375px the table scrolls sideways inside its own box. The
page body does not scroll horizontally. Small helper labels are `hidden sm:block`
and are replaced by `lg:hidden` numeric captions at
`text-[11px] font-semibold tracking-[0.08em] text-muted tabular-nums`.

**Head-to-head comparison pages** (for example `/compare/profound-vs-trakkr`)
use four `overflow-x-auto` wrappers, and stat rows that go
`grid-cols-1` -> `sm:grid-cols-2` -> `lg:grid-cols-4`. The dividers flip the same
way: `divide-y sm:divide-y-0 sm:divide-x`.

**Footer.** See section 6. Below 640px the compact 4-column footer replaces the
full one, and the bottom bar stacks.

## 10. Every media query in the stylesheet

Read from `/assets/index-FXwgnpwI.css`, 516,591 bytes.

### 10.1 Tailwind breakpoints

| Variant | Query | px |
|---|---|---|
| `sm` | `(min-width:40rem)` | 640 |
| `md` | `(min-width:48rem)` | 768 |
| `lg` | `(min-width:64rem)` | 1024 |
| `xl` | `(min-width:80rem)` | 1280 |
| `2xl` | `(min-width:96rem)` | 1536 |

There is also `(min-width:640px)` in plain px, used by the base layer, and
`(min-width:400px)` for `.container { max-width: 400px }`.

### 10.2 Arbitrary Tailwind variants

- `@media (min-width:2000px)` - `min-[2000px]:border-x`, `border-r`, `border-l`,
  `border-default`. This draws the outer rules on very wide screens.
- `@media not all and (min-width:359px)` - the `max-[359px]:` variant.
  It sets `mt-1`, `w-full`, `flex-col`, `items-stretch`, `justify-center`,
  `gap-2`. This is the very small phone fallback.
- `@media not all and (min-width:40rem)` and
  `@media not all and (min-width:80rem)` - the `max-sm:` and `max-xl:` variants.

### 10.3 Hand-written queries, all for the `/learn` docs shell

| Query | Effect |
|---|---|
| `(max-width:1280px)` | `.learn-main-content{padding-right:0}` and `.learn-toc-sidebar{display:none}` - the table of contents is dropped |
| `(max-width:1024px)` | `.learn-sidebar` becomes `position:fixed`, `left:-280px`, `transition:transform .3s`, `box-shadow:4px 0 24px #0000001a`, `z-index:40`; `.learn-sidebar-open{transform:translate(280px)}`; `.learn-overlay` is `position:fixed; inset:0; background:#0000004d; transition:opacity .2s,visibility .2s`; `.learn-overlay-visible` shows it |
| `(max-width:1023px)` | `.learn-mobile-full{border-radius:0;margin-left:-1rem;margin-right:-1rem}` - full-bleed cards |
| `(max-width:768px)` | `.learn-feature-grid{grid-template-columns:1fr}`, `.learn-code-block` goes full-bleed, `.learn-heading-xl{font-size:28px}`, `.learn-heading-lg{font-size:22px}`, `.learn-section-gap{padding:2rem 0}`, `.learn-page-nav{flex-direction:column;gap:1rem}` with `>*{width:100%}` |
| `(max-width:640px)` | `.learn-container{padding:0 1rem}`, `.learn-concept-grid{grid-template-columns:1fr}`, `.learn-progress-section{display:none}`, `.learn-model-grid{grid-template-columns:repeat(2,1fr)}` |

The docs sidebar therefore uses the **same 280px width** as the app tablet
drawer, but it is a CSS slide with a 0.3s transform, not a React overlay.

### 10.4 Feature queries

| Query | Count | Use |
|---|---|---|
| `(hover:hover)` | 7 | hover styles are gated to real pointers |
| `(prefers-reduced-motion:reduce)` | 5 | animations cut to 1ms |
| `(prefers-reduced-motion:no-preference)` | 1 | |
| `(prefers-contrast:high)` | 1 | `.learn-callout{border-width:2px}`, `.learn-nav-item-active{outline:2px solid;outline-offset:-2px}` |
| `print` | 4 | print sheets; the gate, the nav and the sidebar all carry `print:hidden` |
| `screen` | 1 | |

Inline styles on the pricing page add one more:
`@media (prefers-reduced-motion: reduce) { .pricing-configurator * {
animation-duration: 1ms !important; transition-duration: 1ms !important; } }`.

## 11. Summary of the breakpoint ladder

| Width | Marketing site | App |
|---|---|---|
| < 359px | `max-[359px]:` fallbacks stack the tightest rows | gated |
| 375px | 52px nav, hamburger, full-screen menu sheet, single-column pricing, compact footer | gated |
| 640px (`sm`) | nav grows to 56px, full footer grid appears, bottom bar becomes a row | gated |
| 767px | last gated width | last gated width |
| 768px (`md`) | pricing goes to 3 columns | gate clears; 56px sticky header + 280px drawer |
| 1024px (`lg`) | desktop nav replaces the hamburger; 1120px container and side rules appear | fixed sidebar returns, 200px or 60px |
| 1280px (`xl`) | H1 already at 32px since `lg`; wider grids | docs TOC returns |
| 2000px | outer border rules drawn | |
