import type { CSSProperties } from "react";
import { scrollRevealEase } from "@/pages/home2/hooks/useScrollReveal";
import { CheckIcon, FileCodeCornerIcon, RefreshCwIcon } from "./icons";

const dotGridStyle = { "--mkt-dot-opacity": 0.1 } as CSSProperties;

// Syntax-highlighting color spans used inside the diff lines below. Verbatim
// from index.html — punctuation/tags use the arbitrary-value classes
// text-[var(--color-gray-400)] / text-[var(--color-gray-700)], attribute
// names use the plain text-tertiary class, and string values use
// text-[var(--color-green-600)]. Kept as literal Tailwind arbitrary-value
// classes (not swapped for a different token) to match source exactly.
const GRAY_400 = "text-[var(--color-gray-400)]";
const GRAY_700 = "text-[var(--color-gray-700)]";
const GREEN_600 = "text-[var(--color-green-600)]";

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
      { text: "name", className: "text-tk-tertiary" },
      { text: "=", className: GRAY_400 },
      { text: '"description"', className: GREEN_600 },
      { text: " ", className: GRAY_400 },
      { text: "content", className: "text-tk-tertiary" },
      { text: "=", className: GRAY_400 },
      { text: '"Shop Nike running shoes. Free shipping on all orders."', className: GREEN_600 },
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
      { text: "type", className: "text-tk-tertiary" },
      { text: "=", className: GRAY_400 },
      { text: '"application/ld+json"', className: GREEN_600 },
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
      { text: '"FAQPage"', className: GREEN_600 },
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
      { text: '"What are the best Nike running shoes?"', className: GREEN_600 },
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

// Row 03 "Improve" mockup — a fake code-diff/IDE panel, verbatim structure
// from _reference/index.html 2288-2373. Per the simplify-choreography rule
// the many individually-delayed line fades are collapsed into the ONE
// outer reveal already applied by the caller (index.html:2286, 700ms
// translateY(20px) delay 150ms).
//
// AMBIGUITY: the two checkmark icons (file-tab status pill + footer row)
// are captured opacity:0/scale(0.7) in source alongside a still-visible
// pulsing accent dot and the label "Applying"/"Applying changes…" — this
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
      <div
        className="absolute inset-0 pointer-events-none mkt-dot-grid"
        aria-hidden="true"
        style={dotGridStyle}
      />
      <div className="relative flex-1 flex items-center justify-center py-8">
        <div
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
            transition: `700ms ${scrollRevealEase} 150ms`,
          }}
        >
          <div className="p-5 w-full">
            <div className="mx-auto w-full max-w-[520px] border border-tk-default rounded bg-white overflow-hidden shadow-tk-card">
              {/* File tab header */}
              <div className="flex items-center justify-between gap-3 px-3.5 h-11 border-b border-tk-default">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCodeCornerIcon className="text-tk-accent flex-shrink-0" />
                  <span className="text-[12px] font-mono text-tk-primary truncate">
                    running-shoes/index.html
                  </span>
                  <span className="text-[10px] font-mono font-medium text-tk-accent bg-tk-accent-subtle px-1.5 py-0.5 rounded-[3px] tabular-nums flex-shrink-0">
                    +8
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="relative w-3 h-3 flex items-center justify-center">
                    <span className="absolute w-1.5 h-1.5 rounded-full bg-tk-accent animate-atl-pulse" />
                    <CheckIcon className="text-tk-accent absolute opacity-0 scale-[0.7]" />
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
                        <span className="w-[15px] h-[15px] rounded-[3px] bg-tk-accent-subtle text-tk-accent text-[9px] font-mono font-semibold flex items-center justify-center flex-shrink-0 tabular-nums">
                          {row.step}
                        </span>
                        <span className="text-[11px] font-medium text-tk-accent">{row.label}</span>
                      </div>
                    ) : (
                      <div
                        key={`line-${row.num}`}
                        className="flex items-stretch font-mono text-[11px] leading-[1.85]"
                      >
                        <span className="w-10 flex-shrink-0 pr-2 text-right tabular-nums text-[var(--color-gray-400)] select-none border-r border-tk-subtle">
                          {row.num}
                        </span>
                        <span
                          className={`w-5 flex-shrink-0 text-center select-none ${row.added ? "text-tk-accent/70" : "text-transparent"}`}
                        >
                          +
                        </span>
                        <span
                          className="flex-1 min-w-0 pl-2 pr-3 whitespace-pre overflow-hidden"
                          style={
                            row.added
                              ? {
                                  backgroundColor: "rgba(14, 147, 115, 0.04)",
                                  boxShadow: "rgba(14, 147, 115, 0.35) 2px 0px 0px inset",
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
              <div className="px-3.5 h-9 border-t border-tk-default flex items-center justify-between">
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium"
                  style={{ color: "var(--color-tertiary)" }}
                >
                  <CheckIcon className="opacity-0 scale-[0.7]" />
                  <span>Applying changes…</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-tk-tertiary tabular-nums">
                    8 lines · 2 sections
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-tk-accent bg-tk-accent-subtle px-1.5 py-0.5 rounded-[3px]">
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
