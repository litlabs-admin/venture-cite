import { Suspense, type ComponentType } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteSpinner } from "@/components/foundations";

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
    <Tabs value={active} onValueChange={setTab} className="space-y-4">
      {/* sticky so the Monitor/Diagnose/Act/Report stage tabs stay
          on-screen when the user scrolls into a long page body.
          Without this, child sticky toolbars (e.g. the article picker
          on the Signals page) had nothing to anchor against and looked
          orphaned at the top of the viewport. backdrop-blur keeps the
          underlying scroll visible so the sticky element doesn't feel
          like a hard banner. */}
      <TabsList
        className="grid h-auto w-full gap-1 sticky top-0 z-20 bg-background/95 backdrop-blur"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <TabsTrigger key={t.value} value={t.value} data-tour-id={t.tourId} className="w-full">
              <Icon className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      {tabs.map((t) =>
        t.value === active && t.description ? (
          <div
            key={`${t.value}-desc`}
            className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" />
            <p className="text-muted-foreground">{t.description}</p>
          </div>
        ) : null,
      )}
      {tabs.map((t) => {
        const Body = t.Component;
        return (
          <TabsContent key={t.value} value={t.value}>
            <div className="animate-fade-in-up motion-reduce:animate-none">
              <Suspense fallback={<RouteSpinner />}>
                <Body />
              </Suspense>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
