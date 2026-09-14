import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { v2Type } from "@/v2/theme/typography";

// The My work section strip.
//
// `/v2/my-work` (this screen's own Tasks list), `/v2/my-work/queue`, and the
// two boards another agent builds (`/v2/my-work/earned-media`,
// `/v2/my-work/content-opportunities`) are siblings the sidebar does not
// separate - GUIDED_PRIMARY in navMap.ts carries one "My work" entry for the
// whole group. Without this strip a reader who lands on Queue (or either of
// the other two) has no way back to Tasks except the browser's back button.
// Every entry is a real `Link` with the section's own path; there is no tab
// state to keep in sync because each one is its own route.
const ITEMS = [
  { to: "/v2/my-work", label: "Tasks" },
  { to: "/v2/my-work/queue", label: "Queue" },
  { to: "/v2/my-work/earned-media", label: "Earned media" },
  { to: "/v2/my-work/content-opportunities", label: "Content opportunities" },
] as const;

function isActive(pathname: string, to: string): boolean {
  return pathname === to || (to !== "/v2/my-work" && pathname.startsWith(`${to}/`));
}

export function MyWorkNav() {
  const search = useSearch({ strict: false });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const linkSearch = {
    brandId: typeof search.brandId === "string" ? search.brandId : undefined,
    mode: typeof search.mode === "string" ? search.mode : undefined,
  };

  return (
    <nav
      aria-label="My work sections"
      className="flex shrink-0 items-center gap-1 border-b border-[var(--v2-line)] bg-[var(--v2-paper)] px-6"
      data-testid="v2-my-work-nav"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            search={linkSearch}
            aria-current={active ? "page" : undefined}
            className={`${v2Type.bodyStrong} -mb-px border-b-2 px-3 py-3 text-[13px] ${
              active
                ? "border-[var(--v2-brand)] text-[color:var(--v2-brand)]"
                : "border-transparent text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
