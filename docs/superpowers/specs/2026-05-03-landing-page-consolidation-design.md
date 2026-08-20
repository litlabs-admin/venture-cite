# Landing Page Consolidation — Design

> **Historical snapshot.** This stale document is redacted. It does not give current guidance.

**Date:** 2026-05-03
**Status:** Draft (awaiting user review)
**Owner:** owner@example.test

## Problem

VentureCite ships two public landing pages:

- `client/src/pages/landing.tsx` — mounted at `/` for unauthenticated users (1,521 lines, Tailwind-heavy, includes ROI calc + comparison table + waitlist).
- `client/src/pages/landing2.tsx` — mounted at `/landing2` (1,036 lines + 1,686-line `landing2.css`, modern visual design adapted from a generic SaaS template).

Maintaining two competing landing pages drifts copy, confuses intent, and leaves a lot of template-derived content (fake testimonials, fabricated stats, generic GIFs, irrelevant icons) on the modern-looking page. We are pre-launch, so claims like "Trusted by 10,000+ teams" and 9 fabricated testimonials are also a credibility/legal risk.

## Goal

Ship one public landing page that:

1. Uses `landing2`'s visual language (it's stronger).
2. Is honest about pre-launch status (no fake testimonials, no fabricated stats).
3. Describes the actual VentureCite product (citation tracking across AI engines, content optimization, share-of-answer reporting) — not generic SaaS productivity tropes.
4. Uses code-built UI mockups instead of stock images/GIFs, so visuals match the real product and stay accurate as the product evolves.
5. Drops dead weight (~25 unused asset files, the entire `landing.tsx`).

## Non-goals

- Not adjusting Tailwind config, design tokens, or global styles.
- Not migrating `landing2.css` to Tailwind utilities. Keep it as a scoped stylesheet.
- Not adding new dependencies.
- Not finalizing pricing copy. Pricing section is hidden until pricing is locked.
- Not building a CMS or making any section dynamically driven from the DB.

## Final section list

| #   | Section                          | Decision                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Nav                              | Keep. Drop "About Us" and "Pricing" links.                                                                                                                                                                                                                                                                                |
| 2   | Hero                             | Replace external dashboard image with a code-built `<MockDashboard/>` modeled after the JSX in `landing.tsx:464-576` (sidebar + 3 KPI cards: Share of Answer, Citations This Week, Growth Rate; plus a "Latest AI Citation" card).                                                                                        |
| 3   | "Tracks citations across" ticker | Repurpose existing logo ticker into an AI engine wordmark row: ChatGPT, Claude, Perplexity, Gemini, Copilot, Google AI Overview. Text-based wordmarks (no new images). Replaces the fake "Trusted by 10,000+ brand & marketing teams" claim.                                                                              |
| 4   | About Us                         | **Delete.** Remove `aboutImage` asset.                                                                                                                                                                                                                                                                                    |
| 5   | Stats                            | **Delete.** All four numbers were fabricated.                                                                                                                                                                                                                                                                             |
| 6   | Why VentureCite                  | Keep 3-card grid. Card 1 keeps the AI-engine vertical ticker. Card 2 rebuilds as a live "Citation Activity" mockup (rows of: AI engine pill + prompt snippet + sentiment pill). Card 3 swaps the Google Meet/Loom/Cursor icons for ChatGPT/Claude/Perplexity glyphs (text wordmarks); keeps the search-bar mock above it. |
| 7   | Core Features                    | Trim from 6 generic GIFs to 4 product-true features, each with a code-built mockup component: Citation Intelligence, Share-of-Answer Tracking, AI Content Generation, Client Reporting Dashboard.                                                                                                                         |
| 8   | Product Pillars                  | Rewrite copy. Six pillars rooted in real product capability: 01 Continuous Citation Tracking · 02 AI-Optimized Content · 03 Share-of-Answer Reports · 04 Multi-Engine Coverage · 05 SOC2-Grade Security · 06 10-Minute Setup.                                                                                             |
| 9   | Pricing                          | **Hide.** Remove section render and nav link. Leave `pricing` data array in the source with a `// re-enable when pricing is finalized` comment.                                                                                                                                                                           |
| 10  | Testimonials                     | **Delete.** Remove all 9 avatar assets.                                                                                                                                                                                                                                                                                   |
| 11  | FAQ                              | Keep copy (it's the strongest in the file). UI upgrade: two-column grid on desktop, polished accordion (chevron rotates on open, hover tint, smooth max-height + opacity transition), bottom contact CTA card.                                                                                                            |
| 12  | Footer CTA                       | Keep structure. Tighten copy. Confirm CTAs route to `/register` and `#faq`.                                                                                                                                                                                                                                               |
| 13  | Footer                           | Restructure into three columns: **Product** (Why, Features, Pillars, FAQ) · **Company** (Contact via mailto) · **Legal** (Privacy, Terms). Keep brand row + social row.                                                                                                                                                   |

## Routing & file changes

- Delete `client/src/pages/landing.tsx`.
- Rename `client/src/pages/landing2.tsx` → `client/src/pages/landing.tsx`.
- Rename `client/src/pages/landing2.css` → `client/src/pages/landing.css`.
- In `client/src/App.tsx`:
  - Update the `Landing` import to point at the new file (already named `Landing` via default export).
  - Remove the lazy `Landing2` import and the `/landing2` route.
- Class prefix migration: `l2-*` → `landing-*` across both the TSX and CSS file (industry-standard BEM block prefix matching the file name; collision-safe since `landing.css` is the only non-Tailwind stylesheet alongside `index.css`).

## Mockup architecture

All hero/feature visuals are pure JSX + scoped CSS. No new dependencies. Five small sub-components co-located in `landing.tsx`:

| Component              | Used in                | Approx structure                                                                                                                       |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `<MockDashboard/>`     | Hero                   | Sidebar (logo + nav links) + main pane (browser chrome bar, 3 KPI tiles, "Latest AI Citation" card). Modeled on `landing.tsx:464-576`. |
| `<MockCitationFeed/>`  | Why card 2 + Feature 1 | Three to four feed rows: engine pill (ChatGPT/Claude/etc) + prompt text + sentiment pill (positive/neutral).                           |
| `<MockShareOfAnswer/>` | Feature 2              | Horizontal stacked bar showing % share per engine, with a legend column.                                                               |
| `<MockContentEditor/>` | Feature 3              | Two-column: article body left + GEO score sidebar right (score circle + 3-4 signal rows).                                              |
| `<MockReport/>`        | Feature 4              | 2x2 KPI grid + a tiny CSS sparkline.                                                                                                   |

These follow the existing landing-card visual style (rounded corners, soft shadow, faint border, badge pills already defined in the stylesheet). Animations stay limited to the existing `useScrollReveal` and `framer-motion` `useInView` already in the file.

## Asset cleanup

Delete from `attached_assets/landing2/`:

- All 9 avatars (`daniela.png`, `michael.png`, `ryan.png`, `emily.png`, `daniel.png`, `hannah.jpg`, `priy.png`, `lucas.png`, `omar.png`).
- All 5 partner logos (`logo0..4` SVGs).
- `aboutImage` (WvNZhR79…png).
- `heroDashboard` (HPK0hSpZ…png).
- All 6 GIFs (`smart-tasks`, `auto-workflows`, `team-sync`, `insights-hub`, `easy-integrations`, `secure-space`).
- `tickerGoogleMeet`, `tickerLoom`, `tickerCursor`.

Logo (`@assets/logo.png`) stays — used in nav and footer.

## FAQ UI specifics

- Layout: `display: grid; grid-template-columns: 1fr 1fr; gap: 16px;` on desktop (>= 768px); single column below.
- Item: `<button>` trigger with question + chevron; `<div>` answer with `max-height: 0; opacity: 0; transition: max-height 280ms ease, opacity 200ms ease;`. Open state sets a generous `max-height` (e.g. `400px`) and `opacity: 1`.
- Chevron: `transform: rotate(180deg)` on open, `transition: transform 220ms`.
- Hover: subtle background tint (existing token).
- Bottom card: full-width row beneath both columns, "Still have questions? — Email us" with `mailto:owner@example.test`.

## Behavior preserved

- `useScrollReveal` and the `RevealText` word-stagger animation behavior is unchanged.
- All routing/auth flows untouched. The page remains anonymous-only; authenticated users continue to be routed to `Home` via `FirstRunGate` (see `App.tsx:69`).
- `Helmet` title/description copy stays accurate; will be reviewed for the final hero wording.

## Risks / known landmines

- The hero layout ratio (text + image stacked) was tuned for a real-world image. Replacing with `<MockDashboard/>` requires verifying breakpoints don't break the dashboard mock at `< 480px` — plan to hide the sidebar at narrow widths (mirrors `landing.tsx`'s `hidden md:block`).
- Class rename `l2-*` → `landing-*` is mechanical but high-volume (~150+ class references across TSX + CSS). Will be done in a single sweeping rename to avoid stragglers.
- Existing Vite alias `@assets/...` resolves at build time. Removed asset imports must be deleted from the TSX, not just the files — otherwise build breaks. Delete imports first, files second.

