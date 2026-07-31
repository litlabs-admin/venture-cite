import type { ReactNode } from "react";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Shared shell for the three playbook cards. Only the visual in the middle
// (AI logo grid / checklist / chat transcript) differs per card, so that
// piece is passed in as `children`.
//
// No longer a link. Each card used to be an <a> wrapping the whole tile,
// ending in a "See all features" CTA and arrow that pointed at another
// section of this same page — an affordance promising a destination when all
// it did was scroll. The card makes its point; it does not need to send you
// anywhere. The numeral's hover colour went with it, for the same reason: it
// signalled interactivity the card no longer has.
export function PlaybookCard({
  number,
  title,
  body,
  delayMs,
  isVisible,
  children,
}: {
  number: string;
  title: string;
  body: string;
  delayMs: number;
  isVisible: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`min-h-[430px] p-4 sm:p-6 lg:p-8 flex flex-col transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{ transitionDelay: `${delayMs}ms`, transitionTimingFunction: EASE }}
    >
      <span className="text-[20px] sm:text-[24px] lg:text-[28px] font-semibold tabular-nums tracking-tight text-vc-accent/30 mb-3 sm:mb-4">
        {number}
      </span>
      <h3 className="text-[15px] sm:text-[16px] font-semibold text-vc-primary tracking-[-0.02em] leading-snug mb-2 sm:mb-3">
        {title}
      </h3>
      <p className="text-[13px] sm:text-[14px] text-vc-secondary leading-relaxed">{body}</p>
      {/* mt-auto kept so the visual still bottoms out the card now that the
          CTA row that used to sit beneath it is gone. */}
      <div className="mt-auto pt-4 sm:pt-5 min-h-[140px] flex w-full items-center">{children}</div>
    </div>
  );
}
