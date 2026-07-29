// Local copies of the exact lucide-react icon paths used by the hero CTA.
// The "lucide lucide-*" marker classes present in the source snapshot are
// non-visual identifiers from the compiled icon library and are dropped here
// in favour of named components, matching the convention in
// sections/Nav/icons.tsx.
type IconProps = { size?: number; className?: string };

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
