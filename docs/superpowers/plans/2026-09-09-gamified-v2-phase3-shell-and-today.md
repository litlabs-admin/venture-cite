# Gamified v2 — Phase 3: Shell and Today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `/v2/` shell and the Today screen at 100% artboard parity, in every state, for every brand — without changing the live dashboard.

**Architecture:** New routes under `src/routes/_app/v2.*.tsx` gated by `AuthenticatedBareRoute`, which renders no `AppShell`. A new `V2Shell` reproduces the live shell's geometry (200px rail, 56px context bar) by copying its numbers, never by importing `AppShell.tsx` or `Sidebar.tsx`. All colour comes from existing `vc-*` tokens; `client/src/index.css` is not edited.

**Tech Stack:** React, TanStack Start file routes, TanStack Query, Tailwind v4 with the repo's `vc-*` token layer, recharts, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-gamified-v2-dashboard-spec.md`

**Depends on:** Phase 1 (`feat/v2-work-foundation`) merged — the `/work/summary` endpoint is the Today rail's only source.

## Global Constraints

- **Sidebar is 200px** (`w-[200px]`, matching `Sidebar.tsx:251`), not the artboard's 244px. Content offset `lg:ml-[200px]`. Context bar `h-[56px]`.
- **Primary buttons rest as a tint and fill on hover.** This is already the shipped `Button` `default` variant — `bg-(--brand-accent-subtle) text-(--brand-accent) hover:bg-primary hover:text-primary-foreground` (`ui/button.tsx:31`). **Import `<Button>` and use it unmodified.** `button.tsx:22-33` forbids passing `bg-*` through `className` to restyle it; that prohibition binds here.
- **Everything else is 100% artboard parity.** The content column reflows to 200px; it is never rescaled.
- The v2 shell root element must carry `class="vc-app"` — it sets the authenticated 12px/1.5 type scale (`AppShell.tsx:182`). Without it every unstyled element inherits browser 16px and nothing matches the artboards.
- **Never import or modify** `AppShell.tsx`, `Sidebar.tsx`, `SpineShell.tsx`, `client/src/pages/home.tsx`, `client/src/components/dashboard-panels/*` (reading `primitives.tsx` is allowed), `client/src/index.css`, `src/routes/_app/dashboard.tsx`, `src/routes/index.tsx`. Do not add `/v2/*` to `FULL_BLEED_EXACT`.
- One local test process at a time. Never push, merge to `main`, or reset. Commits need `VC_ALLOW_GIT_WRITE=1`.
- Never name Claude, Codex, or any AI tool in code, comments or commit messages. No `Co-Authored-By` trailers.
- All search params are plain strings: `src/router.tsx` pins `parseSearch`/`stringifySearch` to string-in/string-out. Schemas use bare `z.string().optional().catch(undefined)` and `.passthrough()`. Never `z.coerce.*` or `z.number()`.

## Two findings that change the design

**1. `--warning` is aliased to `--brand-accent`** (`index.css:580`). A state styled `bg-warning` renders **identical to the accent**. The spec's four distinct states — Not measured, Inactive, Failed, No finding — therefore **cannot be encoded by colour alone**. Each must carry a distinct glyph and label, following the precedent in `foundations/StatusDot.tsx`, which uses a check glyph rather than relying on hue. Any task that ships two of the four states looking alike has failed its acceptance check.

**2. `NoValue` already exists** — `dashboard-panels/primitives.tsx:162`, the em-dash the product renders where a metric has no measurement, with the comment _"'not measured' is not 'measured zero'"_. Reuse it rather than inventing a second convention.

## Execution policy

Opus builds and judges all UI — artboard parity is never delegated. `codex luna --effort high` may do mechanical extraction (token sweeps, route scaffolding, test scaffolding) but never composes a screen. Sonnet is the fallback for non-UI work. Two heavy agents plus the controller, maximum. Never pipe `codexDispatch.mjs`. Verify every agent result against `git log` before accepting it.

**Waves**

