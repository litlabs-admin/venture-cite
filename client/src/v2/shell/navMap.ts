import type { V2NavItem, V2NavMap, V2NavSection } from "@/v2/contracts/shell";

const GUIDED_PRIMARY = [
  { id: "today", label: "Today", to: "/v2/today", icon: "today" },
  { id: "visibility", label: "Visibility", to: "/v2/visibility", icon: "vis" },
  { id: "diagnostics", label: "Diagnostics", to: "/v2/diagnostics", icon: "diag" },
  { id: "my-work", label: "My work", to: "/v2/my-work", icon: "work" },
  { id: "brand-facts", label: "Brand facts", to: "/v2/brand-facts", icon: "facts" },
  { id: "learn", label: "Learn", to: "/v2/learn", icon: "learn" },
] satisfies V2NavItem[];

const GUIDED_SECONDARY = [
  { id: "geo-assistant", label: "GEO assistant", to: "/v2/geo-assistant", icon: "geo" },
  { id: "notifications", label: "Notifications", to: "/v2/notifications", icon: "bell" },
  { id: "settings", label: "Settings", to: "/v2/settings", icon: "cog" },
] satisfies V2NavItem[];

const EXPERT_PRIMARY = [
  { id: "overview", label: "Overview", to: "/v2/visibility", icon: "vis" },
  { id: "site-health", label: "Site health", to: "/v2/diagnostics/site-health", icon: "shield" },
  { id: "geo-signals", label: "GEO signals", to: "/v2/diagnostics/geo-signals", icon: "chart" },
  { id: "competitors", label: "Competitors", to: "/v2/diagnostics/competitor-gap", icon: "scale" },
  { id: "content", label: "Content", to: "/v2/my-work/content-opportunities", icon: "doc" },
  { id: "mentions", label: "Mentions", to: "/v2/visibility/citations", icon: "eye" },
  { id: "opportunities", label: "Opportunities", to: "/v2/my-work/earned-media", icon: "star" },
  { id: "tasks", label: "Tasks", to: "/v2/my-work", icon: "work" },
  { id: "reports", label: "Reports", to: "/v2/visibility/report", icon: "chart" },
] satisfies V2NavItem[];

const EXPERT_SECONDARY = [
  { id: "expert-mode", label: "Expert mode", to: "/v2/diagnostics", icon: "diag" },
  { id: "diagnostics", label: "Diagnostics", to: "/v2/diagnostics", icon: "diag", dot: true },
  { id: "settings", label: "Settings", to: "/v2/settings", icon: "cog" },
] satisfies V2NavItem[];

const AGENCY_PRIMARY = [
  { id: "portfolio", label: "Portfolio", to: "/v2/agency", icon: "today" },
  { id: "tasks", label: "Tasks", to: "/v2/my-work", icon: "work" },
  { id: "reports", label: "Reports", to: "/v2/visibility/report", icon: "chart" },
  { id: "team", label: "Team", to: "/v2/settings/team", icon: "facts" },
  { id: "integrations", label: "Integrations", to: "/v2/settings/integrations", icon: "link" },
  { id: "settings", label: "Settings", to: "/v2/settings", icon: "cog" },
] satisfies V2NavItem[];

export const V2_NAV_MAP = {
  guided: [
    { id: "primary", items: GUIDED_PRIMARY },
    { id: "secondary", items: GUIDED_SECONDARY },
  ],
  expert: [
    { id: "primary", items: GUIDED_PRIMARY },
    { id: "secondary", items: GUIDED_SECONDARY },
  ],
  "expert-nav": [
    { id: "primary", items: EXPERT_PRIMARY },
    { id: "secondary", items: EXPERT_SECONDARY },
  ],
  agency: [{ id: "primary", items: AGENCY_PRIMARY }],
} satisfies V2NavMap;

/** Route exceptions stay here because the frozen navigation contract has no active-path field. */
export const ACTIVE_FOR: Record<string, string[]> = {
  today: ["/v2/onboarding/baseline-review"],
};

const NON_ACTIVE_ITEMS = new Set(["expert-mode"]);

function matchesPath(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function getNavItems(sections: V2NavSection[]): V2NavItem[] {
  return sections.flatMap((section) => section.items);
}

export function getActiveNavItemId(sections: V2NavSection[], pathname: string): string | undefined {
  let activeId: string | undefined;
  let activePrefixLength = -1;

  for (const item of getNavItems(sections)) {
    if (NON_ACTIVE_ITEMS.has(item.id)) continue;
    const targets = [item.to, ...(ACTIVE_FOR[item.id] ?? [])];
    for (const target of targets) {
      if (matchesPath(pathname, target) && target.length > activePrefixLength) {
        activeId = item.id;
        activePrefixLength = target.length;
      }
    }
  }

  return activeId;
}
