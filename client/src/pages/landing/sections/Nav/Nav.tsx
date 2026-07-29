import { Link } from "@tanstack/react-router";
import logoPath from "@assets/logo.png";
import { ProductMegaMenu } from "./ProductMegaMenu";
import { ResourcesMegaMenu } from "./ResourcesMegaMenu";
import { MobileMenu } from "./MobileMenu";
import { demoLink, containerMaxWidth } from "./data";

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
          <img src={logoPath} alt="VentureCite" className="h-[26px] w-auto" />
        </Link>

        <div className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          <ProductMegaMenu />
          <ResourcesMegaMenu />
          <a
            href={demoLink.href}
            className="h-9 px-4 text-[13px] font-medium text-vc-secondary hover:text-vc-primary hover:bg-vc-muted transition-all duration-250 rounded inline-flex items-center"
          >
            {demoLink.name}
          </a>
          {/* Real (server-rendered) route, unlike the # anchors above — a
              TanStack `<Link>` so it navigates client-side instead of a
              full reload. */}
          <Link
            to="/pricing"
            className="h-9 px-4 text-[13px] font-medium text-vc-secondary hover:text-vc-primary hover:bg-vc-muted transition-all duration-250 rounded inline-flex items-center"
          >
            Pricing
          </Link>
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
                tier (--ink-fill). The accent fill is reserved for the
                in-page conversion CTA in the hero. Never both accent.
                Arbitrary values because --ink-fill/--ink are declared on
                .vc-home in landing/styles.css but not registered as Tailwind
                theme keys in index.css. */}
            <Link
              to="/register"
              className="h-9 px-4 bg-[var(--ink-fill)] text-white text-[13px] font-medium rounded hover:bg-[var(--ink)] transition-colors duration-150 inline-flex items-center"
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