## Additional ported sections (added 2026-05-03 by request)

Three sections from the legacy `landing.tsx` are ported into the new page, restyled in the `landing-*` design language:

- **Comparison vs competition** (legacy `landing.tsx:1019-1132`) — table comparing VentureCite vs Searchable.ai vs Traditional SEO. New section ID: `#comparison`. Place between Core Features and Product Pillars.
- **ROI Calculator** (legacy `landing.tsx:1135-1226`) — interactive `<Slider/>` from `@/components/ui/slider` driving three derived KPIs (citations/mo, monthly value, annual value). New section ID: `#roi`. Place between Comparison and Product Pillars.
- **Waitlist email capture** (legacy `landing.tsx:635-705`) — `POST /api/waitlist` form with `{ email, source: "landing" }`. New section ID: `#waitlist`. Place between Product Pillars and FAQ.

Final section order: Nav · Hero · AI engines ticker · Why · Features · **Comparison** · **ROI** · Pillars · **Waitlist** · FAQ · Footer CTA · Footer.

The waitlist form preserves the existing API contract; nav adds a "Waitlist" link replacing the dropped "Pricing" link. Hero secondary CTA changes from "View Pricing" to "Join Waitlist" (anchors to `#waitlist`).

## Out of scope (deferred)

- A dedicated `/contact` page. The footer + FAQ contact CTAs use `mailto:` for now.

## Acceptance

- `npm run check` passes.
- `npm run lint` passes (zero new errors/warnings introduced).
- `npm run dev` renders the new landing at `/`; nav anchors scroll smoothly to existing section IDs.
- No 404s on assets in browser DevTools network panel.
- `/landing2` returns the app's standard 404 (route removed).
- All five `<Mock*/>` components render at >= 1280px, 768px, and 375px without overflow or horizontal scroll.
- FAQ accordion: clicking a question opens it (and only it on mobile); two-column layout renders at >= 768px.
- No fake testimonials, no fabricated stats, no "10,000+ teams" claim anywhere on the page.
