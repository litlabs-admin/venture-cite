import logoPath from "@assets/logo.svg";

// ─── Brand lockup ────────────────────────────────────────────────────────────
// The mark plus the "Venture Cite" wordmark, in one place.
//
// This exists because the lockup was previously copy-pasted at eight call
// sites (sidebar, mobile header, four auth pages, landing nav, landing
// footer). Adding the wordmark meant editing all eight and missing some - so
// the composition lives here and every surface renders the same thing.
//
// SPACING, deliberately tight:
//   * `gap-1.5` between mark and text - the mark already carries internal
//     padding, so a wider gap reads as two separate objects rather than one
//     lockup.
//   * negative word-spacing pulls "Venture" and "Cite" together. They stay two
//     words for legibility, but at default spacing they drift apart and stop
//     reading as a single name.
//   * `tracking-tight` for the same reason at the letter level.
//
// The <img> is intentionally alt="" - the adjacent text is the accessible
// name, so a link wrapping this needs no aria-label.

export function BrandLogo({
  className = "",
  imgClassName = "h-7 w-auto",
  textClassName = "text-ui",
  showText = true,
}: {
  className?: string;
  /** Height utility for the mark. Width stays auto - the mark is wider than
   *  it is tall, and fixing both axes squashes it. */
  imgClassName?: string;
  textClassName?: string;
  showText?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img src={logoPath} alt="" className={`${imgClassName} shrink-0 object-contain`} />
      {showText && (
        <span
          className={`whitespace-nowrap font-semibold tracking-tight text-vc-primary ${textClassName}`}
          style={{ wordSpacing: "-0.12em" }}
        >
          Venture Cite
        </span>
      )}
    </span>
  );
}
