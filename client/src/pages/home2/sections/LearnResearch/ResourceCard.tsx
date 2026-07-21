import { ArrowRightIcon } from "./icons";
import { scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";
import type { ResourceCardData } from "./data";

export function ResourceCard({ item, isVisible }: { item: ResourceCardData; isVisible: boolean }) {
  return (
    <a
      href={item.href}
      className={
        "group flex items-stretch transition-all duration-500 " +
        (isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
      }
      style={{ transitionDelay: `${item.delayMs}ms`, transitionTimingFunction: scrollRevealEase }}
    >
      <div className="box-border w-[72px] min-h-[72px] flex-shrink-0 overflow-hidden self-stretch border-r border-tk-default bg-white p-2 flex items-center justify-center">
        <img
          src={item.iconSrc}
          alt=""
          width={72}
          height={72}
          className={
            item.iconClassName +
            " max-h-full max-w-full object-contain transition-transform duration-250 group-hover:scale-105"
          }
        />
      </div>
      <div className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          {item.showMobileEyebrow && (
            <span className="lg:hidden text-[11px] font-semibold tracking-[0.08em] text-tk-accent tabular-nums">
              [07]
            </span>
          )}
          <h3 className="text-[12px] sm:text-[13px] font-semibold text-tk-primary group-hover:text-tk-accent transition-colors duration-200">
            {item.title}
          </h3>
          <ArrowRightIcon
            size={12}
            strokeWidth={2}
            className="text-tk-text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200"
          />
        </div>
        <p className="text-[10px] sm:text-[11px] text-tk-secondary">{item.subtitle}</p>
      </div>
    </a>
  );
}
