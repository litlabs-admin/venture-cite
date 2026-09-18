// New-thread empty state (01-trakkr-teardown.md §2.5): date, time-of-day
// greeting, status line, and numbered "Explore your visibility" questions.
import { useMemo } from "react";

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function AskEmptyState({
  brandName,
  hasScore,
  questions,
  onPick,
}: {
  brandName: string;
  hasScore: boolean;
  questions: string[];
  onPick: (text: string) => void;
}) {
  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    [],
  );

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="mb-2 text-caption text-vc-tertiary">{dateLabel}</p>
      <h1 className="mb-2 text-page font-semibold text-vc-primary">
        {greetingForNow()}, {brandName}.
      </h1>
      <p className="mb-8 text-body text-vc-tertiary">
        {hasScore ? "Ask about your AI visibility." : "Model scores are not available yet."}
      </p>

      {questions.length > 0 && (
        <div className="text-left">
          <p className="mb-2 text-caption font-medium text-vc-tertiary">Explore your visibility</p>
          <ol className="space-y-1.5">
            {questions.map((q, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(q)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-body text-vc-secondary hover:bg-vc-hover"
                >
                  <span className="text-vc-tertiary">{i + 1}.</span>
                  {/* Display only - `onPick(q)` above still sends the
                      ORIGINAL string. shared/ask/suggestions.ts's sentences
                      are written lowercase (they read as a question, not a
                      heading); `capitalize` is cosmetic here, never applied
                      to what the model actually receives. */}
                  <span className="capitalize">{q}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
