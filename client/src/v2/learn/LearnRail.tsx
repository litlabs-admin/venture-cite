import { Link } from "@tanstack/react-router";
import { NotWrittenBadge } from "./LearnNotice";

// The right rail, 322px, in the same grammar as `today/ProgressRail` and
// `brandfacts/StartRail`: stacked sections separated by a hairline, each with
// a `text-body font-semibold` heading.
//
// WHAT IS NOT HERE, AND WHY. The sibling rails open with a level hexagon, a
// point total and a progress bar. This one does not, and the omission is the
// point. A lesson count, a completion ratio or a bar at any percentage would
// be a number invented about the user's learning, and there is nothing to
// count: no lesson exists. A bar drawn at 0% would be worse still - it would
// assert that progress IS tracked and currently stands at nothing. The rail
// states the absence in words instead.

export function LearnRail() {
  return (
    <div className="space-y-6" data-testid="v2-learn-rail">
      <section>
        <h2 className="text-body font-semibold text-vc-primary">Your progress</h2>
        <p className="mt-2 text-body text-vc-secondary" data-testid="v2-learn-no-progress">
          Lesson progress is not tracked. No lesson has been completed because no lesson exists, so
          there is no count and no percentage to show here.
        </p>
        <NotWrittenBadge className="mt-3" />
      </section>

      <section className="border-t border-vc-default pt-5">
        <h2 className="text-body font-semibold text-vc-primary">Where the guidance is today</h2>
        <p className="mt-2 text-body text-vc-secondary">
          Until this area has content, the explanations that do exist sit next to the work they
          explain.
        </p>
        <ul className="mt-3 space-y-2">
          <li>
            <Link
              to="/v2/today"
              className="text-body text-vc-accent underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
            >
              Today
            </Link>
            <span className="text-body text-vc-secondary"> — why a task is ranked first.</span>
          </li>
          <li>
            <Link
              to="/v2/my-work"
              className="text-body text-vc-accent underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
            >
              My work
            </Link>
            <span className="text-body text-vc-secondary">
              {" "}
              — the evidence behind each task, and what completing it requires.
            </span>
          </li>
          <li>
            <Link
              to="/v2/brand-facts"
              className="text-body text-vc-accent underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
            >
              Brand facts
            </Link>
            <span className="text-body text-vc-secondary">
              {" "}
              — the quoted source wording behind every extracted fact.
            </span>
          </li>
        </ul>
      </section>

      <section className="border-t border-vc-default pt-5">
        <h2 className="text-body font-semibold text-vc-primary">Why this area is empty</h2>
        <p className="mt-2 text-body text-vc-secondary">
          The lessons were deferred on purpose. The navigation and the frame were built first so the
          shape of the area could be reviewed before any of it was written.
        </p>
      </section>
    </div>
  );
}
