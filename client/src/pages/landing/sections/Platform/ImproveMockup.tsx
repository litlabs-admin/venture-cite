import { MockupBackdrop } from "./MockupBackdrop";
import { scrollRevealEase } from "@/pages/landing/hooks/useScrollReveal";
import { CheckIcon, FileCodeCornerIcon, RefreshCwIcon } from "./icons";

// Syntax-highlighting color spans used inside the diff lines below.
// Punctuation/tags use the grey-ramp classes, attribute names use the plain
// tertiary class, and string values use text-vc-success-ink - added lines are
// additions, so their string literals read as the same --success family as the
// diff's own added-line rail below, not the legacy brand green.
const GRAY_400 = "text-gray-400";
const GRAY_700 = "text-gray-700";
const ADDED_STRING = "text-vc-success-ink";

type Span = { text: string; className?: string };
type DiffRow =
  | { type: "hunk"; step: string; label: string }
  | { type: "line"; num: string; added: boolean; spans: Span[] };

// Verbatim diff content from index.html 2305-2363 (the two hunks: a meta
// description context+addition at line 12/13, and a FAQPage JSON-LD
// schema block spanning lines 15-21).
const rows: DiffRow[] = [
  { type: "hunk", step: "1", label: "Meta description for AI context" },
  {
    type: "line",
    num: "12",
    added: false,
    spans: [{ text: "<title>Nike Running Shoes</title>", className: GRAY_400 }],
  },
  {
    type: "line",
    num: "13",
    added: true,
    spans: [
      { text: "<", className: GRAY_400 },
      { text: "meta", className: GRAY_700 },
      { text: " ", className: GRAY_400 },
      { text: "name", className: "text-vc-tertiary" },
      { text: "=", className: GRAY_400 },
      { text: '"description"', className: ADDED_STRING },
      { text: " ", className: GRAY_400 },
      { text: "content", className: "text-vc-tertiary" },
      { text: "=", className: GRAY_400 },
      { text: '"Shop Nike running shoes. Free shipping on all orders."', className: ADDED_STRING },
      { text: " />", className: GRAY_400 },
    ],
  },
  { type: "hunk", step: "2", label: "FAQ schema for rich results" },
  {
    type: "line",
    num: "15",
    added: true,
    spans: [
      { text: "<", className: GRAY_400 },
      { text: "script", className: GRAY_700 },
      { text: " ", className: GRAY_400 },
      { text: "type", className: "text-vc-tertiary" },
      { text: "=", className: GRAY_400 },
      { text: '"application/ld+json"', className: ADDED_STRING },
      { text: ">", className: GRAY_400 },
    ],
  },
  {
    type: "line",
    num: "16",
    added: true,
    spans: [
      { text: "{ ", className: GRAY_400 },
      { text: '"@type"', className: GRAY_700 },
      { text: ": ", className: GRAY_400 },
      { text: '"FAQPage"', className: ADDED_STRING },
      { text: ",", className: GRAY_400 },
    ],
  },
  {
    type: "line",
    num: "17",
    added: true,
    spans: [
      { text: "  ", className: GRAY_400 },
      { text: '"mainEntity"', className: GRAY_700 },
      { text: ": [{", className: GRAY_400 },
    ],
  },
  {
    type: "line",
    num: "18",
    added: true,
    spans: [
      { text: "    ", className: GRAY_400 },
      { text: '"name"', className: GRAY_700 },
      { text: ": ", className: GRAY_400 },
      { text: '"What are the best Nike running shoes?"', className: ADDED_STRING },
      { text: ",", className: GRAY_400 },
    ],
  },
  {
    type: "line",
    num: "19",
    added: true,
    spans: [
      { text: "    ", className: GRAY_400 },
      { text: '"acceptedAnswer"', className: GRAY_700 },
      { text: ": { ", className: GRAY_400 },
      { text: "…", className: GRAY_400 },
      { text: " }", className: GRAY_400 },
    ],
  },
  {
    type: "line",
    num: "20",
    added: true,
    spans: [{ text: "  }] }", className: GRAY_400 }],
  },
  {
    type: "line",
    num: "21",
    added: true,
    spans: [
      { text: "</", className: GRAY_400 },
      { text: "script", className: GRAY_700 },
      { text: ">", className: GRAY_400 },
    ],
  },
];