| Wave | Track | Tasks                                                                 | Worktree         |
| ---- | ----- | --------------------------------------------------------------------- | ---------------- |
| A    | A1    | Tasks 1-3 — route scaffold, search schema, V2Shell                    | `v2-ui`          |
| A    | A2    | Task 4 — the four-state vocabulary (no screen work)                   | `v2-ui` after A1 |
| B    | B1    | Tasks 5-7 — Today: priority task, progress rail, visibility block     | `v2-ui`          |
| B    | B2    | Task 8 — the Sidebar "Gamified" entry, the single permitted live edit | `v2-ui`, last    |
| C    | C1    | Task 9 — every Today state across four fixture brands                 | `v2-ui`          |

## File Structure

| File                                         | Responsibility                                                 |
| -------------------------------------------- | -------------------------------------------------------------- |
| `src/routes/_app/v2.tsx`                     | Layout route mounting `V2Shell` once for all `/v2/*` children. |
| `src/routes/_app/v2.today.tsx`               | The Today route.                                               |
| `src/routes/-shared/searchSchemas.ts`        | **Modified.** Adds `v2SearchSchema`.                           |
| `client/src/v2/shell/V2Shell.tsx`            | The 200px shell: rail, context bar, main region, skip link.    |
| `client/src/v2/shell/V2Nav.tsx`              | The five Guided nav items.                                     |
| `client/src/v2/state/StateBadge.tsx`         | The four distinct states, glyph-led.                           |
| `client/src/v2/today/TodayPage.tsx`          | Composition only.                                              |
| `client/src/v2/today/PriorityTask.tsx`       | Ranked next task with conflict badge, effort, evidence action. |
| `client/src/v2/today/ProgressRail.tsx`       | Level, points, next threshold, waiting-for-observation.        |
| `client/src/v2/today/ObservedVisibility.tsx` | The trend block.                                               |
| `client/src/v2/data/useWorkSummary.ts`       | Query wrapper for `/work/summary`.                             |
| `client/src/components/Sidebar.tsx`          | **Modified, once, in Task 8.** One additive nav entry.         |

---

### Task 1: Route scaffold and search schema

**Files:**

- Create: `src/routes/_app/v2.tsx`, `src/routes/_app/v2.today.tsx`
- Modify: `src/routes/-shared/searchSchemas.ts`
- Modify (generated): `src/routeTree.gen.ts`

**Interfaces:**

- Produces: URL `/v2/today`; `v2SearchSchema` exporting `{ brandId?: string; task?: string }` with passthrough.

- [ ] **Step 1: Read the three schema rules before writing one**

```bash
sed -n '12,40p' src/routes/-shared/searchSchemas.ts
```

Expected: bare `z.string()`, `.optional().catch(undefined)`, `.passthrough()`. `brandId` is read app-wide by `useBrandSelection`; stripping unknown keys breaks it.

- [ ] **Step 2: Add the schema**

```ts
// src/routes/-shared/searchSchemas.ts
/** `/v2/*` - the gamified shell. `brandId` is the app-wide selector key read by
 *  useBrandSelection from every authenticated surface; `task` deep-links one work
 *  item. Both plain strings: src/router.tsx pins search to string in, string out. */
export const v2SearchSchema = z
  .object({
    brandId: z.string().optional().catch(undefined),
    task: z.string().optional().catch(undefined),
  })
  .passthrough();
```

- [ ] **Step 3: Add the layout route**

```tsx
// src/routes/_app/v2.tsx
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthenticatedBareRoute } from "../-shared/routeGates";
import { v2SearchSchema } from "../-shared/searchSchemas";
import { V2Shell } from "@/v2/shell/V2Shell";

function V2Layout() {
  return (
    <V2Shell>
      <Outlet />
    </V2Shell>
  );
}

export const Route = createFileRoute("/_app/v2")({
  validateSearch: v2SearchSchema,
  component: () => <AuthenticatedBareRoute component={V2Layout} />,
});
```

`AuthenticatedBareRoute` (`routeGates.tsx:83`) renders **no** `AppShell`. `AuthenticatedRoute` and `FirstRunGate` both do — never use those here.

- [ ] **Step 4: Add the Today route**

```tsx
// src/routes/_app/v2.today.tsx
import { createFileRoute } from "@tanstack/react-router";
import TodayPage from "@/v2/today/TodayPage";

