import { PanelsTopLeft } from "lucide-react";

// The one wording for "this tab has not been built", and the one place it is
// said. Diagnostics ships one of its four tabs; the other three are reachable
// and say so in words, exactly as `learn/LearnNotice.tsx` established for an
// area with no content.
//
// Told apart by GLYPH AND WORDS, never by hue - `index.css:580` aliases
// `--warning` to `--brand-accent`, so a "warning" tint is the same pixel
// colour as a link and carries no meaning on its own.
//
// The glyph is deliberately NOT one of `StateBadge`'s four, and not Learn's
// `BookDashed` either. StateBadge owns "em-dash", "slash", "alert" and
// "check", and its premise is that one glyph means exactly one thing;
// borrowing its slash here would make the same mark mean "the check could not
// run" on one screen and "nobody has built this" on another. Learn's dashed
// book means "no lesson was written". An empty panel outline means neither.
export const NOT_BUILT_LABEL = "Not built yet";

/** The status marker. Carries the word, so it survives a greyscale render. */
export function NotBuiltBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      title="This tab has not been built. No data is being read for it."
      className={`inline-flex items-center gap-1.5 text-caption text-vc-tertiary ${className}`}
      data-testid="v2-diagnostics-not-built-badge"
    >
      <span data-glyph="panel-outline" aria-hidden="true" className="inline-flex shrink-0">
        <PanelsTopLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      <span>{NOT_BUILT_LABEL}</span>
    </span>
  );
}

/**
 * What stands where an unbuilt tab's content would stand.
 *
 * IT HOLDS NO STAND-IN FINDING. Not a skeleton row, not a greyed metric, not
 * a "coming soon" card that reads as a panel from three feet away. A skeleton
 * here would be indistinguishable from a panel that failed to load, and an
 * invented figure would be a claim about the user's site that nothing
 * measured.
 *
 * `subject` names what the tab WOULD cover, in the future tense, so the
 * sentence cannot be read as a description of something already running.
 */
export function NotBuiltPanel({ title, subject }: { title: string; subject: string }) {
  return (
    <section
      data-testid="v2-diagnostics-not-built"
      data-tab-title={title}
      aria-labelledby="v2-diagnostics-not-built-heading"
      className="mt-6 rounded-md border border-vc-default bg-vc-surface px-5 py-5"
    >
      <NotBuiltBadge />
      <h2
        id="v2-diagnostics-not-built-heading"
        className="mt-2 text-section font-semibold text-vc-primary"
      >
        {title} has not been built yet
      </h2>
      <p className="mt-2 max-w-lg text-body text-vc-secondary">
        This tab will {subject}. None of it exists yet, so there is nothing here to read — no
        finding, no score, and no count, not even a zero.
      </p>
      <p className="mt-2 max-w-lg text-body text-vc-secondary">
        The tab is reachable so the shape of the area can be reviewed. Nothing on this page was
        generated to stand in for a result.
      </p>
    </section>
  );
}
