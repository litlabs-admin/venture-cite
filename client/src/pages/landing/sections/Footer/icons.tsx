// Local copies of the exact icon paths seen rendered in index.html's footer
// (lines 3627-3769): a chevron-up on the "Free Tools" trigger, an earth
// glyph + check on the language switcher, and the LinkedIn brand mark.
// Follows the same convention as components/sections/Nav/icons.tsx — paths
// reproduced verbatim, the source's non-visual "lucide lucide-*" identifier
// classes dropped.
type IconProps = { size?: number; className?: string };

const strokeBase = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// index.html:3647 / :3695 — the "Free Tools" button's trailing chevron.
export function ChevronUpIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...strokeBase} width={size} height={size} className={className}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

// index.html:3757 — lucide-earth, the language switcher's globe glyph.
export function EarthIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...strokeBase} width={size} height={size} className={className}>
      <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54" />
      <path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17" />
      <path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

// index.html:3759 — lucide-check, marks the current language.
export function CheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...strokeBase} width={size} height={size} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// index.html:3684 — LinkedIn brand mark, filled not stroked.
export function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
