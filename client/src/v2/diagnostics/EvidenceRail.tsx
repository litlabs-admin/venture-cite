import { Clock, Eye, HelpCircle, ShieldCheck } from "lucide-react";
import { observationSentence, type Observation } from "./answerRows";

// EVIDENCE BOUNDARIES.
//
// The rail is not decoration and its three headings are not a stylistic
// choice. They are the screen's contract with the reader:
//
//   Observed    - what was counted, with the denominator named.
//   Unknown     - what the data cannot tell us. This section is never empty
//                 and never softened. The one thing this screen genuinely
//                 does not know is WHY a model omitted the brand, and saying
//                 so is the difference between a diagnosis and a guess.
//   Next check  - what would produce new evidence.
//
// Then the "No fault confirmed" panel, which states the product rule in
// words: this screen tests a hypothesis, it does not assign blame. That rule
// is repeated in three places on the board (here, in the assessment row, and
// under the source excerpt) precisely because a single instance is easy to
// delete by accident.

function Boundary({
  icon: Icon,
  title,
  children,
  testId,
}: {
  icon: typeof Eye;
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <li className="flex items-start gap-3" data-testid={testId}>
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vc-muted"
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5 text-vc-secondary" />
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold text-vc-primary">{title}</span>
        <span className="mt-1 block text-body text-vc-secondary">{children}</span>
      </span>
    </li>
  );
}

export function EvidenceRail({
  observation,
  lastCheckedAt,
}: {
  observation: Observation;
  /** Already formatted, or null. Never a guessed date. */
  lastCheckedAt: string | null;
}) {
  return (
    <div className="space-y-6" data-testid="v2-diagnostics-rail">
      <section>
        <h2 className="text-body font-semibold text-vc-primary">Evidence boundaries</h2>
        <ul className="mt-4 space-y-5">
          <Boundary icon={Eye} title="Observed" testId="v2-boundary-observed">
            {observation.successful === 0
              ? "Nothing. No model returned an answer to this question, so no observation exists to report."
              : observationSentence(observation)}
            {observation.failed > 0 ? (
              <span className="mt-1 block text-vc-tertiary">
                {observation.failed} provider call
                {observation.failed === 1 ? "" : "s"} failed and{" "}
                {observation.failed === 1 ? "is" : "are"} excluded from that figure.
              </span>
            ) : null}
          </Boundary>

          {/* Never conditional, never softened when the numbers look clean. */}
          <Boundary icon={HelpCircle} title="Unknown" testId="v2-boundary-unknown">
            Why each model omitted the brand. Nothing recorded here explains a model&apos;s
            reasoning, and no cause has been established.
          </Boundary>

          <Boundary icon={Clock} title="Next check" testId="v2-boundary-next">
            Repeat the same question set after the page change.
            {lastCheckedAt ? (
              <span className="mt-1 block text-vc-tertiary">Last checked {lastCheckedAt}.</span>
            ) : null}
          </Boundary>
        </ul>
      </section>

      {/* The product requirement, stated rather than implied. Deliberately not
          a "warning" tint: --warning is aliased to --brand-accent, so the tint
          would be the accent and would read as emphasis rather than as the
          calm statement it is. */}
      <section
        data-testid="v2-no-fault-confirmed"
        aria-labelledby="v2-no-fault-heading"
        className="rounded-md border border-vc-default bg-vc-accent-subtle/50 px-5 py-5"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-vc-surface"
          aria-hidden="true"
        >
          <ShieldCheck className="h-4 w-4 text-vc-accent" />
        </span>
        <h3 id="v2-no-fault-heading" className="mt-3 text-body font-semibold text-vc-primary">
          No fault confirmed
        </h3>
        <p className="mt-2 text-body text-vc-secondary">This task tests a content hypothesis.</p>
        <p className="mt-2 text-body text-vc-secondary">
          We avoid blame and focus on useful experiments.
        </p>
      </section>
    </div>
  );
}
