# Trakkr replication spec - Part 01: design system and app shell

Source: https://trakkr.ai, logged-in session, brand "Venture PR".
Capture date: 2026-08-07. Browser viewport used for the desktop capture: 1280 x 900 CSS px, devicePixelRatio 1.25.
All values in this file come from `getComputedStyle`, `getBoundingClientRect`, or verbatim DOM dumps.

IMPORTANT capture note: the app reads the viewport width at mount. After a viewport resize you must reload the page, or the shell keeps the previous breakpoint layout.

The capture browser reported `prefers-color-scheme: dark` and `prefers-reduced-motion: reduce`. Both facts matter. See sections 1.6 and 6.

---

## 1. Design tokens

### 1.1 Token source

All tokens are declared in one rule with the selector `:root, :host` in `https://trakkr.ai/assets/index-DLp-sUO4.css`.
Two extra `:root` rules follow it. Both are shown below.
Two Google Fonts stylesheets are cross-origin and their rules are not readable. They are listed in section 1.7.

### 1.2 Full token dump - rule 1 (`:root, :host`)

```css
:root, :host {
  --font-sans: "Inter",system-ui,-apple-system,sans-serif;
  --font-serif: ui-serif,Georgia,Cambria,"Times New Roman",Times,serif;
  --font-mono: "JetBrains Mono","SF Mono",Menlo,Monaco,monospace;

  --color-red-50: #fef2f2;
  --color-red-100: oklch(93.6% .032 17.717);
  --color-red-200: oklch(88.5% .062 18.334);
  --color-red-300: oklch(80.8% .114 19.571);
  --color-red-400: oklch(70.4% .191 22.216);
  --color-red-500: #ef4444;
  --color-red-600: #dc2626;
  --color-red-700: oklch(50.5% .213 27.518);
  --color-red-800: oklch(44.4% .177 26.899);
  --color-red-900: oklch(39.6% .141 25.723);

  --color-orange-50: oklch(98% .016 73.684);
  --color-orange-100: oklch(95.4% .038 75.164);
  --color-orange-200: oklch(90.1% .076 70.697);
  --color-orange-300: oklch(83.7% .128 66.29);
  --color-orange-400: oklch(75% .183 55.934);
  --color-orange-500: oklch(70.5% .213 47.604);
  --color-orange-600: oklch(64.6% .222 41.116);
  --color-orange-700: oklch(55.3% .195 38.402);
  --color-orange-800: oklch(47% .157 37.304);
  --color-orange-900: oklch(40.8% .123 38.172);

  --color-amber-50: #fffbeb;
  --color-amber-100: #fef3c7;
  --color-amber-200: #fde68a;
  --color-amber-300: oklch(87.9% .169 91.605);
  --color-amber-400: oklch(82.8% .189 84.429);
  --color-amber-500: #f59e0b;
  --color-amber-600: #d97706;
  --color-amber-700: #b45309;
  --color-amber-800: oklch(47.3% .137 46.201);
  --color-amber-900: oklch(41.4% .112 45.904);
  --color-amber-950: oklch(27.9% .077 45.635);

  --color-yellow-50: oklch(98.7% .026 102.212);
  --color-yellow-100: oklch(97.3% .071 103.193);
  --color-yellow-200: oklch(94.5% .129 101.54);
  --color-yellow-400: oklch(85.2% .199 91.936);
  --color-yellow-500: oklch(79.5% .184 86.047);
  --color-yellow-600: oklch(68.1% .162 75.834);
  --color-yellow-700: oklch(55.4% .135 66.442);
  --color-yellow-900: oklch(42.1% .095 57.708);

  --color-green-50: #e4f6f2;
  --color-green-100: #c8ede5;
  --color-green-200: oklch(92.5% .084 155.995);
  --color-green-300: oklch(87.1% .15 154.449);
  --color-green-400: oklch(79.2% .209 151.711);
  --color-green-500: #0e9373;
  --color-green-600: #0c7a60;
  --color-green-700: oklch(52.7% .154 150.069);
  --color-green-900: oklch(39.3% .095 152.535);

  --color-emerald-50: oklch(97.9% .021 166.113);
  --color-emerald-100: oklch(95% .052 163.051);
  --color-emerald-200: oklch(90.5% .093 164.15);
  --color-emerald-300: oklch(84.5% .143 164.978);
  --color-emerald-400: oklch(76.5% .177 163.223);
  --color-emerald-500: oklch(69.6% .17 162.48);
  --color-emerald-600: oklch(59.6% .145 163.225);
  --color-emerald-700: oklch(50.8% .118 165.612);
  --color-emerald-800: oklch(43.2% .095 166.913);
  --color-emerald-900: oklch(37.8% .077 168.94);

  --color-teal-50: oklch(98.4% .014 180.72);
  --color-teal-200: oklch(91% .096 180.426);
  --color-teal-500: oklch(70.4% .14 182.503);
  --color-teal-600: oklch(60% .118 184.704);
  --color-teal-700: oklch(51.1% .096 186.391);

  --color-cyan-50: oklch(98.4% .019 200.873);
  --color-cyan-400: oklch(78.9% .154 211.53);
  --color-cyan-500: oklch(71.5% .143 215.221);
  --color-cyan-600: oklch(60.9% .126 221.723);
  --color-cyan-700: oklch(52% .105 223.128);

  --color-sky-50: oklch(97.7% .013 236.62);
  --color-sky-100: oklch(95.1% .026 236.824);
  --color-sky-200: oklch(90.1% .058 230.902);
  --color-sky-300: oklch(82.8% .111 230.318);
  --color-sky-400: oklch(74.6% .16 232.661);
  --color-sky-500: oklch(68.5% .169 237.323);
  --color-sky-600: oklch(58.8% .158 241.966);
  --color-sky-800: oklch(44.3% .11 240.79);
  --color-sky-900: oklch(39.1% .09 240.876);

  --color-blue-50: #eff6ff;
  --color-blue-100: oklch(93.2% .032 255.585);
  --color-blue-200: oklch(88.2% .059 254.128);
  --color-blue-300: oklch(80.9% .105 251.813);
  --color-blue-400: oklch(70.7% .165 254.624);
  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;
  --color-blue-700: oklch(48.8% .243 264.376);
  --color-blue-800: oklch(42.4% .199 265.638);
  --color-blue-900: oklch(37.9% .146 265.522);

  --color-indigo-50: oklch(96.2% .018 272.314);
  --color-indigo-500: oklch(58.5% .233 277.117);
  --color-indigo-600: oklch(51.1% .262 276.966);

  --color-violet-50: oklch(96.9% .016 293.756);
  --color-violet-100: oklch(94.3% .029 294.588);
  --color-violet-200: oklch(89.4% .057 293.283);
  --color-violet-400: oklch(70.2% .183 293.541);
  --color-violet-500: oklch(60.6% .25 292.717);
  --color-violet-600: oklch(54.1% .281 293.009);
  --color-violet-700: oklch(49.1% .27 292.581);
  --color-violet-900: oklch(38% .189 293.745);

  --color-purple-50: oklch(97.7% .014 308.299);
  --color-purple-100: oklch(94.6% .033 307.174);
  --color-purple-200: oklch(90.2% .063 306.703);
  --color-purple-400: oklch(71.4% .203 305.504);
  --color-purple-500: oklch(62.7% .265 303.9);
  --color-purple-600: oklch(55.8% .288 302.321);
  --color-purple-700: oklch(49.6% .265 301.924);
  --color-purple-900: oklch(38.1% .176 304.987);

  --color-fuchsia-500: oklch(66.7% .295 322.15);
  --color-pink-50: oklch(97.1% .014 343.198);
  --color-pink-500: oklch(65.6% .241 354.308);
  --color-pink-600: oklch(59.2% .249 .584);
  --color-rose-50: oklch(96.9% .015 12.422);
  --color-rose-100: oklch(94.1% .03 12.58);
  --color-rose-400: oklch(71.2% .194 13.428);
  --color-rose-500: oklch(64.5% .246 16.439);
  --color-rose-600: oklch(58.6% .253 17.585);

  --color-slate-50: oklch(98.4% .003 247.858);
  --color-slate-100: oklch(96.8% .007 247.896);
  --color-slate-200: oklch(92.9% .013 255.508);
  --color-slate-300: oklch(86.9% .022 252.894);
  --color-slate-400: oklch(70.4% .04 256.788);
  --color-slate-500: oklch(55.4% .046 257.417);
  --color-slate-600: oklch(44.6% .043 257.281);
  --color-slate-700: oklch(37.2% .044 257.287);
  --color-slate-800: oklch(27.9% .041 260.031);
  --color-slate-900: oklch(20.8% .042 265.755);

  --color-gray-50: #fafaf9;
  --color-gray-100: #f5f5f4;
  --color-gray-200: #e7e5e4;
  --color-gray-300: #d6d3d1;
  --color-gray-400: #a8a29e;
  --color-gray-500: #78716c;
  --color-gray-600: #57534e;
  --color-gray-700: #44403c;
  --color-gray-800: #292524;
  --color-gray-900: #1c1917;
  --color-gray-950: oklch(13% .028 261.692);

  --color-zinc-50: oklch(98.5% 0 0);
  --color-zinc-100: oklch(96.7% .001 286.375);
  --color-zinc-200: oklch(92% .004 286.32);
  --color-zinc-300: oklch(87.1% .006 286.286);
  --color-zinc-400: oklch(70.5% .015 286.067);
  --color-zinc-500: oklch(55.2% .016 285.938);
  --color-zinc-600: oklch(44.2% .017 285.786);
  --color-zinc-700: oklch(37% .013 285.805);
  --color-zinc-800: oklch(27.4% .006 286.033);
  --color-zinc-900: oklch(21% .006 285.885);

  --color-stone-50: oklch(98.5% .001 106.423);
  --color-stone-100: oklch(97% .001 106.424);
  --color-stone-200: oklch(92.3% .003 48.717);
  --color-stone-300: oklch(86.9% .005 56.366);
  --color-stone-400: oklch(70.9% .01 56.259);
  --color-stone-500: oklch(55.3% .013 58.071);
  --color-stone-600: oklch(44.4% .011 73.639);
  --color-stone-700: oklch(37.4% .01 67.558);
  --color-stone-800: oklch(26.8% .007 34.298);
  --color-stone-900: oklch(21.6% .006 56.043);

  --color-black: #000;
  --color-white: #fff;

  --spacing: .25rem;

  --container-xs: 20rem;  --container-sm: 24rem;  --container-md: 28rem;
  --container-lg: 32rem;  --container-xl: 36rem;  --container-2xl: 42rem;
  --container-3xl: 48rem; --container-4xl: 56rem; --container-5xl: 64rem;
  --container-6xl: 72rem; --container-7xl: 80rem;

  --text-xs: .75rem;    --text-xs--line-height: calc(1/.75);
  --text-sm: .875rem;   --text-sm--line-height: calc(1.25/.875);
  --text-base: 1rem;    --text-base--line-height: 1.5;
  --text-lg: 1.125rem;  --text-lg--line-height: calc(1.75/1.125);
  --text-xl: 1.25rem;   --text-xl--line-height: calc(1.75/1.25);
  --text-2xl: 1.5rem;   --text-2xl--line-height: calc(2/1.5);
  --text-4xl: 2.25rem;  --text-4xl--line-height: calc(2.5/2.25);

  --font-weight-light: 300;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-black: 900;

  --tracking-tight: -.025em;
  --tracking-normal: 0em;
  --tracking-wide: .025em;
  --tracking-wider: .05em;
  --tracking-widest: .1em;

  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-relaxed: 1.625;
  --leading-loose: 2;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: .5rem;
  --radius-xl: .75rem;
  --radius-2xl: 1rem;

  --shadow-sm: 0 1px 2px #0000000a;
  --shadow-md: 0 2px 8px #0000000a,0 4px 16px #00000005;
  --drop-shadow-md: 0 3px 3px #0000001f;

  --ease-out: cubic-bezier(0,0,.2,1);
  --ease-in-out: cubic-bezier(.4,0,.2,1);

  --animate-spin: spin 1s linear infinite;
  --animate-ping: ping 1s cubic-bezier(0,0,.2,1) infinite;
  --animate-pulse: pulse 2s cubic-bezier(.4,0,.6,1) infinite;
  --animate-bounce: bounce 1s infinite;

  --blur-sm: 8px;  --blur-md: 12px; --blur-lg: 16px;
  --blur-xl: 24px; --blur-2xl: 40px; --blur-3xl: 64px;

  --aspect-video: 16/9;
  --default-transition-duration: .15s;
  --default-transition-timing-function: cubic-bezier(.4,0,.2,1);
  --default-font-family: var(--font-sans);
  --default-mono-font-family: var(--font-mono);

  --mkt-dot-opacity: .08;
  --mkt-dot-spacing: 9px;
  --mkt-dot-size: .8px;

  --color-gray-75: #f8f8f7;

  /* semantic surface + text */
  --color-page: #fff;
  --color-surface: #fff;
  --color-muted: var(--color-gray-75);
  --color-primary: var(--color-gray-900);
  --color-secondary: var(--color-gray-600);
  --color-tertiary: var(--color-gray-500);
  --color-placeholder: var(--color-gray-500);
  --color-text-muted: var(--color-gray-500);

  /* semantic borders */
  --color-default: var(--color-gray-200);
  --color-subtle: var(--color-gray-75);
  --color-hover: var(--color-gray-300);
  --color-faint: var(--color-gray-300);

  /* semantic status */
  --color-accent: var(--color-green-500);
  --color-accent-subtle: var(--color-green-50);
  --color-accent-hover: var(--color-green-600);
  --color-success: var(--color-green-500);
  --color-success-subtle: var(--color-green-50);
  --color-warning: var(--color-amber-500);
  --color-warning-subtle: var(--color-amber-50);
  --color-warning-strong: var(--color-amber-700);
  --color-warning-border: var(--color-amber-200);
  --color-error: var(--color-red-500);
  --color-error-subtle: var(--color-red-50);
  --color-info: var(--color-blue-500);
  --color-info-subtle: var(--color-blue-50);

  /* chart */
  --chart-1: var(--color-accent);
  --chart-2: var(--color-gray-400);
  --chart-3: var(--color-blue-500);
  --chart-4: var(--color-amber-500);
  --chart-5: var(--color-gray-600);
  --chart-6: var(--color-gray-300);
  --chart-grid: var(--color-gray-100);
  --chart-axis: var(--color-gray-500);

  --duration-250: .25s;

  /* control heights */
  --height-input: 40px;
  --control-h-sm: 1.75rem;  /* 28px */
  --control-h-md: 2rem;     /* 32px */
  --control-h-lg: 2.25rem;  /* 36px */
  --control-h-xl: 2.5rem;   /* 40px */

  /* product type scale */
  --text-hero: 56px;
  --text-stat: 28px;
  --text-metric: 24px;
  --text-page: 20px;
  --text-section: 16px;
  --text-dialog: 15px;
  --text-ui: 14px;
  --text-body: 13px;
  --text-caption: 12px;
  --text-data: 11px;
  --text-label: 10px;

  --shadow-card: 0 1px 3px 0 #0000000a;
  --shadow-overlay: 0 4px 16px -4px #00000014;
}
```

