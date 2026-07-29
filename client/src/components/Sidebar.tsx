import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Activity,
  Stethoscope,
  Wrench,
  FileText,
  SlidersHorizontal,
  LogOut,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoPath from "@assets/logo.png";
import SidebarOnboarding from "@/components/SidebarOnboarding";
import { ThemeMenuItems, QuickThemeToggle } from "@/components/ThemeMenuItems";

// ─── Workflow spine ──────────────────────────────────────────────────────────
// One flat list, no section labels. The product is a single operating system,
// rendered in the order a real user moves through it:
//
//   Command Center → Setup → Monitor → Diagnose → Act → Report
//
// Command Center is the daily landing spot. Setup configures the brand and
// fact sheet (first task for any new user, ongoing maintenance for existing
// ones). Monitor measures, Diagnose explains, Act fixes, Report proves.
// The global welcome tour narrates the same flow.
//
// Each spine stage carries a literal data-tour-id wrapper (nav.setup,
// nav.monitor, nav.diagnose, nav.act, nav.report) referenced by
// global-welcome.tour.ts. They must stay literal strings — the build gate
// scripts/verify-tour-targets.ts statically greps `data-tour-id="…"` and
// fails the build if a registered target has no literal match in source.

// ─── Sub-components ───────────────────────────────────────────────────────────

/** The fixed set of top-level spine destinations this nav renders — kept as
 *  a literal union (not `string`) so every `<Link to={href}>` below stays
 *  type-checked against the generated route tree. */
type SpineHref = "/" | "/setup" | "/monitor" | "/diagnose" | "/act" | "/report";

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: SpineHref;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  // Measured nav-item spec: 12px text, px-2 py-2, rounded-sm, 150ms colors,
  // 16px icon, accent-subtle fill + accent text when active. No pill, no
  // heavy weight — the active state is a tint, not a slab.
  return (
    <Link to={href} onClick={onNavigate}>
      <div
        className={[
          "group flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-caption transition-colors duration-150",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40",
          active
            ? "bg-vc-accent-subtle font-medium text-vc-accent"
            : "text-vc-secondary hover:bg-vc-muted/50 hover:text-vc-primary",
        ].join(" ")}
        tabIndex={0}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    </Link>
  );
}

// ─── Shared content (used in both desktop aside and mobile Sheet) ────────────

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) return user.email[0].toUpperCase();
    return "U";
  };

  // `/` and `/dashboard` both render the Command Center. Every other spine
  // stage owns a path prefix (e.g. `/monitor?tab=citations`).
  const isActive = (href: string) =>
    href === "/"
      ? location === "/" || location === "/dashboard"
      : location === href || location.startsWith(`${href}/`) || location.startsWith(`${href}?`);

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Brand row — 56px, matching the context bar's height exactly so the
          two hairlines meet in one unbroken line across the viewport. */}
      <div className="relative flex h-[56px] shrink-0 items-center border-b border-vc-default px-2.5">
        {/* Mark only — the wordmark is dropped. With no text child the link
            has no accessible name, so it carries one explicitly. */}
        <Link
          to="/"
          onClick={onNavigate}
          aria-label="VentureCite home"
          className="flex items-center rounded-md px-1.5 py-1.5"
        >
          {/* The asset is a 779×258 wordmark (~3:1). Fixing both axes squashed
              it to a third of its width; height + `w-auto` lets it keep its
              proportions. */}
          <img src={logoPath} alt="" className="h-7 w-auto shrink-0 object-contain" />
        </Link>
      </div>

      {/* Spine nav. Rendered in workflow order — the sequence a user
          actually moves through. Unrolled so the five spine-stage tour
          targets can carry literal data-tour-id strings the build gate
          can grep. */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        <NavItem
          href="/"
          label="Dashboard"
          icon={Home}
          active={isActive("/")}
          onNavigate={onNavigate}
        />
        <div data-tour-id="nav.setup">
          <NavItem
            href="/setup"
            label="Setup"
            icon={SlidersHorizontal}
            active={isActive("/setup")}
            onNavigate={onNavigate}
          />
        </div>
        <div data-tour-id="nav.monitor">
          <NavItem
            href="/monitor"
            label="Monitor"
            icon={Activity}
            active={isActive("/monitor")}
            onNavigate={onNavigate}
          />
        </div>
        <div data-tour-id="nav.diagnose">
          <NavItem
            href="/diagnose"
            label="Diagnose"
            icon={Stethoscope}
            active={isActive("/diagnose")}
            onNavigate={onNavigate}
          />
        </div>
        <div data-tour-id="nav.act">
          <NavItem
            href="/act"
            label="Act"
            icon={Wrench}
            active={isActive("/act")}
            onNavigate={onNavigate}
          />
        </div>
        <div data-tour-id="nav.report">
          <NavItem
            href="/report"
            label="Report"
            icon={FileText}
            active={isActive("/report")}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      {/* Bottom: user */}
      <div className="shrink-0 space-y-1 border-t border-vc-default px-2 py-3">
        <div className="px-1 pt-1">
          <SidebarOnboarding onNavigate={onNavigate} />
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 transition-colors duration-150 hover:bg-vc-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-vc-accent-subtle text-label font-medium text-vc-accent-hover">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-caption text-vc-secondary">
                    {user?.firstName
                      ? `${user.firstName} ${user.lastName ?? ""}`.trim()
                      : "Account"}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  navigate({ to: "/settings" });
                  onNavigate?.();
                }}
                className="cursor-pointer"
              >
                <Settings className="w-4 h-4 mr-2" />
                Account settings
              </DropdownMenuItem>
              <ThemeMenuItems />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <QuickThemeToggle />
        </div>
      </div>
    </div>
  );
}

// ─── Desktop Sidebar (fixed aside, lg+ only) ─────────────────────────────────

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[200px] flex-col border-r border-vc-default bg-white lg:flex">
      <SidebarContent />
    </aside>
  );
}
