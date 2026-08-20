---
name: VentureCite
description: Generative Engine Optimization platform — practical, considered, sharp.
colors:
  signal-green: "oklch(0.5912 0.1145 170)"
  signal-green-fill: "oklch(0.5171 0.0988 170.6)"
  console-teal: "oklch(0.71 0.13 184)"
  on-accent: "oklch(0.99 0.01 170)"
  canvas: "oklch(1 0 0)"
  surface: "oklch(1 0 0)"
  surface-muted: "oklch(0.964 0.005 258)"
  ink: "oklch(0.205 0.008 275)"
  ink-secondary: "oklch(0.475 0.012 273)"
  ink-tertiary: "oklch(0.645 0.014 276)"
  border-default: "oklch(0.937 0.006 275)"
  border-strong: "oklch(0.901 0.008 271)"
  positive: "oklch(0.5912 0.1145 170)"
  warning: "oklch(0.7 0.19 48)"
  negative: "oklch(0.645 0.225 14)"
  on-strong: "oklch(0.99 0.003 273)"
  chart-1: "oklch(0.5912 0.1145 170)"
  chart-2: "oklch(0.563 0.167 263)"
  chart-3: "oklch(0.722 0.138 65)"
  chart-4: "oklch(0.606 0.219 293)"
  chart-5: "oklch(0.646 0.154 360)"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Monaco, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.signal-green-fill}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.signal-green-fill}"
    textColor: "{colors.on-accent}"
  button-outline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-destructive:
    backgroundColor: "{colors.negative}"
    textColor: "{colors.on-strong}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: VentureCite

## 1. Overview

**Creative North Star: "The Operator's Console"**

VentureCite is an instrument, not a brochure. It gives marketing operators a calm, dense, trustworthy view of how brands appear inside AI answer surfaces, and what to do about it. The visual system is a near-monochrome workspace, cool-neutral in both themes though the two are no longer color siblings: light runs on Trakkr's TDS palette (hue ~273), dark stays cool-tinted zinc (hue ~285). A single sans-serif (Inter), restrained shadows, and one disciplined accent (green in light, Signal Indigo in dark) earn their presence by appearing rarely and only on what matters most. Teal plays a quiet second, as occasional secondary emphasis. Status color (emerald, amber, rose) is strictly functional and never decoration.

The canonical theme is **light**: Trakkr's TDS system, a white canvas with recessed surfaces and a cool-neutral ink ramp (hue ~273) at high contrast. Dark remains a fully themed peer, unchanged from the prior system and available via the toggle: a sophisticated cool-zinc near-black (never pure black, which reads as an undesigned void) with crisp near-white text. Light is what a user lands on; design for it first and verify dark second.

The system explicitly rejects the four reflex aesthetics of contemporary SaaS: the AI-tool cliché (purple-to-pink gradients, neon glow, glassmorphism, sparkle/✨ iconography, "AI-powered" badges), the old-school SEO chrome (navy enterprise dashboards, table-of-tables density, every-metric-on-screen overload), the generic SaaS template (gradient hero, three identical feature cards, stock illustrations), and crypto/web3 maximalism (loud color for its own sake). It should sit alongside otterly.ai and peec.ai: clean, confident, data-forward. Density varies by surface; long-form pages (glossary, reports) breathe with editorial rhythm, while operational dashboards (rankings, citations, analytics) tighten up for fast scanning.

**Key Characteristics:**
- Light-first cool-neutral TDS workspace (hue ~273); dark is a cool-zinc peer (hue ~285), unchanged, via toggle
- One saturated accent (green in light, Signal Indigo in dark), used on ≤10% of any screen; teal as the quiet second
- Inter for all chrome; JetBrains Mono only for numeric/code/identifiers
- Soft, low-contrast shadows in light; surface-lightening plus a lit top edge in dark
- Moderate rounding (6px controls, 8px containers); pill badges
- Active navigation is a raised neutral chip, never an accent fill
- OKLCH throughout; `#000` never appears, `#fff` appears only as the light-theme canvas

## 2. Colors