### 1.3 Full token dump - rule 2 (easing overrides)

This rule appears after rule 1 and overrides `--ease-out`.

```css
:root {
  --ease-spring: cubic-bezier(.34,1.56,.64,1);
  --ease-smooth: cubic-bezier(.16,1,.3,1);
  --ease-out: cubic-bezier(.22,1,.36,1);
}
```

### 1.4 Full token dump - rule 3 (Learn / Academy / code themes)

```css
:root {
  --learn-accent: #0e9373;
  --learn-accent-light: #e4f6f2;
  --learn-accent-hover: #0b7a5e;
  --learn-bg-primary: #fafafa;
  --learn-bg-warm: #f8f7f5;
  --learn-bg-paper: #fff;
  --learn-text-primary: #18181b;
  --learn-text-secondary: #52525b;
  --learn-text-muted: #a1a1aa;
  --learn-border: #e4e4e7;
  --learn-border-subtle: #f4f4f5;
  --academy-bg: #fbfaf8;
  --academy-accent: #c2410c;
  --academy-accent-light: #fff7ed;
  --code-bg: #1e293b;
  --code-bg-light: #334155;
  --code-border: #475569;
  --code-text: #e2e8f0;
  --code-comment: #94a3b8;
  --code-keyword: #a5b4fc;
  --code-string: #86efac;
  --code-function: #93c5fd;
  --code-number: #fcd34d;
  --code-operator: #fca5a5;
}
```

### 1.5 Base html rule

```css
html, :host {
  text-size-adjust: 100%;
  tab-size: 4;
  line-height: 1.5;
  font-family: var(--default-font-family, ui-sans-serif, system-ui, sans-serif,
                "Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji");
  font-feature-settings: var(--default-font-feature-settings, normal);
  font-variation-settings: var(--default-font-variation-settings, normal);
  -webkit-tap-highlight-color: transparent;
}
```

### 1.6 Light theme and dark theme

There is no dark theme.

- A scan of every readable stylesheet for `@media (prefers-color-scheme: ...)` rules and for any rule whose condition text contains "dark" returned zero results.
- No `.dark` class rule and no `[data-theme]` rule exists.
- `document.documentElement` has only the attribute `lang="en"`. Its `class` is empty.
- `getComputedStyle(document.documentElement).colorScheme` is `normal`.
- The capture browser reported `matchMedia('(prefers-color-scheme: dark)').matches === true`, and the app still rendered the light palette. Confirmed by screenshot.

Conclusion: no token changes between light and dark. Build one theme only.

### 1.7 Fonts

`<link rel="preconnect">` to `https://fonts.googleapis.com` and `https://fonts.gstatic.com`.

Two `<link rel="stylesheet">` requests:

```
https://fonts.googleapis.com/css2?family=Inter:wght@350;400;450;500;550;600;700&family=Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,500&family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600&display=swap
https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap
```

`document.fonts` entries (family | weight | style | status at capture time on /dashboard):

| Family | Weights declared | Loaded at capture |
|---|---|---|
| Inter | 350, 400, 450, 500, 550, 600, 700 | 400, 500, 600 |
| Newsreader | 300, 400, 500, 600 | none |
| Source Serif 4 | 300, 400, 500 | none |
| JetBrains Mono | 400, 500, 600 | 400, 500, 600 |

The `@font-face` rules are inside cross-origin Google stylesheets and are not readable from the page.
Actual font file URLs: NOT OBSERVED.

The app UI uses only `--font-sans` (Inter) and `--font-mono` (JetBrains Mono).
`--font-serif` resolves to a system serif stack, not to Newsreader or Source Serif 4.
Where Newsreader and Source Serif 4 are applied: NOT OBSERVED.

### 1.8 z-index scale

Values found in the CSS and in inline classes:

| Value | Used by |
|---|---|
| `z-[1]` / `z-[2]` | sticky table cells inside a row |
| `z-10` | sticky column header cell (non-first) |
| `z-20` | sticky table header row, sticky first column header |
| `z-30` | desktop sidebar `<aside>` |
| `z-40` | tablet/mobile sticky `<header>`; "Connect your AI" popover |
| `z-[90]` | present on /citations. Owning element: NOT IDENTIFIED |
| `z-[100]` | Ask command palette root; overlay layer (`[data-overlay-layer]`) for drawers |
| `z-[101]` | right-side drawer panel (brand manager) |
| `z-[300]` | help tooltip (`role="tooltip"`) |
| `z-[9999]` | "Built for bigger screens" small-screen gate |
| `2147483001` / `2147483003` | Intercom lightweight app / launcher |

### 1.9 Radii, shadows, spacing in practice

- Radii used in the shell: `--radius-sm: 4px` (buttons, badges, cards, inputs, nav items), `--radius-md: 6px` (brand button, palette panel, popover), `50%` (Intercom launcher).
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-card`, `--shadow-overlay` as listed. Ad-hoc shadows observed:
  - Ask palette: `0 8px 28px -8px rgba(15,23,42,0.18)`
  - Connect-your-AI popover: `0 10px 34px -8px rgba(0,0,0,0.16)`
- Spacing base: `--spacing: .25rem` (Tailwind v4 scale). Page gutters are `px-8` (32px) at >= 640px and `px-4` (16px) below.

---

## 2. Typography in practice

Measured with `getComputedStyle` on live elements.

| Role | Sample copy | Font family | Size | Weight | Line height | Letter spacing | Colour |
|---|---|---|---|---|---|---|---|
| Page heading (`h1.text-page`) | "Actions" | Inter, system-ui, -apple-system, sans-serif | 16px | 600 | 24px | -0.32px | rgb(28,25,23) |
| Section heading (`h2` in empty state) | "Nothing planned yet" | Inter stack | 16px | 600 | 24px | -0.32px | rgb(28,25,23) |
| Table column header (`.section-label`) | "WORK" | Inter stack | 10px | 600 | 15px | 1.2px | rgb(120,113,108) |
| Table cell, primary (`.text-ui`) | "Deploy Service-Specific Schema" | Inter stack | 14px | 400 | 21px | normal | rgb(28,25,23) |
| Table cell, secondary (`.text-caption`) | "Technical" | Inter stack | 12px | 400 | 18px | normal | rgb(87,83,78) |
| KPI label | "VISIBILITY" | Inter stack | 10px | 600 | 15px | 0.5px | rgb(120,113,108) |
| KPI number | "10" | "JetBrains Mono","SF Mono",Menlo,Monaco,monospace | 22px | 600 | 22px | -0.55px | rgb(28,25,23) |
| KPI delta | "+0.8" | JetBrains Mono stack | 11px | 400 | 16.5px | normal | oklch(0.696 0.17 162.48) |
| KPI sublabel | "vs yesterday" | Inter stack | 9px | 400 | 13.5px | normal | rgb(120,113,108) |
| Body copy (empty state) | "A short plan appears here when new report or crawler data lands." | Inter stack | 13px | 400 | 21.125px | normal | rgb(87,83,78) |
| Caption / timestamp | "Updated 20m ago" | Inter stack | 11px | 400 | 16.5px | normal | rgb(168,162,158) |
| Button label (`.btn.btn-ghost.btn-sm`) | "New action" | Inter stack | 13px | 500 | 13px | normal | rgb(87,83,78) |
| Toolbar button label (bordered, `h-8`) | "Share" | Inter stack | 12px | 500 | 18px | normal | rgb(87,83,78) |
| Banner text | "Your Agent finds work..." | Inter stack | 13px | 400 | 19.5px | normal | oklab(0.591172 -0.112679 0.0199704 / 0.8) |
| Sidebar brand name | "Venture PR" | Inter stack | 13px | 600 | 19.5px | normal | rgb(28,25,23) |
| Dashboard page-header brand | "Venture PR" | Inter stack | 14px | 600 | 21px | normal | rgb(28,25,23) |
| Sidebar top-level item | "Actions" | Inter stack | 12px | 400 | 18px | normal | rgb(87,83,78) |
| Sidebar active item | "Dashboard" | Inter stack | 12px | 500 | 18px | normal | rgb(14,147,115) |
| Sidebar sub-item | "Prompts" | Inter stack | 11px | 400 | 16.5px | normal | rgb(87,83,78) |

Utility classes that set only the size:

```css
.text-hero    { font-size: var(--text-hero); }    /* 56px */
.text-stat    { font-size: var(--text-stat); }    /* 28px */
.text-metric  { font-size: var(--text-metric); }  /* 24px */
.text-section { font-size: var(--text-section); } /* 16px */
.text-dialog  { font-size: var(--text-dialog); }  /* 15px */
.text-ui      { font-size: var(--text-ui); }      /* 14px */
.text-body    { font-size: var(--text-body); }    /* 13px */
.text-caption { font-size: var(--text-caption); } /* 12px */
.text-data    { font-size: var(--text-data); }    /* 11px */
.text-label   { font-size: var(--text-label); }   /* 10px */
```

Warning for the implementer: `.text-page` is NOT a size utility. It sets a colour:

```css
.text-page { color: var(--color-page); }
```

The `h1` on /actions carries `class="text-page font-semibold text-primary tracking-tight truncate"` and computes to 16px, not 20px. The 20px `--text-page` token is not applied by that class.

The uppercase label style:

```css
.section-label {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-placeholder);
  font-size: 10px;
  font-weight: 600;
}
```

---

## 3. App shell

### 3.1 Shell root structure at >= 1024px (desktop)

```
DIV#root
  DIV
    DIV.min-h-screen bg-white overflow-x-clip
      DIV.hidden lg:block            <- wrapper for the fixed sidebar
        ASIDE[data-sidebar="true"][data-sidebar-mode="fixed"]
      MAIN.lg:pl-[200px] transition-all duration-300 ease-out overflow-x-clip
