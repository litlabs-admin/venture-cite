import { v2Type } from "@/v2/theme/typography";

// The one piece of chrome board 07 and board 34 share: the strip that moves
// between the Level 1 setup gate (`/v2/brand-facts`) and the steady-state
// workspace (`/v2/brand-facts/workspace`).
//
// PLAIN `<a>`, NOT `Link`. `Link`'s `search` prop is typed off each route's
// own declared search schema (`v2SearchSchema`: `brandId` and `task` only -
// see `src/routes/-shared/searchSchemas.ts`), and `mode` is not in it -
// `Board07Screen`'s own `internalHref`/`TabLink` hit the same wall building
// its onboarding step links and made the same choice. `v2SearchSchema` is
// `.passthrough()`, so the extra query key survives the hop; the router just
// won't type-check a `Link` that names it.

export type FactsTab = "setup" | "workspace";

const TABS: ReadonlyArray<{ id: FactsTab; label: string; path: string }> = [
  { id: "setup", label: "Setup review", path: "/v2/brand-facts" },
  { id: "workspace", label: "Workspace", path: "/v2/brand-facts/workspace" },
];

function tabHref(path: string, brandId: string, mode: string): string {
  const params = new URLSearchParams();
  if (brandId) params.set("brandId", brandId);
  params.set("mode", mode);
  return `${path}?${params.toString()}`;
}

export function FactsTabStrip({
  active,
  brandId,
  mode,
}: {
  active: FactsTab;
  brandId: string;
  mode: string;
}) {
  return (
    <nav
      aria-label="Brand facts"
      className="flex flex-wrap gap-x-6 border-b border-[var(--v2-line)] px-7 pt-6 lg:px-8"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <a
            key={tab.id}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px inline-flex items-center border-b-2 pb-2.5 ${
              isActive
                ? "border-[var(--v2-brand)] text-[color:var(--v2-brand)]"
                : "border-transparent text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-brand)]"
            }`}
            href={tabHref(tab.path, brandId, mode)}
          >
            <span className={v2Type.body}>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