A cool-neutral grayscale workspace with one disciplined accent and a teal second. Neutrals are tinted cool (TDS hue ~273 in light, zinc hue ~285 in dark) so the surface reads as a clear instrument rather than a warm document; light and dark are no longer color siblings, each runs its own cool-neutral family. The accent is green in light, Signal Indigo in dark, saturated enough to draw the eye and rare enough to never feel decorative.

### Primary
- **The Accent**: light is green (≈#0e9373 / `oklch(0.5912 0.1145 170)`); dark is Signal Indigo (≈#6366F1 / `oklch(0.66 0.19 278)`), unchanged from the prior system. The system's one brand accent per theme. Reserved for the primary action in any flow, the focus ring, links, the active rank/selection indicator, and chart series 1. Never a card fill, never a section divider, never ambient decoration. In light, button fills use the darker `#0c7a60` (`oklch(0.5171 0.0988 170.6)`) rather than the `#0e9373` swatch: the swatch only reaches 3.86:1 against white, below WCAG AA for normal text, while `#0c7a60` reaches 5.29:1. Carries on-accent text at AA.

### Secondary
- **Console Teal** (≈#14B8A6 / `oklch(0.71 0.13 184)`): complementary secondary emphasis. Pair sparingly with the accent; it is a supporting voice, not a co-headliner. No longer the chart lead series: chart series 2 is now blue (`#3f6fd6`) under the updated ramp.

### Neutral
- **Canvas** (light `oklch(1 0 0)` / `#ffffff`, dark `oklch(0.165 0.003 285)`): the workspace background. Pure white in light under Trakkr's TDS, the deliberate exception to the No-Pure-Black/White rule below; cool near-black zinc in dark, unchanged.
- **Surface** (light `oklch(1 0 0)` / `#ffffff`, dark `oklch(0.225 0.0045 285)`): elevated surfaces (cards, popovers, sidebar). Coincides with canvas at white in light, TDS defines no separate elevated-white step, so elevation reads via border and shadow rather than fill; a lifted zinc step in dark, unchanged.
- **Surface Muted** (light `oklch(0.964 0.005 258)` / `#f1f3f6`, dark `oklch(0.195 0.004 285)`): muted/secondary surfaces, sidebar, ghost-control hover fills, chip backgrounds. This is TDS's "recessed surface" in light; unchanged in dark.
- **Border Default** (light `oklch(0.937 0.006 275)` / `#e9eaee`, dark `oklch(0.31 0.006 285)`): every default border and divider. Hairline weight (1px), low contrast. Stronger and subtler steps exist for emphasis and recession: light `border-strong` is `oklch(0.901 0.008 271)` / `#dcdee4` (dark unchanged at `oklch(0.31 0.006 285)`).
- **Ink** (light `oklch(0.205 0.008 275)` / `#16171b`, dark `oklch(0.97 0.003 285)`): primary text. Near-black cool-neutral in light (top of TDS's ink ramp), near-white zinc in dark, unchanged; tinted toward the neutral hue, never `#000`/`#fff`.
- **Ink Secondary / Tertiary** (light `oklch(0.475 0.012 273)` / `#5a5c63`, `oklch(0.645 0.014 276)` / `#8b8d96`): secondary text, descriptions, captions, axis labels (`--fg-secondary`, `--fg-tertiary` / `muted-foreground`). TDS's ink ramp continues one step lighter still, `oklch(0.789 0.010 273)` / `#b8bac1`, for disabled and placeholder text.

### Functional Status
Status colors are functional-only and used sparingly. Each is paired with an icon, label, or shape; color is never the sole signal.
- **Positive Emerald** (`oklch(0.5912 0.1145 170)` / `#0e9373`): success, positive deltas, healthy state. In light this is now the identical value to the accent, see the Status-Is-Functional Rule below for the tension that creates.
- **Warning Amber** (`oklch(0.7 0.19 48)`): caution, pending, attention-needed.
- **Negative Rose** (`oklch(0.645 0.225 14)`): errors and destructive actions. This token is also `--destructive`.

### Chart Series
Categorical ramp = the brand palette, brand-led: **Chart 1** green `oklch(0.5912 0.1145 170)`, **Chart 2** blue `oklch(0.563 0.167 263)`, **Chart 3** amber `oklch(0.722 0.138 65)`, **Chart 4** violet `oklch(0.606 0.219 293)`, **Chart 5** pink `oklch(0.646 0.154 360)`. The most-emphasized series sits on the accent. Series always carry a distinct label, line style, or marker shape so color is never the only encoding.

### Named Rules

**The Earned-Accent Rule.** The accent (green in light, Signal Indigo in dark) appears on ≤10% of any given screen. Its rarity is the point. If you reach for it twice on one surface, one use is wrong. Teal is the quiet second; it never competes with the accent for primacy.

**The Status-Is-Functional Rule.** Emerald, amber, and rose are status only, never brand and never decoration. The brand accent is green in light and Signal Indigo in dark; the destructive/error color is rose. They must stay visually distinct so semantics and identity never collide. **Known tension:** in light, positive-emerald and the accent now share the exact same value (`#0e9373`), a Trakkr TDS choice that collides with this rule. Treat it as a documented exception, not a precedent for reusing the accent as a status color elsewhere.

**The Neutral-Active-Nav Rule.** The active navigation item is a raised neutral chip with full-contrast text, in both themes. It is never an accent fill. The accent (green in light, indigo in dark) stays reserved for the single primary action and the focus ring.

**The No-Pure-Black/White Rule.** `#000` never appears as text, surface, or border in either theme; `#fff` never appears as text or border. Every neutral is tinted toward the cool hue (TDS ~273 light, zinc ~285 dark), with one deliberate exception: TDS's light canvas is literal `#ffffff`. Pure black reads as an undesigned void; pure white elsewhere still reads as a glare.

## 3. Typography

**Display / Body Font:** Inter (with system-ui fallback)
**Mono Font:** JetBrains Mono (with Monaco, Consolas fallback)
**Long-form Serif:** Georgia (prose containers only)

**Character:** A single sans-serif voice, Inter, carries the entire hierarchy: headings, labels, buttons, body, and dense data. Its neutral technical clarity matches an operator's console and never draws attention to itself, which is the point. JetBrains Mono carries numeric data, identifiers, code, and citation URLs where character alignment and tabular figures matter more than personality. There is no display serif in the chrome; a serif here would tilt the system toward "magazine" and away from "instrument." The type scale is a **fixed rem scale** (not fluid `clamp()`); users view at consistent DPI, and a heading that shrinks inside a sidebar looks worse, not better.

### Hierarchy
- **Display** (600, 3rem / 48px, line-height 1.05, -0.02em): the single hero number on a surface (the visibility score on `/report`, `/home`), top of empty states. The figure does the work.
- **Headline** (600, 1.875rem / 30px, 1.15, -0.015em): page titles. The "you are here" type.
- **Title** (600, 1.5rem / 24px, 1.2, -0.01em): card titles (`CardTitle`), section headers, dialog headings.
- **Body** (400, 0.875rem / 14px, 1.55): the workhorse text size for dense operational UI. Comfortable for short report copy; tight enough for tables and panels.
- **Label** (500, 0.75rem / 12px, +0.01em): form labels, axis labels, badge text (badges run 600).
- **Mono** (500, 0.8125rem / 13px, JetBrains Mono): numeric values where alignment matters, IDs, code, citation URLs, anything that updates live.

### Named Rules

**The Inter-Only-In-Chrome Rule.** Inter handles every chrome surface. Long-form content (glossary entries, report bodies via `@tailwindcss/typography`) is the only place Georgia may legitimately appear, and only inside the prose container.

**The Tabular-Numerals Rule.** Anywhere numbers stack vertically or update live (tables, KPIs, ranking lists, charts, counters), use the `.tnum` utility (JetBrains Mono + `tabular-nums`). Proportional digits in a numeric column, or a figure that shimmies as it updates, is a tell of carelessness.

**The 65–75ch Rule.** Body copy in long-form surfaces caps at 65–75 characters per line. Data and compact UI may run denser; tables at 120ch+ are fine.

## 4. Elevation

The system is **flat by default with subtle ambient lift**, and elevation is expressed differently per theme. In **light**, cards and popovers carry a low-opacity ink-tinted shadow (`oklch(0.16 0.012 275)` at 3–10% alpha): present enough to separate elevated surfaces from the canvas, never enough to feel like they float. In **dark**, shadows recede; elevation is conveyed by **lightening the surface** one step (canvas to surface to popover) plus an `inset` lit top edge (`oklch(1 0 0 / 0.04)`). Drama lives in the data, not the chrome.

### Shadow Vocabulary (light)
- **shadow-2xs** (`0 1px 2px oklch(0.16 0.012 275 / 0.04)`): hairline lift on inputs and ghost surfaces.
- **shadow-xs** (`0 1px 3px / 0.06`): default resting input.
- **shadow-sm** (`0 2px 4px / 0.06, 0 1px 2px -1px / 0.03`): the resting card state.
- **shadow / shadow-md** (`0 4–6px ... / 0.08`): popovers, dropdowns, command menus.
- **shadow-lg** (`0 10px 15px -3px / 0.08`): dialogs, drawers, sticky overlays.
- **shadow-xl / 2xl**: full-screen modals only.

### Named Rules

**The Flat-At-Rest Rule.** Operational surfaces (dashboard cards, list rows, sidebar items) sit flat at rest; `Card` rests at `shadow-sm`. Heavier shadow appears only as a state change (hover, focus, drag) or genuine elevation (a popover over a panel). Ambient `shadow-lg` on a resting card is the SaaS-template tell; never do it.

**The No-Glass Rule.** Glassmorphism is forbidden in product chrome. `backdrop-filter: blur` may appear only on a full-viewport dialog overlay. Translucent panels stacked on translucent panels is confusion, not depth. (Legacy decorative utilities `.text-gradient-red` and `.shimmer-bg` exist in `index.css` but are scoped to the intentionally-distinct marketing landing page; never use them in product surfaces.)

## 5. Components

### Buttons
- **Shape:** rounded-md (6px). Height 40px (default), 36px (sm), 44px (lg / icon, meeting WCAG 2.5.5 touch target).
- **Primary (`default`):** accent fill, on-accent text, no border, green (`#0c7a60`, the AA-contrast fill) in light, Signal Indigo in dark. Hover darkens to `primary/90`. The single most important action on a surface.
- **Outline:** transparent/canvas fill, hairline `input` border, ink text. Hover fills with the neutral `accent` (surface-muted). The default "do something" button when there is no single primary.
- **Ghost:** no border or fill at rest; hover fills with neutral `accent`. Tertiary actions in dense surfaces (row actions, toolbar buttons).
- **Secondary:** surface fill, ink text. Used sparingly; outline is usually the better answer.
- **Destructive:** Negative Rose fill, on-strong text. Confirmation dialogs and irreversible actions.
- **Link:** accent-colored text (green in light, indigo in dark), `underline-offset-4`, underline on hover.
- **Focus:** 2px `ring` (the accent: green in light, indigo in dark) with 2px offset on every variant.

### Inputs / Fields
- **Style:** canvas-background fill, hairline `input` border, 6px radius, 40px height. The fill matches the workspace so inputs read as wells cut into the surface.
- **Focus:** 2px accent ring (green in light, indigo in dark) with 2px offset; the ring is the entire focus signal (no border-color shift).
- **Disabled:** 50% opacity, `cursor-not-allowed`.
- **Error:** destructive ring + `aria-invalid`, with an inline message below in the negative color, wired via `aria-describedby`. Always paired with text; color is never the only signal.

### Cards
- **Corner Style:** rounded-lg (8px), slightly softer than controls to read as "container."
- **Background:** Surface (white in light, coinciding with canvas; lifted zinc in dark) on the canvas.
- **Border:** hairline `border`.
- **Shadow:** `shadow-sm` at rest; no shadow change on hover for static cards.
- **Internal Padding:** 24px (`p-6`).
- **Title:** Title scale (24px, 600, tight tracking). Description follows in `muted-foreground` at body-small size. Never wrap a single control in a card; never nest a card in a card.

### Badges / Chips
- **Shape:** rounded-full (pill). Pills signal "label/state"; squares signal "action."
- **Default:** accent fill (green in light, indigo in dark), on-accent text. Used very sparingly (a primary badge competes with a primary button for accent share).
- **Secondary:** Surface Muted fill, ink text. The default for state pills, tags, and labels.
- **Destructive:** rose fill. **Outline:** transparent, ink text. Typography: 12px / 600.

### Navigation (Sidebar)
- **Background:** Surface Muted, with a hairline right border. Reads as a recessed rail.
- **Item resting:** transparent fill, `muted-foreground` text.
- **Item hover:** neutral surface fill, ink text.
- **Item active:** a raised neutral chip (Surface) with full-contrast ink text, in both themes. Never an accent fill; the accent (green in light, indigo in dark) is reserved for the primary action and focus ring.

### Charts
- **Color order:** Chart 1 green, Chart 2 blue, Chart 3 amber, Chart 4 violet, Chart 5 pink.
- **Gridlines:** border color, low opacity. **Axis labels:** `muted-foreground`, label type.
- **Tooltips:** Surface, `shadow-md`, tabular numerals, 6px radius.
- Color is never the only encoding; series carry distinct labels, line styles, or markers.

### Motion
Motion is functional: state change, feedback, loading, reveal. Transitions run 80–220ms (`--motion-instant` 80ms, `--motion-fast` 140ms, `--motion-base` 220ms) on an exponential ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`). No bounce, no elastic, no orchestrated page-load sequences. The `.reveal` utility settles content 6px with opacity; under `prefers-reduced-motion: reduce` it collapses to an opacity-only crossfade. Reduced motion is honored everywhere; it is not optional.

## 6. Do's and Don'ts

### Do:
- **Do** design light-first (it is the default theme) and verify dark as a peer.
- **Do** lead with the data. Numbers, ranks, and signals appear before any verdict copy; interpretation follows evidence.
- **Do** use the accent sparingly and only on what matters most: the primary action, the focus ring, links, the active rank indicator, chart-1. Green in light, Signal Indigo in dark.
- **Do** keep cards flat at rest (`shadow-sm`); shadow responds to state, not as ambient decoration.
- **Do** pair every status color with an icon, label, or shape. Color is never the sole encoding.
- **Do** use the `.tnum` utility (JetBrains Mono + tabular-nums) anywhere numbers stack or update.
- **Do** use the neutral raised chip for active nav; anchor with weight, not the accent.
- **Do** keep long-form body copy inside a 65–75ch container; reserve Georgia for prose containers only.
- **Do** respect `prefers-reduced-motion` everywhere.

### Don't:
- **Don't** treat the brand accent as red. The brand accent is **green in light, Signal Indigo in dark** (`--brand-accent` / `--primary`); rose is the destructive/status color only. (DESIGN.md once claimed a vermillion brand; the code never used it.)
- **Don't** use sparkle/✨ icons (as decoration, affordance, or a model brand mark), purple-to-pink gradients, neon glow, or glassmorphism anywhere in product chrome. (Anti-reference: AI-tool cliché.)
- **Don't** use gradient text or `background-clip: text`. Emphasis comes from weight or scale, in a single solid color. (The `.text-gradient-red` utility is landing-only legacy; never use it in product.)
- **Don't** ship the hero-metric template (big number + small label + supporting stats + accent) or identical card grids repeated endlessly. (Anti-references: generic SaaS template, hero-metric cliché.)
- **Don't** ship a navy enterprise-blue dashboard, table-of-tables layouts, or every-metric-on-screen overload. One opinion per screen. (Anti-reference: old-school SEO tool.)
- **Don't** use saturated color decoratively. If a color isn't reporting a state or anchoring a primary action, it's wrong. (Anti-reference: crypto/web3 maximalism.)
- **Don't** use raw Tailwind palette colors (`gray-*`, `slate-*`, `blue-*`, `emerald-400`, `amber-400`, `sky-600`, `orange-*`) or `bg-white`/`text-white`. Always use the semantic tokens.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe. Rewrite with full borders, background tints, or leading icons.
- **Don't** wrap a single control or everything in a card; nested cards are always wrong.
- **Don't** reach for a modal as the first thought; exhaust inline/progressive alternatives first.
- **Don't** use em dashes (—) or `--` in product copy. Use commas, colons, semicolons, periods, or parentheses.
- **Don't** animate CSS layout properties; animate `transform` and `opacity`. No bounce or elastic easing; no orchestrated page-load sequences.
- **Don't** add `shadow-lg`/`shadow-xl` to a resting card; those are for true overlays (dialogs, drawers).