```

Measured at 1280 x 900:

| Element | x | y | width | height |
|---|---|---|---|---|
| `aside` | 0 | 0 | 200 | 900 |
| `main` padding-left | - | - | 200px | - |
| `main` content box | 200 | 0 | 1064.8 | full |

When the sidebar is collapsed, `main` becomes `lg:pl-[60px]` and `aside` becomes `w-[60px]`.
Both animate with `transition-all duration-300 ease-out`.

At < 1024px the sidebar wrapper computes `display: none` and a sticky `<header>` renders instead. See section 6.

### 3.2 Sidebar container

```html
<aside data-sidebar="true" data-sidebar-mode="fixed"
  class="fixed inset-y-0 left-0 w-[200px] z-30 bg-white border-r border-default
         flex flex-col transition-all duration-300 ease-out print:hidden">
```

- Width expanded: 200px. Width collapsed: 60px.
- Background `rgb(255,255,255)`.
- Right border: `0.8px solid rgb(231,229,228)` computed (the `border-r` utility resolves to a sub-pixel width at DPR 1.25; the authored value is `1px solid var(--color-default)`).
- `data-sidebar-mode` is `"fixed"` on desktop and `"embedded"` inside the tablet drawer.

### 3.3 Brand switcher (sidebar top)

```html
<div class="relative h-[56px] px-2.5 flex items-center border-b border-default"
     data-brand-selector="true">
  <button class="group flex-1 min-w-0 flex items-center gap-2.5 hover:bg-muted/50
                 rounded-md px-1.5 py-1.5 transition-colors duration-200">
    <div class="flex items-center justify-center flex-shrink-0 overflow-hidden rounded
                bg-muted/40 ring-1 ring-inset ring-black/[0.04]"
         style="width: 20px; height: 20px;">
      <img alt="" class="w-full h-full object-contain"
           src="https://www.google.com/s2/favicons?domain=venturepr.com&sz=64">
    </div>
    <span class="text-[13px] font-semibold text-primary truncate flex-1 text-left">Venture PR</span>
    <!-- lucide-plus, 14x14, stroke-width 1.5 -->
    <svg class="lucide lucide-plus text-muted opacity-0 group-hover:opacity-100
                transition-opacity duration-150 flex-shrink-0" ...>
  </button>
</div>
```

- Row rect: x 0, y 0, w 199.2, h 56. Padding `0 10px`.
- Button rect: x 10, y 11.6, w 179.2, h 32. Padding 6px. Radius 6px.
- Favicon square: 20 x 20, `rounded` (4px), inset ring `rgba(0,0,0,0.04)`.
- The `lucide-plus` icon is invisible until the row is hovered (`opacity-0 group-hover:opacity-100`).
- Behaviour observed: with a single brand on the account, clicking the button navigates to `/settings?tab=brands`. No dropdown menu appeared.
- Collapsed sidebar: the label and the plus icon are removed; the button becomes `w-full justify-center` and only the 20 x 20 favicon remains.

### 3.4 Ask button (sidebar, above the nav items)

```html
<button class="w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-[12px]
               text-secondary hover:text-primary hover:bg-muted/50
               transition-colors duration-150 mb-1 group"
        aria-label="Open Ask command">
  <span class="relative inline-flex items-center justify-center flex-shrink-0"
        style="width: 15px; height: 15px;">
    <span class="absolute rounded-full border border-accent"
          style="width:13px;height:13px;opacity:0.22;animation:5s ease-in-out 0s infinite normal none running ask-halo;"></span>
    <span class="rounded-full bg-accent"
          style="width:5px;height:5px;opacity:1;animation:5s ease-in-out 0s infinite normal none running ask-dot-breath;"></span>
  </span>
  <span class="flex-1 text-left tracking-[0.01em]">Ask</span>
  <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded
               font-mono tabular-nums leading-none text-[10px] bg-muted text-tertiary
               border border-default/60">&#8984;K</span>
</button>
```

Rect: x 8, y 68, w 183.2, h 34. Padding 8px. Radius 4px.

The two keyframes are injected as an inline `<style>` inside the `<nav>`:

```css
@keyframes ask-dot-breath {
  0%, 100% { opacity: 0.78; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.12); }
}
@keyframes ask-halo {
  0%, 100% { opacity: 0.18; transform: scale(1); }
  50%      { opacity: 0.34; transform: scale(1.08); }
}
```

Both run for 5s, `ease-in-out`, infinite.

### 3.5 Sidebar navigation - complete inventory

`<nav class="flex-1 px-2 py-3 overflow-y-auto">`, computed padding `12px 8px`.

Top-level items (order as rendered):

| Order | Label | href | Icon (lucide class) | Notes |
|---|---|---|---|---|
| 1 | "Ask" | none (button) | custom dot + halo | opens the command palette |
| 2 | "Dashboard" | `/dashboard` | `lucide-layout-grid` | |
| 3 | "Actions" | `/actions` | `lucide-play` | |
| - | divider `<div class="h-px bg-default -mx-2 my-3">` | - | - | |
| 4 | "Prompts" (group) | none (button) | `lucide-message-square-text` | collapsible |
| 5 | "Visibility" (group) | none (button) | `lucide-eye` | collapsible |
| 6 | "Traffic" (group) | none (button) | `lucide-chart-column` | collapsible |
| 7 | "Growth" (group) | none (button) | `lucide-trending-up` | collapsible |

Group children:

| Group | Item label | href | `title` attribute |
|---|---|---|---|
| Prompts | "Prompts" | `/prompts` | - |
| Prompts | "Research" | `/research` | - |
| Prompts | "Diagnose" | `/diagnose` | - |
| Visibility | "Pages" | `/pages` | - |
| Visibility | "Citations" | `/citations` | - |
| Visibility | "Competitors" | `/competitors` | - |
| Visibility | "Perception" | `/perception` | - |
| Traffic | "Visitors" | `/traffic/analytics` | "Humans arriving via AI recommendations" |
| Traffic | "Crawlers" | `/traffic/crawler` | "AI bots indexing your content" |
| Growth | "Content" | `/create` | - |
| Growth | "Site Optimization" | `/optimize` | - |
| Growth | "AI Pages" | `/ai-pages` | "Serve AI-optimized versions to crawlers" |
| Growth | "Reddit" | `/reddit` | - |
| Growth | "Automations" | `/automations` | - |

Footer items (below a `border-t border-default`, container `px-2 py-3 space-y-0.5`):

| Label | href | Icon |
|---|---|---|
| "Connect your AI" | none (button, `aria-label="Connect your AI"`, `aria-expanded`) | `lucide-cable` + `lucide-chevron-right` |
| "Integrations" | `/integrate` | `lucide-link` |
| "Settings" | `/settings` | `lucide-settings` |
| (icon only, `title="Help & Learn"`) | `/learn` | `lucide-circle-question-mark`, 13 x 13 |

All sidebar icons are 15 x 15, `stroke-width="1.5"`, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Chevrons are 12 x 12.

#### 3.5.1 Item state classes

Base (top-level link or group button):

```
w-full flex items-center gap-2.5 px-2 py-2 rounded-sm text-[12px]
transition-colors duration-150 group
```

| State | Extra classes | Computed |
|---|---|---|
| Default | `text-secondary hover:text-primary hover:bg-muted/50` | colour rgb(87,83,78), weight 400, bg transparent |
| Active (`aria-current="page"`) | `bg-accent-subtle font-medium text-accent` | colour rgb(14,147,115), weight 500, bg rgb(228,246,242) |
| Icon default | `text-muted group-hover:text-secondary` | rgb(120,113,108) |
| Icon active | `text-accent` | rgb(14,147,115) |

Sub-item base:

```
flex items-center px-2 py-1.5 rounded-sm text-[11px] transition-colors duration-150
focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20
```

Sub-item active adds `bg-accent-subtle font-medium text-accent active`.

Footer items use `px-2 py-1.5` (height 30) instead of `px-2 py-2` (height 34).

#### 3.5.2 Group expand / collapse

Panel wrapper:

```html
<div class="overflow-hidden transition-[max-height,opacity] duration-200 ease-out"
     style="max-height: 0px; opacity: 0;">
  <div class="ml-[17px] pl-3 border-l border-default mt-1 space-y-0.5"> ... </div>
</div>
```

Collapsed inline style: `max-height: 0px; opacity: 0;`.
Expanded inline style measured on the Visibility group (4 children): `max-height: 152px; opacity: 1;`.
The chevron carries `class="lucide lucide-chevron-right text-muted transition-all duration-200"` and is rotated when open.

Measured item rects at 1280 x 900, sidebar expanded, all groups collapsed:

| Item | x | y | w | h |
|---|---|---|---|---|
| Ask | 8 | 68 | 183.2 | 34 |
| Dashboard | 8 | 106 | 183.2 | 34 |
| Actions | 8 | 140 | 183.2 | 34 |
| Prompts (group) | 8 | 199 | 183.2 | 34 |
| Sub-item "Prompts" (expanded) | 37.8 | 237 | 153.4 | 28.5 |
| Collapse control | 169.2 | 751.2 | 22 | 22 |
| Connect your AI | 8 | 794 | 183.2 | 30 |
| Integrations | 8 | 826 | 183.2 | 30 |
| Settings | 8 | 858 | 154.2 | 30 |
| Learn (icon) | 166.2 | 860.5 | 25 | 25 |

### 3.6 Collapse control

Expanded state, right-aligned in a `px-2 pb-2 flex justify-end` row:

```html
<button class="p-1 rounded hover:bg-muted/50 transition-colors text-muted hover:text-secondary"
        title="Collapse sidebar">
  <!-- lucide-chevrons-left, 14x14 -->