export const Route = createFileRoute("/_app/v2/today")({
  component: TodayPage,
});
```

The route id is the dotted filename resolved to a path: `"/_app/v2/today"`, not `"/_app/v2.today"`. The parent already carries the gate and the schema.

- [ ] **Step 5: Regenerate the route tree**

Start the dev server through the Browser pane's `preview_start` with the `dev-local` config — never with Bash. The `tanstackStart()` Vite plugin rewrites `src/routeTree.gen.ts` on boot.

- [ ] **Step 6: Verify the tree regenerated and typechecks**

```bash
grep -c "v2" src/routeTree.gen.ts
npm run check
```

Expected: non-zero count, and a clean typecheck. `routeTree.gen.ts` is git-tracked and must be committed; never hand-edit it.

- [ ] **Step 7: Commit**

```bash
VC_ALLOW_GIT_WRITE=1 git add src/routes src/routeTree.gen.ts
VC_ALLOW_GIT_WRITE=1 git commit -m "feat(v2): add the v2 route shell and search schema"
```

---

### Task 2: V2Shell — the 200px chrome

**Files:**

- Create: `client/src/v2/shell/V2Shell.tsx`, `client/src/v2/shell/V2Nav.tsx`
- Test: `tests/unit/v2Shell.test.tsx`

**Interfaces:**

- Produces: `V2Shell({ children }: { children: ReactNode })`. Renders the rail, context bar and `<main id="v2-main-content">`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/v2Shell.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { V2Shell } from "@/v2/shell/V2Shell";

describe("V2Shell", () => {
  it("renders a 200px rail, not the artboard 244", () => {
    const { container } = render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    const aside = container.querySelector("aside");
    expect(aside?.className).toContain("w-[200px]");
    expect(aside?.className).not.toContain("244");
  });

  it("carries the vc-app type scale on its root", () => {
    const { container } = render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    expect(container.firstElementChild?.className).toContain("vc-app");
  });

  it("exposes a skip link to the main region", () => {
    render(
      <V2Shell>
        <div />
      </V2Shell>,
    );
    expect(screen.getByText(/skip to main content/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/v2Shell.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Build the shell from the live geometry**

Reproduce these exact values, copied from the live shell but **not imported from it**:

- root: `vc-app flex min-h-screen bg-vc-page`
- rail: `fixed inset-y-0 left-0 z-40 hidden w-[200px] flex-col border-r border-vc-default bg-vc-surface lg:flex`
- brand row inside the rail: `relative flex h-[56px] shrink-0 items-center border-b border-vc-default px-2.5`
- nav container: `flex-1 space-y-1 overflow-y-auto px-2 py-3`
- content column: `flex min-w-0 flex-1 flex-col lg:ml-[200px] print:ml-0`
- context bar: `sticky top-0 z-20 hidden h-[56px] items-center border-b border-vc-default bg-vc-surface px-8 lg:flex print:hidden`
- footer/account block: `shrink-0 space-y-1 border-t border-vc-default px-2 py-3`

The 56px brand row and 56px context bar must match so their hairlines form one continuous line — that is why both are `h-[56px]`.

- [ ] **Step 4: Build V2Nav with the live item grammar**

Active and inactive classes, copied from `Sidebar.tsx:80-85`:

```
"group flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-caption transition-colors duration-150"
active   -> "bg-vc-accent-subtle font-medium text-vc-accent"
inactive -> "text-vc-secondary hover:bg-vc-muted/50 hover:text-vc-primary"
```

Icons `h-4 w-4 shrink-0`. Items: Today, Visibility, My work, Brand facts, Learn — the five Guided areas, in that order.

**Do not add any `data-tour-id` attribute.** The build gate greps `client/src` for literal target strings; adding unreferenced ones is harmless but adding a duplicate of an existing id is not. Keep them out.

- [ ] **Step 5: Handle the zero-brand case yourself**

`BrandSelector.tsx:41` returns `null` when `brands.length === 0` — it renders nothing, not an empty control. The live app never sees this because `FirstRunGate` redirects brand-less users to `/welcome`, and `AuthenticatedBareRoute` does not. So `V2Shell` must render its own labelled placeholder in the context bar when there are no brands, never an empty gap.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/unit/v2Shell.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
VC_ALLOW_GIT_WRITE=1 git add client/src/v2/shell tests/unit/v2Shell.test.tsx
VC_ALLOW_GIT_WRITE=1 git commit -m "feat(v2): add the v2 shell at the shipped rail geometry"
```

---

