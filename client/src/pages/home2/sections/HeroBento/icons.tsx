// Local lucide-style icon paths seen rendered in _reference/index.html for
// this section (lines 1090, 1456/1462/1464/1466, 1460). Note the header's
// chevron-down and the action rows' chevron-right both use stroke-width
// 1.5 here, not the 2 used by Nav's icons -- reproduced per-section as
// captured rather than sharing Nav's icons.tsx (each section owns its own
// icons.tsx, per repo convention).
type IconProps = { size?: number; className?: string };

const base = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ChevronDownIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// "Run action" button's filled play triangle, source line 1460.
export function PlayIcon({ size = 9, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 2.5v7l6.5-3.5L3 2.5z" />
    </svg>
  );
}
