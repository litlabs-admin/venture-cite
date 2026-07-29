import { RANKINGS } from "./data";
import { faviconUrl } from "@/pages/landing/faviconUrl";

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
          <p className="text-[11px] font-medium text-vc-secondary">Rankings</p>
          <span className="text-[11px] text-vc-tertiary hover:text-vc-accent transition-colors cursor-pointer">
            Visibility
          </span>
        </div>
        <div className="flex-1 overflow-hidden -mx-6">
          {RANKINGS.map((row) => (
            <div
              key={row.domain}
              className={
                "group relative flex items-center gap-2.5 px-6 py-[7px] transition-colors " +
                (row.highlighted ? "cursor-default" : "cursor-pointer hover:bg-vc-row-hover") +
                (row.hiddenBelowLg ? " hidden lg:flex" : "")
              }
              style={
                row.highlighted
                  ? {
                      background:
                        "linear-gradient(90deg, rgba(238,242,254,0.98) 0%, rgba(238,242,254,0.45) 100%)",
                    }
                  : undefined
              }
            >
              {/* 2px accent rail marks "your" row without adding a fifth
                  colour to the row's own type. */}
              {row.highlighted && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-[2px]"
                  style={{
                    background: "linear-gradient(180deg, var(--accent), var(--hb-accent-bright))",
                  }}
                />
              )}
              <span
                className={
                  "w-7 text-[11px] tabular-nums shrink-0 " +
                  (row.highlighted
                    ? "text-vc-primary font-semibold"
                    : row.dimmed
                      ? "text-vc-tertiary"
                      : "text-vc-secondary")
                }
              >
                #{row.rank}
              </span>
              <span
                className={
                  "shrink-0 inline-flex items-center justify-center " +
                  (row.highlighted
                    ? "w-5 h-5 rounded-[5px] bg-white ring-1 ring-[rgba(22,22,46,0.08)] shadow-[var(--hb-shadow-raised)]"
                    : "w-4 h-4")
                }
                style={
                  row.dimmed
                    ? { filter: "grayscale(0.85) saturate(0.55)", opacity: 0.72 }
                    : { filter: "none", opacity: 1 }
                }
              >
                <img
                  alt=""
                  className={
                    row.highlighted
                      ? "w-[18px] h-[18px] rounded-sm object-contain shrink-0"
                      : "shrink-0 rounded"
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
                  (row.highlighted
                    ? "text-vc-primary font-semibold"
                    : row.dimmed
                      ? "text-vc-secondary"
                      : "text-vc-primary font-medium")
                }
              >
                {row.name}
              </span>
              <span
                className={
                  "tabular-nums " +
                  (row.highlighted
                    ? "text-[13px] font-semibold text-vc-primary"
                    : row.dimmed
                      ? "text-[12px] text-vc-secondary"
                      : "text-[12px] font-medium text-vc-primary")
                }
              >
                {row.score}
              </span>
              <span
                className={
                  // Your own row states its movement as a filled pill; the
                  // rest use the ghost weight so one row reads as "you".
                  "w-[46px] shrink-0 " +
                  (row.highlighted
                    ? "inline-flex justify-center hb-pill " +
                      (row.deltaPositive ? "hb-pill-up" : "hb-pill-down")
                    : "text-right hb-delta-ghost " +
                      (row.deltaPositive ? "hb-delta-ghost-up" : "hb-delta-ghost-down") +
                      (row.dimmed ? " opacity-70" : ""))
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
