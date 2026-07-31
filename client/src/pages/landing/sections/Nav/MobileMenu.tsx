import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { MenuIcon, XIcon } from "./icons";
import { pageSections } from "./data";

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

  // Section links cannot just close the menu and let the browser follow the
  // href. The effect above locks body scroll while the menu is open, and the
  // unlock only lands after this render commits — a SMOOTH scroll kicked off
  // against a still-locked body is dropped on the floor, so the tap closed
  // the menu and went nowhere. (The old instant jump survived it, which is
  // why this only broke when scroll-behavior became smooth.)
  //
  // So: swallow the navigation, close, and scroll on the second frame, once
  // the unlock has been committed and painted.
  //
  // scrollIntoView is called with no `behavior`, deliberately — that inherits
  // the CSS scroll-behavior, which styles.css sets to smooth for this page and
  // back to auto under prefers-reduced-motion. Passing "smooth" here would
  // override the accessibility opt-out. It honours scroll-margin-top too, so
  // the landing offset stays in one place.
  const goToSection = (href: string) => (e: React.MouseEvent) => {
    const target = document.querySelector(href);
    if (!target) return; // let the browser try the href rather than dead-end
    e.preventDefault();
    setIsOpen(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: "start" });
        // Keep the URL honest without re-triggering a jump, which assigning
        // location.hash would do.
        history.replaceState(null, "", href);
      }),
    );
  };

  return (
    <>
      <button
        className="lg:hidden w-9 h-9 flex items-center justify-center text-vc-secondary hover:text-vc-primary transition-colors"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        {isOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>
      {isOpen &&
        mounted &&
        createPortal(
          <div className="lg:hidden fixed inset-0 top-[52px] sm:top-[56px] bg-vc-surface z-40 overflow-y-auto">
            <div className="px-4 py-3">
              <div className="space-y-0.5">
                {/* The page's sections, same list the desktop nav and the
                    footer render. This used to be three separate blocks —
                    top links, a Solutions group and a Tools group, each with
                    its own placeholder icon — advertising a product surface
                    that does not exist. */}
                {pageSections.map((section) => (
                  <a
                    key={section.href}
                    href={section.href}
                    onClick={goToSection(section.href)}
                    className="block px-4 py-2.5 text-[15px] font-medium rounded transition-colors text-vc-secondary hover:bg-vc-muted hover:text-vc-primary"
                  >
                    {section.name}
                  </a>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-vc-default space-y-2">
                <Link
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="block w-full px-4 py-2.5 text-center text-[14px] font-medium text-vc-secondary border border-vc-default rounded hover:border-vc-accent hover:text-vc-accent transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsOpen(false)}
                  className="block w-full px-4 py-2.5 text-center text-[14px] font-medium bg-vc-accent text-white rounded hover:bg-vc-accent-hover transition-colors"
                >
                  Get started
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