</button>
```

Collapsed state, full width and centred:

```html
<button class="w-full flex items-center justify-center px-2 py-1.5 rounded-sm
               text-muted hover:text-secondary hover:bg-muted/50 transition-colors duration-150"
        title="Expand sidebar">
  <!-- lucide-chevrons-left rotate-180, 14x14 -->
</button>
```

### 3.7 Collapsed sidebar (60px)

- `aside` class becomes `... w-[60px] ...`; `main` becomes `lg:pl-[60px]`.
- Every nav row gains `justify-center` and the text `<span>` is removed from the DOM.
- The brand button becomes `w-full justify-center` and shows only the favicon.
- The persistence key was NOT identified. Only `trakkr.agent.threads-collapsed=0` matched a localStorage scan for `sidebar|collapse`.

### 3.8 "Connect your AI" popover

Trigger button gains `bg-accent-subtle font-medium text-accent` and `aria-expanded="true"` when open.

```html
<div data-ai-launcher-popover="true" role="dialog" aria-label="Connect your AI"
  class="absolute bottom-full left-0 mb-2 w-[340px] max-h-[72vh] overflow-y-auto
         bg-white border border-default rounded-md
         shadow-[0_10px_34px_-8px_rgba(0,0,0,0.16)] z-40
         origin-bottom-left transition-all duration-150 ease-out"
  style="opacity: 0; transform: scale(0.98) translateY(6px);">
```

Exact copy inside:

- Title: "Connect Trakkr to your AI" (13px, 600, `text-primary`, `leading-tight`)
- Subtitle: "Ask your data anything. Read-only, about 30 seconds." (11.5px, `text-muted`, `leading-snug`)
- Primary button: "Add Trakkr to Claude" - `h-10 px-4 rounded bg-accent-subtle text-accent text-[13px] font-medium hover:bg-accent hover:text-white active:scale-[0.99] transition-all`
- Helper: "Paste one URL into Claude, then approve. You're already signed in." (11px, `text-muted`)
- Row: "Using" + "Claude" + "Change" (11.5px, `text-secondary`)
- Footer: "More setup options" (11px, `text-muted`), on `border-t border-subtle bg-page/30`
- Leading icon chip: `w-7 h-7 rounded-md bg-accent-subtle`

Entry transition: `transition-all duration-150 ease-out` from `opacity 0, scale(0.98) translateY(6px)` to `opacity 1, none`.

### 3.9 Page header / toolbar patterns

Two distinct patterns exist.

#### Pattern A - dashboard identity bar (`/dashboard`)

```html
<div class="h-[56px] px-8 flex items-center border-b border-default print:hidden"
     style="opacity: 0; transform: translateY(-4px);">
  <div class="flex items-center justify-between w-full">
    <div class="flex items-center gap-3">
      <img alt="" class="w-5 h-5 rounded" src="...favicons?domain=venturepr.com&sz=64">
      <span class="text-[14px] font-semibold text-primary">Venture PR</span>
    </div>
    <div class="flex items-center gap-2 flex-shrink-0">
      <span class="tabular-nums select-none text-[11px] text-gray-400 cursor-default
                   hover:text-gray-500 transition-colors duration-250 mr-2">Data through Aug 6, 2026</span>
      <!-- three identical dropdown buttons -->
    </div>
  </div>
</div>
```

Right-side action buttons, exact class and copy:

```html
<button class="h-8 px-2.5 flex items-center gap-1.5 rounded border border-default
               text-secondary hover:bg-muted/50 text-[12px] font-medium
               transition-colors duration-150">
  <svg .../> Share <svg class="lucide lucide-chevron-down text-muted transition-transform duration-150" .../>
</button>
```

| Order | Label | Leading icon | Trailing icon |
|---|---|---|---|
| 1 | "Share" | `lucide-share2 lucide-share-2` (14 x 14, stroke 2) | `lucide-chevron-down` 14 x 14 |
| 2 | "Export" | `lucide-download` | `lucide-chevron-down` |
| 3 | "Reports" | `lucide-file-text` | `lucide-chevron-down` |

The header animates in from `opacity: 0; transform: translateY(-4px)`.

#### Pattern B - titled page header (`/actions`, `/competitors`, `/citations`)

```html
<div class="border-b border-default">
  <div class="px-8 py-5 flex items-center justify-between gap-6">
    <div class="min-w-0 flex items-center gap-3">
      <h1 class="text-page font-semibold text-primary tracking-tight truncate">Actions</h1>
      <span class="text-data text-muted truncate">
        <span class="tabular-nums select-none text-[11px] text-gray-400 cursor-default
                     hover:text-gray-500 transition-colors duration-250
                     hidden whitespace-nowrap sm:inline-flex">Updated 18m ago</span>
      </span>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <button class="btn btn-ghost btn-sm gap-1.5 px-2 sm:px-3"
              aria-label="New action" title="New action"> ... New action</button>
      <!-- Export -->
    </div>
  </div>
</div>
```

Computed padding: `20px 32px` at >= 640px, `20px 16px` at 375px.
The timestamp `<span>` is hidden below the `sm` breakpoint (`hidden sm:inline-flex`).

Observed page titles and their subtitle lines:

| Route | `h1` | Subtitle line | Right actions |
|---|---|---|---|
| `/dashboard` | (none; brand name instead) | "Data through Aug 6, 2026" | "Share", "Export", "Reports" |
| `/actions` | "Actions" | "Updated 18m ago" | "New action", "Export" |
| `/competitors` | "Competitors" | none | "Latest + 14-day his..." (date range), "Compare", "Export" |
| `/citations` | "Citations" | NOT RECORDED | NOT RECORDED |

### 3.10 Global banner

Observed on `/actions`. Container reserves height with `min-h-[41px]`.

```html
<div class="bg-accent-subtle/50 border-b border-accent/10 px-8 py-2.5
            flex items-center justify-between"
     style="opacity: 0; transform: translateY(-0.0703119px);">
  <div class="flex items-center gap-3">
    <svg class="lucide lucide-zap text-accent flex-shrink-0" width="14" height="14" .../>
    <span class="text-[13px] text-accent/80">Your Agent finds work, plans three for the week,
      and measures what ships. Every measured outcome appears in Results, including no movement.</span>
  </div>
  <button class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded
                 hover:bg-accent/10 transition-colors text-accent/40 hover:text-accent/60"
          aria-label="Dismiss" style="transition-duration: 120ms;">
    <svg class="lucide lucide-x" width="14" height="14" .../>
  </button>
</div>
```

Banner text colour computes to `oklab(0.591172 -0.112679 0.0199704 / 0.8)`.
The banner animates in on the `translateY` axis. Dismiss button transition duration is overridden to 120ms inline.

Other global banners referenced by module preloads but NOT OBSERVED rendering:
`PausedSubscriptionBanner`, `PausedBrandBanner`, `RefreshPaused`.

### 3.11 Toast

No toast element was present on `/dashboard`, `/actions`, `/competitors`, or `/citations` during the capture.
Queries for `[data-sonner-toaster]`, `#toast-root`, `[class*="toast"]`, and `[role="status"][aria-live]` returned nothing.
Toast markup and position: NOT OBSERVED.
Two toast-related keyframes exist in the stylesheet, so a toast component does exist:

```css
@keyframes toast-progress { 0% { width: 100%; } 100% { width: 0%; } }
```

---

## 4. Ask / Cmd+K command palette

Opened with `Ctrl+K`. The sidebar button `aria-label="Open Ask command"` opens the same panel.

### 4.1 Structure

```html
<div class="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-6"
     role="dialog" aria-modal="true" aria-label="Ask command">

  <div class="absolute inset-0 bg-gray-900/[0.08] backdrop-blur-[2px]" aria-hidden="true"></div>

  <div class="relative w-full max-w-[560px] bg-white rounded-md border border-default
              shadow-[0_8px_28px_-8px_rgba(15,23,42,0.18)] overflow-hidden">

    <!-- input row -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-subtle">
      <input placeholder="Ask anything about Venture PR…"
             class="flex-1 text-[14px] text-primary placeholder:text-muted outline-none bg-transparent"
             spellcheck="false" autocomplete="off"
             aria-label="Ask, search, or navigate" type="text" value="">
      <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded
                   font-mono tabular-nums leading-none text-[10px] bg-muted text-tertiary
                   border border-default/60">esc</span>
    </div>

    <!-- results -->
    <div class="max-h-[52vh] overflow-y-auto">
      <div class="px-4 pt-3 pb-1 flex items-center justify-between">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">For Venture PR · this week</span>
      </div>
      <div class="px-2 pb-2 pt-1"> ... four suggestion rows ... </div>
    </div>

    <!-- footer -->
    <div class="flex items-center justify-between gap-3 px-4 py-2 border-t border-subtle
                bg-page/40 text-[10px] text-muted"> ... </div>
  </div>
</div>
```

### 4.2 Placeholder and section header

- Input placeholder, verbatim: `Ask anything about Venture PR…` (uses a real ellipsis character U+2026).
- Section header, verbatim: `For Venture PR · this week` (middle dot U+00B7). Rendered uppercase by `uppercase`.
- Only one section was present. No "Navigate" or "Recent" section appeared with an empty query.

### 4.3 Suggestion rows

Row markup (selected row shown):

```html
<button type="button" data-ask-row-index="0"
        class="group w-full flex items-center text-left rounded transition-colors duration-100
               bg-accent-subtle/50">
  <span class="w-full flex items-center gap-3 px-2.5 py-2.5 text-[13px]">
    <svg class="lucide lucide-trending-up transition-colors text-accent" width="14" height="14" .../>
    <span class="flex-1 truncate text-secondary">why has our AI visibility moved this week?</span>
    <svg class="lucide lucide-corner-down-left text-muted" width="11" height="11" stroke-width="2" .../>
  </span>
</button>
```

Unselected rows use `hover:bg-accent-subtle/40` and their icon uses `text-muted`. They have no trailing return-arrow icon.

| Index | Copy (verbatim) | Icon |
|---|---|---|
| 0 | "why has our AI visibility moved this week?" | `lucide-trending-up` |
| 1 | "show me where competitors are outranking us" | `lucide-git-compare` |
| 2 | "start tracking a new prompt we should be ranking on" | `lucide-target` |
| 3 | "what AI bots are crawling our site this week?" | `lucide-radar` |

Rows are buttons, not links. No `href` exists, so the navigation target is not derivable from markup.
Where each suggestion links to: NOT OBSERVED (a query was not submitted).

### 4.4 Footer

Left group, three hint pairs. Each key uses the same key-cap span as the Ask button:

```
[⏎] open      [↑][↓] navigate      [esc] close
```

Right: a button, verbatim copy "Open workspace" with a trailing `lucide-arrow-up-right` (11 x 11). It is a `<button>` with no href; its target is NOT OBSERVED.

Panel rect: full-viewport root; the panel itself is `max-w-[560px]`, top offset `pt-[12vh]`.
Scrim: `bg-gray-900/[0.08]` with `backdrop-blur-[2px]`.
No enter/exit animation class was present on the panel at capture. Panel animation: NOT OBSERVED.

---

## 5. Shared components

### 5.1 Button variants (exact CSS)

