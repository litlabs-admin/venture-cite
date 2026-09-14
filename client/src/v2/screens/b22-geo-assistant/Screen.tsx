import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2Mode } from "@/v2/contracts/shell";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Avatar } from "@/v2/shared/ui/Avatar";
import { InlineAlert } from "@/v2/shared/ui/InlineAlert";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";
import { useBoard22Chat, type Board22ChatMessage } from "./chat";

export type Board22Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string };

export type Board22ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

export type Board22SavedConversation = { id: string; title: string; updatedAt: string };

export type Board22Data = {
  context: { brandId: string; mode: V2Mode };
  brand: { name: string; domain: Board22Value<string> };
  dataAvailable: {
    trackedQuestions: Board22Value<number>;
    visibilityWindow: Board22Value<string>;
    citedSources: Board22Value<number>;
    competitors: Board22Value<number>;
  };
  /** Seed messages only. Live mode always seeds this empty - a page that has
   *  never received a real question shows an empty composer, never an
   *  invented past conversation. The preview fixture seeds the approved
   *  sample exchange instead, since the fixture's job is visual parity with
   *  the approved render, not honesty about a live database. */
  conversation: { messages: readonly Board22ConversationMessage[] };
  /** Fallback list shown until the live thread query resolves. */
  savedConversations: readonly Board22SavedConversation[];
};

const SUGGESTED_QUESTIONS = [
  "Which sources cite my competitors?",
  "What questions am I missing from?",
  "How can I improve my visibility?",
] as const;

function stateTitle(value: Board22Value<unknown>): string | undefined {
  return value.kind === "not-measured" ? value.reason : undefined;
}

function renderValue<T>(value: Board22Value<T>, render: (inner: T) => ReactNode): ReactNode {
  if (value.kind === "measured") return render(value.value);
  return (
    <span title={stateTitle(value)}>
      <StateLabel state="not-measured" />
    </span>
  );
}

function buildV2Href(path: string, context: Board22Data["context"]): string {
  const params = new URLSearchParams({ brandId: context.brandId, mode: context.mode });
  return `${path}?${params.toString()}`;
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatSavedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(date);
}

/** A light-touch renderer for the model's markdown-flavoured reply: `**bold**`
 *  inline, `- ` bullet blocks, and a short bold-only line read as a heading -
 *  matching the Observations / Hypotheses structure the system prompt asks
 *  for, without pulling in a markdown dependency for freeform model text. */
