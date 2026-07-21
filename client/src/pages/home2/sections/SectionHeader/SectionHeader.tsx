// Shared "[01] Why Now / The Shift"-style eyebrow header, verbatim from the
// repeated pattern at _reference/index.html (e.g. lines 1840-1862 for Why
// Now). Precedes why-now, platform, philosophy, revenue, testimonials, and
// pricing. Learn/Research inlines its own variant instead of using this;
// Closing CTA has no eyebrow at all.
//
// Note: the label and gutter-number both use the literal `text-muted`
// Tailwind class, which resolves to --color-gray-100 (#f5f5f4) — very low
// contrast against the white background. That's exactly what the source
// does (confirmed identically in the mobile nav menu's "Solutions"/"Tools"
// labels too) — reproduced as-is rather than "fixed" to a more legible gray.
export function SectionHeader({
  number,
  label,
  subtitle,
}: {
  number: string;
  label: string;
  subtitle: string;
}) {
  return (
    <div className="relative mt-[42px] sm:mt-[62px] lg:mt-[83px]">
      <div
        className="hidden lg:flex items-center absolute top-0 bottom-0 z-20 opacity-100"
        style={{ left: "calc(50% - 624px)" }}
      >
        <span className="text-[11px] font-semibold tracking-[0.08em] text-tk-accent tabular-nums">
          [{number}]
        </span>
      </div>
      <div className="mx-auto border-t border-tk-default opacity-100" style={{ maxWidth: 1120 }}>
        <div className="py-2.5 sm:py-3 lg:py-3.5 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 opacity-100 translate-x-0">
            <span className="lg:hidden text-[11px] font-semibold tracking-[0.08em] text-tk-accent tabular-nums">
              [{number}]
            </span>
            <span className="text-[11px] font-semibold tracking-[0.08em] text-tk-text-muted uppercase">
              {label}
            </span>
          </div>
          <span className="hidden sm:block text-[10px] text-tk-text-muted tracking-wide opacity-100 translate-x-0">
            / {subtitle}
          </span>
        </div>
      </div>
    </div>
  );
}
