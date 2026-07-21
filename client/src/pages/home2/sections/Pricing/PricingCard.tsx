import { scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";
import type { PricingFeature, PricingPlan } from "./data";

// Dotted-underline tooltip triggers (_reference/index.html:3313 etc, e.g.
// `<span class="text-secondary border-b border-dotted ..." cursor-help>`)
// are rendered visually only — components/ui/Popover.tsx does not exist yet
// in this codebase (checked before building). No popover is wired up here.
// AMBIGUITY / follow-up — see closing report.
function FeatureRow({ feature }: { feature: PricingFeature }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-1 h-1 rounded-full bg-tk-accent flex-shrink-0 mt-1.5" />
      <span className="text-[12px] sm:text-[13px] leading-snug">
        <div className="inline-block">
          <span className="text-tk-secondary border-b border-dotted border-[#d6d3d1]/60 hover:border-[#a8a29e] hover:text-tk-primary cursor-help transition-colors">
            {feature.text}
          </span>
        </div>
        {feature.note && <span className="text-tk-text-muted ml-1">{feature.note}</span>}
      </span>
    </div>
  );
}

export interface PricingCardTag {
  label: string;
  variant: "accent" | "muted";
}

export function PricingCard({
  plan,
  highlighted = false,
  eyebrowBadge,
  tag,
  delay,
  isVisible,
}: {
  plan: PricingPlan;
  highlighted?: boolean;
  eyebrowBadge?: string;
  tag: PricingCardTag;
  delay: number;
  isVisible: boolean;
}) {
  return (
    <div
      className={`relative p-4 sm:p-6 lg:p-8 flex flex-col ${highlighted ? "bg-tk-accent-subtle/20" : ""} transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{ transitionDelay: `${delay}ms`, transitionTimingFunction: scrollRevealEase }}
    >
      {eyebrowBadge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-tk-accent-subtle text-tk-accent text-[10px] sm:text-[11px] font-medium rounded border border-tk-accent/20 whitespace-nowrap">
            {eyebrowBadge}
          </span>
        </div>
      )}
      <div className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-[15px] sm:text-[16px] font-semibold text-tk-primary">{plan.name}</h3>
          <span
            className={
              tag.variant === "accent"
                ? "text-[9px] sm:text-[10px] font-semibold text-tk-accent uppercase tracking-wider bg-tk-accent-subtle px-1.5 py-0.5 rounded"
                : "text-[9px] sm:text-[10px] font-medium text-tk-text-muted uppercase tracking-wider"
            }
          >
            {tag.label}
          </span>
        </div>
        <p className="text-[12px] sm:text-[13px] text-tk-secondary">{plan.description}</p>
      </div>
      <div className="mb-4 sm:mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] sm:text-[36px] font-semibold text-tk-primary tracking-tight tabular-nums">
            {plan.price}
          </span>
          <span className="text-[12px] sm:text-[13px] text-tk-text-muted">{plan.priceSuffix}</span>
        </div>
      </div>
      <div className="space-y-2 sm:space-y-2.5 mb-4 sm:mb-6 flex-1">
        {plan.features.map((feature) => (
          <FeatureRow key={feature.text} feature={feature} />
        ))}
      </div>
      <a
        href={plan.ctaHref}
        className="w-full py-2.5 sm:py-3 rounded text-[12px] sm:text-[13px] font-medium transition-all duration-150 text-center block bg-tk-accent-subtle text-tk-accent hover:bg-tk-accent hover:text-white"
      >
        {plan.ctaLabel}
      </a>
    </div>
  );
}
