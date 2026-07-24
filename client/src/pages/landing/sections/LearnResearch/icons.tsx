// Local lucide "arrow-right" icon for this section. Not reused from
// components/sections/Nav/icons.tsx because the Nav copy hardcodes
// stroke-width 2, while index.html uses stroke-width 1.5 for two of the
// three arrow-right instances in this section (headline link + data-tile
// cards) and 2 for the third (resource row cards) — verbatim per source.
type IconProps = { size?: number; strokeWidth?: number; className?: string };

export function ArrowRightIcon({ size = 12, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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
