import logoPath from "@assets/logo.png";
import { ProductMegaMenu } from "./ProductMegaMenu";
import { ResourcesMegaMenu } from "./ResourcesMegaMenu";
import { MobileMenu } from "./MobileMenu";
import { demoLink, containerMaxWidth } from "./data";

export function Nav() {
  return (
    <nav className="h-[52px] sm:h-[56px] flex items-center bg-tk-surface/95 backdrop-blur-sm sticky top-0 z-50 border-b border-tk-default px-4 lg:px-0">
      <div
        className="w-full mx-auto flex items-center justify-between relative"
        style={{ maxWidth: containerMaxWidth }}
      >
        <a href="/" className="flex-shrink-0" aria-label="VentureCite home">
          {/* Wordmark is 779x258 (~3:1), not the square mark this replaced —
              height-constrained with w-auto so it can't squash. */}
          <img src={logoPath} alt="VentureCite" className="h-[26px] w-auto" />
        </a>

        <div className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          <ProductMegaMenu />
          <ResourcesMegaMenu />
          <a
            href={demoLink.href}
            className="h-9 px-4 text-[13px] font-medium text-tk-secondary hover:text-tk-primary hover:bg-tk-muted transition-all duration-250 rounded inline-flex items-center"
          >
            {demoLink.name}
          </a>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden lg:flex items-center gap-2">
            <a
              href="/login"
              className="h-9 px-4 text-[13px] font-medium text-tk-secondary hover:text-tk-primary transition-colors duration-150 rounded inline-flex items-center"
            >
              Sign in
            </a>
            <a
              href="/register"
              className="h-9 px-4 bg-tk-accent-subtle text-tk-accent text-[13px] font-medium rounded hover:bg-tk-accent hover:text-white transition-all duration-150 inline-flex items-center"
            >
              Get started
            </a>
          </div>
          <MobileMenu />
        </div>
      </div>
    </nav>
  );
}
