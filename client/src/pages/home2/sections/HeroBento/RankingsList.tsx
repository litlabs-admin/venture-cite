import { RANKINGS } from "./data";
import { faviconUrl } from "@/pages/home2/faviconUrl";

// Right column of Row 1 (col-span-4): Rankings list, verbatim from
// _reference/index.html lines 1142-1191. Source staggers each row in via
// `rankRowIn` (45ms apart); per the simplify-choreography rule that's
// collapsed here into rendering every row already settled (opacity 1) --
// the section's own single mount fade (see HeroBento.tsx) covers the
// reveal instead of 8 separately-timed row animations.
export function RankingsList() {
  return (
    <div className="col-span-12 lg:col-span-4">
      <div className="flex flex-col h-full px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-medium text-tk-secondary">Rankings</p>
          <span className="text-[11px] text-tk-tertiary hover:text-tk-accent transition-colors cursor-pointer">
            Visibility
          </span>
        </div>
        <div className="flex-1 overflow-hidden -mx-6">
          {RANKINGS.map((row) => (
            <div
              key={row.domain}
              className={
                "group relative flex items-center gap-2.5 px-6 py-[7px] transition-colors " +
                (row.highlighted
                  ? "cursor-default bg-tk-accent-subtle/55"
                  : "cursor-pointer hover:bg-[rgba(244,244,240,0.55)]") +
                (row.hiddenBelowLg ? " hidden lg:flex" : "")
              }
            >
              <span
                className={
                  "w-7 text-[11px] tabular-nums flex-shrink-0 " +
                  (row.highlighted ? "text-tk-primary font-medium" : "text-tk-tertiary")
                }
              >
                #{row.rank}
              </span>
              <span
                className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4"
                style={
                  row.dimmed
                    ? { filter: "grayscale(1) contrast(0.92) brightness(1.05)", opacity: 0.55 }
                    : { filter: "none", opacity: 1 }
                }
              >
                <img
                  alt=""
                  className={
                    row.highlighted
                      ? "w-[18px] h-[18px] rounded-sm object-contain shrink-0"
                      : "flex-shrink-0 rounded"
                  }
                  style={
                    row.highlighted ? undefined : { width: row.logoSizePx, height: row.logoSizePx }
                  }
                  src={faviconUrl(row.domain, 64)}
                />
              </span>
              <span
                className={
                  "flex-1 text-[12px] truncate transition-colors duration-150 " +
                  (row.dimmed ? "text-tk-secondary" : "text-tk-primary font-medium")
                }
              >
                {row.name}
              </span>
              <span
                className={
                  "text-[12px] tabular-nums text-tk-primary" +
                  (row.highlighted ? " font-semibold" : "")
                }
              >
                {row.score}
              </span>
              <span
                className={
                  "text-[10px] tabular-nums w-8 text-right flex-shrink-0 font-mono " +
                  (row.deltaPositive ? "text-tk-accent" : "text-rose-400")
                }
              >
                {row.delta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
