import { Link } from "@tanstack/react-router";
import { MobileMenu } from "./MobileMenu";
import { pageSections, containerMaxWidth } from "./data";
import { BrandLogo } from "@/components/BrandLogo";

// The two mega-menus this used to open (Product and Resources, ~30 links
// between them) are gone. They advertised a product surface the app does not
// have — most rows resolved to /register or to an anchor on this same page —
// and a one-page site does not need a hover-triggered navigation system.
// What is left is the page's own sections, plus the two conversion actions.

export function Nav() {
  return (
    <nav className="h-[52px] sm:h-[56px] flex items-center bg-vc-surface/95 backdrop-blur-sm sticky top-0 z-50 border-b border-vc-default px-4 lg:px-0">
      <div
        className="w-full mx-auto flex items-center justify-between relative"
        style={{ maxWidth: containerMaxWidth }}
      >
        <Link to="/" className="shrink-0" aria-label="VentureCite home">
          {/* Wordmark is 779x258 (~3:1), not the square mark this replaced —
              height-constrained with w-auto so it can't squash. */}
          <BrandLogo imgClassName="h-[26px] w-auto" textClassName="text-body" />
        </Link>

        {/* Plain <a> anchors, not TanStack <Link>s: these scroll within the
            current document. Routing them would push a history entry and make
            Back walk the section list. */}
        <div className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {pageSections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="h-9 px-4 text-[13px] font-medium text-vc-secondary hover:text-vc-primary hover:bg-vc-muted transition-all duration-250 rounded inline-flex items-center"
            >
              {section.name}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden lg:flex items-center gap-2">
            <Link
              to="/login"
              className="h-9 px-4 text-[13px] font-medium text-vc-secondary hover:text-vc-primary transition-colors duration-150 rounded inline-flex items-center"
            >
              Sign in
            </Link>
            {/* Two-tier button system: this persistent nav CTA is the DARK
                tier (ink-fill). The accent fill is reserved for the in-page
                conversion CTA in the hero. Never both accent. */}
            <Link
              to="/register"
              className="h-9 px-4 bg-ink-fill text-white text-[13px] font-medium rounded hover:bg-ink transition-colors duration-150 inline-flex items-center"
            >
              Get started
            </Link>
          </div>
          <MobileMenu />
        </div>
      </div>
    </nav>
  );
}
