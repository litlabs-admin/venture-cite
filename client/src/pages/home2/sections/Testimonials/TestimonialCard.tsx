// Shared shape for the two smaller stacked quotes in the right-hand column
// — layout verbatim from _reference/index.html lines 3183-3222. The two cards
// differ only in their top-border treatment (the first one drops its border
// on desktop since it sits at the top of the column) and in whether an extra
// accent-colored note line is present.
//
// The source's avatars were photographs of named individuals quoted about a
// different product. Those are gone; the circle now renders initials, so the
// card has a real resting state without borrowing anyone's likeness. Swap it
// back to a photo when there are real customers to quote.
interface TestimonialCardProps {
  quote: string;
  initials: string;
  name: string;
  title: string;
  note?: string;
  borderClassName: string;
  isVisible: boolean;
  delayMs: number;
}

export function TestimonialCard({
  quote,
  initials,
  name,
  title,
  note,
  borderClassName,
  isVisible,
  delayMs,
}: TestimonialCardProps) {
  return (
    <div
      className={`p-4 sm:p-6 lg:p-8 flex-1 flex flex-col justify-center ${borderClassName} transition-all duration-700 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{
        transitionDelay: `${delayMs}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <blockquote className="mb-3 sm:mb-4">
        <p className="text-[13px] sm:text-[14px] text-tk-secondary leading-relaxed">{quote}</p>
      </blockquote>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-tk-accent-subtle flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-tk-accent">{initials}</span>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-tk-primary">{name}</div>
            <div className="text-[11px] text-tk-text-muted truncate">{title}</div>
            {note ? (
              <div className="text-[11px] text-tk-accent/80 truncate mt-0.5">{note}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
