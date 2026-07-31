// Local copies of the lucide icon paths rendered in _reference/index.html's
// Platform section (2026-2425): arrow-right (feature links + Built For
// strip), trending-up (stat badges + Top Sources chips), minus (TechCrunch
// chip, flat trend), check (diff-panel status), refresh-cw (re-crawl
// badge), and the custom "file-code-corner" mark on the diff panel's file
// tab. Same convention as components/sections/Nav/icons.tsx,
// Pricing/icons.tsx, Revenue/icons.tsx.
type IconProps = { size?: number; className?: string };

// Verbatim from index.html 2044 (stroke-width 2) - used at 14px in the
// "Explore tracking" / "See how it works" / "Start improving" links, and at
// 11px in the Built For strip's agency/startup/enterprise links.
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

// Verbatim from index.html 2068-2069 (stroke-width 2.5) - Visibility/Rank/
// Mentions trend badges and the Top Sources chips (G2, Reddit, Capterra).
export function TrendingUpIcon({ size = 10, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}

// Verbatim from index.html 2218-2220 (stroke-width 2.5) - the flat-trend
// TechCrunch chip in the Top Sources row.
export function MinusIcon({ size = 10, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

// Verbatim from index.html 2297-2299 / 2368 (stroke-width 2.5) - the
// diff panel's "applying" status check, present twice (file-tab status
// pill and footer row). Both instances are captured opacity:0/scale(0.7)
// in source (mid-animation into a completed state); reproduced hidden in
// the settled snapshot per the settled-state rule below.
export function CheckIcon({ size = 11, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Verbatim from index.html 2371 (stroke-width 2) - "Re-crawl queued" badge.
export function RefreshCwIcon({ size = 9, className }: IconProps) {
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
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

// Verbatim from index.html 2290-2291 (stroke-width 1.75) - a custom lucide
// variant (not a stock lucide-react icon name) rendered as the file-tab
// icon on the "running-shoes/index.html" diff panel.
export function FileCodeCornerIcon({ size = 13, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="m5 16-3 3 3 3" />
      <path d="m9 22 3-3-3-3" />
    </svg>
  );
}