function AssistantBody({ content }: { content: string }) {
  if (!content) {
    return <span className={cn(v2Type.body, "italic")}>Thinking…</span>;
  }
  function renderInline(line: string, key: number) {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <span key={key}>
        {parts.map((part, index) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={index} className="font-semibold text-[color:var(--v2-ink)]">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </span>
    );
  }

  // Grouped by line type across the whole message rather than by blank-line
  // block, because the model reliably writes "**Heading**\n- bullet\n-
  // bullet" with no blank line between the heading and its list.
  type Group =
    | { kind: "heading"; text: string }
    | { kind: "bullets"; lines: string[] }
    | { kind: "paragraph"; lines: string[] };
  const groups: Group[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
    const boldOnly = line.startsWith("**") && line.endsWith("**") && line.length < 60;
    if (headingMatch) {
      groups.push({ kind: "heading", text: headingMatch[1] });
      continue;
    }
    if (boldOnly) {
      groups.push({ kind: "heading", text: line.slice(2, -2) });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const bulletText = line.replace(/^[-*]\s+/, "");
      const last = groups[groups.length - 1];
      if (last?.kind === "bullets") last.lines.push(bulletText);
      else groups.push({ kind: "bullets", lines: [bulletText] });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "paragraph") last.lines.push(line);
    else groups.push({ kind: "paragraph", lines: [line] });
  }

  return (
    <div className="space-y-2.5">
      {groups.map((group, groupIndex) => {
        if (group.kind === "heading") {
          return (
            <h4 key={groupIndex} className="text-[14px] font-semibold text-[color:var(--v2-ink)]">
              {group.text}
            </h4>
          );
        }
        if (group.kind === "bullets") {
          return (
            <ul key={groupIndex} className="list-disc space-y-1 pl-[18px]">
              {group.lines.map((line, lineIndex) => (
                <li key={lineIndex} className={v2Type.body}>
                  {renderInline(line, lineIndex)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={groupIndex} className={v2Type.body}>
            {group.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {renderInline(line, lineIndex)}
                {lineIndex < group.lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ChatMessageRow({
  message,
  index,
  context,
}: {
  message: Board22ChatMessage;
  index: number;
  context: Board22Data["context"];
}) {
  if (message.role === "user") {
    return (
      <div className="mb-4 flex items-start gap-3">
        <Avatar initials="Y" size="sm" label="You" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className={v2Type.body}>{message.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-5 flex items-start gap-3">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--v2-brand)]"
      >
        <V2Icon name="geo" size={15} className="text-[color:var(--v2-paper)]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn(v2Type.label, "mb-1.5")}>GEO assistant</p>
        <AssistantBody content={message.content} />
        {message.content ? (
          <div className="mt-3 flex flex-wrap gap-2" data-testid={`b22-actions-${index}`}>
            <Button asChild className="h-8 rounded-lg px-3 text-[12.5px]">
              <a href={buildV2Href("/v2/visibility/evidence", context)}>Review source evidence</a>
            </Button>
            <Button asChild variant="outline" className="h-8 rounded-lg px-3 text-[12.5px]">
              <a href={buildV2Href("/v2/my-work", context)}>Create an experiment</a>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DataAvailableRow({
  icon,
  label,
  value,
}: {
  icon: Parameters<typeof V2Icon>[0]["name"];
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-[7px]">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]">
          <V2Icon name={icon} size={14} />
        </span>
        <span className={v2Type.bodyStrong}>{label}</span>
      </span>
      <span className="shrink-0 text-right">{value}</span>
    </div>
  );
}

const EVIDENCE_RULES = [
  "Answers use only your verified VentureCite data",
  "Cite specific records when possible",
  "Show multiple perspectives, not certainty",
  "Do not claim hidden model reasoning",
  "Flag hypotheses clearly",
] as const;

export function Board22Screen({ data }: V2ScreenProps<Board22Data>) {
  const chat = useBoard22Chat(data.context.brandId);
  const [draft, setDraft] = useState("");
  const [showAllSaved, setShowAllSaved] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Local seed used only until the user (or a restored thread) produces real
  // messages - see the comment on Board22Data.conversation.
  const seeded = chat.activeThreadId === null && chat.messages.length === 0;
  const visibleMessages: Board22ChatMessage[] = seeded
    ? data.conversation.messages.map((m) => ({ role: m.role, content: m.content }))
    : chat.messages;

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [visibleMessages.length, chat.isStreaming]);

  function submit(text: string) {
    if (!text.trim() || chat.isStreaming) return;
    void chat.send(text);
    setDraft("");
  }

  const savedList =
    chat.threads.length > 0 || !chat.threadsLoading
      ? chat.threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }))
      : data.savedConversations;
  const shownSaved = showAllSaved ? savedList : savedList.slice(0, 3);

  return (
    <div className="min-w-0 bg-[var(--v2-paper)] text-[color:var(--v2-ink)]">
      <div className="grid min-w-0 grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_322px]">
        <main className="min-w-0 px-7 py-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className={v2Type.pageTitle}>Ask about your verified visibility data</h1>
            <span className={v2Type.meta}>{formatClock(new Date())}</span>
          </div>
          <p className={cn(v2Type.pageSub, "mt-1")}>
            Get evidence-based answers from your VentureCite data.
          </p>

          <div
            ref={transcriptRef}
            className="mt-5 max-h-[520px] min-h-[120px] overflow-y-auto"
            data-testid="b22-transcript"
          >
            {visibleMessages.length === 0 ? (
              <p className={cn(v2Type.body, "py-6 text-center")}>
                Ask a question about this brand's verified visibility data to get started.
              </p>
            ) : (
              visibleMessages.map((message, index) => (
                <ChatMessageRow
                  context={data.context}
                  index={index}
                  key={index}
                  message={message}
                />
              ))
            )}
          </div>

          {chat.error ? (
            <InlineAlert tone="bad" className="mb-3">
              {chat.error}
            </InlineAlert>
          ) : null}
          {chat.budgetExceeded ? (
            <InlineAlert tone="warn" className="mb-3">
              Daily AI assistant budget reached. It resets at midnight UTC.
            </InlineAlert>
          ) : null}

          <form
            className="flex items-center gap-2.5 rounded-[var(--v2-radius)] border border-[var(--v2-line2)] px-3.5 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit(draft);
            }}
          >
            <input
              aria-label="Ask a follow-up question"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[color:var(--v2-ink)] outline-none placeholder:text-[color:var(--v2-ink3)]"
              disabled={chat.isStreaming}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a follow-up question…"
              value={draft}
            />
            {chat.isStreaming ? (
              <button
                aria-label="Stop generating"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--v2-line)] text-[color:var(--v2-ink3)]"
                onClick={chat.stop}
                type="button"
              >
                <V2Icon name="warn" size={14} />
              </button>
            ) : (
              <button
                aria-label="Send question"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--v2-brand)] text-[color:var(--v2-paper)] disabled:opacity-40"
                disabled={!draft.trim()}
                type="submit"
              >
                <V2Icon name="arrow" size={14} />
              </button>
            )}
          </form>

          <p className={cn(v2Type.meta, "mt-3 mb-2")}>Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                className="inline-flex items-center rounded-full border border-[var(--v2-brand-soft)] bg-[var(--v2-brand-soft)] px-3 py-1.5 text-[12.5px] font-medium text-[color:var(--v2-brand)] disabled:opacity-50"
                disabled={chat.isStreaming}
                key={question}
                onClick={() => submit(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </main>

        <aside className="min-w-0 border-t border-[var(--v2-line)] px-6 py-7 min-[1100px]:border-l min-[1100px]:border-t-0">
          <div className="flex items-baseline justify-between">
            <h2 className={v2Type.sectionTitle}>Active brand</h2>
            <a
              className="text-[12.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
              href={buildV2Href("/v2/settings", data.context)}
            >
              Edit
            </a>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]">
              <V2Icon name="doc" size={16} />
            </span>
            <div className="min-w-0">
              <p className={v2Type.bodyStrong}>{data.brand.name}</p>
              <p className={v2Type.meta}>
                {renderValue(data.brand.domain, (domain) => domain)}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--v2-line)] pt-4">
            <h2 className={cn(v2Type.caps, "mb-1")}>Data available</h2>
            <DataAvailableRow
              icon="doc"
              label="Tracked questions"
              value={renderValue(data.dataAvailable.trackedQuestions, (n) => (
                <span className={v2Type.num}>{n} queries</span>
              ))}
            />
            <DataAvailableRow
              icon="chart"
              label="Visibility history"
              value={renderValue(data.dataAvailable.visibilityWindow, (window) => (
                <span className={v2Type.num}>{window}</span>
              ))}
            />
            <DataAvailableRow
              icon="link"
              label="Cited sources"
              value={renderValue(data.dataAvailable.citedSources, (n) => (
                <span className={v2Type.num}>{n} sources</span>
              ))}
            />
            <DataAvailableRow
              icon="check"
              label="Competitor comparison"
              value={renderValue(data.dataAvailable.competitors, (n) => (
                <span className={v2Type.num}>{n} brands</span>
              ))}
            />
          </div>

          <div className="mt-4 border-t border-[var(--v2-line)] pt-4">
            <h2 className={cn(v2Type.caps, "mb-1")}>Data unavailable</h2>
            <div className="flex items-start gap-2.5 py-1.5">
              <V2Icon name="warn" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ink3)]" />
              <div>
                <p className={v2Type.bodyStrong}>Live model data</p>
                <p className={v2Type.meta}>Direct API access not available</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 py-1.5">
              <V2Icon name="warn" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ink3)]" />
              <div>
                <p className={v2Type.bodyStrong}>User-level prompts</p>
                <p className={v2Type.meta}>Individual prompts not stored</p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--v2-line)] pt-4">
            <h2 className={cn(v2Type.caps, "mb-1")}>Evidence rules</h2>
            {EVIDENCE_RULES.map((rule) => (
              <div className="flex items-start gap-2 py-[5px]" key={rule}>
                <V2Icon name="check" size={14} className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
                <span className={v2Type.body}>{rule}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-[var(--v2-line)] pt-4">
            <div className="flex items-baseline justify-between">
              <h2 className={v2Type.sectionTitle}>Recent saved conversations</h2>
              {savedList.length > 3 ? (
                <button
                  className="text-[12.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
                  onClick={() => setShowAllSaved((v) => !v)}
                  type="button"
                >
                  {showAllSaved ? "Show less" : "View all"}
                </button>
              ) : null}
            </div>
            {shownSaved.length === 0 ? (
              <p className={cn(v2Type.meta, "mt-2")}>No saved conversations yet.</p>
            ) : (
              shownSaved.map((conversation) => (
                <button
                  className="flex w-full items-center justify-between gap-2 py-[7px] text-left"
                  key={conversation.id}
                  onClick={() => chat.selectThread(conversation.id)}
                  type="button"
                >
                  <span className={cn(v2Type.body, "min-w-0 truncate")}>{conversation.title}</span>
                  <span className={cn(v2Type.meta, "shrink-0")}>
                    {formatSavedDate(conversation.updatedAt)}
                  </span>
                </button>
              ))
            )}
            <button
              className="mt-2 text-[12.5px] font-semibold text-[color:var(--v2-brand)] hover:text-[color:var(--v2-brand-fill)]"
              onClick={chat.newChat}
              type="button"
            >
              Start a new conversation
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
