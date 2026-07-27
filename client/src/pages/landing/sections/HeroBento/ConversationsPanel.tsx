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
          <span className="flex items-center gap-0.5 text-[11px] font-medium text-vc-accent tabular-nums">
            ↑33%
          </span>
        </div>
        <span className="text-[10px] text-vc-text-muted mt-0.5 block">
          conversations citing nike.com
        </span>
      </div>

      <div className="relative mb-3">
        <div className="flex gap-px">
          {CONVERSATION_BARS.map((bar, i) => (
            <div key={i} className="flex-1 relative cursor-pointer">
              <div
                className="h-[14px]"
                style={{
                  backgroundColor: `rgba(14, 147, 115, ${bar.opacity})`,
                  opacity: 1,
                  transformOrigin: "center bottom",
                  transform: "scaleY(1)",
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[8px] text-[#d6d3d1] font-mono tabular-nums">3pm</span>
          <span className="text-[8px] text-[#d6d3d1] font-mono tabular-nums">9pm</span>
          <span className="text-[8px] text-[#d6d3d1] font-mono tabular-nums">3am</span>
          <span className="text-[8px] text-[#d6d3d1] font-mono tabular-nums">9am</span>
          <span className="text-[8px] text-[#a8a29e] font-mono">Now</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 -mx-2 mt-1">
        <div className="flex items-center gap-1.5 mb-2 px-2">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-vc-accent opacity-75 animate-ping" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-vc-accent" />
          </span>
          <span className="text-[10px] font-medium text-vc-accent">Live</span>
        </div>
        <div className="space-y-px">
          {CONVERSATION_ROWS.map((row) => (
            <div
              key={row.resultPath}
              data-conversation-row="true"
              className="group relative rounded transition-colors duration-150 cursor-pointer hover:bg-[rgba(244,244,240,0.55)]"
              style={{ opacity: row.opacity }}
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <img
                  src={row.logoSrc}
                  alt=""
                  width={14}
                  height={14}
                  className="w-3.5 h-3.5 shrink-0 object-contain"
                />
                <span className="flex-1 min-w-0 text-[11px] text-vc-secondary truncate group-hover:text-vc-primary transition-colors">
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
