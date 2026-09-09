import { AlertCircle, CircleCheck } from "lucide-react";
import { PLATFORM_COLORS } from "@/lib/platformColors";
import { exclusionSentence, observationSentence, observe, type AnswerRow } from "./answerRows";

// MODEL / RESULT / ANSWER SNIPPET / NOTES.
//
// EVERY OBSERVATION IS LISTED, INCLUDING THE FAILED ONES. A failed provider
// call is an absent observation, not a model that declined to mention the
// brand: it is excluded from the count printed above the table (see
// `answerRows.ts`) and it still gets its own row here, because a person who
// sees three rows where four checks ran has been told something false about
// how much was measured.
//
// The two results are told apart by GLYPH AND WORDS. `--warning` is aliased to
// `--brand-accent` in index.css, so a warning tint is the same pixel colour as
// a link; hue alone could not carry this distinction even if it were allowed
// to. The word "(excluded)" is part of the label rather than a footnote,
// because the exclusion is the fact the reader most needs from that row.

const GRID =
  "grid grid-cols-[minmax(0,10rem)_minmax(0,9.5rem)_minmax(0,1fr)_minmax(0,12rem)] gap-4";

function PlatformMark({ platform }: { platform: string }) {
  const tone = PLATFORM_COLORS[platform] ?? "bg-muted text-vc-secondary border-vc-default";
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-data font-semibold ${tone}`}
    >
      {platform.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ResultChip({ failed }: { failed: boolean }) {
  const Icon = failed ? AlertCircle : CircleCheck;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-caption ${
        failed ? "text-negative" : "text-positive"
      }`}
      data-answer-result={failed ? "failed" : "successful"}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
        data-glyph={failed ? "failed" : "successful"}
      />
      {failed ? "Failed (excluded)" : "Successful"}
    </span>
  );
}

/**
 * The right-hand note.
 *
 * A failed row's note names the absence of an answer. It must never say the
 * brand was not mentioned - nothing was read, so nothing about the brand was
 * observed at all.
 */
function noteFor(row: AnswerRow, brandName: string): string {
  if (row.failed) return "No answer generated.";
  return row.isCited ? `${brandName} mentioned.` : `${brandName} not mentioned.`;
}

/** The failure's own status line is the snippet. It is shown rather than
 *  replaced with prose, so the reader can see what the provider actually
 *  reported. */
function snippetFor(row: AnswerRow): string {
  const text = row.snippet?.trim();
  if (text) return text;
  return row.failed ? "No response text was recorded." : "No snippet was recorded.";
}

export function AnswerTable({
  rows,
  brandName,
}: {
  rows: readonly AnswerRow[];
  brandName: string;
}) {
  const observation = observe(rows);
  const exclusion = exclusionSentence(observation);

  return (
    <div data-testid="v2-diagnosis-answers">
      <p className="text-caption text-vc-secondary" data-testid="v2-diagnosis-answer-count">
        {observation.successful === 0
          ? "No model returned an answer to this question, so there is nothing to count."
          : observationSentence(observation)}
        {exclusion ? <span className="text-vc-tertiary"> · {exclusion}</span> : null}
      </p>

      <div className="mt-4">
        <div
          className={`${GRID} border-b border-vc-default px-2 pb-2 text-data font-medium tracking-wide text-vc-tertiary uppercase`}
        >
          <span>Model</span>
          <span>Result</span>
          <span>Answer snippet</span>
          <span>Notes</span>
        </div>

        {rows.map((row) => (
          <div
            key={row.platform}
            data-testid="v2-diagnosis-answer-row"
            data-platform={row.platform}
            data-failed={row.failed ? "true" : "false"}
            className={`${GRID} items-start border-b border-vc-default px-2 py-3`}
          >
            <span className="flex min-w-0 items-center gap-2 text-body text-vc-primary">
              <PlatformMark platform={row.platform} />
              <span className="truncate">{row.platform}</span>
            </span>
            <span className="min-w-0">
              <ResultChip failed={row.failed} />
            </span>
            <span
              className={`min-w-0 text-body ${row.failed ? "text-vc-tertiary" : "text-vc-secondary"}`}
            >
              {snippetFor(row)}
            </span>
            <span className="min-w-0 text-body text-vc-tertiary">{noteFor(row, brandName)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
