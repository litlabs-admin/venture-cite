import { Link } from "@tanstack/react-router";
import { FooterColumn } from "./FooterColumn";
import { ArrowRightIcon, LinkedInIcon } from "./icons";
import {
  solutionsLinks,
  mobileProductLinks,
  desktopProductLinks,
  mobileLearnLinks,
  desktopLearnLinks,
} from "./data";
import { BrandLogo } from "@/components/BrandLogo";

// index.html:3627-3769. Every reveal block in the source is already
// captured in its settled state (opacity-100, translate-y-0) — per the
// project's settled-vs-transient rule that's the resting look, rendered by
// default here and wired to play in via useScrollReveal + IntersectionObserver
// rather than treated as the permanent state. The transition classes
// (duration-500 ease-out) and every per-element transition-delay value are
// taken verbatim from the source's inline styles, not the generic 100ms
// stagger convention, since the source supplies exact numbers here.
const REVEAL = "transition-all duration-500 ease-out";

function revealY(isVisible: boolean) {
  return `${REVEAL} ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`;
}

// index.html:3743-3746 — the bottom bar's reveal wrapper only ever carries
// "opacity-100" in the source, never a translate-y-* class, so only opacity
// is toggled here (unlike the blocks above it, which pair opacity with translate-y).
function revealOpacity(isVisible: boolean) {
  return `${REVEAL} ${isVisible ? "opacity-100" : "opacity-0"}`;
}

export function Footer() {
  // No scroll-reveal here: the footer is the last element on the page, so
  // a scroll-triggered IntersectionObserver with the sitewide -40% bottom
  // rootMargin can never be satisfied once the user is scrolled all the way
  // down (its resting position never crosses the trigger line) — that left
  // the footer permanently invisible for anyone who scrolled straight to
  // the bottom. This animation was never confirmed against source either
  // (see migration report), so rendering it always-visible is both safer
  // and no less faithful than a guess.
  const isVisible = true;

  return (
    <footer className="bg-vc-surface">
      <div className="bg-vc-surface border-y border-vc-default relative">
        <div className="px-4 sm:px-6 lg:px-8 mx-auto" style={{ maxWidth: 1120 }}>
          {/* Mobile condensed block — index.html:3630-3674 */}
          <div className="sm:hidden py-6">
            <div
              className={`flex items-start gap-3 mb-5 pb-5 border-b border-vc-default ${revealY(isVisible)}`}
            >
              <Link to="/" className="shrink-0">
                <BrandLogo imgClassName="h-6 w-auto" textClassName="text-caption" />
              </Link>
              <p className="text-[11px] text-vc-secondary leading-relaxed">
                Get recommended by AI engines. Every question your buyers ask.
              </p>
            </div>

            <div
              className={`grid grid-cols-3 gap-4 mb-5 pb-5 border-b border-vc-default ${revealY(isVisible)}`}
              style={{ transitionDelay: "50ms" }}
            >
              <div>
                <FooterColumn title="Product" links={mobileProductLinks} size="mobile">
                  {/* Real (server-rendered) route — a TanStack `<Link>`
                      via FooterColumn's children slot, not a data-driven
                      href, since every entry in mobileProductLinks is a
                      full-reload `<a>`. */}
                  <Link
                    to="/pricing"
                    className="block text-[11px] text-vc-secondary hover:text-vc-accent transition-colors"
                  >
                    Pricing
                  </Link>
                </FooterColumn>
              </div>
              <div>
                <FooterColumn title="Solutions" links={solutionsLinks} size="mobile" />
              </div>
              <div>
                <FooterColumn title="Learn" links={mobileLearnLinks} size="mobile" />
              </div>
            </div>

            <div className={revealY(isVisible)} style={{ transitionDelay: "100ms" }}>
              <Link
                to="/register"
                className="h-9 w-full bg-vc-accent-subtle text-vc-accent text-[12px] font-medium rounded flex items-center justify-center gap-1.5 whitespace-nowrap hover:bg-vc-accent hover:text-white transition-all duration-150"
              >
                Get started
                <ArrowRightIcon size={14} />
              </Link>
            </div>
          </div>

          {/* Desktop grid — index.html:3675-3739 */}
          <div className="hidden sm:grid grid-cols-3 lg:grid-cols-[180px_1fr_1fr_1fr_160px] gap-6 lg:gap-0 py-10 lg:py-0">
            <div
              className={`col-span-3 lg:col-span-1 lg:py-10 lg:px-6 lg:border-r border-vc-default flex flex-col ${revealY(
                isVisible,
              )}`}
            >
              <Link to="/" className="flex items-center mb-4">
                <BrandLogo imgClassName="h-6 w-auto" textClassName="text-caption" />
              </Link>
              <p className="text-[12px] text-vc-secondary leading-relaxed mb-4 max-w-[180px]">
                Get recommended by AI engines. Every question your buyers ask.
              </p>
              <div className="flex items-center gap-2">
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className="w-7 h-7 rounded border border-vc-default flex items-center justify-center text-vc-text-muted hover:text-vc-accent hover:border-vc-accent hover:bg-vc-accent-subtle transition-all duration-150"
                >
                  <LinkedInIcon className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div
              className={`lg:py-8 lg:px-5 lg:border-r border-vc-default ${revealY(isVisible)}`}
              style={{ transitionDelay: "50ms" }}
            >
              <FooterColumn title="Product" links={desktopProductLinks} size="desktop">
                <Link
                  to="/pricing"
                  className="block text-[12px] text-vc-secondary hover:text-vc-accent transition-colors duration-150"
                >
                  Pricing
                </Link>
              </FooterColumn>
            </div>

            <div
              className={`lg:py-8 lg:px-5 lg:border-r border-vc-default ${revealY(isVisible)}`}
              style={{ transitionDelay: "75ms" }}
            >
              <FooterColumn title="Solutions" links={solutionsLinks} size="desktop" />
            </div>

            <div
              className={`lg:py-8 lg:px-5 lg:border-r border-vc-default ${revealY(isVisible)}`}
              style={{ transitionDelay: "100ms" }}
            >
              <FooterColumn title="Learn" links={desktopLearnLinks} size="desktop" />
            </div>

            <div
              className={`col-span-3 lg:col-span-1 lg:py-8 lg:px-5 flex flex-col ${revealY(isVisible)}`}
              style={{ transitionDelay: "150ms" }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted mb-2">
                Get started
              </div>
              <Link
                to="/register"
                className="h-9 px-4 bg-vc-accent-subtle text-vc-accent text-[13px] font-medium rounded flex items-center justify-center gap-1.5 whitespace-nowrap hover:bg-vc-accent hover:text-white transition-all duration-150"
              >
                Get started
                <ArrowRightIcon size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar — index.html:3742-3752 */}
      <div className="px-4 sm:px-6 lg:px-8 mx-auto" style={{ maxWidth: 1120 }}>
        <div
          className={`py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 ${revealOpacity(
            isVisible,
          )}`}
          style={{ transitionDelay: "250ms" }}
        >
          <span className="text-[10px] sm:text-[11px] text-vc-text-muted">
            © 2026 VentureCite. All rights reserved.
          </span>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* No live status page exists yet — the source's status-widget
                  link is replaced with the same "Built for the AI search
                  era" line landing.tsx's footer strip uses, keeping the
                  dot + text layout instead of inventing an unsourced page. */}
            <span className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] text-vc-tertiary">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-vc-muted" />
              <span className="text-vc-text-muted">Built for the AI search era</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
