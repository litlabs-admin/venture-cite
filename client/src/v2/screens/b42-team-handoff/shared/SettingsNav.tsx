// Local Settings sub-navigation. Duplicated (not shared) on purpose - this
// board owns client/src/v2/screens/b42-team-handoff/** only and may not edit
// client/src/v2/shared/**. client/src/v2/screens/b44-billing/shared/SettingsNav.tsx
// carries an identical copy for the same reason.
import { Link } from "@tanstack/react-router";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";

export type SettingsNavItem = "general" | "integrations" | "team" | "billing";

type SettingsRoute =
  "/v2/settings" | "/v2/settings/integrations" | "/v2/settings/team" | "/v2/settings/billing";

const items: readonly { key: SettingsNavItem; label: string; to: SettingsRoute }[] = [
  { key: "general", label: "General", to: "/v2/settings" },
  { key: "integrations", label: "Integrations", to: "/v2/settings/integrations" },
  { key: "team", label: "Team", to: "/v2/settings/team" },
  { key: "billing", label: "Billing", to: "/v2/settings/billing" },
];

export function SettingsNav({
  active,
  brandId,
  mode,
}: {
  active: SettingsNavItem;
  brandId: string;
  mode: "guided" | "expert";
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="mb-6 flex flex-wrap gap-1 border-b border-[var(--v2-line)]"
    >
      {items.map((item) => (
        <Link
          className={cn(
            v2Type.body,
            "-mb-px border-b-2 px-3 py-2.5 font-medium",
            item.key === active
              ? "border-[var(--v2-brand)] text-[color:var(--v2-ink)]"
              : "border-transparent text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]",
          )}
          key={item.key}
          search={{ brandId, mode }}
          to={item.to}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
