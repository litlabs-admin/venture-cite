// New-thread empty state (01-trakkr-teardown.md §2.5): date, time-of-day
// greeting, status line, an inbox row for an unreviewed business brief, and
// numbered "Explore your visibility" questions.
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText } from "lucide-react";

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
  briefReadyForReview,
}: {
  brandName: string;
  hasScore: boolean;
  questions: string[];
  onPick: (text: string) => void;
  // True once a website-sourced draft exists and nothing has been saved yet
  // (useAskBrief's brief.status === "draft" && brief.hasAnyContent) - "A
  // starting business brief is ready from your website" (01-trakkr-teardown
  // .md §2.5's inbox row).
  briefReadyForReview?: boolean;
}) {
  const navigate = useNavigate();
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

      {briefReadyForReview && (
        <button
          type="button"
          onClick={() => navigate({ to: "/agent/context", search: { tab: "brief" } })}
          className="mb-6 flex w-full items-center gap-2.5 rounded-md border border-vc-default bg-vc-surface px-3 py-2.5 text-left transition-colors hover:bg-vc-hover animate-fade-in-up motion-reduce:animate-none"
        >
          <FileText className="h-4 w-4 shrink-0 text-vc-accent" />
          <span className="text-caption text-vc-secondary">
            A starting business brief is ready from your website.
          </span>
        </button>
      )}

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