// Row 03 "Improve" mockup - a fake code-diff/IDE panel, verbatim structure
// from _reference/index.html 2288-2373. Per the simplify-choreography rule
// the many individually-delayed line fades are collapsed into the ONE
// outer reveal already applied by the caller (index.html:2286, 700ms
// translateY(20px) delay 150ms).
//
// AMBIGUITY: the two checkmark icons (file-tab status pill + footer row)
// are captured opacity:0/scale(0.7) in source alongside a still-visible
// pulsing accent dot and the label "Applying"/"Applying changes…" - this
// reads as an independent looping "applying" status simulation (not the
// page's scroll-reveal system), so it is reproduced in that same captured
// state: pulsing dot visible, checkmark hidden, per the settled-snapshot
// rule. The dot's `atl-pulse` keyframe (the only keyframe from this row's
// source <style> block actually applied to any element) is reproduced
// below as plain CSS; the sibling `atl-wash` keyframe defined in source is
// unused by any element in this range and is omitted.
export function ImproveMockup({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="relative bg-white overflow-hidden h-full flex flex-col min-h-[240px] sm:min-h-[320px] lg:min-h-[360px]">
      <MockupBackdrop />
      <div className="relative flex-1 flex items-center justify-center py-8">
        <div
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
            transition: `700ms ${scrollRevealEase} 150ms`,
          }}
        >
          <div className="p-5 w-full">
            <div
              className="mx-auto w-full max-w-[520px] rounded bg-vc-surface overflow-hidden ring-1 ring-vc-hairline"
              style={{ boxShadow: "var(--hb-shadow-float)" }}
            >
              {/* File tab header */}
              <div className="flex items-center justify-between gap-3 px-3.5 h-11 border-b border-vc-default">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCodeCornerIcon className="text-vc-accent shrink-0" />
                  <span className="text-[12px] font-mono text-vc-primary truncate">
                    running-shoes/index.html
                  </span>
                  <span className="text-[10px] font-mono font-medium text-vc-accent bg-vc-accent-subtle px-1.5 py-0.5 rounded-[3px] tabular-nums shrink-0">
                    +8
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="relative w-3 h-3 flex items-center justify-center">
                    <span
                      className="absolute w-1.5 h-1.5 rounded-full bg-vc-accent animate-atl-pulse"
                      style={{ boxShadow: "0 0 0 4px var(--accent-subtle)" }}
                    />
                    <CheckIcon className="text-vc-accent absolute opacity-0 scale-[0.7]" />
                  </span>
                  <span
                    className="text-[10px] font-medium tabular-nums"
                    style={{ color: "var(--color-tertiary)" }}
                  >
                    Applying
                  </span>
                </div>
              </div>

              {/* Diff body */}
              <div className="relative">
                <div className="py-1.5">
                  {rows.map((row, i) =>
                    row.type === "hunk" ? (
                      <div
                        key={`hunk-${row.step}-${i}`}
                        className="flex items-center gap-2 pl-[60px] pr-4 h-7"
                      >
                        <span className="w-[15px] h-[15px] rounded-[3px] bg-vc-accent-subtle text-vc-accent text-[9px] font-mono font-semibold flex items-center justify-center shrink-0 tabular-nums">
                          {row.step}
                        </span>
                        <span className="text-[11px] font-medium text-vc-accent">{row.label}</span>
                      </div>
                    ) : (
                      <div
                        key={`line-${row.num}`}
                        className="flex items-stretch font-mono text-[11px] leading-[1.85]"
                      >
                        <span className="w-10 shrink-0 pr-2 text-right tabular-nums text-gray-400 select-none border-r border-vc-subtle">
                          {row.num}
                        </span>
                        <span
                          className={`w-5 shrink-0 text-center select-none ${row.added ? "text-vc-success" : "text-transparent"}`}
                        >
                          +
                        </span>
                        <span
                          className="flex-1 min-w-0 pl-2 pr-3 whitespace-pre overflow-hidden"
                          style={
                            row.added
                              ? {
                                  backgroundColor: "var(--success-bg)",
                                  backgroundImage:
                                    "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 60%)",
                                  boxShadow: "inset 2px 0 0 var(--success)",
                                }
                              : { backgroundColor: "transparent" }
                          }
                        >
                          {row.spans.map((s, si) => (
                            <span key={si} className={s.className}>
                              {s.text}
                            </span>
                          ))}
                        </span>
                      </div>
                    ),
                  )}
                </div>
                <div
                  className="absolute top-0 right-0 bottom-0 w-10 pointer-events-none"
                  aria-hidden="true"
                  style={{ background: "linear-gradient(90deg, transparent, white)" }}
                />
              </div>

              {/* Footer */}
              <div className="px-3.5 h-9 border-t border-vc-default flex items-center justify-between">
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium"
                  style={{ color: "var(--color-tertiary)" }}
                >
                  <CheckIcon className="opacity-0 scale-[0.7]" />
                  <span>Applying changes…</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-vc-tertiary tabular-nums">
                    8 lines · 2 sections
                  </span>
                  <span className="hb-callout flex items-center gap-1 text-[10px] font-medium text-vc-accent bg-vc-accent-subtle px-1.5 py-0.5 rounded-[3px]">
                    <RefreshCwIcon />
                    Re-crawl queued
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes atl-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
        .animate-atl-pulse {
          animation: atl-pulse 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-atl-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