```css
.btn {
  min-width: 0px;
  height: var(--control-h-lg);         /* 36px */
  white-space: nowrap;
  border-radius: var(--radius-sm);     /* 4px */
  transition: background-color .25s var(--ease-out),
              color .25s var(--ease-out),
              border-color .25s var(--ease-out);
  border: 1px solid rgba(0, 0, 0, 0);
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  padding: 0px 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  display: inline-flex;
}
.btn:focus-visible {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);
  outline: none;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary               { background-color: var(--color-accent-subtle); color: var(--color-accent); }
.btn-primary:hover:not(:disabled)  { background-color: var(--color-accent); color: var(--color-surface); }

.btn-secondary             { background-color: var(--color-surface); color: var(--color-secondary);
                             border: 1px solid var(--color-default); }
.btn-secondary:hover:not(:disabled){ background-color: var(--color-muted); color: var(--color-primary); }

.btn-ghost                 { color: var(--color-secondary); background-color: rgba(0,0,0,0); }
.btn-ghost:hover:not(:disabled)    { background-color: var(--color-muted); color: var(--color-primary); }

.btn-danger                { background-color: var(--color-surface); color: var(--color-error);
                             border-color: var(--color-default); }
.btn-danger:hover:not(:disabled)   { background-color: var(--color-error-subtle); color: var(--color-error);
                             border-color: var(--color-error); }

.btn-sm  { height: var(--control-h-sm); padding: 0px 0.625rem; font-size: 0.8125rem; }  /* 28px / 13px */
.btn-md  { height: var(--control-h-md); padding: 0px 0.75rem;  font-size: 0.8125rem; }  /* 32px */
.btn-lg  { height: var(--control-h-xl); padding: 0px 1.125rem; }                        /* 40px */

.btn-icon         { width: var(--control-h-lg); padding: 0px; }
.btn-icon.btn-sm  { width: var(--control-h-sm); }
.btn-icon.btn-md  { width: var(--control-h-md); }
.btn-icon.btn-lg  { width: var(--control-h-xl); }
```

The destructive variant is named `btn-danger`, not `btn-destructive`.

There is also a second, ad-hoc bordered button used in toolbars, written inline rather than as a `.btn`:

```
h-8 px-2.5 flex items-center gap-1.5 rounded border border-default
text-secondary hover:bg-muted/50 text-[12px] font-medium transition-colors duration-150
```

and a dropdown-trigger variant:

```
h-8 px-2.5 inline-flex items-center gap-1.5 rounded border text-[12px] font-medium
whitespace-nowrap transition-colors duration-200 max-w-[180px]
border-default text-secondary hover:text-primary hover:border-hover hover:bg-muted
```

and a square icon button:

```
focus-ring h-8 w-8 inline-flex items-center justify-center rounded border border-default
text-secondary transition-colors duration-200 hover:border-hover hover:bg-muted hover:text-primary
```

### 5.2 Card

```css
.card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-default);
  border-radius: var(--radius-sm);
}
.card-hover {
  background-color: var(--color-surface);
  border: 1px solid var(--color-default);
  border-radius: var(--radius-sm);
  transition: border-color .25s var(--ease-out), box-shadow .25s var(--ease-out);
}
.card-hover:hover { border-color: var(--color-hover); box-shadow: var(--shadow-card); }
```

### 5.3 Badge / pill variants

```css
.badge {
  border-radius: var(--radius-sm);
  align-items: center;
  gap: 0.25rem;
  padding: 0.0625rem 0.375rem;   /* 1px 6px */
  font-size: 0.6875rem;          /* 11px */
  font-weight: 500;
  line-height: 1.45;
  display: inline-flex;
}
.badge-neutral { color: var(--color-secondary); box-shadow: inset 0 0 0 1px var(--color-default);
                 background-color: rgba(0,0,0,0); }
.badge-accent  { background-color: var(--color-accent-subtle);  color: var(--color-accent); }
.badge-success { background-color: var(--color-success-subtle); color: var(--color-success); }
.badge-warning { background-color: var(--color-warning-subtle); color: var(--color-warning); }
.badge-error   { background-color: var(--color-error-subtle);   color: var(--color-error); }
.badge-info    { background-color: var(--color-info-subtle);    color: var(--color-info); }

.badge-pop { animation: 0.4s cubic-bezier(0.34,1.56,0.64,1) 0s 1 normal forwards running badge-pop; }
@keyframes badge-pop {
  0%   { opacity: 0; transform: scale(0) rotate(-12deg); }
  50%  { transform: scale(1.2) rotate(6deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
```

Resolved colours: accent `#0e9373` on `#e4f6f2`; success identical; warning `#f59e0b` on `#fffbeb`; error `#ef4444` on `#fef2f2`; info `#3b82f6` on `#eff6ff`.

A separate count-pill is used inside tab bars and segmented filters (inline classes, not `.badge`):

```
inline-flex min-w-5 items-center justify-center rounded px-1.5 py-0.5
font-mono text-label tabular-nums
```

with `bg-accent-subtle text-accent` when active and `bg-muted text-tertiary` when inactive.
In the segmented filter the padding is `px-1 py-0.5` and the inactive pill uses `bg-muted/70 text-tertiary`.

### 5.4 Focus ring

```css
.focus-ring:focus-visible {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);
  outline: none;
}
```

### 5.5 Form controls (`ctrl-*` family)

```css
.ctrl-field       { gap: 0.375rem; min-width: 0; display: grid; }
.ctrl-label-row   { justify-content: space-between; align-items: baseline; gap: 0.75rem; display: flex; }
.ctrl-label       { color: var(--color-secondary); font-size: 0.75rem; font-weight: 500; line-height: 1.4; }
.ctrl-necessity   { color: var(--color-tertiary); flex-shrink: 0; font-size: 0.6875rem; font-weight: 400; }
.ctrl-help, .ctrl-message { color: var(--color-tertiary); align-items: flex-start; gap: 0.375rem;
                            font-size: 0.75rem; line-height: 1.45; display: flex; }

.ctrl-shell {
  width: 100%; height: var(--control-h-xl);       /* 40px */
  color: var(--color-primary); background: var(--color-surface);
  border: 1px solid var(--color-default); border-radius: var(--radius-sm);
  transition: border-color .25s var(--ease-out), box-shadow .25s var(--ease-out);
  align-items: center; display: flex; overflow: hidden;
}
.ctrl-shell:hover:not([data-disabled="true"]) { border-color: var(--color-hover); }
.ctrl-shell:focus-within, .ctrl-shell[data-open="true"] {
  border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-subtle);
}

.ctrl-input, .ctrl-select { min-width: 0; height: 100%; color: inherit; font: inherit;
  background: 0 0; border: 0; outline: 0; flex: 1 1 0%; padding: 0 0.75rem; font-size: 0.875rem; }
.ctrl-input::placeholder { color: var(--color-placeholder); }
.ctrl-input:disabled, .ctrl-select:disabled { cursor: not-allowed; }
.ctrl-input:read-only { cursor: text; }
.ctrl-select { appearance: none; cursor: pointer; padding-right: 0.25rem; }

.ctrl-slot { height: 100%; color: var(--color-tertiary); flex-shrink: 0;
  justify-content: center; align-items: center; font-size: 0.8125rem; display: inline-flex; }

.ctrl-inline-action { width: 1.75rem; height: 1.75rem; color: var(--color-tertiary);
  border-radius: var(--radius-sm);
  transition: color .2s var(--ease-out), background-color .2s var(--ease-out);
  justify-content: center; align-items: center; margin-right: 0.25rem; display: inline-flex; }
.ctrl-inline-action:hover { color: var(--color-primary); background: var(--color-muted); }
.ctrl-inline-action:focus-visible { box-shadow: 0 0 0 2px var(--color-accent); outline: none; }

.ctrl-textarea { width: 100%; min-height: 6.5rem; color: var(--color-primary);
  background: var(--color-surface); border: 1px solid var(--color-default);
  border-radius: var(--radius-sm); font: inherit; resize: vertical;
  transition: border-color .25s var(--ease-out), box-shadow .25s var(--ease-out);
  outline: 0; padding: 0.75rem; font-size: 0.875rem; line-height: 1.5; }
.ctrl-textarea:hover:not(:disabled) { border-color: var(--color-hover); }
.ctrl-textarea:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-subtle); }
.ctrl-textarea:disabled { cursor: not-allowed; opacity: 0.6; }
.ctrl-textarea:read-only { border-color: var(--color-subtle); box-shadow: inset 3px 0 0 var(--color-subtle); }

.ctrl-choice { min-width: 0; min-height: 1.5rem; color: var(--color-primary); cursor: pointer;
  align-items: flex-start; gap: 0.625rem; display: inline-flex; }
.ctrl-choice-mark { width: 1rem; height: 1rem; color: var(--color-surface);
  background: var(--color-surface); border: 1px solid var(--color-default);
  border-radius: var(--radius-sm);
  transition: background-color .2s var(--ease-out), border-color .2s var(--ease-out),
              box-shadow .2s var(--ease-out);
  flex: 0 0 auto; justify-content: center; align-items: center; margin-top: 0.125rem;
  display: inline-flex; position: relative; }
.ctrl-choice input:checked + .ctrl-choice-mark { background: var(--color-accent);
  border-color: var(--color-accent); }
.ctrl-choice input:focus-visible + .ctrl-choice-mark {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent); }
.ctrl-choice-copy        { gap: 0.125rem; min-width: 0; display: grid; }
.ctrl-choice-label       { color: var(--color-primary); font-size: 0.8125rem; font-weight: 500; line-height: 1.4; }
.ctrl-choice-description { color: var(--color-tertiary); font-size: 0.75rem; line-height: 1.45; }

.ctrl-switch-track { background: var(--color-hover); width: 2.25rem; height: 1.25rem;
  transition: background-color .2s var(--ease-out), box-shadow .2s var(--ease-out);
  border-radius: 999px; flex: 0 0 auto; align-items: center; margin-top: 0.125rem;
  display: inline-flex; position: relative; }
.ctrl-switch-thumb { background: var(--color-surface); width: 1rem; height: 1rem;
  transition: transform .2s var(--ease-out); border-radius: 999px; margin-left: 0.125rem;
  box-shadow: rgba(0,0,0,0.14) 0 1px 2px; }
.ctrl-choice input:checked + .ctrl-switch-track { background: var(--color-accent); }
.ctrl-choice input:checked + .ctrl-switch-track .ctrl-switch-thumb { transform: translate(1rem); }
.ctrl-choice input:checked + .ctrl-switch-track[data-size="sm"] .ctrl-switch-thumb { transform: translate(0.75rem); }
.ctrl-choice input:focus-visible + .ctrl-switch-track {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent); }

.ctrl-segmented { min-height: var(--control-h-xl); background: var(--color-muted);
  border: 1px solid var(--color-default); border-radius: var(--radius-sm);
  grid-auto-columns: minmax(0px, 1fr); grid-auto-flow: column; gap: 0.25rem;
  padding: 0.1875rem; display: grid; }
.ctrl-segment { min-width: 0; color: var(--color-secondary);
  border-radius: calc(var(--radius-sm) - 1px);
  transition: color .2s var(--ease-out), background-color .2s var(--ease-out), border-color .2s var(--ease-out);
  background: 0 0; border: 1px solid rgba(0,0,0,0); padding-inline: 0.625rem;
  font-size: 0.75rem; font-weight: 500; line-height: 1; }
.ctrl-segment:hover { color: var(--color-primary); }
.ctrl-segment:focus-visible { box-shadow: 0 0 0 2px var(--color-accent); outline: none; }

.ctrl-fieldset      { border: 0; min-width: 0; padding: 0; }
.ctrl-fieldset-grid { gap: 1rem; margin-top: 0.75rem; display: grid; }
```

