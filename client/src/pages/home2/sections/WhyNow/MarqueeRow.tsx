// One AI-logo + query "pill". Verbatim shape from _reference/index.html
// (e.g. line 1902): a bordered, flex-shrink-0 chip with a dimmed logo that
// brightens on hover, and query text that darkens to text-primary on hover.
export interface MarqueeQuery {
  alt: string;
  src: string;
  query: string;
}

// The source's drift-left/drift-right rows each repeat their 6-item query
// list 3x back-to-back (verified by counting pill divs at index.html
// 1902-1936 and 1941-1994 — 18 pills per row, not the ~4x guessed
// beforehand) so the animation can loop seamlessly at translateX(-50%).
const DUPLICATION_FACTOR = 3;

export function MarqueeRow({
  direction,
  queries,
  isVisible,
  delayMs,
}: {
  direction: "left" | "right";
  queries: MarqueeQuery[];
  isVisible: boolean;
  delayMs: number;
}) {
  const duplicated = Array.from({ length: DUPLICATION_FACTOR }).flatMap((_, setIndex) =>
    queries.map((item, itemIndex) => ({ ...item, key: `${setIndex}-${itemIndex}` })),
  );

  return (
    <div
      className={`transition-all duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className={direction === "left" ? "drift-left inline-flex" : "drift-right inline-flex"}>
        {duplicated.map(({ key, alt, src, query }) => (
          <div
            key={key}
            className="flex-shrink-0 flex items-center gap-2.5 px-5 py-2.5 border-r border-tk-default bg-tk-surface group"
          >
            <img
              src={src}
              alt={alt}
              width={16}
              height={16}
              className="w-4 h-4 object-contain opacity-50 group-hover:opacity-80 transition-opacity duration-150"
            />
            <span className="text-[12px] text-tk-secondary group-hover:text-tk-primary whitespace-nowrap transition-colors duration-150">
              {query}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
