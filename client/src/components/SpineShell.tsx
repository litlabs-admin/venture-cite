import { Suspense, type ComponentType } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContentSkeleton } from "@/components/foundations";

// Phase 0 spine scaffold. A stage (Monitor/Diagnose/Act/Report/Setup) is one
// route hosting a tab strip. Each tab embeds an EXISTING page component
// unchanged; only the active tab mounts (Radix unmounts inactive content), so
// each embedded page keeps its own header/brand-selector with no duplication.
// The active tab is mirrored to `?tab=` so the recommendations engine and the
// (Phase 1) redirect map can deep-link straight to a sub-view.

export interface SpineTab {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
  /** Optional one-line purpose shown under the tab strip for the active tab. */
  description?: string;
  /** Optional tour target; remapped wholesale in Phase 2. */
  tourId?: string;
}

export default function SpineShell({ defaultTab, tabs }: { defaultTab: string; tabs: SpineTab[] }) {
  // SpineShell hosts under whichever stage route mounted it (monitor,
  // diagnose, act, setup, report) — it has no single `from` route, so this
  // reads/writes search loosely ({ strict: false } / to: location) rather
  // than against one route's typed `Route.useSearch()` — see
  // native-api-contract.md rule 3. `tab` is declared (as an optional string)
  // on every one of those routes' schemas in
  // src/routes/-shared/searchSchemas.ts.
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false });

  const requested = typeof search.tab === "string" ? search.tab : undefined;
  const active =
    requested !== undefined && tabs.some((t) => t.value === requested) ? requested : defaultTab;

  const setTab = (value: string) => {
    // `to: location` rather than a route literal: this component isn't
    // tied to one route (it mounts under monitor/diagnose/act/setup/report),
    // so `location` (the current pathname) is a runtime `string`, not a
    // literal — TanStack Router accepts a plain `string` `to` for exactly
    // this case (see native-api-contract.md). `search` is a function of the
    // previous search object so every existing param (notably `brandId`,
    // read by useBrandSelection() from nearly every page) survives — only
    // `tab` changes.
    navigate({
      to: location,
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: value }),
      replace: true,
    });
  };

  return (
    <Tabs value={active} onValueChange={setTab}>
      {/* Full-bleed tab band. This is the shared chrome above 13 pages across
          four stage routes, so it sets the grammar those pages sit in: a
          hairline-bounded strip flush to the viewport edge, no rounded pill,
          no gap between triggers — separation is a 1px rule, same as every
          panel row on the Dashboard.

          Still sticky, for the original reason: without it, child sticky
          toolbars (e.g. the article picker on the Signals page) have nothing
          to anchor against and look orphaned at the top of the viewport.
          `bg-vc-surface` rather than a translucent blur — the panel grammar
          has no frosted layers, and a solid band keeps the hairline crisp
          while content scrolls beneath it. */}
      <TabsList
        className="grid h-auto w-full gap-0 rounded-none border-b border-vc-default bg-vc-surface p-0 sticky top-0 z-20"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <TabsTrigger
              key={t.value}
              value={t.value}
              data-tour-id={t.tourId}
              // Underline-on-active, not a filled pill: a pill needs a radius
              // and a fill, and this surface has neither. The 2px inset
              // bottom border sits on the band's own hairline.
              className="w-full rounded-none border-b-2 border-transparent px-4 py-3 text-caption text-vc-tertiary shadow-none transition-colors hover:text-vc-primary data-[state=active]:border-vc-accent data-[state=active]:bg-transparent data-[state=active]:text-vc-primary data-[state=active]:shadow-none"
            >
              <Icon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      {tabs.map((t) =>
        t.value === active && t.description ? (
          // Demoted from a bordered/tinted callout to a plain header-style
          // caption: this renders on every tab of every spine stage (17
          // tabs across Monitor/Diagnose/Act/Report/Setup), and the content
          // is a routine one-line purpose statement, not something that
          // needs attention. No border, no bg fill, and the glyph is
          // uncoloured (`currentColor` off the muted text) rather than the
          // amber `text-warning` it had — amber is this design system's
          // attention colour and this isn't an attention case.
          <div
            key={`${t.value}-desc`}
            className="flex items-center gap-2 border-b border-vc-default px-8 py-3 text-caption text-vc-tertiary"
          >
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{t.description}</p>
          </div>
        ) : null,
      )}
      {tabs.map((t) => {
        const Body = t.Component;
        return (
          <TabsContent key={t.value} value={t.value}>
            <div className="animate-fade-in-up motion-reduce:animate-none">
              {/* The sidebar/tab strip above is already mounted by the time
                  this Suspense trips, so the loading shape is knowable at
                  least at the "content region" level (unlike routeGates.tsx's
                  whole-page gates, which keep RouteSpinner) — a generic
                  shape-matched skeleton reads better here than a spinner. */}
              <Suspense fallback={<ContentSkeleton />}>
                <Body />
              </Suspense>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
