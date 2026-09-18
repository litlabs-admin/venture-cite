// One assistant turn. Section order is Trakkr's own, confirmed twice
// (01-trakkr-teardown.md R13): step bar -> blocks -> prose -> action cards
// ("Waiting on you" while pending / "N suggestion(s)" once resolved) ->
// evidence -> degradation notice -> follow-ups.
import { AlertTriangle } from "lucide-react";
import SafeMarkdown from "@/components/SafeMarkdown";
import { BrandLogo } from "@/components/BrandLogo";
import { AskThinking } from "./AskThinking";
import { AskStepBar, formatDuration } from "./AskStepBar";
import { AskBlockView } from "./AskBlock";
import { AskEvidence } from "./AskEvidence";
import { AskActionCard } from "./AskActionCard";
import { AskFollowups } from "./AskFollowups";
import type { AskMessageView } from "@/hooks/useAskRun";

function formatClockTime(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function AskUserMessage({
  content,
  createdAt,
}: {
  content: string;
  createdAt?: string | null;
}) {
  return (
    <div className="mb-4 flex flex-col items-end gap-1">
      <p className="text-caption text-vc-tertiary">You · {formatClockTime(createdAt ?? null)}</p>
      <div className="max-w-[80%] rounded-md bg-positive-subtle px-3 py-2 text-ui text-vc-primary">
        {content}
      </div>
    </div>
  );
}

export function AskAgentMessage({
  message,
  onFollowup,
}: {
  message: AskMessageView;
  onFollowup: (text: string) => void;
}) {
  const running = message.runStatus === "running";
  // Once no more content is coming, the standalone thinking row (orb +
  // shimmer text) has nothing left to say - the step bar and the answer
  // itself already carry the story from here.
  const showThinking = running && !!message.statusLine && !message.content;
  const pendingCards = message.actionCards.filter((c) => c.status === "pending");
  const resolvedCards = message.actionCards.filter((c) => c.status !== "pending");

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <BrandLogo showText={false} imgClassName="h-5 w-auto" />
        <span className="text-caption font-medium text-vc-secondary">Agent</span>
        {!running && message.durationMs != null && (
          <span className="ml-auto shrink-0 font-mono text-data tabular-nums text-vc-tertiary">
            {formatDuration(message.durationMs)}
          </span>
        )}
      </div>

      {showThinking && message.statusLine && (
        <AskThinking verb={message.statusLine.verb} object={message.statusLine.object} />
      )}

      <AskStepBar
        steps={message.steps}
        running={running}
        runStatus={message.runStatus === "running" ? "ok" : message.runStatus}
        durationMs={message.durationMs}
        pagesRead={message.pagesRead}
      />

      {message.blocks.map((block, i) => (
        <AskBlockView key={i} block={block} />
      ))}

      {message.content && (
        // Same `prose` convention already used for user Markdown elsewhere
        // (ViewEditDialog.tsx, MarkdownEditor.tsx) - prose-sm's 14px base
        // matches this app's --text-ui token, so Ask's answers land on the
        // same type scale as everything else instead of the bare, bullet-
        // less paragraphs SafeMarkdown produces unstyled.
        <div className="prose prose-sm dark:prose-invert mb-3 max-w-none">
          <SafeMarkdown>{message.content}</SafeMarkdown>
        </div>
      )}

      {message.actionCards.length > 0 && (
        <div className="mb-1">
          <p className="mb-1.5 text-caption font-medium text-vc-tertiary">
            {pendingCards.length > 0
              ? "Waiting on you"
              : `${resolvedCards.length} suggestion${resolvedCards.length === 1 ? "" : "s"}`}
          </p>
          {message.actionCards.map((card) => (
            <AskActionCard key={card.id} card={card} />
          ))}
        </div>
      )}

      <AskEvidence items={message.evidence} />

      {message.runStatus === "degraded" && message.degradedReasons.length > 0 && (
        <div className="mb-3 flex items-start gap-2 text-caption text-amber-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Some data was unavailable: {message.degradedReasons.join("; ")}</span>
        </div>
      )}

      <AskFollowups items={message.suggestions} onPick={onFollowup} />
    </div>
  );
}
