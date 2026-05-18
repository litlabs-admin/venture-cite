import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Menu, X } from "lucide-react";
import Sidebar, { SidebarContent } from "./Sidebar";
import EducationAssistant from "./EducationAssistant";
import CommandPalette from "./CommandPalette";
import BrandSelector from "./BrandSelector";
import { PageHeaderHelp } from "./PageHeaderHelp";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import logoPath from "@assets/logo.png";
import { spineTitleFor } from "@/lib/spineStages";

// ─── AppShell ────────────────────────────────────────────────────────────────
// The one persistent three-zone shell (nav rail / context bar + canvas /
// inspector). Replaces AppLayout for every authenticated route. (Named
// AppShell, not SpineShell, because SpineShell already exists as the
// per-stage tab host that monitor/diagnose/act/setup depend on; that gets
// decomposed in a later increment.)
//
// This first increment fully owns the Command Center: a route-derived
// title + the global BrandSelector + help in the context bar, plus a real
// inspector. Legacy routes render their existing body in the canvas
// unchanged (no context bar, no double header, no 18-page edits) until
// later increments decompose them.
//
// Preserves AppLayout's responsibilities verbatim: skip link, desktop
// Sidebar + mobile Sheet (so the nav.* tour targets stay intact), and the
// EducationAssistant.

interface InspectorPayload {
  title: string;
  body: ReactNode;
}

interface InspectorApi {
  open: (payload: InspectorPayload) => void;
  close: () => void;
}

const InspectorContext = createContext<InspectorApi | null>(null);

/** Drive the shell's inspector. No-ops outside AppShell so a panel can be
 *  written once and not crash if mounted bare. */
export function useInspector(): InspectorApi {
  return useContext(InspectorContext) ?? { open: () => {}, close: () => {} };
}

// Route → context-bar title. The shell owns the one header for Command
// Center, Report, the four spine stages (titled by the active ?tab via
// spineStages.ts so the title names the tab you're on) and their standalone
// twins (/content, /articles, /keyword-research, /brands). null means "this
// route keeps its own in-page header" (e.g. /settings).
function shellTitleFor(location: string, tab: string | null): string | null {
  if (location === "/" || location === "/dashboard") return "Command Center";
  if (location === "/report") return "Report";
  return spineTitleFor(location, tab);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inspector, setInspector] = useState<InspectorPayload | null>(null);
  const [location] = useLocation();
  const search = useSearch();
  const [cmdkOpen, setCmdkOpen] = useState(false);

  // Global Cmd/Ctrl+K → command palette. Mounted here so it's live on every
  // authenticated route. Different key from the sidebar's Cmd/Ctrl+B, so the
  // two shortcuts don't collide.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = shellTitleFor(location, new URLSearchParams(search).get("tab"));
  const ownsContextBar = title !== null;
  const inspectorOpen = ownsContextBar && inspector !== null;

  const inspectorApi: InspectorApi = {
    open: (payload) => setInspector(payload),
    close: () => setInspector(null),
  };

  return (
    <InspectorContext.Provider value={inspectorApi}>
      <div className="flex min-h-screen bg-background">
        {/* Skip link — keyboard / screen-reader (carried from AppLayout). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
        >
          Skip to main content
        </a>

        {/* Zone 1 — nav rail (desktop fixed; reused so nav.* tour targets stay). */}
        <div className="print:hidden">
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col lg:ml-[220px] print:ml-0">
          {/* Mobile top bar (carried from AppLayout). */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 lg:hidden print:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[260px] p-0">
                <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
            <Link href="/dashboard">
              <img src={logoPath} alt="VentureCite" className="h-8 w-auto cursor-pointer" />
            </Link>
            <div className="w-9" />
          </header>

          {/* Zone 2 — context bar (only the migrated surface owns it). One
              header app-wide: title + global BrandSelector + help. The wide
              bar is what fixes the old truncated "C…" / one-word wrapping. */}
          {ownsContextBar && (
            <div className="sticky top-0 z-20 hidden border-b border-border bg-background/95 backdrop-blur-sm lg:block print:hidden">
              <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-8 py-4">
                <h1 className="min-w-0 text-xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
                <div className="flex shrink-0 items-center gap-2">
                  <BrandSelector className="w-56" />
                  <PageHeaderHelp
                    tourId={location === "/" || location === "/dashboard" ? "dashboard" : undefined}
                    pageLabel={title ?? ""}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            {/* Canvas */}
            <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>

            {/* Zone 3 — inspector (desktop xl+; Command Center only). Quiet
                surface-3; only mounts when something is selected. */}
            {inspectorOpen && (
              <aside
                className="hidden w-[340px] shrink-0 border-l border-border bg-[var(--bg-surface-3)] xl:block print:hidden"
                aria-label={inspector.title}
              >
                <div className="sticky top-[73px] flex max-h-[calc(100vh-73px)] flex-col">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
                    <h2 className="text-sm font-semibold text-foreground">{inspector.title}</h2>
                    <button
                      type="button"
                      aria-label="Close inspector"
                      onClick={inspectorApi.close}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="overflow-y-auto px-5 py-4">{inspector.body}</div>
                </div>
              </aside>
            )}
          </div>
        </div>

        {/* Mobile / tablet inspector — overlay sheet (Command Center only). */}
        {ownsContextBar && (
          <Sheet
            open={inspector !== null}
            onOpenChange={(o) => {
              if (!o) inspectorApi.close();
            }}
          >
            <SheetContent side="right" className="w-[340px] p-0 xl:hidden">
              {inspector && (
                <div className="flex h-full flex-col">
                  <div className="border-b border-border px-5 py-4">
                    <h2 className="text-sm font-semibold text-foreground">{inspector.title}</h2>
                  </div>
                  <div className="overflow-y-auto px-5 py-4">{inspector.body}</div>
                </div>
              )}
            </SheetContent>
          </Sheet>
        )}

        <div className="print:hidden">
          <EducationAssistant />
        </div>

        <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
      </div>
    </InspectorContext.Provider>
  );
}
