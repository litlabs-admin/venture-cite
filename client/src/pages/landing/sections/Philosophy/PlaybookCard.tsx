import type { ReactNode } from "react";
import { ArrowRightIcon } from "./icons";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Shared shell for the three "Why Trakkr" playbook cards
// (_reference/index.html:2476-2723). The outer <a>, numeral, title, body,
// visual-wrapper and CTA markup are identical across all three cards — only
// the visual in the middle (AI logo grid / checklist / chat transcript)
// differs, so that piece is passed in as `children` and built by its own
// component per card.
export function PlaybookCard({
  number,
  href,
  title,
  body,
  ctaLabel,
  delayMs,
  isVisible,
  children,
}: {
  number: string;
  href: string;
  title: string;
  body: string;
  ctaLabel: string;
  delayMs: number;
  isVisible: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`group min-h-[430px] p-4 sm:p-6 lg:p-8 flex flex-col transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{ transitionDelay: `${delayMs}ms`, transitionTimingFunction: EASE }}
    >
      <span className="text-[20px] sm:text-[24px] lg:text-[28px] font-semibold tabular-nums tracking-tight text-vc-accent/30 group-hover:text-vc-accent transition-colors duration-300 mb-3 sm:mb-4">
        {number}
      </span>
      <h3 className="text-[15px] sm:text-[16px] font-semibold text-vc-primary tracking-[-0.02em] leading-snug mb-2 sm:mb-3">
        {title}
      </h3>
      <p className="text-[13px] sm:text-[14px] text-vc-secondary leading-relaxed">{body}</p>
      <div className="mt-4 sm:mt-5 mb-6 sm:mb-7 min-h-[140px] flex w-full items-center">
        {children}
      </div>
      <span className="mt-auto text-[12px] sm:text-[13px] font-medium text-vc-accent flex items-center gap-1.5">
        {ctaLabel}
        <ArrowRightIcon className="group-hover:translate-x-1 transition-transform duration-300" />
      </span>
    </a>
  );
}
