import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import BrandSelector from "@/components/BrandSelector";
import { Button } from "@/components/ui/button";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { V2Nav } from "./V2Nav";

// The gamified shell's chrome.
//
// Geometry is the SHIPPED shell's, not the artboards'. The approved artboards
// draw a 244px rail; the app ships 200px, and the content column reflows to
// 200px rather than being rescaled to fit a wider one. Every number below is
// copied from the live shell - never imported from it, because AppShell.tsx
// and Sidebar.tsx are out of scope for this tree and must keep rendering the
// live dashboard exactly as they do now.
//
// The 56px brand row and the 56px context bar are the same height on purpose:
// their bottom hairlines then meet as one unbroken line across the viewport.
// Changing either without the other visibly breaks that seam.
//
// `vc-app` on the root is load-bearing. It sets the authenticated app's
// default type to the product scale (12px/1.5). Without it every element that
// does not carry its own `text-*` class inherits the browser's 16px, and
// nothing on this tree matches its artboard.
export function V2Shell({ children }: { children: ReactNode }) {
  const { brands, isLoading } = useBrandSelection();

  return (
    <div className="vc-app flex min-h-screen bg-vc-page">
      <a
        href="#v2-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[200px] flex-col border-r border-vc-default bg-vc-surface lg:flex">
        <div className="relative flex h-[56px] shrink-0 items-center border-b border-vc-default px-2.5">
          <Link to="/v2/today" className="flex items-center gap-2 rounded-md px-1.5 py-1.5">
            <BrandLogo />
          </Link>
        </div>

        <V2Nav />

        <div className="shrink-0 space-y-1 border-t border-vc-default px-2 py-3">
          {/* The way back to the live dashboard. Without it this tree is a
              one-way door for anyone who lands on it from a bookmark. */}
          <Link
            to="/dashboard"
            className="block rounded-sm px-2 py-2 text-caption text-vc-secondary transition-colors duration-150 hover:bg-vc-muted/50 hover:text-vc-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
          >
            Back to dashboard
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ml-[200px] print:ml-0">
        <div className="sticky top-0 z-20 hidden h-[56px] items-center border-b border-vc-default bg-vc-surface px-8 lg:flex print:hidden">
          <V2BrandControl brands={brands} isLoading={isLoading} />
        </div>

        <main id="v2-main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

// BrandSelector.tsx:41 returns `null` when the user has no brands - it renders
// nothing at all, not an empty control. The live app never sees that, because
// FirstRunGate sends a brand-less user to /welcome before any shell mounts.
// This tree is gated by AuthenticatedBareRoute, which does not redirect, so
// the zero-brand case is reachable here and has to be a real, named state:
// an unexplained hole in the context bar would read as a broken control.
function V2BrandControl({ brands, isLoading }: { brands: { id: string }[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <span className="text-caption text-vc-tertiary" data-testid="v2-brand-loading">
        Loading brands…
      </span>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="flex items-center gap-3" data-testid="v2-brand-empty">
        <span className="text-caption text-vc-secondary">
          No brands yet — add one to start measuring.
        </span>
        {/* The shipped `default` variant already rests as a tint and fills on
            hover. It is used unmodified: no bg-* through className, per the
            prohibition in ui/button.tsx. */}
        <Button asChild size="sm">
          <Link to="/welcome">Add a brand</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-caption text-vc-secondary" id="v2-brand-label">
        Brand
      </span>
      <BrandSelector />
    </div>
  );
}
