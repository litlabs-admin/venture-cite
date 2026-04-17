import { Link, useLocation } from "wouter";
import {
  Home, Building2, FileText, PenLine, Link2, Search, ScanEye,
  CreditCard, LogOut, ChevronRight, Settings,
} from "lucide-react";
import { useState } from "react";
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

// ─── Nav definitions ─────────────────────────────────────────────────────────

const NAV_MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/brands",    label: "Brands",    icon: Building2 },
  { href: "/articles",  label: "Articles",  icon: FileText },
];

const NAV_TOOLS = [
  { href: "/content",          label: "Content",       icon: PenLine  },
  { href: "/citations",        label: "Citations",     icon: Link2    },
  { href: "/keyword-research", label: "Keywords",      icon: Search   },
  { href: "/ai-visibility",    label: "AI Visibility", icon: ScanEye  },
];

const NAV_PHASE2 = [
  { href: "/geo-rankings",           label: "GEO Rankings"     },
  { href: "/geo-analytics",          label: "Analytics"        },
  { href: "/ai-intelligence",        label: "AI Intelligence"  },
  { href: "/opportunities",          label: "Opportunities"    },
  { href: "/outreach",               label: "Outreach"         },
  { href: "/community",              label: "Community"        },
  { href: "/agent",                  label: "AI Agent"         },
  { href: "/revenue-analytics",      label: "Revenue"          },
  { href: "/publications",           label: "Publications"     },
  { href: "/competitors",            label: "Competitors"      },
  { href: "/crawler-check",          label: "Crawler"          },
  { href: "/geo-tools",              label: "GEO Tools"        },
  { href: "/geo-signals",            label: "Signals"          },
  { href: "/ai-traffic",             label: "AI Traffic"       },
  { href: "/analytics-integrations", label: "Integrations"     },
  { href: "/faq-manager",            label: "FAQ Manager"      },
  { href: "/client-reports",         label: "Reports"          },
  { href: "/brand-fact-sheet",       label: "Fact Sheet"       },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-5 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90">
      {label}
    </p>
  );
}

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
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] -ml-2 bg-primary rounded-r" />
        )}
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    </Link>
  );
}

function Phase2Item({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link href={href} onClick={onNavigate}>
      <div
        className={[
          "group flex items-center justify-between gap-3 mx-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        ].join(" ")}
        tabIndex={0}
      >
        <span className="truncate pl-7">{label}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 group-hover:text-muted-foreground">
          Soon
        </span>
      </div>
    </Link>
  );
}

// ─── Shared content (used in both desktop aside and mobile Sheet) ────────────

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [phase2Open, setPhase2Open] = useState(false);

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) return user.email[0].toUpperCase();
    return "U";
  };

  const activePath = location === "/" ? "/dashboard" : location;

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex items-center px-5 h-14 border-b border-sidebar-border shrink-0">
        <Link href="/dashboard" onClick={onNavigate}>
          <img src={logoPath} alt="VentureCite" className="h-9 w-auto cursor-pointer" />
        </Link>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        <SectionLabel label="Main" />
        {NAV_MAIN.map((item) => (
          <NavItem key={item.href} {...item} active={activePath === item.href} onNavigate={onNavigate} />
        ))}

        <SectionLabel label="Tools" />
        {NAV_TOOLS.map((item) => (
          <NavItem key={item.href} {...item} active={activePath === item.href} onNavigate={onNavigate} />
        ))}

        <button
          onClick={() => setPhase2Open((v) => !v)}
          className="flex items-center w-full px-5 pt-5 pb-1.5 gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/90 hover:text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-expanded={phase2Open}
        >
          Upcoming
          <ChevronRight
            className={`w-3 h-3 ml-auto transition-transform duration-200 ${phase2Open ? "rotate-90" : ""}`}
          />
        </button>

        {phase2Open && NAV_PHASE2.map((item) => (
          <Phase2Item key={item.href} {...item} active={activePath === item.href} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Bottom: pricing + user */}
      <div className="shrink-0 border-t border-sidebar-border px-2 py-3 space-y-1">
        <Link href="/pricing" onClick={onNavigate}>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0}>
            <CreditCard className="w-4 h-4 shrink-0" />
            <span>Pricing</span>
          </div>
        </Link>

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
            <DropdownMenuItem disabled>
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
