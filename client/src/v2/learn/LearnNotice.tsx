import { BookDashed } from "lucide-react";

// The one place this tree says "there is no content here yet", and the one
// wording for it. Every other screen in `v2/` distinguishes an absent thing
// from a measured zero (StateBadge.tsx); Learn has to make the same
// distinction about LESSONS rather than about measurements, so it gets its own
// label rather than borrowing a measurement state that would be a category
// error on this screen.
//
// Told apart by GLYPH AND WORDS, never by hue - `index.css:580` aliases
// `--warning` to `--brand-accent`, so a "warning" tint is the same pixel colour
// as a link and carries no meaning on its own.
//
// The glyph is deliberately NOT one of StateBadge's four. That component owns
// "em-dash", "slash", "alert" and "check", and its whole premise is that one
// glyph means exactly one thing. Borrowing its slash here would make the same
// mark mean "the check could not run" on one screen and "nobody has written
// this" on another. An outline of a book with a dashed edge means neither of
// those and collides with neither.
export const NOT_WRITTEN_LABEL = "Not available yet";

/** The status marker. Carries the word, so it survives a greyscale render. */
export function NotWrittenBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      title="No lesson content has been written. This area is a layout prototype."
      className={`inline-flex items-center gap-1.5 text-caption text-vc-tertiary ${className}`}
      data-testid="v2-learn-not-written-badge"
    >
      <span data-glyph="book-dashed" aria-hidden="true" className="inline-flex shrink-0">
        <BookDashed className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span>{NOT_WRITTEN_LABEL}</span>
    </span>
  );
}

/**
 * The panel that stands where a lesson list would stand.
 *
 * IT DELIBERATELY HOLDS NO LESSON. Not a placeholder title, not a greyed row,
 * not a "coming soon" card that looks like a lesson from three feet away. A
 * skeleton row here would be indistinguishable from a lesson that failed to
 * load, and an invented title would be a claim that the product teaches
 * something it does not teach yet.
 */
export function NotWrittenPanel() {
  return (
    <section
      data-testid="v2-learn-not-written"
      aria-labelledby="v2-learn-not-written-heading"
      className="mt-6 rounded-md border border-vc-default bg-vc-surface px-5 py-5"
    >
      <NotWrittenBadge />
      <h2
        id="v2-learn-not-written-heading"
        className="mt-2 text-section font-semibold text-vc-primary"
      >
        No lessons have been written yet
      </h2>
      <p className="mt-2 max-w-lg text-body text-vc-secondary">
        This screen is the finished frame for an area whose content does not exist. There is no
        lesson to open, nothing to complete, and no progress to report — not zero progress, no
        tracking at all.
      </p>
      <p className="mt-2 max-w-lg text-body text-vc-secondary">
        Everything you can see here is layout. Nothing on this page was generated to stand in for a
        lesson.
      </p>
    </section>
  );
}
