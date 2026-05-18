import { Link, useLocation } from "wouter";
import {
  Home,
  Activity,
  Stethoscope,
  Wrench,
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

// ─── Workflow spine ──────────────────────────────────────────────────────────
// One flat list, no section labels. The product is a single operating system:
// Monitor (where do I stand) → Diagnose (what's wrong) → Act (fix it) →
// Report (prove it), with the Command Center as the at-a-glance home and
// Setup holding brand/prompt/fact-sheet configuration.
//
// The Monitor/Act/Setup items are wrapped in elements carrying literal
// data-tour-id attributes (nav.monitor / nav.act / nav.setup) referenced by
// global-welcome.tour.ts. They must stay literal strings — the build gate
// scripts/verify-tour-targets.ts statically greps `data-tour-id="…"` and
// fails the build if a registered target has no literal match in source.

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link href={href} onClick={onNavigate}>
      <div
        className={[
          "relative flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        ].join(" ")}
        tabIndex={0}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    </Link>
  );
}

// ─── Shared content (used in both desktop aside and mobile Sheet) ────────────

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location, navigate] = useLocation();
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
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex items-center px-5 h-14 border-b border-sidebar-border shrink-0">
        <Link href="/" onClick={onNavigate}>
          <img src={logoPath} alt="VentureCite" className="h-9 w-auto cursor-pointer" />
        </Link>
      </div>

      {/* Spine nav. Unrolled (only 6 fixed items) so the three tour targets
          can carry literal data-tour-id strings the build gate can grep. */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
        <NavItem
          href="/"
          label="Command Center"
          icon={Home}
          active={isActive("/")}
          onNavigate={onNavigate}
        />
        <div data-tour-id="nav.monitor">
          <NavItem
            href="/monitor"
            label="Monitor"
            icon={Activity}
            active={isActive("/monitor")}
            onNavigate={onNavigate}
          />
        </div>
        <NavItem
          href="/diagnose"
          label="Diagnose"
          icon={Stethoscope}
          active={isActive("/diagnose")}
          onNavigate={onNavigate}
        />
        <div data-tour-id="nav.act">
          <NavItem
            href="/act"
            label="Act"
            icon={Wrench}
            active={isActive("/act")}
            onNavigate={onNavigate}
          />
        </div>
        <div data-tour-id="nav.setup">
          <NavItem
            href="/setup"
            label="Setup"
            icon={SlidersHorizontal}
            active={isActive("/setup")}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      {/* Bottom: user */}
      <div className="shrink-0 border-t border-sidebar-border px-2 py-3 space-y-1">
        <div className="px-1 pt-1">
          <SidebarOnboarding onNavigate={onNavigate} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "Account"}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                navigate("/settings");
                onNavigate?.();
              }}
              className="cursor-pointer"
            >
              <Settings className="w-4 h-4 mr-2" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Desktop Sidebar (fixed aside, lg+ only) ─────────────────────────────────

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden lg:flex flex-col w-[220px] border-r border-sidebar-border">
      <SidebarContent />
    </aside>
  );
}