Search input in a table toolbar uses `data-size="compact"` on `.ctrl-shell`. The compact height was not exposed as a separate rule in the readable CSS; the rendered control height is 32px.

### 5.6 Key cap

Two key-cap styles exist.

CSS class (used outside the palette):

```css
.kbd {
  min-width: 1.25rem; height: 1.25rem;
  font-family: var(--font-mono); color: var(--color-tertiary);
  background: var(--color-surface); border: 1px solid var(--color-default);
  border-radius: var(--radius-sm); box-shadow: 0 1px 0 var(--color-default);
  justify-content: center; align-items: center;
  padding: 0 0.3125rem; font-size: 0.6875rem; line-height: 1; display: inline-flex;
}
```

Inline variant (sidebar Ask button and the palette):

```
inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded
font-mono tabular-nums leading-none text-[10px] bg-muted text-tertiary border border-default/60
```

### 5.7 Data table

There is no `<table>` element in the app shell. Two grid-based table implementations were observed.

#### 5.7.1 `InstrumentTable` (used on /actions)

Container: `<div role="table" class="focus-ring overflow-auto bg-surface outline-none" tabindex="0" aria-rowcount="8">`.

Header row:

```html
<div role="row"
     class="sticky top-0 z-20 grid h-10 items-center gap-3 border-b border-default bg-surface px-8"
     style="grid-template-columns: 20px minmax(220px, 2fr) minmax(200px, 2fr) 80px;">
  <div role="columnheader" class="sticky left-0 z-20 flex min-w-0 items-center bg-surface">
    <label class="ctrl-choice" data-standalone="true">
      <input aria-label="Select all rows" class="sr-only" type="checkbox">
      <span class="ctrl-choice-mark" aria-hidden="true"><svg class="lucide lucide-check"
        width="11" height="11" stroke-width="2.25" .../></span>
    </label>
  </div>
  <div role="columnheader" class="min-w-0 sticky z-10 bg-surface" style="left: 32px;">
    <span class="section-label inline-flex items-center gap-1 transition-colors duration-200">Work</span>
  </div>
  <div role="columnheader" class="min-w-0">
    <span class="section-label inline-flex items-center gap-1 transition-colors duration-200">Why now</span>
  </div>
  <div role="columnheader" class="min-w-0 text-right"><span class="section-label ..."></span></div>
</div>
```

Body row:

```html
<div role="row" aria-rowindex="1" aria-selected="false" data-index="0"
     class="group relative grid items-center gap-3 border-b border-subtle cursor-pointer px-8
            transition-[background-color,transform,box-shadow] duration-200
            hover:-translate-y-[0.5px] hover:bg-muted/30 hover:shadow-sm"
     style="grid-template-columns: 20px minmax(220px, 2fr) minmax(200px, 2fr) 80px; height: 48px;">
```

- Header row height 40px. Body row height 48px (set inline; the density control changes it).
- Header column labels render uppercase through `.section-label`. Verbatim labels: "Work", "Why now", plus one empty column.
- First column is a select-all checkbox, sticky at `left: 0`. Second column sticky at `left: 32px`.
- Row hover raises the row by 0.5px and adds `shadow-sm`.
- The row action button: `rounded px-2 py-1 text-caption font-medium text-secondary transition-colors group-hover:bg-accent-subtle group-hover:text-accent hover:bg-accent-subtle hover:text-accent`, copy "Open".
- Rows are wrapped one-per-`<div>`, consistent with a virtualised list. No pagination control was present. The row count is shown as a static counter, not as pages.

#### 5.7.2 Competitors table (sortable headers)

Header container:

```html
<div class="grid grid-cols-[32px_1fr_64px_80px_64px_80px_80px_32px] items-center gap-4
            h-10 px-8 bg-surface border-b border-default">
```

Sortable header button:

```html
<button class="group inline-flex items-center gap-1 text-[10px] font-medium uppercase
               tracking-wider transition-colors duration-150 text-muted hover:text-secondary
               justify-end w-full">
  <span>Mentions</span>
  <span class="inline-flex w-3 h-3 items-center justify-center">
    <svg class="lucide lucide-arrow-up-down opacity-0 group-hover:opacity-50
                transition-opacity duration-150" width="10" height="10" stroke-width="1.5" .../>
  </span>
</button>
```

Active sort column:

```html
<button class="group inline-flex items-center gap-1 text-[10px] font-medium uppercase
               tracking-wider transition-colors duration-150 text-primary">
  <span>#</span>
  <span class="inline-flex w-3 h-3 items-center justify-center">
    <svg class="lucide lucide-chevron-up" width="12" height="12" stroke-width="2" .../>
  </span>
</button>
```

Non-sortable header: `<span class="text-[10px] font-medium uppercase tracking-wider text-muted">Competitor</span>`.

Column labels, verbatim and in order: "#", "Competitor", "Mentions", "Visibility", "Trend", "H2H", "Win Rate", plus a 32px trailing column.

Sort affordance rules:
- Inactive sortable column: 10 x 10 `lucide-arrow-up-down`, `opacity-0`, becomes `opacity-50` on hover of the button group.
- Active sortable column: 12 x 12 `lucide-chevron-up` (or presumably `chevron-down`), always visible, label colour `text-primary`.

### 5.8 Table toolbar (filters, count, density)

Observed on /actions, `#desk-found`:

```html
<div class="flex-shrink-0 min-h-12 px-4 py-2 sm:px-8 border-b border-default
            flex flex-wrap items-center gap-x-4 gap-y-2">

  <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 basis-[28rem]">

    <div class="relative min-w-40 max-w-full flex-shrink w-64">
      <div class="ctrl-shell" data-size="compact">
        <span class="ctrl-slot" data-side="start"><svg class="lucide lucide-search" width="14" height="14" .../></span>
        <input placeholder="Search work" aria-label="Search work" role="searchbox" class="ctrl-input" type="text">
      </div>
    </div>

    <button aria-haspopup="menu" aria-expanded="false" type="button">
      <span class="h-8 px-2.5 inline-flex items-center gap-1.5 rounded border text-[12px] font-medium
                   whitespace-nowrap transition-colors duration-200 max-w-[180px]
                   border-default text-secondary hover:text-primary hover:border-hover hover:bg-muted"
            title="Which work to show">
        <span class="truncate">Open</span>
        <svg class="lucide lucide-chevron-down flex-shrink-0 opacity-50" width="12" height="12" .../>
      </span>
    </button>

    <button type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Filter by type">
      <span class="h-8 px-2.5 inline-flex items-center gap-1.5 rounded border ...">
        <svg class="lucide lucide-list-filter shrink-0 text-muted" width="13" height="13" .../>
        <span class="truncate">Type</span>
        <svg class="lucide lucide-chevron-down flex-shrink-0 opacity-50" width="12" height="12" .../>
      </span>
    </button>
  </div>

  <div class="ml-auto flex max-w-full flex-shrink-0 flex-wrap items-center justify-end gap-2">
    <button type="button" class="btn btn-ghost btn-sm gap-1.5">
      <svg class="lucide lucide-brain" width="13" height="13" .../>Learning</button>
    <span class="text-[11px] text-muted tabular-nums whitespace-nowrap">8 of 8</span>
    <button type="button" class="focus-ring h-8 w-8 inline-flex items-center justify-center rounded
            border border-default text-secondary transition-colors duration-200
            hover:border-hover hover:bg-muted hover:text-primary"
            title="Columns and density" aria-haspopup="dialog" aria-expanded="false"
            aria-label="Columns and density">
      <svg class="lucide lucide-columns3 lucide-columns-3" width="14" height="14" .../>
    </button>
  </div>
</div>
```

- Search placeholder, verbatim: "Search work".
- Filter chip copy, verbatim: "Open" (`title="Which work to show"`) and "Type".
- Count copy format: "8 of 8" (11px, `text-muted`, tabular numerals).
- Density and column control: one 32 x 32 icon button, `title="Columns and density"`, `aria-haspopup="dialog"`. Its panel contents: NOT OBSERVED.
- Toolbar padding: `8px 32px` at >= 640px, `8px 16px` at 375px. Minimum height 48px.
- There is no pagination control. The list is virtualised inside an `overflow-auto` container.

### 5.9 KPI tile

Dashboard KPI strip: 6 equal tiles in a `flex` row, each `flex-1 border-r border-default` (last tile has no right border), on a `border-b border-default` container.

```html
<div class="flex-1 border-r border-default" style="opacity: 0; transform: translateY(8px);">
  <a class="block px-5 py-5 hover:bg-muted/50 transition-colors group h-full" href="/reports">
    <div class="flex items-center gap-1.5 mb-2">
      <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">Visibility</span>
      <div class="inline-block">
        <button class="inline-flex items-center justify-center min-w-[28px] min-h-[28px] -m-2
                       text-gray-400 hover:text-gray-600 transition-colors cursor-help"
                aria-label="Help: Visibility score">
          <svg class="lucide lucide-info" width="12" height="12" stroke-width="1.5" .../>
        </button>
      </div>
    </div>
    <div class="flex items-baseline gap-1.5">
      <span class="text-[22px] font-semibold font-mono tabular-nums tracking-tight leading-none text-primary">
        <span>10</span></span>
      <span class="text-[11px] font-mono tabular-nums text-emerald-500" style="opacity: 0;">+0.8</span>
    </div>
    <span class="text-[9px] text-tertiary mt-1 block">vs yesterday</span>
  </a>
</div>
```

Tile rect measured: x 200, y 64, w 176.8, h 113. Padding 20px. Tiles animate in from `opacity 0, translateY(8px)`.

Complete tile inventory on /dashboard:

| Label | Value | Delta | Sublabel | Links to | Help `aria-label` |
|---|---|---|---|---|---|
| "Visibility" | "10" | "+0.8" (emerald-500) | "vs yesterday" | `/reports` | "Help: Visibility score" |
| "Mentions" | "28" | none | "last 7 days" | `/prompts` | "Help: Total mentions" |
| "Rank" | "#80" + "of 554" (13px, `text-tertiary`) | none | "this week" | `/competitors` | "Help: Competitive rank" |
| "Citations" | "408" | none | "this week" | `/citations` | "Help: Citation count" |
| "AI Traffic" | "--" (`text-gray-200`) | none | "Connect GA" (link-styled, `hover:text-accent`) | `/traffic/analytics` | "Help: AI traffic" |
| "Conversations" | "--" (`text-gray-200`) | none | "Connect AI Crawlers" | `/traffic/crawler` | "Help: Conversations" |

A second, larger KPI tile style is used on /competitors (`HeroStatRow`), 5 columns, `grid-template-columns: repeat(5, minmax(0px,1fr))`:

```html
<div class="relative flex h-full w-full flex-col justify-start overflow-hidden px-8 py-5">
  <div class="flex items-center gap-1.5 mb-2">
    <p class="section-label truncate">Your rank</p>
    <svg class="lucide lucide-info hover:text-muted transition-colors cursor-help text-muted/40"
         width="11" height="11" .../>
  </div>
  <div class="flex items-baseline gap-3">
    <div class="flex min-w-0 items-baseline gap-2">
      <p class="font-semibold tracking-tight leading-none text-primary text-[28px]">#80
        <span class="ml-0.5 font-normal text-tertiary text-[14px]"> / 443</span></p>
    </div>
  </div>
</div>
```