### Task 3: The four-state vocabulary

**Why its own task:** the spec requires Not measured, Inactive, Failed and No finding to be distinct, and `--warning` is aliased to `--brand-accent`, so colour cannot carry the distinction. Getting this wrong once poisons every screen built after it.

**Files:**

- Create: `client/src/v2/state/StateBadge.tsx`
- Test: `tests/unit/v2StateBadge.test.tsx`

**Interfaces:**

- Produces: `StateBadge({ state }: { state: "not_measured" | "inactive" | "failed" | "no_finding" })`, and `NOT_MEASURED_LABEL`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/v2StateBadge.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateBadge } from "@/v2/state/StateBadge";

const STATES = ["not_measured", "inactive", "failed", "no_finding"] as const;

describe("StateBadge", () => {
  it("gives every state a distinct label", () => {
    const labels = STATES.map((s) => render(<StateBadge state={s} />).container.textContent);
    expect(new Set(labels).size).toBe(4);
  });

  it("gives every state a distinct glyph, so colour is never the only signal", () => {
    const glyphs = STATES.map((s) =>
      render(<StateBadge state={s} />)
        .container.querySelector("[data-glyph]")
        ?.getAttribute("data-glyph"),
    );
    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(4);
  });

  it("never claims reassurance for an inactive detector", () => {
    const { container } = render(<StateBadge state="inactive" />);
    expect(container.textContent).not.toMatch(/no (problems|issues) found/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/v2StateBadge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Four states, each with its own glyph and its own words:

| State          | Meaning                     | Label          |
| -------------- | --------------------------- | -------------- |
| `not_measured` | No observation exists       | "Not measured" |
| `inactive`     | The check cannot run yet    | "Inactive"     |
| `failed`       | The provider errored        | "Failed"       |
| `no_finding`   | Measured, and nothing found | "No finding"   |

Each renders a `data-glyph` attribute with a distinct value. Use `--fg-tertiary` for `not_measured` and `inactive`, `--negative` for `failed`, `--positive` for `no_finding`. **Do not use `bg-warning` for any of them** — it resolves to the brand accent.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/v2StateBadge.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
VC_ALLOW_GIT_WRITE=1 git add client/src/v2/state tests/unit/v2StateBadge.test.tsx
VC_ALLOW_GIT_WRITE=1 git commit -m "feat(v2): give the four measurement states distinct glyphs and labels"
```

---

### Tasks 4-9

Written when Wave A closes, because each depends on the shell's rendered geometry. Scoped here:

- **Task 4** — `useWorkSummary(brandId)` wrapping `GET /api/brands/:brandId/work/summary`, namespaced query key `["v2","work","summary",brandId]` so an invalidation from `/v2` never re-renders the live dashboard, which shares the query client singleton.
- **Task 5** — `PriorityTask`: the ranked task with its conflict badge, effort, evidence action. Copy is the artboard's verbatim.
- **Task 6** — `ProgressRail`: level hexagon, points against `nextThreshold`, the capability checklist, waiting-for-observation. Reads `currentLevel`/`nextThreshold` from Phase 1's summary contract.
- **Task 7** — `ObservedVisibility`: the trend from `GET /api/dashboard/citation-trend/:brandId`. **The artboard's confidence band has no data source** — `citation-trend` returns weekly point buckets and nothing in `shared/visibilityMetrics.ts` computes an interval. Either add a server-side interval (n per bucket plus a Wilson interval) as its own task, or render the trend without a band and record the omission. Do not fake a band from the series itself.
- **Task 8** — the single permitted live edit: one additive `NavItem` in `Sidebar.tsx` pointing at `/v2/today`, widening the `SpineHref` union. `isActive` is prefix-based and `/v2` shares no prefix with any existing entry, so no existing item changes behaviour. The route must exist in `routeTree.gen.ts` before this compiles. The tour gate is one-directional and cannot be tripped by adding an item.
- **Task 9** — every Today state across the four fixture brands: **Venture PR** (rich), **Narwal** (thin, no facts), **DROS AI** (the only brand with site health), **Feather** (empty). Plus loading, error, and zero-brand. Captured and judged against the artboards by Opus.

**Recorded gaps this phase does not close:** the confidence band (no source), business results (no endpoint anywhere), and Learn content (prototype only, per spec D13).
