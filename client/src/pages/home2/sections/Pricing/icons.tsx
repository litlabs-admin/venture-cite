// Local copy of the exact lucide-react "arrow-right" icon path seen rendered
// in _reference/index.html:3404 (the "Compare features" link at the foot of
// the pricing panel). The "lucide lucide-arrow-right" marker class present
// in the source is a non-visual identifier from the compiled icon library
// and is dropped here in favor of a named component, matching the
// convention in components/sections/Nav/icons.tsx and Hero/icons.tsx.
type IconProps = { size?: number; className?: string };

export function ArrowRightIcon({ size = 12, className }: IconProps) {
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
