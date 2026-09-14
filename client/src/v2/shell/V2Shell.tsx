import { useEffect, useState, type ReactNode } from "react";
import { Link, useMatches, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import BrandSelector from "@/components/BrandSelector";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2Mode, V2ShellVariant } from "@/v2/contracts/shell";
import { V2Icon } from "@/v2/theme/V2Icon";
import "@/v2/theme/v2-mono.css";
import { V2ModeToggle } from "./V2ModeToggle";
import { getActiveNavItemId, getNavItems, V2_NAV_MAP } from "./navMap";
import { V2Nav } from "./V2Nav";
import { V2TopBar } from "./V2TopBar";
import { useV2Mode } from "./useV2Mode";

const EXPERT_EQUIVALENTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/v2/visibility", to: "/v2/visibility" },
  { from: "/v2/diagnostics", to: "/v2/diagnostics" },
];

type ShellUser = ReturnType<typeof useAuth>["user"];

function resolveShellVariant(matches: ReturnType<typeof useMatches>): V2ShellVariant {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const shell = matches[index]?.staticData?.v2Shell;
    if (shell) return shell;
  }
  return "guided";
}

function getExpertEquivalent(pathname: string): string | undefined {
  return EXPERT_EQUIVALENTS.find(({ from }) => pathname === from || pathname.startsWith(`${from}/`))
    ?.to;
}

function getUserInitials(user: ShellUser): string {
  if (user?.firstName && user.lastName) {
    return `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`.toUpperCase();
  }
  if (user?.firstName) return user.firstName.slice(0, 2).toUpperCase();
  if (user?.email) return user.email.slice(0, 1).toUpperCase();
  return "U";
}

function V2UserAvatar({ user }: { user: ShellUser }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--v2-brand-soft)] text-[11px] font-semibold text-[color:var(--v2-brand)]"
    >
      {getUserInitials(user)}
    </span>
  );
}

function V2UserRow({ user }: { user: ShellUser }) {
  const name = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : (user?.email ?? "Account");

  return (
    <div className="shrink-0 border-t border-[var(--v2-line)] px-3 py-3">
      <button
        type="button"
        aria-label={`${name} account`}
        className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] font-medium text-[color:var(--v2-ink2)] transition-colors hover:bg-[var(--v2-inset)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)]"
      >
        <V2UserAvatar user={user} />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <V2Icon name="cdown" size={14} className="shrink-0 text-[color:var(--v2-ink3)]" />
      </button>
    </div>
  );
}

function V2BrandControl({
  brands,
  isLoading,
  selectedBrand,
}: {
  brands: { id: string }[];
  isLoading: boolean;
  selectedBrand?: { name: string };
}) {
  if (isLoading) {
    return (
      <span className="text-[12px] text-[color:var(--v2-ink3)]" data-testid="v2-brand-loading">
        Loading brands…
      </span>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-1" data-testid="v2-brand-empty">
        <span className="text-[12px] text-[color:var(--v2-ink3)]">No brands yet.</span>
        <Button asChild size="sm">
          <Link to="/welcome">Add a brand</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="v2-brand-switcher">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--v2-brand-soft)] text-[10px] font-semibold text-[color:var(--v2-brand)]">
        {(selectedBrand?.name.slice(0, 2) ?? "BR").toUpperCase()}
      </span>
      <BrandSelector className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[13.5px] font-semibold text-[color:var(--v2-ink)] shadow-none focus:ring-0" />
    </div>
  );
}

function V2ExpertTopBar({ user }: { user: ShellUser }) {
  const [searchValue, setSearchValue] = useState("");
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-5 border-b border-[var(--v2-line)] bg-[var(--v2-paper)] px-6">
      <label
        className="flex h-8 w-full max-w-[520px] items-center gap-2 rounded-[7px] border border-[var(--v2-line)] bg-[var(--v2-inset)] px-3 text-[12px] text-[color:var(--v2-ink3)] focus-within:border-[var(--v2-brand)] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--v2-brand)]"
        htmlFor="v2-expert-search"
      >
        <V2Icon name="srch" size={15} className="shrink-0" />
        <input
          id="v2-expert-search"
          aria-label="Search"
          className="min-w-0 flex-1 bg-transparent text-[color:var(--v2-ink)] outline-none placeholder:text-[color:var(--v2-ink3)]"
          placeholder="Search companies, topics, or prompts…"
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
        />
      </label>
      <div className="ml-auto flex shrink-0 items-center gap-4 text-[12px] text-[color:var(--v2-ink3)]">
        <span className="hidden items-center gap-1.5 md:flex">
          <V2Icon name="cal" size={15} />
          {date}
        </span>
        <button
          type="button"
          aria-label="Help"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--v2-line)] text-[12px] font-semibold text-[color:var(--v2-ink2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)]"
        >
          ?
        </button>
        <button
          type="button"
          aria-label="Account"
          className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)]"
        >
          <V2UserAvatar user={user} />
        </button>
      </div>
    </header>
  );
}

