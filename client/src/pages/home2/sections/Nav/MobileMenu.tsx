import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MenuIcon, XIcon, PlaceholderIcon } from "./icons";
import { mobileTopLinks, productSolutions, productTools } from "./data";

// Verbatim structure from TrakkrNav-JAUeEuWq.js `Xe`: full-screen overlay
// below the 52/56px nav bar, body scroll locked while open, Escape closes.
//
// The source renders the overlay as a sibling of <nav>, not nested inside
// it — because <nav> has backdrop-blur-sm, and backdrop-filter creates a
// new containing block for fixed-position descendants. Nesting the overlay
// inside <nav> here collapsed it to 0 height (top-[52px] + bottom-0
// resolved against nav's own ~52px box, not the viewport). Portalling to
// document.body reproduces the sibling placement without restructuring Nav
// into a client component just to share toggle state across two DOM spots.
export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <button
        className="lg:hidden w-9 h-9 flex items-center justify-center text-tk-secondary hover:text-tk-primary transition-colors"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        {isOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>
      {isOpen &&
        mounted &&
        createPortal(
          <div className="lg:hidden fixed inset-0 top-[52px] sm:top-[56px] bg-tk-surface z-40 overflow-y-auto">
            <div className="px-4 py-3">
              <div className="space-y-0.5">
                {mobileTopLinks.map((link, index) => (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`
                    block px-4 py-2.5 text-[15px] font-medium rounded transition-colors
                    ${index === 0 ? "text-tk-accent bg-tk-accent-subtle" : "text-tk-secondary hover:bg-tk-muted hover:text-tk-primary"}
                  `}
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-tk-default">
                <h3 className="px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-tk-text-muted mb-2">
                  Solutions
                </h3>
                <div className="space-y-0.5">
                  {productSolutions.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-tk-secondary hover:bg-tk-muted hover:text-tk-primary rounded transition-colors"
                    >
                      <div className="w-7 h-7 rounded bg-tk-muted flex items-center justify-center flex-shrink-0">
                        <PlaceholderIcon size={14} className="text-tk-text-muted" />
                      </div>
                      <span className="font-medium">{item.name}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-tk-default">
                <h3 className="px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-tk-text-muted mb-2">
                  Tools
                </h3>
                <div className="space-y-0.5">
                  {productTools.map((item) => {
                    const rowClass =
                      "flex items-center gap-3 px-4 py-2.5 text-[14px] text-tk-secondary hover:bg-tk-muted hover:text-tk-primary rounded transition-colors";
                    const content = (
                      <>
                        <div className="w-7 h-7 rounded bg-tk-muted flex items-center justify-center flex-shrink-0">
                          <PlaceholderIcon size={14} className="text-tk-text-muted" />
                        </div>
                        <span className="font-medium">{item.name}</span>
                      </>
                    );
                    // Both branches of the source's external/internal ternary
                    // render the same <a> now that next/Link is gone, and no
                    // menu link is external.
                    return (
                      <a
                        key={item.name}
                        href={item.href}
                        className={rowClass}
                        onClick={() => setIsOpen(false)}
                      >
                        {content}
                      </a>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-tk-default space-y-2">
                <a
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="block w-full px-4 py-2.5 text-center text-[14px] font-medium text-tk-secondary border border-tk-default rounded hover:border-tk-accent hover:text-tk-accent transition-colors"
                >
                  Sign in
                </a>
                <a
                  href="/register"
                  onClick={() => setIsOpen(false)}
                  className="block w-full px-4 py-2.5 text-center text-[14px] font-medium bg-tk-accent text-white rounded hover:bg-tk-accent-hover transition-colors"
                >
                  Get started
                </a>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
