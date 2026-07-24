import { ChevronDownIcon } from "./icons";
import { faviconUrl } from "@/pages/landing/faviconUrl";

// Header bar, verbatim from _reference/index.html lines 1090-1094: a brand
// switcher button (favicon + name + chevron) on the left, the live score +
// delta + rank badge on the right. Static/settled -- the brand switcher
// isn't wired to anything in the source snapshot either (no menu ever
// captured open).
export function TopChrome() {
  return (
    <div className="relative flex items-center justify-between h-12 px-5 border-b border-[#EFEEEA] bg-vc-surface">
      <button
        type="button"
        className="flex items-center gap-2 -ml-1.5 px-1.5 py-1 rounded hover:bg-vc-muted/60 transition-colors duration-150 cursor-pointer"
      >
        <img
          alt=""
          className="w-[18px] h-[18px] rounded-sm object-contain shrink-0"
          src={faviconUrl("nike.com", 64)}
        />
        <span className="text-[13px] font-semibold text-vc-primary tracking-tight">Nike</span>
        <ChevronDownIcon size={12} className="text-vc-text-muted" />
      </button>

      <div className="flex items-center gap-3 leading-none">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold text-vc-primary tabular-nums tracking-tight">
            83
          </span>
          <span className="text-[11px] tabular-nums tracking-tight text-vc-accent">+3.3</span>
        </div>
        <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-vc-tertiary tabular-nums">
          #2 of 9
        </span>
      </div>
    </div>
  );
}
