import { ArrowRightIcon } from "./icons";
import { NavItemIcon } from "@/pages/landing/sections/Nav/icons";
import { scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { dataTiles, type DataTileData } from "./data";

function DataTile({ item, isVisible }: { item: DataTileData; isVisible: boolean }) {
  return (
    <a
      href={item.href}
      className={
        "group relative flex flex-col gap-3 px-4 sm:px-5 py-5 sm:py-6 min-h-[150px] " +
        "border-vc-default transition-all duration-500 hover:bg-[rgba(0,0,0,0.012)] " +
        item.borderClassName +
        " " +
        (isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3")
      }
      style={{ transitionDelay: `${item.delayMs}ms`, transitionTimingFunction: scrollRevealEase }}
    >
      <div className="flex items-start justify-between">
        <NavItemIcon
          item={item}
          size={56}
          className={
            "w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] -ml-1 -mt-1 transition-transform duration-300 group-hover:scale-[1.06] " +
            (item.iconExtraClassName ?? "")
          }
        />
        <ArrowRightIcon
          size={14}
          strokeWidth={1.5}
          className="text-vc-text-muted opacity-0 -translate-x-0.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 mt-1"
        />
      </div>
      <div className="mt-auto">
        <div className="flex items-baseline gap-2">
          <h4 className="text-[13px] font-semibold text-vc-primary group-hover:text-vc-accent transition-colors duration-200">
            {item.title}
          </h4>
          <span className="text-[11px] font-medium tabular-nums text-vc-tertiary">
            {item.count}
          </span>
        </div>
        <p className="text-[11px] text-vc-secondary truncate mt-0.5">{item.description}</p>
      </div>
    </a>
  );
}

export function DataTileGrid({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-vc-default">
      {dataTiles.map((item, i) => (
        <DataTile key={`${item.href}-${i}`} item={item} isVisible={isVisible} />
      ))}
    </div>
  );
}
