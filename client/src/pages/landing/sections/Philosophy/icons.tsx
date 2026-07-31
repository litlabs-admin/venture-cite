// Local copies of the lucide-react "arrow-right" CTA icon and the two
// checkmark SVGs seen in _reference/index.html:2464-2759 (Philosophy /
// "Why Trakkr" section), matching the convention in
// components/sections/Pricing/icons.tsx.
type IconProps = { size?: number; className?: string };

// CTA arrow, identical markup to Pricing/icons.tsx's ArrowRightIcon - kept
// as a local copy per-section rather than shared, matching existing
// convention (each section owns its own icons.tsx).
export function ArrowRightIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// Card 02 checklist checkbox tick (index.html:2489 and identical siblings).
// Source ships it as a draw-in animation (pathLength=1, stroke-dasharray=1,
// stroke-dashoffset=1, transitioning on a hover/interaction trigger this
// rebuild doesn't wire up per the simplify-choreography rule) - rendered
// here at its settled/resting dashoffset of 1, i.e. undrawn, matching the
// checklist's unchecked resting state.
export function ChecklistTickIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M1.5 5.5L4 8L8.5 2"
        stroke="white"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1}
        style={{ transition: "stroke-dashoffset 320ms cubic-bezier(0.16, 1, 0.3, 1) 80ms" }}
      />
    </svg>
  );
}

// Card 03 chat-transcript "done" tag icon (index.html:2521 and identical
// siblings) - static checkmark, currentColor, no draw-in.
export function TagCheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M1.5 5.5L4 8L8.5 2"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
