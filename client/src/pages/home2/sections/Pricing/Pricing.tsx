import { useScrollReveal } from "@/pages/home2/hooks/useScrollReveal";
import { SectionHeader } from "@/pages/home2/sections/SectionHeader/SectionHeader";
import { BillingToggle } from "./BillingToggle";
import { PricingCard } from "./PricingCard";
import { ArrowRightIcon } from "./icons";
import { growthPlan, scalePlan } from "./data";

// Verbatim from _reference/index.html:3257-3409 (section-header-06 sibling
// + <section id="pricing-section">).
export function Pricing() {
  const { ref, isVisible } = useScrollReveal<HTMLElement>();

  return (
    <>
      <SectionHeader number="06" label="Pricing" subtitle="Plans" />
      <section id="pricing-section" ref={ref} className="bg-tk-surface relative">
        <div className="px-4 lg:px-8">
          <div className="mx-auto" style={{ maxWidth: 1120 }}>
            <div
              className="bg-tk-surface border border-tk-default"
              style={{ maxWidth: 1120, margin: "0px auto" }}
            >
              {/* Header row: title + billing toggle. No explicit transition-delay
                  or easing override in source (style="" attr absent) — relies on
                  Tailwind's default transition-timing-function. */}
              <div
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 border-b border-tk-default transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <div>
                  <h2 className="text-[18px] sm:text-[24px] lg:text-[28px] font-semibold text-tk-primary tracking-[-0.02em] mb-1">
                    Simple pricing, scale as you grow<span className="text-tk-accent">.</span>
                  </h2>
                  <p className="text-[13px] sm:text-[14px] text-tk-secondary">
                    Start with a 14-day free trial. Cancel anytime.
                  </p>
                </div>
                <BillingToggle />
              </div>

              {/* Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-tk-default">
                <PricingCard
                  plan={growthPlan}
                  highlighted
                  eyebrowBadge="14-day free trial"
                  tag={{ label: "Popular", variant: "accent" }}
                  delay={0}
                  isVisible={isVisible}
                />
                <PricingCard
                  plan={scalePlan}
                  tag={{ label: "Popular with agencies", variant: "muted" }}
                  delay={100}
                  isVisible={isVisible}
                />
              </div>

              {/* Footer row: bullets + "Compare features" link. Source style
                  attr only sets transition-delay: 300ms, no easing override. */}
              <div className="border-t border-tk-default">
                <div
                  className={`px-3 sm:px-6 lg:px-8 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 transition-all duration-700 ${
                    isVisible ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ transitionDelay: "300ms" }}
                >
                  <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="w-1 h-1 rounded-full bg-tk-accent flex-shrink-0" />
                      <span className="text-[11px] sm:text-[13px] text-tk-secondary">
                        14-day free trial
                      </span>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 sm:gap-2">
                      <div className="w-1 h-1 rounded-full bg-tk-accent flex-shrink-0" />
                      <span className="text-[11px] sm:text-[13px] text-tk-secondary">
                        Cancel anytime
                      </span>
                    </div>
                  </div>
                  <a
                    href="/register"
                    className="text-[11px] sm:text-[13px] font-medium text-tk-accent hover:text-tk-accent-hover transition-colors flex items-center gap-1 flex-shrink-0"
                  >
                    Compare features
                    <ArrowRightIcon />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
