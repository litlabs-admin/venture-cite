import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "../mywork/evidence";
import {
  FactAmendError,
  useAmendFact,
  useApproveFact,
  type BrandFactView,
} from "../data/brandFacts";
import { ReviewChip } from "./FactTable";
import { factLabel, reviewStateOf } from "./factRows";

// THE EVIDENCE AND THE GATE.
//
// This block is the screen's whole argument: the value the person is asked to
// approve, shown beside the words it was read out of and the page those words
// are on. It is never dropped for space, and where the excerpt is missing the
// block says so rather than closing up as though the value were unsourced by
// design.
//
// THE GATE ITSELF. The owner's requirement is that approval is attributed and
// never silent: the brand owner must accept the extracted value, or make the
// required change. So:
//   - Both actions are explicit controls the person presses.
//   - NEITHER IS A DEFAULT. There is no autofocus, and no primary/secondary
//     pairing where one is pre-selected. Approving requires pressing Approve;
//     amending requires typing a different value and pressing Save.
//   - Every control below sets `type="button"` EXPLICITLY. `ui/button.tsx`
//     does not default it, and an HTML button with no type is a SUBMIT
//     button - so the day any of this is wrapped in a form, a stray Return
//     in the value field would fire the first control on the row. That is
//     precisely the silent approval this screen forbids, so the attribute is
//     set here rather than left to the absence of a form.
//   - Nothing here approves on mount, on selection, or on another fact's
//     approval. Every mutation is inside an onClick.
//   - There is no bulk control. `POST /facts/bulk-accept` exists, but it acts
//     on conflict pairs by side and domain and returns only a count - it
//     cannot name the facts it will accept before it acts, which is the
//     condition this screen is held to. So it is not offered.

/** The quoted snippet and the page it is on. The pairing is the point. */
function Evidence({ fact }: { fact: BrandFactView }) {
  const extracted = formatDate(fact.lastVerified);

  return (
    <section className="mt-8" aria-labelledby="v2-fact-excerpt-heading">
      <h3
        id="v2-fact-excerpt-heading"
        className="text-data font-medium tracking-wide text-vc-tertiary uppercase"
      >
        Source excerpt
      </h3>

      {fact.sourceExcerpt ? (
        <blockquote
          data-testid="v2-fact-excerpt"
          className="mt-3 border-l-2 border-vc-accent pl-4 text-section text-vc-primary"
        >
          {`“${fact.sourceExcerpt}”`}
        </blockquote>
      ) : (
        // Not a blank space. An absent excerpt means nobody can check this
        // value against a page, and that is exactly what the person deciding
        // needs to be told before they approve it.
        <p data-testid="v2-fact-no-excerpt" className="mt-3 text-body text-vc-secondary">
          No excerpt was captured for this value, so there is no quoted wording to check it against.
        </p>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-4 text-caption">
        {fact.sourceUrl ? (
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="v2-fact-source-link"
            className="text-vc-accent hover:underline"
          >
            {fact.sourceUrl}
          </a>
        ) : (
          <span data-testid="v2-fact-source-none" className="text-vc-secondary">
            Supplied by you, not read from a page.
          </span>
        )}
        {extracted && (
          <span className="font-mono text-data text-vc-tertiary">Extracted {extracted}</span>
        )}
      </p>
    </section>
  );
}

export function FactReview({ fact }: { fact: BrandFactView }) {
  const state = reviewStateOf(fact);
  const approve = useApproveFact(fact.brandId);
  const amend = useAmendFact(fact.brandId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.factValue);
  const inputId = useId();

  // Moving to another row closes any half-finished edit and drops its draft.
  // Carrying a draft across rows would let a value typed for one fact be
  // saved onto another.
  useEffect(() => {
    setEditing(false);
    setDraft(fact.factValue);
    approve.reset();
    amend.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fact.id]);

  const busy = approve.isPending || amend.isPending;
  const unchanged = draft.trim() === fact.factValue.trim();
  const empty = draft.trim().length === 0;

  const label = factLabel(fact.factKey);
  // The caption states the fact's ACTUAL position. Labelling an unreviewed
  // value "Approved" - even as the name of the field being approved - would
  // be the implied approval this screen is built to prevent.
  const caption =
    state === "confirmed" ? `Confirmed · ${label}` : `Awaiting your review · ${label}`;

  // Order matters and follows the artboard: the evidence comes FIRST, then
  // the decision. The person reads where the value came from before they are
  // asked to stand behind it.
  return (
    <>
      <Evidence fact={fact} />

      <section className="mt-8 border-t border-vc-default pt-6" data-testid="v2-fact-review">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-data font-medium tracking-wide text-vc-tertiary uppercase">
              {caption}
            </h3>
            {editing ? (
              <div className="mt-2">
                <label htmlFor={inputId} className="sr-only">
                  {label}
                </label>
                <input
                  id={inputId}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  data-testid="v2-fact-amend-input"
                  className="w-full min-w-0 rounded-md border border-vc-default bg-vc-surface px-3 py-2 text-section text-vc-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40 sm:w-96"
                />
              </div>
            ) : (
              <p className="mt-2 text-section font-semibold text-vc-primary">{fact.factValue}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {editing ? (
              <>
                {/* Saving an amendment approves the amended value, because
                  making the required change IS the owner's decision. It is
                  still explicit: they typed it and pressed this. */}
                <Button
                  size="sm"
                  type="button"
                  data-testid="v2-fact-save-amend"
                  disabled={busy || empty || unchanged}
                  onClick={() => amend.mutate({ factId: fact.id, factValue: draft.trim() })}
                >
                  {amend.isPending ? "Saving…" : "Save and approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  data-testid="v2-fact-cancel-amend"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setDraft(fact.factValue);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  type="button"
                  data-testid="v2-fact-approve"
                  disabled={busy || state === "confirmed"}
                  onClick={() => approve.mutate(fact.id)}
                >
                  {approve.isPending
                    ? "Approving…"
                    : state === "confirmed"
                      ? "Approved"
                      : "Approve this fact"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  data-testid="v2-fact-edit"
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  Edit value
                </Button>
              </>
            )}
          </div>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-3 text-caption text-vc-secondary">
          <ReviewChip state={state} />
          <span>
            {state === "confirmed"
              ? "You approved this value. Change it any time with Edit value."
              : "Nothing is approved until you approve it. Viewing this page changes nothing."}
          </span>
        </p>

        {approve.isError && (
          <p className="mt-3 text-caption text-destructive" data-testid="v2-fact-approve-error">
            That approval was not saved: {approve.error.message}. The fact is unchanged.
          </p>
        )}

        {/* An amend is two calls, and the two failures are not the same event.
          Reporting "it failed" after the value was already written would send
          the person looking for a change that is in fact saved. */}
        {amend.isError && (
          <p className="mt-3 text-caption text-destructive" data-testid="v2-fact-amend-error">
            {amend.error instanceof FactAmendError && amend.error.stage === "approve"
              ? `Your new value was saved, but the approval was not recorded: ${amend.error.message}. Press Approve this fact to finish.`
              : `That change was not saved: ${amend.error.message}. The fact is unchanged.`}
          </p>
        )}
      </section>
    </>
  );
}