function V2DateMeta() {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <span className="flex items-center gap-1.5 text-[12px] text-[color:var(--v2-ink3)]">
      <V2Icon name="cal" size={15} />
      {date}
    </span>
  );
}

function V2AgencyWorkspace({ selectedBrand }: { selectedBrand?: { name: string } }) {
  return (
    <button
      type="button"
      className="mx-3 flex items-center justify-between gap-2 rounded-[7px] border border-[var(--v2-line)] px-2.5 py-2"
      data-testid="v2-workspace-switcher"
    >
      <span className="min-w-0 truncate text-[12.5px] font-semibold text-[color:var(--v2-ink)]">
        {selectedBrand?.name ?? "All brands"}
      </span>
      <V2Icon name="cdown" size={14} className="shrink-0 text-[color:var(--v2-ink3)]" />
    </button>
  );
}

function V2AppChrome({
  variant,
  children,
}: {
  variant: Exclude<V2ShellVariant, "bare">;
  children: ReactNode;
}) {
  const { brands, isLoading, selectedBrand, selectedBrandId } = useBrandSelection();
  const { user } = useAuth();
  const { mode, setMode } = useV2Mode();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useSearch({ strict: false });
  const [modeOverride, setModeOverride] = useState<V2Mode>();
  const modeFromVariant = variant === "expert" || variant === "expert-nav" ? "expert" : mode;
  const activeMode = modeOverride ?? modeFromVariant;
  const sections = V2_NAV_MAP[variant];
  const activeItemId = getActiveNavItemId(sections, pathname);
  const activeItem = getNavItems(sections).find((item) => item.id === activeItemId);

  useEffect(() => {
    setModeOverride(undefined);
  }, [pathname, variant]);

  function handleModeChange(nextMode: V2Mode) {
    setModeOverride(nextMode);
    setMode(nextMode);
    if (nextMode !== "expert") return;

    const target = getExpertEquivalent(pathname);
    if (!target) return;

    navigate({
      to: target,
      search: { ...search, brandId: selectedBrandId || undefined, mode: nextMode },
    });
  }

  const linkSearch = { ...search, brandId: selectedBrandId || undefined, mode: activeMode };
  const standardRail = variant === "guided" || variant === "expert";
  const railWidth = variant === "expert-nav" ? "w-[190px]" : "w-[200px]";
  const contentOffset = variant === "expert-nav" ? "lg:ml-[190px]" : "lg:ml-[200px]";

  return (
    <div className="flex min-h-screen bg-[var(--v2-paper)]">
      <aside
        aria-label={`${variant} shell`}
        className={`fixed inset-y-0 left-0 z-40 hidden ${railWidth} flex-col border-r border-[var(--v2-line)] bg-[var(--v2-paper)] lg:flex`}
        data-testid={`v2-${variant}-rail`}
      >
        <div className="flex h-[56px] shrink-0 items-center border-b border-[var(--v2-line)] px-3">
          <Link
            to="/v2/today"
            search={linkSearch}
            className="flex items-center gap-2 rounded-[7px] px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)]"
          >
            <BrandLogo />
          </Link>
        </div>

        {standardRail ? (
          <div className="shrink-0 space-y-3 px-3 py-3">
            <V2BrandControl brands={brands} isLoading={isLoading} selectedBrand={selectedBrand} />
            <V2ModeToggle mode={activeMode} onChange={handleModeChange} />
          </div>
        ) : null}
        {variant === "agency" ? <V2AgencyWorkspace selectedBrand={selectedBrand} /> : null}

        <V2Nav
          variant={variant}
          pathname={pathname}
          brandId={selectedBrandId}
          mode={activeMode}
          search={search}
        />
        <V2UserRow user={user} />
      </aside>

      <div className={`flex min-w-0 flex-1 flex-col ${contentOffset}`}>
        {variant === "expert-nav" ? (
          <V2ExpertTopBar user={user} />
        ) : (
          <V2TopBar left={activeItem?.label} right={<V2DateMeta />} />
        )}
        <main id="v2-main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

export function V2Shell({ children }: { children: ReactNode }) {
  const variant = resolveShellVariant(useMatches());

  return (
    <div className="v2-mono vc-app min-h-screen bg-[var(--v2-paper)] text-[color:var(--v2-ink)]">
      <a
        href="#v2-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-[7px] focus:bg-[var(--v2-brand)] focus:px-4 focus:py-2 focus:text-[color:var(--v2-paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-brand)]"
      >
        Skip to main content
      </a>
      {variant === "bare" ? (
        <main id="v2-main-content" className="min-h-screen">
          {children}
        </main>
      ) : (
        <V2AppChrome variant={variant}>{children}</V2AppChrome>
      )}
    </div>
  );
}
