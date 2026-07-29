import { CONVERSATION_BARS } from "./chartData";
import { CONVERSATION_ROWS } from "./data";

// Conversations panel content, verbatim from _reference/index.html lines
// 1310-1447 (desktop) / 1611-1748 (mobile carousel duplicate -- confirmed
// identical content on spot-check). Mounted twice by HeroBento.tsx, same
// pattern as CrawlersPanel.
export function ConversationsPanel() {
  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium text-vc-secondary">Conversations</p>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tracking-tight text-vc-primary tabular-nums leading-none">
            2,810
          </span>
          <span className="hb-pill hb-pill-up">↑33%</span>
        </div>
        <span className="text-[10px] text-vc-text-muted mt-1 block">
          conversations citing nike.com
        </span>
      </div>

      <div className="relative mb-3">
        <div
          className="flex items-end gap-[1.5px] h-[26px] border-b"
          style={{ borderBottomColor: "var(--hb-chart-baseline)" }}
        >
          {CONVERSATION_BARS.map((bar, i) => {
            const isNow = i === CONVERSATION_BARS.length - 1;
            return (
              <div key={i} className="flex-1 cursor-pointer">
                <div
                  style={{
                    // Same source value as before (bar.opacity); it now
                    // drives height as the primary channel with alpha as a
                    // secondary one, so the strip reads as a chart instead
                    // of a flat heat band.
                    height: `${6 + 18 * bar.opacity}px`,
                    borderRadius: "2px 2px 0 0",
                    background:
                      "linear-gradient(180deg, var(--accent) 0%, var(--hb-accent-bright) 50%, var(--accent-tint-1) 100%)",
                    opacity: isNow ? 1 : 0.42 + 0.58 * bar.opacity,
                    filter: isNow ? "drop-shadow(0 0 6px rgba(59,91,246,0.40))" : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-vc-tertiary font-mono tabular-nums">3pm</span>
          <span className="text-[9px] text-vc-tertiary font-mono tabular-nums">9pm</span>
          <span className="text-[9px] text-vc-tertiary font-mono tabular-nums">3am</span>
          <span className="text-[9px] text-vc-tertiary font-mono tabular-nums">9am</span>
          <span className="text-[9px] text-vc-secondary font-mono font-medium">Now</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 -mx-2 mt-1">
        <div className="flex items-center gap-1.5 mb-2 px-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-vc-accent-subtle px-2 py-[3px]">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-vc-accent opacity-75 animate-ping" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-vc-accent" />
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-vc-accent">
              Live
            </span>
          </span>
        </div>
        <div className="space-y-px">
          {CONVERSATION_ROWS.map((row, i) => (
            <div
              key={row.resultPath}
              data-conversation-row="true"
              className={
                // Row recency is carried by the logo chip's alpha and the
                // query-text colour ramp below -- NOT by fading the whole
                // row, which also washed out the timestamps and paths.
                "group relative rounded-[5px] transition-colors duration-150 cursor-pointer hover:bg-vc-row-hover" +
                (i === 0 ? " bg-[rgba(238,242,254,0.45)]" : "")
              }
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-white ring-1 ring-[rgba(22,22,46,0.06)]"
                  style={{ opacity: 0.55 + 0.45 * row.opacity }}
                >
                  <img
                    src={row.logoSrc}
                    alt=""
                    width={14}
                    height={14}
                    className="w-3.5 h-3.5 object-contain"
                  />
                </span>
                <span
                  className={
                    "flex-1 min-w-0 text-[11px] truncate group-hover:text-vc-primary transition-colors " +
                    (i === 0
                      ? "text-vc-primary"
                      : i <= 2
                        ? "text-vc-secondary"
                        : "text-vc-tertiary")
                  }
                >
                  {row.query}
                </span>
                <span className="shrink-0 text-[10px] font-mono tabular-nums w-[88px] text-right truncate text-vc-tertiary">
                  {row.resultPath}
                </span>
                <span className="shrink-0 text-[10px] font-mono tabular-nums w-12 text-right text-vc-text-muted">
                  {row.timeAgo}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
