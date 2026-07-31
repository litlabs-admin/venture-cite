// Local copies of the lucide icon paths rendered in _reference/index.html's
// Revenue section (2850-3131): trending-up (session/revenue deltas) and the
// checkmark-circle used 3x in the bottom badge strip. Same convention as
// components/sections/Nav/icons.tsx.
type IconProps = { size?: number; className?: string };

// Verbatim from index.html 2873-2874 / 3062 - xmlns + aria-hidden + the
// "lucide lucide-trending-up" class are present on the source's svg.
export function TrendingUpIcon({ size = 11, className }: IconProps) {
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
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  );
}

// Verbatim from index.html 3119-3122 - note this instance of the icon has
// no xmlns/aria-hidden attributes in the source (unlike TrendingUpIcon
// above), sized purely via the w-3 h-3 Tailwind classes rather than
// width/height attributes. Reproduced as found.
export function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
