// Shared "[01] Why Now / The Shift"-style eyebrow header, verbatim from the
// repeated pattern at _reference/index.html (e.g. lines 1840-1862 for Why
// Now). Precedes why-now, platform, philosophy, revenue, testimonials, and
// pricing. Learn/Research inlines its own variant instead of using this;
// Closing CTA has no eyebrow at all.
//
// The label and subtitle use `--color-vc-label` (#a8a29e), the reference's
// `text-meta` role. Do not swap these to a `muted` token: in the source
// system `--color-muted` is a SURFACE colour (#f5f5f4) and renders as
// near-invisible text on white.
//
// The header rule must sit inside the same `px-4 lg:px-8` gutter as every
// section panel below it, or its top border spans flush to the column guides
// while the panels are inset by 16/32px.
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
        <span className="text-[11px] font-semibold tracking-[0.08em] text-vc-accent tabular-nums">
          [{number}]
        </span>
      </div>
      <div className="px-4 lg:px-8">
        <div className="mx-auto border-t border-vc-default opacity-100" style={{ maxWidth: 1120 }}>
          <div className="px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 lg:py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3 opacity-100 translate-x-0">
              <span className="lg:hidden text-[11px] font-semibold tracking-[0.08em] text-vc-accent tabular-nums">
                [{number}]
              </span>
              <span className="text-[11px] font-semibold tracking-[0.08em] text-vc-label uppercase">
                {label}
              </span>
            </div>
            <span className="hidden sm:block text-[10px] text-vc-label tracking-wide opacity-100 translate-x-0">
              / {subtitle}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
