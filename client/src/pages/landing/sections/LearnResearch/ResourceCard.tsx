import { scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import type { ResourceCardData } from "./data";

export function ResourceCard({ item, isVisible }: { item: ResourceCardData; isVisible: boolean }) {
  return (
    <div
      className={
        "flex items-stretch transition-all duration-500 " +
        (isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
      }
      style={{ transitionDelay: `${item.delayMs}ms`, transitionTimingFunction: scrollRevealEase }}
    >
      <div
        className="box-border w-[72px] min-h-[72px] shrink-0 overflow-hidden self-stretch p-2 flex items-center justify-center"
        style={{
          background: "var(--hb-surface-wash)",
          boxShadow: "inset -1px 0 0 var(--hb-hairline)",
        }}
      >
        <img
          src={item.iconSrc}
          alt=""
          width={72}
          height={72}
          className={item.iconClassName + " max-h-full max-w-full object-contain"}
        />
      </div>
      <div className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          {/* Must match LearnResearch's own desktop eyebrow - this is the
              mobile stand-in for it, not an independent number. */}
          {item.showMobileEyebrow && (
            <span className="lg:hidden text-[11px] font-semibold tracking-[0.08em] text-vc-accent tabular-nums">
              [05]
            </span>
          )}
          <h3 className="text-[12px] sm:text-[13px] font-semibold text-vc-primary">{item.title}</h3>
        </div>
        <p className="text-[10px] sm:text-[11px] text-vc-secondary">{item.subtitle}</p>
      </div>
    </div>
  );
}
