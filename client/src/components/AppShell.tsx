import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { HeaderActions } from "@/components/command-center/HeaderActions";
import Sidebar, { SidebarContent } from "./Sidebar";
import EducationAssistant from "./EducationAssistant";
import CommandPalette from "./CommandPalette";
import BrandSelector from "./BrandSelector";
import { PageHeaderHelp } from "./PageHeaderHelp";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import logoPath from "@assets/logo.png";
import { spineTitleFor, pageTourFor } from "@/lib/spineStages";

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

// The inspector has two mutually exclusive presentations: an inline aside at
// xl+ and an overlay Sheet below xl. They MUST be gated in JS, not just CSS.
// A Radix Sheet left `open` at xl+ keeps its full-screen overlay + body
// scroll-lock active even when its content is `display:none` (xl:hidden) —
// which froze the entire Command Center on desktop the moment a tile was
// clicked. Tailwind's xl breakpoint is 1280px; this hook mirrors use-mobile.
const XL_BREAKPOINT = 1280;

function useIsXlUp() {
  const [isXlUp, setIsXlUp] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);
    const onChange = () => setIsXlUp(window.innerWidth >= XL_BREAKPOINT);
    mql.addEventListener("change", onChange);
    setIsXlUp(window.innerWidth >= XL_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isXlUp;
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

/** The Command Center draws its own full-bleed hairline grid and owns its
 *  horizontal padding. Wrapping it in the shell's padded, max-width canvas
 *  would inset every row border away from the viewport edge. */
function isFullBleed(location: string) {
  // The prompt detail page draws its own top bar, section hairlines and
  // 340px aside edge-to-edge, so it takes the unpadded canvas too.
  return location === "/" || location === "/dashboard" || location.startsWith("/prompts/");
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inspector, setInspector] = useState<InspectorPayload | null>(null);
  const location = useRouterState({ select: (s) => s.location.pathname });
  // AppShell mounts above every authenticated route (Command Center, Report,
  // and all four spine stages), so — like SpineShell — it reads search
  // loosely rather than against one route's typed search; see
  // native-api-contract.md rule 3. `tab` is declared (as an optional string)
  // on every spine stage's schema in src/routes/-shared/searchSchemas.ts.
  const search = useSearch({ strict: false });
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

  const isXlUp = useIsXlUp();

  // "Data through <date>" in the context bar. Shares the Command Center's
  // hero queryKey, so on the dashboard this is a cache read, not a request.
  const { selectedBrandId, brands } = useBrandSelection();
  const selectedBrandName = brands.find((b) => b.id === selectedBrandId)?.name ?? "brand";
  const heroForDate = useQuery<{ success: boolean; data: { lastScanAt: string | null } }>({
    queryKey: [`/api/dashboard/hero/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });
  const lastScanAt = heroForDate.data?.data?.lastScanAt ?? null;
  const lastScanLabel = lastScanAt
    ? `Data through ${new Date(lastScanAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : null;
  // `useSearch({ strict: false })`'s FullSearchSchema type widens `tab` across
  // every route in the tree (including ones that don't declare it), so a
  // runtime narrow — not a cast — is what gets back to a plain `string | null`.
  const activeTab = typeof search.tab === "string" ? search.tab : null;
  const title = shellTitleFor(location, activeTab);
  const ownsContextBar = title !== null;
  const fullBleed = isFullBleed(location);
  // Exactly one presentation is live at a time. Below xl the overlay Sheet
  // owns it; at xl+ the inline aside does. Never both — see useIsXlUp above.
  const showInlineInspector = ownsContextBar && inspector !== null && isXlUp;
  const showSheetInspector = ownsContextBar && inspector !== null && !isXlUp;

  const inspectorApi: InspectorApi = {
    open: (payload) => setInspector(payload),
    close: () => setInspector(null),
  };

  return (
    <InspectorContext.Provider value={inspectorApi}>
      <div className="flex min-h-screen bg-white">
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

        <div className="flex min-w-0 flex-1 flex-col lg:ml-[200px] print:ml-0">
          {/* Mobile top bar (carried from AppLayout). */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-vc-default bg-white px-4 lg:hidden print:hidden">
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
            <Link to="/dashboard">
              <img src={logoPath} alt="VentureCite" className="h-8 w-auto cursor-pointer" />
            </Link>
            {/* Mobile help: the desktop context bar is lg:-only, so without
                this the "?" (tour replay / AI tutor) is unreachable on phones
                — where it's most needed. Sits in the balanced right slot. */}
            <PageHeaderHelp
              tourId={pageTourFor(location, activeTab)}
              pageLabel={title ?? "this page"}
            />
          </header>

          {/* Zone 2 — context bar. Measured against the reference dashboard:
              56px tall, px-8, one hairline bottom border, 14px/600 title on
              the left and the controls right-aligned at h-8. No backdrop
              blur, no shadow — this chrome is a hairline, not a layer. */}
          {ownsContextBar && (
            <div className="sticky top-0 z-20 hidden h-[56px] items-center border-b border-vc-default bg-white px-8 lg:flex print:hidden">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={logoPath} alt="" className="h-5 w-5 rounded" />
                  <span className="text-[14px] font-semibold text-vc-primary">{title}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {lastScanLabel && (
                    <span className="mr-2 select-none text-[11px] tabular-nums text-vc-hover">
                      {lastScanLabel}
                    </span>
                  )}
                  <BrandSelector className="w-48" />
                  {fullBleed && selectedBrandId && (
                    <HeaderActions brandId={selectedBrandId} brandName={selectedBrandName} />
                  )}
                  <PageHeaderHelp
                    tourId={pageTourFor(location, activeTab)}
                    pageLabel={title ?? ""}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            {/* Canvas */}
            <main id="main-content" className="min-w-0 flex-1 overflow-y-auto">
              {/* The AI Tutor pill (EducationAssistant.tsx) is `fixed bottom-6
                  right-6 h-12` — anchored to the viewport, not this canvas —
                  and covers roughly the bottom 72px on the right for every
                  authenticated route. It is not dismissible, so content that
                  ends near the bottom needs its own clearance. `pb-24` (96px)
                  covers the pill's ~72px zone with margin to spare. Above
                  ~1450px the centred max-w-[1400px] column no longer reaches
                  into the pill's corner (it sits in the gutter instead), so
                  the extra padding reverts to the original py-6 value there. */}
              {fullBleed ? (
                // The Command Center's own grid reaches the viewport edge; the
                // shell contributes nothing but the max-width column.
                <div className="mx-auto w-full max-w-[1800px]">{children}</div>
              ) : (
                <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-24 sm:px-6 lg:px-8 min-[1450px]:pb-6">
                  {children}
                </div>
              )}
            </main>

            {/* Zone 3 — inspector (desktop xl+). Live on every route that owns
                a context bar (ownsContextBar = shellTitleFor(...) !== null:
                Command Center, Report, and every Monitor/Diagnose/Act/Setup
                stage + its standalone twins), not Command-Center-only. Quiet
                surface-3; only mounts when something is selected. */}
            {showInlineInspector && (
              <aside
                className="hidden w-[340px] shrink-0 border-l border-border bg-(--bg-surface-3) xl:block print:hidden"
                aria-label={inspector.title}
              >
                <div className="sticky top-[73px] flex max-h-[calc(100vh-73px)] flex-col">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
                    <h2 className="text-sm font-semibold text-foreground">{inspector.title}</h2>
                    <button
                      type="button"
                      aria-label="Close inspector"
                      onClick={inspectorApi.close}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
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

        {/* Mobile / tablet inspector — overlay sheet, live on every route
            with a context bar (see Zone 3's comment above — not
            Command-Center-only). `open` is gated by !isXlUp so the modal
            overlay + scroll-lock never activate at xl+, where the inline
            aside is the live presentation. */}
        {ownsContextBar && (
          <Sheet
            open={showSheetInspector}
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
