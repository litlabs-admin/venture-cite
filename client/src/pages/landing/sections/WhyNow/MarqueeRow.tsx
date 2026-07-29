// One AI-logo + query "pill".
//
// This was previously an infinitely-drifting marquee (drift-left/drift-right,
// six queries duplicated 3x per row, 12px text). At that size the queries read
// as texture rather than as content, so the section now renders a single
// static row of three pills at 14px — legible at 1x — and the drift animation
// is gone. See the comment at the call site in WhyNow.tsx.
//
// The `drift-left` / `drift-right` keyframes in styles.css are now unused by
// this section; they are left in place because that file is a curated port of
// the source stylesheet.
export interface MarqueeQuery {
  alt: string;
  src: string;
  query: string;
}

export function QueryRow({
  queries,
  isVisible,
  delayMs,
}: {
  queries: MarqueeQuery[];
  isVisible: boolean;
  delayMs: number;
}) {
  return (
    <div
      className={`transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-vc-default">
        {queries.map(({ alt, src, query }) => (
          <div
            key={query}
            className="flex items-start gap-3 px-5 py-4 sm:px-6 sm:py-5 bg-vc-surface group"
          >
            <img
              src={src}
              alt={alt}
              width={18}
              height={18}
              className="w-[18px] h-[18px] object-contain shrink-0 mt-px opacity-60 group-hover:opacity-90 transition-opacity duration-150"
            />
            <span className="text-[14px] leading-snug text-vc-secondary group-hover:text-vc-primary transition-colors duration-150">
              {query}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