Value sizes seen: `text-[28px]` for the lead stat, `text-[24px]` for the others.
Delta chip: `font-mono tabular-nums leading-none whitespace-nowrap text-[11px] text-success`, copy "+0.8 pts".
Labels observed: "Your rank", "Visibility", "Win rate" (two more not captured).
Note: this tile uses Inter, not the mono font, for the number. The dashboard KPI uses mono.

### 5.10 Empty state

```html
<div class="border-y border-default bg-surface px-8 py-10">
  <section aria-labelledby="state-title-_r_u_"
           data-state-kind="initial-empty" data-state-scope="section"
           data-state-preserves-chrome="true"
           class="flex w-full flex-col items-center justify-center text-center
                  min-h-[220px] px-5 py-10 sm:px-8">
    <div class="w-full max-w-[560px]">
      <div class="mx-auto flex items-center justify-center rounded mb-4 h-10 w-10 bg-accent-subtle"
           aria-hidden="true">
        <svg class="lucide lucide-inbox text-accent" width="18" height="18" stroke-width="1.5" .../>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2 id="state-title-_r_u_" class="font-semibold tracking-tight text-primary text-[16px]">
          Nothing planned yet</h2>
        <div class="mx-auto mt-1 max-w-[52ch] text-[13px] leading-relaxed text-secondary">
          A short plan appears here when new report or crawler data lands. Everything found so far is below.</div>
      </div>
    </div>
  </section>
</div>
```

Contract: `data-state-kind` (observed value `"initial-empty"`), `data-state-scope` (`"section"`), `data-state-preserves-chrome` (`"true"`).
Icon chip: 40 x 40, `rounded` (4px), `bg-accent-subtle`, icon 18 x 18 in `text-accent`.
Body copy is limited to `max-w-[52ch]`.

### 5.11 Loading skeleton

Skeleton blocks were visible in a screenshot of /competitors during load (light grey bars in the KPI strip and the table rows), but the DOM had already swapped by the time the query ran. Their exact markup: NOT OBSERVED.

The shimmer utility exists in the stylesheet:

```css
.skeleton-shimmer { position: relative; overflow: hidden; }
.skeleton-shimmer::after {
  content: "";
  background: linear-gradient(90deg, rgba(0,0,0,0), rgba(255,255,255,0.5), rgba(0,0,0,0));
  animation: 1.5s ease-in-out 0s infinite normal none running shimmer;
  position: absolute; inset: 0;
}
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
```

Note: `.skeleton-shimmer::after` animates `shimmer`, which moves `background-position`, but the `::after` uses a `linear-gradient` without a `background-size` above 100%. Reproduce as written.

### 5.12 Tab bars - two distinct styles

Both are `role="tablist"` with `data-navigation-overflow="true"` and the container class:

```
flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
```

#### Style 1 - primary section tabs (h-11)

Used for: `aria-label="Work status"` (/actions), `"Competitor analysis sections"` (/competitors), `"Citation sections"` (/citations).

```html
<button role="tab" aria-selected="true" tabindex="0"
  class="focus-ring relative -mb-px inline-flex shrink-0 items-center whitespace-nowrap rounded
         font-medium transition-colors h-11 gap-1.5 px-4 text-ui text-accent
         disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50">
  <svg class="lucide lucide-calendar-check" width="14" height="14" stroke-width="1.5" .../>
  <span>This week</span>
  <span class="inline-flex min-w-5 items-center justify-center rounded px-1.5 py-0.5
               font-mono text-label tabular-nums bg-accent-subtle text-accent">50</span>
  <span aria-hidden="true"
        class="absolute bottom-0 h-0.5 bg-accent motion-reduce:transition-none inset-x-0"></span>
</button>
```

Inactive: replace `text-accent` with `text-tertiary hover:bg-muted/40 hover:text-secondary`, drop the underline span, and set the count pill to `bg-muted text-tertiary`. `tabindex="-1"`.

Height 44px, horizontal padding 16px, font `--text-ui` (14px), weight 500. Underline is 2px, `bg-accent`, spans the full button width (`inset-x-0`). Each tab has a leading 14 x 14 lucide icon.

Observed tab sets:

| Tablist `aria-label` | Tabs (verbatim) | Icons |
|---|---|---|
| "Work status" | "This week", "Results" | `lucide-calendar-check`, `lucide-badge-check` |
| "Competitor analysis sections" | "Competitors" (50), "Prompts" (23), "Matrix" | `lucide-users`, `lucide-file-text`, `lucide-grid3x3 lucide-grid-3x3` |
| "Citation sections" | "Sources", "Queries", "Videos", "Outreach" | (icons present, classes not recorded) |

#### Style 2 - secondary sub-tabs (h-10)

Used for `aria-label="Citation source views"`. Container adds `mb-1.5`.

```html
<button role="tab" aria-selected="true" tabindex="0"
  class="focus-ring relative -mb-px inline-flex shrink-0 items-center whitespace-nowrap rounded
         font-medium transition-colors h-10 gap-1.5 px-3 text-data text-primary
         disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50">
  <span>Domains</span>
  <span aria-hidden="true"
        class="absolute bottom-0 h-0.5 bg-accent motion-reduce:transition-none inset-x-2"></span>
</button>
```

Inactive: `text-tertiary hover:bg-muted/40 hover:text-secondary`.

Differences from style 1: height 40px, padding 12px, font `--text-data` (11px), active colour is `text-primary` (not accent), underline is inset by 8px on each side (`inset-x-2`), no icons, no count pills.

Tabs, verbatim: "Domains", "Pages", "Feed".

Panels for both styles: `role="tabpanel"`, `aria-labelledby` matching the tab id, `tabindex="0"`, `class="focus-ring ..."` and, on /actions, `animate-in fade-in duration-200`.

### 5.13 Segmented "All / Threats / Rising" filter

Container:

```html
<div class="relative flex h-11 min-w-0 flex-shrink-0 items-center gap-1 overflow-x-auto
            border-b border-default px-4 [scrollbar-width:none] sm:px-8
            [&::-webkit-scrollbar]:hidden">
```

Active segment:

```html
<button type="button" aria-label="All" aria-pressed="true"
  class="focus-ring flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap
         rounded px-2 text-caption transition-colors font-medium text-primary">
  <span>All</span>
  <span class="inline-flex min-w-5 items-center justify-center rounded px-1 py-0.5
               font-mono text-label font-medium tabular-nums transition-colors
               bg-accent-subtle text-accent"><span>50</span></span>
</button>
```

Inactive segment: `text-tertiary hover:text-secondary hover:bg-muted/40` (no `font-medium`), count pill `bg-muted/70 text-tertiary`, `aria-pressed="false"`.

- Uses `aria-pressed` on plain buttons, not `role="tab"`.
- Segment height 28px, padding 8px, font `--text-caption` (12px).
- Strip height 44px, bottom border, gutters `px-4` / `sm:px-8`.
- Each segment is wrapped in a `<div>` with an entry animation from `opacity 0, translateY(8px)`.
- Observed items and counts: "All" 50, "Threats" 20, "Rising" 30.
- This is NOT the `.ctrl-segmented` component. `.ctrl-segmented` is a separate pill-in-a-tray control (see 5.5).

### 5.14 Help tooltip / popover

Trigger, on every dashboard KPI:

```html
<button class="inline-flex items-center justify-center min-w-[28px] min-h-[28px] -m-2
               text-gray-400 hover:text-gray-600 transition-colors cursor-help"
        aria-label="Help: Visibility score">
  <svg class="lucide lucide-info" width="12" height="12" stroke-width="1.5" .../>
</button>
```

Opens on hover (`mouseenter`). Full panel:

```html
<div class="fixed z-[300] px-3 py-2 max-w-[280px] bg-white text-gray-900 rounded
            border border-gray-200 shadow-sm"
     role="tooltip" style="left: 154.962px; top: 122px; opacity: 1; transform: none;">
  <div class="text-[12px] leading-relaxed">
    <div class="min-w-[200px]">
      <p class="font-medium text-gray-900 mb-1">Visibility score</p>
      <p class="text-[11px] text-gray-600 leading-relaxed">How prominently AI models mention your brand
        when answering relevant questions. Higher-ranked mentions earn more points.</p>
      <p class="text-[10px] font-mono text-gray-400 mt-1.5 bg-gray-50 px-2 py-1 rounded
                border border-gray-100">100 × √(position points ÷ (successful responses × 10))</p>
      <p class="text-[10px] text-gray-400 mt-1.5 font-medium">Good: 40+ · Excellent: 60+</p>
    </div>
  </div>
  <a class="inline-flex items-center gap-1 mt-2 text-[11px] text-accent hover:text-[#0b7a5e]
            font-medium transition-colors" href="/learn/docs/concepts#visibility">
    Learn more<svg class="lucide lucide-arrow-right" width="10" height="10" stroke-width="2" .../></a>
  <div class="absolute w-2 h-2 bg-white border-gray-200 border-t border-l top-0 left-1/2
              -translate-x-1/2 -translate-y-1/2 rotate-45"></div>
</div>
```

Measured: width 280px, height 191.475px, position `fixed`, `z-index: 300`, radius 4px, border `0.8px solid rgb(231,229,228)`, box-shadow `rgba(0,0,0,0.04) 0 1px 2px`, `transition: all`, `animation: none`.

Arrow: 8 x 8 square, white, top and left borders only, rotated 45deg, centred on the top edge.

Verbatim copy of this tooltip:
- Title: "Visibility score"
- Body: "How prominently AI models mention your brand when answering relevant questions. Higher-ranked mentions earn more points."
- Formula (mono, 10px, on `bg-gray-50`): "100 × √(position points ÷ (successful responses × 10))"
- Footer: "Good: 40+ · Excellent: 60+"
- Link: "Learn more" -> `/learn/docs/concepts#visibility`

The other five KPI help buttons use the same component. Their copy: NOT RECORDED.

A lighter tooltip trigger variant is used in the /competitors hero stats: a bare `svg` with
`class="lucide lucide-info hover:text-muted transition-colors cursor-help text-muted/40"`, 11 x 11.

### 5.15 Drawer / overlay shell

Overlay layer and panel, from the tablet navigation drawer:

```html
<div data-overlay-layer="true" class="fixed inset-0 z-[100] pointer-events-none">
  <div aria-hidden="true" class="absolute inset-0 bg-black/20 pointer-events-auto"
       style="opacity: 0;"></div>
  <div role="dialog" aria-modal="true" aria-label="Application navigation" tabindex="-1"
       data-overlay-panel="true" data-modal-content="true"
       class="pointer-events-auto outline-none fixed inset-y-0 left-0 flex w-[280px]
              max-w-[calc(100vw-48px)] flex-col overflow-hidden border-r border-default
              bg-white shadow-[var(--shadow-overlay)]"
       style="transform: translateX(-100%);">
    <div id="tablet-app-navigation" class="min-h-0 flex-1">
      <aside data-sidebar="true" data-sidebar-mode="embedded"
             class="relative h-full w-full [&_button]:min-h-11 [&_a]:min-h-11 bg-white
                    border-r border-default flex flex-col transition-all duration-300 ease-out
                    print:hidden"> ... </aside>
    </div>
  </div>
</div>
```

