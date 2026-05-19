import { Suspense, type ComponentType } from "react";
import { useLocation, useSearch } from "wouter";
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
  /** Optional tour target; remapped wholesale in Phase 2. */
  tourId?: string;
}

export default function SpineShell({ defaultTab, tabs }: { defaultTab: string; tabs: SpineTab[] }) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();

  const params = new URLSearchParams(searchString);
  const requested = params.get("tab");
  const active = tabs.some((t) => t.value === requested) ? (requested as string) : defaultTab;

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchString);
    next.set("tab", value);
    const path = location.split("?")[0];
    setLocation(`${path}?${next.toString()}`, { replace: true });
  };

  return (
    <Tabs value={active} onValueChange={setTab} className="space-y-4">
      <TabsList
        className="grid h-auto w-full gap-1"
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
