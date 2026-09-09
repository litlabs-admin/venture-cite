import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  GraduationCap,
  ListChecks,
  Sun,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

// The five Guided areas, in the order a user moves through them. Item
// grammar (12px text, px-2 py-2, rounded-sm, 150ms colour transition, 16px
// icon, accent-subtle tint when active) is reproduced from the shipped nav
// item, not imported from it - Sidebar.tsx is out of scope for this tree and
// stays untouched.
//
// `href` is present only for an area whose route exists. The other four are
// rendered as non-interactive rows rather than as links to nowhere: a typed
// `Link` cannot address a route that is not in the tree, and a row that
// silently does nothing when clicked is worse than a row that says it is not
// ready. They gain an `href` as each screen lands.
type V2NavEntry = {
  label: string;
  icon: LucideIcon;
  href?: "/v2/today" | "/v2/my-work";
};

const ITEMS: V2NavEntry[] = [
  { label: "Today", icon: Sun, href: "/v2/today" },
  { label: "Visibility", icon: TrendingUp },
  { label: "My work", icon: ListChecks, href: "/v2/my-work" },
  { label: "Brand facts", icon: BookOpen },
  { label: "Learn", icon: GraduationCap },
];

const ROW =
  "group flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-caption transition-colors duration-150";
const ACTIVE = "bg-vc-accent-subtle font-medium text-vc-accent";
const INACTIVE = "text-vc-secondary hover:bg-vc-muted/50 hover:text-vc-primary";

export function V2Nav() {
  // `useRouterState` rather than `window.location`: this has to re-render on
  // an in-app navigation, which does not touch the document location in a way
  // React would observe.
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Guided areas">
      {ITEMS.map(({ label, icon: Icon, href }) => {
        if (!href) {
          return (
            <div
              key={label}
              aria-disabled="true"
              className={`${ROW} cursor-default text-vc-tertiary`}
              data-v2-nav={label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
              <span className="ml-auto shrink-0 text-vc-tertiary">Soon</span>
            </div>
          );
        }

        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={label}
            to={href}
            className="block rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
            data-v2-nav={label}
          >
            <div className={`${ROW} ${active ? ACTIVE : INACTIVE}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