Contract:
- Layer: `[data-overlay-layer]`, `fixed inset-0 z-[100] pointer-events-none`.
- Scrim: `bg-black/20`, `pointer-events-auto`, opacity animated from 0.
- Panel: `[data-overlay-panel][data-modal-content]`, `role="dialog" aria-modal="true"`, shadow `var(--shadow-overlay)`, animated by an inline `transform: translateX(-100%)` -> `translateX(0)`.
- Inside the drawer the sidebar switches to `data-sidebar-mode="embedded"` and forces a 44px minimum touch target on every button and link: `[&_button]:min-h-11 [&_a]:min-h-11`.

A right-side drawer was also observed (brand manager, reached from /settings at 375px):

```
fixed top-0 right-0 bottom-0 w-full max-w-[380px] bg-surface border-l border-default
z-[101] transition-transform duration-200 ease-out flex flex-col shadow-overlay...
```

with its own scrim `fixed inset-0 bg-black/5 z-[100] transition-opacity duration-200 opacity-0 pointer-events-none`.
Verbatim copy inside: "Manage brands", "Group related brand names together", "Your Brand", "Competitors", "PRIMARY BRAND", "Venture PR", "No aliases configu[red]".

### 5.16 Intercom launcher

- Element: `div.intercom-lightweight-app-launcher.intercom-launcher`.
- `position: fixed; bottom: 20px; right: 20px;`
- Size 48 x 48. `border-radius: 50%`. Background `rgb(14, 147, 115)` (the accent green).
- `z-index: 2147483003`.
- Host container `div.intercom-lightweight-app` is `position: fixed; bottom: 0; z-index: 2147483001`.
- Hidden 1 x 1 `#intercom-frame` at `z-index: -1`.
- Position is identical at 1280px, 768px, and 375px.

---

## 6. Responsive behaviour

Breakpoint used by the shell: Tailwind `lg` = 1024px. The shell reads the width at mount, so a reload is needed after resize.

### 6.1 1280px (>= 1024px, desktop)

| Property | Value |
|---|---|
| Sidebar wrapper | `hidden lg:block`, visible |
| `aside` | fixed, 200px wide, full height, `z-30` |
| `main` | `lg:pl-[200px]`, computed `padding-left: 200px` |
| Sticky `<header>` | not rendered |
| Page header padding | `20px 32px` |
| Table toolbar padding | `8px 32px` |
| Table gutters | `px-8` |
| Content max width | `max-w-[1800px] mx-auto`; adds `border-l`/`border-r` at `min-[2000px]` |

### 6.2 768px (tablet)

| Property | Value |
|---|---|
| Sidebar wrapper | computed `display: none`; `aside` width 0 |
| `main` | `padding-left: 0px` |
| Sticky `<header>` | rendered, height 56px |
| Page header padding | `20px 32px` (unchanged) |
| Table toolbar padding | `8px 32px` (unchanged) |
| Tab height | 44px (unchanged) |

Header markup at < 1024px:

```html
<header class="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-default
               bg-white px-2 print:hidden">
  <button type="button"
          class="inline-flex size-11 flex-shrink-0 items-center justify-center rounded
                 text-secondary transition-colors hover:bg-muted/50 hover:text-primary
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          aria-label="Open navigation" aria-expanded="false" aria-controls="tablet-app-navigation">
    <svg class="lucide lucide-menu" width="20" height="20" stroke-width="1.5" .../>
  </button>
  <div class="flex min-w-0 flex-1 items-center gap-2.5 px-1">
    <div class="flex items-center justify-center flex-shrink-0 overflow-hidden rounded
                bg-muted/40 ring-1 ring-inset ring-black/[0.04]" style="width:20px;height:20px;">
      <img alt="" class="w-full h-full object-contain" src="...favicons?domain=venturepr.com&sz=64">
    </div>
    <span class="truncate text-[13px] font-semibold text-primary">Venture PR</span>
  </div>
  <button type="button" class="inline-flex size-11 ... " aria-label="Open Settings">
    <svg class="lucide lucide-settings" width="18" height="18" stroke-width="1.5" .../>
  </button>
</header>
```

Touch targets are 44 x 44 (`size-11`). The hamburger opens the drawer described in 5.15.

### 6.3 375px (mobile)

The app is gated. A full-screen dialog covers the page.

| Property | Value |
|---|---|
| Sidebar | `display: none` |
| Sticky `<header>` | rendered, 56px |
| `main` padding-left | `0px` |
| Page header padding | `20px 16px` |
| Table toolbar padding | `8px 16px` |
| `document.body.scrollWidth` | 375 (no horizontal overflow) |
| Gate | `role="dialog" aria-modal="true"`, `fixed inset-0 z-[9999] bg-surface p-6` |

Gate markup:

```html
<div role="dialog" aria-modal="true" aria-labelledby="_r_1_" aria-describedby="_r_2_" tabindex="-1"
     class="print:hidden fixed inset-0 z-[9999] flex flex-col items-center justify-center
            overflow-y-auto bg-surface p-6">
  <div class="absolute left-6 top-6">
    <img alt="Trakkr" class="h-6 w-6 rounded" src="/logo-mint.png">
  </div>
  <div class="flex w-full max-w-sm flex-col items-center py-10 text-center">
    <div class="mb-6 flex h-14 w-14 items-center justify-center rounded border border-default bg-surface">
      <svg class="lucide lucide-monitor text-tertiary" width="24" height="24" stroke-width="1.5" .../>
    </div>
    <h1 id="_r_1_" class="text-dialog font-semibold text-primary">Built for bigger screens</h1>
    <p id="_r_2_" class="mb-8 mt-2 text-body text-secondary">Open Trakkr on a laptop or desktop
      to use the full workspace.</p>
    <div class="mb-6 w-full border-t border-subtle"></div>
    <p class="mb-4 text-caption text-tertiary">Send yourself a desktop sign-in link</p>
    <form class="w-full space-y-3">
      <p class="text-body text-secondary">[signed-in account email; not recorded here]</p>
      <button type="submit" class="btn btn-primary btn-lg w-full justify-center gap-2">
        <svg class="lucide lucide-mail" width="14" height="14" stroke-width="1.5" .../>Send magic link</button>
    </form>
  </div>
</div>
```

Verbatim copy: "Built for bigger screens", "Open Trakkr on a laptop or desktop to use the full workspace.", "Send yourself a desktop sign-in link", "Send magic link".
The logo asset is `/logo-mint.png`, rendered 24 x 24 with `rounded`.

The exact width at which the gate appears was not bisected. It is active at 375px and not active at 768px.

---

## 7. Motion

### 7.1 Reduced motion

The capture browser requested reduced motion. This rule was active:

```css
.btn, .ctrl-shell, .ctrl-textarea, .ctrl-choice-mark, .ctrl-switch-track, .ctrl-switch-thumb {
  transition-duration: 0.01ms;
}
.btn [data-loading-spinner="true"] { animation: none; }
```

Tab underlines carry `motion-reduce:transition-none`.
The authored (non-reduced) transition durations are the ones written in each component's `transition:` shorthand, listed above.

### 7.2 Standard durations observed

| Duration | Used for |
|---|---|
| 100ms | Ask palette row background |
| 120ms | banner dismiss button (inline override) |
| 150ms | sidebar item colours, dropdown chevron, "Connect your AI" popover, brand plus icon |
| 200ms | sidebar group expand, drawer transform, table row hover, tab colours, empty-state fade-in, brand button |
| 250ms (`--duration-250`) | timestamp colour, `.btn`, `.card-hover`, `.ctrl-shell` |
| 300ms | sidebar width and `main` padding |

### 7.3 Keyframes present in the stylesheet

The stylesheet declares a large keyframe library. The ones relevant to the shell and shared components:

```css
@keyframes fade-in            { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes zoom-in            { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
@keyframes scale-in           { 0% { opacity: 0; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } }
@keyframes slide-in-from-top-1    { 0% { opacity: 0; transform: translateY(-4px); }  100% { opacity: 1; transform: translateY(0); } }
@keyframes slide-in-from-bottom-2 { 0% { opacity: 0; transform: translateY(8px); }   100% { opacity: 1; transform: translateY(0); } }
@keyframes slide-in-from-bottom-3 { 0% { opacity: 0; transform: translateY(12px); }  100% { opacity: 1; transform: translateY(0); } }
@keyframes slide-in-from-bottom-4 { 0% { opacity: 0; transform: translateY(16px); }  100% { opacity: 1; transform: translateY(0); } }
@keyframes slideFromRight     { 0% { opacity: 0; transform: translate(8px); }  100% { opacity: 1; transform: translate(0); } }
@keyframes slideFromLeft      { 0% { opacity: 0; transform: translate(-8px); } 100% { opacity: 1; transform: translate(0); } }
@keyframes slide-in-right     { 0% { opacity: 0; transform: translate(20px); } 100% { opacity: 1; transform: translate(0); } }
@keyframes section-reveal     { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes stagger-enter      { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes number-reveal      { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes shimmer            { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes toast-progress     { 0% { width: 100%; } 100% { width: 0%; } }
@keyframes progress-indeterminate { 0% { width: 40%; transform: translate(-100%); }
                                    50% { width: 60%; }
                                    100% { width: 40%; transform: translate(250%); } }
@keyframes badge-pop          { 0% { opacity: 0; transform: scale(0) rotate(-12deg); }
                                50% { transform: scale(1.2) rotate(6deg); }
                                100% { opacity: 1; transform: scale(1) rotate(0deg); } }
@keyframes pulse-glow         { 0%,100% { box-shadow: rgba(14,147,115,0.4) 0 0; }
                                50% { box-shadow: rgba(14,147,115,0) 0 0 0 8px; } }
@keyframes sidebar-indicator  { 0% { opacity: 0; transform: translateY(-50%) scaleY(0); }
                                100% { opacity: 1; transform: translateY(-50%) scaleY(1); } }
@keyframes status-breathe     { 0%,100% { opacity: 1; transform: scale(1); }
                                50% { opacity: 0.7; transform: scale(1.15); } }
@keyframes status-ring        { 0% { opacity: 0.4; transform: scale(1); } 100% { opacity: 0; transform: scale(2.2); } }
@keyframes checkmark-draw     { 0% { stroke-dashoffset: 24px; } 100% { stroke-dashoffset: 0; } }
@keyframes settle             { 0% { transform: scale(1.008); } 100% { transform: scale(1); } }
@keyframes blink              { 0%,48% { opacity: 1; } 50%,100% { opacity: 0; } }
@keyframes typing-cursor      { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes confetti-fall      { 0% { opacity: 1; transform: translateY(-100%) rotate(0deg); }
                                100% { opacity: 0; transform: translateY(100vh) rotate(720deg); } }
```

`.animate-in { animation-fill-mode: both; }` and `.fade-in { animation-name: fade-in; }` are the composable entry utilities. Duration comes from a `duration-*` class (for example `animate-in fade-in duration-200` on tab panels).

Many further keyframes exist for the marketing site, charts, crawler views, and the Learn area. They are listed in the source but are not part of the app shell.

---

## 8. Items not observed

- Dark theme tokens. None exist (section 1.6).
- Toast markup, position, and stacking behaviour (section 3.11).
- Loading skeleton markup (section 5.11).
- The "Columns and density" popover contents (section 5.8).
- The five other KPI help-tooltip copies (section 5.14).
- The targets of the Ask palette suggestion rows and the "Open workspace" button (section 4).
- Sidebar collapse persistence key (section 3.7).
- The `z-[90]` element on /citations.
- `/citations` page-header right actions and subtitle line.
- Where the Newsreader and Source Serif 4 fonts are applied.
- The precise viewport width at which the small-screen gate activates.
- Actual `@font-face` src URLs (cross-origin stylesheets).
