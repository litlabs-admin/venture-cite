import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import { v2FocusRing } from "@/v2/shared/ui/shared";
import { cn } from "@/lib/utils";
import { SETTINGS_TABS } from "@/v2/dispatch/settingsTabs";

/**
 * Real navigation, not a decorative tab widget: each item is a `Link` to its
 * own route, carrying `brandId` and `mode` and nothing else (the make-it-live
 * route contract). The active tab is read from the router's own pathname
 * rather than a `defaultValue`, so a direct visit to
 * `/v2/settings/integrations` highlights `Integrations` correctly instead of
 * always showing the first tab active.
 *
 * Shared by every settings-family screen (b24 General, b25 Integrations, and
 * whatever b42 Team / b44 Billing render) so the strip is pixel-identical
 * everywhere it appears rather than five hand-copied tab bars.
 */
export function SettingsTabStrip({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { mode } = useV2Mode();
  const brandId = typeof search.brandId === "string" ? search.brandId : undefined;

  return (
    <nav
      aria-label="Settings"
      className={cn("flex items-center gap-5 border-b border-[var(--v2-line)]", className)}
    >
      {SETTINGS_TABS.map((tab) => {
        const active = pathname === tab.route;
        return (
          <Link
            className={cn(
              "border-b-2 border-transparent pb-2.5 text-[13.5px] font-medium text-[color:var(--v2-ink3)]",
              "hover:text-[color:var(--v2-ink)]",
              active && "border-[var(--v2-brand)] text-[color:var(--v2-brand)]",
              v2FocusRing,
            )}
            key={tab.route}
            search={{ brandId, mode }}
            to={tab.route}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
