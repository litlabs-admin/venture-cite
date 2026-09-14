import { Link } from "@tanstack/react-router";
import type { V2Mode, V2NavItem, V2ShellVariant } from "@/v2/contracts/shell";
import { V2Icon } from "@/v2/theme/V2Icon";
import { getActiveNavItemId, getNavItems, V2_NAV_MAP } from "./navMap";

const ROW =
  "group flex min-h-9 w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)]";
const ACTIVE = "bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]";
const INACTIVE =
  "text-[color:var(--v2-ink2)] hover:bg-[var(--v2-inset)] hover:text-[color:var(--v2-ink)]";

type V2NavProps = {
  variant: Exclude<V2ShellVariant, "bare">;
  pathname: string;
  brandId: string;
  mode: V2Mode;
  search: Record<string, unknown>;
};

function NavRow({
  item,
  active,
  search,
}: {
  item: V2NavItem;
  active: boolean;
  search: Record<string, unknown>;
}) {
  const itemIsActive = active || item.id === "expert-mode";
  const rowClassName = `${ROW} ${itemIsActive ? ACTIVE : INACTIVE}`;
  const contents = (
    <>
      <V2Icon name={item.icon} size={17} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.dot ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--v2-brand)]"
        />
      ) : null}
    </>
  );

  if (item.id === "expert-mode") {
    return (
      <button
        type="button"
        aria-pressed="true"
        className={`${rowClassName} text-left`}
        data-v2-nav={item.id}
      >
        {contents}
      </button>
    );
  }

  return (
    <Link
      to={item.to}
      search={search}
      aria-current={active ? "page" : undefined}
      className="block rounded-[7px] focus-visible:outline-none"
      data-v2-nav={item.id}
    >
      <span className={rowClassName}>{contents}</span>
    </Link>
  );
}

export function V2Nav({ variant, pathname, brandId, mode, search }: V2NavProps) {
  const sections = V2_NAV_MAP[variant];
  const activeItemId = getActiveNavItemId(sections, pathname);
  const linkSearch = { ...search, brandId: brandId || undefined, mode };
  const navLabel =
    variant === "expert-nav"
      ? "Expert areas"
      : variant === "agency"
        ? "Agency areas"
        : "VentureCite areas";

  return (
    <nav aria-label={navLabel} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {sections.map((section, sectionIndex) => (
        <div
          key={section.id}
          className={sectionIndex === 0 ? "" : "mt-4 border-t border-[var(--v2-line)] pt-3"}
        >
          <div className="space-y-1">
            {getNavItems([section]).map((item) => (
              <NavRow
                key={item.id}
                item={item}
                active={item.id === activeItemId}
                search={linkSearch}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
