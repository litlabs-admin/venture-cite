import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { ChecklistItem } from "@/v2/shared/ui/ChecklistItem";
import { Chip } from "@/v2/shared/ui/Chip";
import { Divider } from "@/v2/shared/ui/Divider";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { Toast } from "@/v2/shared/ui/Toast";

export type ContentValue<T> =
  { kind: "measured"; value: T } | { kind: "not-measured"; reason: string };

export type EditorStepStatus = "completed" | "active" | "pending";

export type EditorStep = {
  label: string;
  caption: string;
  status: EditorStepStatus;
};

export type DraftSection =
  | { kind: "heading"; text: ContentValue<string> }
  | { kind: "paragraph"; text: ContentValue<string> }
  | { kind: "bullets"; items: readonly ContentValue<string>[] };

export type ContentTaskData<TBoard extends "buyer-guide" | "services"> = {
  board: TBoard;
  brandId: string;
  task: {
    id: string;
    revision: number;
    title: ContentValue<string>;
    state: "edit" | "edit_page" | "verify";
    steps: readonly EditorStep[];
    buyerNeed: ContentValue<string>;
    sourceEvidence: ContentValue<string>;
    completionRequirements: ContentValue<readonly string[]>;
    pointsAfterVerification: ContentValue<number>;
  };
  draft: {
    /** The article row this draft persists to - absent when the task's
     *  linked article does not exist (an orphaned reference, or one not yet
     *  created), in which case saving and submitting stay disabled. */
    articleId: ContentValue<string>;
    status: ContentValue<string>;
    title: ContentValue<string>;
    body: ContentValue<string>;
    questions: ContentValue<readonly string[]>;
    sections: readonly DraftSection[];
    savedAt: ContentValue<string>;
    footnotes: ContentValue<readonly string[]>;
    citationCount: ContentValue<number>;
  };
  publication: {
    url: ContentValue<string>;
    verified: ContentValue<boolean>;
  };
  toast: ContentValue<string>;
};

type ContentTaskBoard = ContentTaskData<"buyer-guide"> | ContentTaskData<"services">;

export type ContentTaskActions = {
  saveDraft: {
    run: (content: string) => void;
    pending: boolean;
    error?: string;
  };
  submit: {
    run: () => void;
    pending: boolean;
    blocked: boolean;
    reason?: string;
  };
};

function valueText<T>(value: ContentValue<T>, render: (content: T) => ReactNode): ReactNode {
  if (value.kind === "not-measured") {
    return (
      <span data-v2-value-state="not-measured" title={value.reason}>
        Not measured
      </span>
    );
  }

  return render(value.value);
}

function v2Href(path: string, brandId: string, params?: Record<string, string>): string {
  const query = new URLSearchParams({ brandId, mode: "guided", ...params });
  return `${path}?${query.toString()}`;
}

function EditorSteps({ steps }: { steps: readonly EditorStep[] }) {
  return (
    <ol className="mt-6 flex min-w-0 items-start gap-2" data-testid="v2-content-task-steps">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isCompleted = step.status === "completed";
        const isActive = step.status === "active";
        return (
          <li key={step.label} className="flex min-w-0 flex-1 items-start gap-2">
            <span
              aria-hidden="true"
              className={`${v2Type.label} mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                isCompleted || isActive
                  ? "bg-[var(--v2-brand)] text-[color:var(--v2-paper)]"
                  : "bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]"
              }`}
            >
              {isCompleted ? <V2Icon name="check" size={13} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`${v2Type.bodyStrong} block truncate ${
                  isActive || isCompleted
                    ? "font-semibold text-[color:var(--v2-ink)]"
                    : "font-normal text-[color:var(--v2-ink2)]"
                }`}
              >
                {step.label}
              </span>
              <span
                className={`${v2Type.meta} mt-0.5 block ${
                  isActive ? "text-[color:var(--v2-brand)]" : "text-[color:var(--v2-ink3)]"
                }`}
              >
                {step.caption}
              </span>
            </span>
            {!isLast ? (
              <span aria-hidden="true" className="mt-3 h-px min-w-5 flex-1 bg-[var(--v2-line)]" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function EditorToolbar() {
  function applyCommand(command: string, value?: string) {
    if (typeof document !== "undefined") {
      document.execCommand(command, false, value);
    }
  }

  return (
    <div className="flex h-12 items-center gap-1 border-b border-[var(--v2-line)] px-3">
      <Button
        type="button"
        variant="outline"
        onClick={() => applyCommand("formatBlock", "h2")}
        className={`${v2Type.body} h-8 rounded-lg px-3`}
      >
        Heading 2
        <V2Icon name="cdown" size={13} />
      </Button>
      <Divider className="mx-2 h-6 w-px" />
      <Button
        type="button"
        variant="ghost"
        aria-label="Bold"
        onClick={() => applyCommand("bold")}
        className={`${v2Type.bodyStrong} h-8 rounded-lg px-2`}
      >
        B
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Italic"
        onClick={() => applyCommand("italic")}
        className={`${v2Type.body} h-8 rounded-lg px-2 font-serif italic`}
      >
        I
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-label="Add link"
        onClick={() => applyCommand("createLink", "https://example.com")}
        className="h-8 rounded-lg px-2"
      >
        <V2Icon name="link" size={15} />
      </Button>
    </div>
  );
}

function DraftContent({
  draft,
  onStatusChange,
  saveDraft,
}: {
  draft: ContentTaskBoard["draft"];
  onStatusChange: (status: string) => void;
  saveDraft?: ContentTaskActions["saveDraft"];
}) {
  return (
    <article
      aria-label="Draft content"
      className="min-h-[510px] px-6 py-5 outline-none"
      contentEditable
      data-testid="v2-content-task-editable"
      onInput={() => onStatusChange("Saving draft")}
      onBlur={(event) => {
        saveDraft?.run(event.currentTarget.innerText);
        onStatusChange("Draft saved");
      }}
      role="textbox"
      suppressContentEditableWarning
    >
      {valueText(draft.title, (title) => (
        <h2 className={`${v2Type.cardTitle} mb-3 text-[21px]`}>{title}</h2>
      ))}
      {draft.sections.map((section, index) => {
        if (section.kind === "heading") {
          return (
            <h3 key={`heading-${index}`} className={`${v2Type.sectionTitle} mb-2 mt-5 first:mt-0`}>
              {valueText(section.text, (text) => text)}
            </h3>
          );
        }
        if (section.kind === "bullets") {
          return (
            <ul key={`bullets-${index}`} className={`${v2Type.body} mb-4 list-disc space-y-1 pl-5`}>
              {section.items.map((item, itemIndex) => (
                <li key={`bullet-${index}-${itemIndex}`}>{valueText(item, (text) => text)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`paragraph-${index}`} className={`${v2Type.body} mb-4`}>
            {valueText(section.text, (text) => text)}
          </p>
        );
      })}
      <Divider className="mt-5 mb-3" />
      <div className={v2Type.meta}>
        {valueText(draft.footnotes, (footnotes) => (
          <ul className="space-y-1">
            {footnotes.map((footnote) => (
              <li key={footnote}>{footnote}</li>
            ))}
          </ul>
        ))}
      </div>
    </article>
  );
}

function Requirements({ requirements }: { requirements: ContentValue<readonly string[]> }) {
  return (
    <div className="mt-5">
      <h3 className={v2Type.sectionTitle}>Completion requirements</h3>
      <div className="mt-4 space-y-3">
        {valueText(requirements, (items) =>
          items.map((item) => (
            <ChecklistItem
              key={item}
              status="todo"
              label={<span className={v2Type.body}>{item}</span>}
            />
          )),
        )}
      </div>
    </div>
  );
}

function TaskBrief({
  data,
  submit,
}: {
  data: ContentTaskBoard;
  submit?: ContentTaskActions["submit"];
}) {
  const isServices = data.board === "services";
  return (
    <Panel padding="spacious">
      <PanelHeader title="Task brief" />
      <div className="space-y-4">
        <p className={v2Type.body}>
          <strong className={v2Type.bodyStrong}>Buyer need:</strong>{" "}
          {valueText(data.task.buyerNeed, (value) => value)}
        </p>
        <p className={v2Type.body}>
          <strong className={v2Type.bodyStrong}>
            {isServices ? "Source evidence:" : "Evidence:"}
          </strong>{" "}
          {valueText(data.task.sourceEvidence, (value) => value)}
        </p>
      </div>
      <Divider className="mt-5" />
      <Requirements requirements={data.task.completionRequirements} />
      <Divider className="mt-5" />
      <p
        className={`${v2Type.bodyStrong} mt-4 flex items-center gap-2 text-[color:var(--v2-brand)]`}
      >
        <V2Icon name="star" size={15} />
        {valueText(
          data.task.pointsAfterVerification,
          (points) => `${points} work points after verification`,
        )}
      </p>
      <Button
        className={`${v2Type.body} mt-4 h-10 w-full rounded-lg px-3`}
        data-testid="v2-content-task-submit"
        disabled={!submit || submit.blocked || submit.pending}
        onClick={submit?.run}
        type="button"
      >
        {submit?.pending ? "Submitting…" : "Continue to publication check"}
      </Button>
      {submit?.reason ? (
        <p className={`${v2Type.meta} mt-2`} data-testid="v2-content-task-submit-reason">
          {submit.reason}
        </p>
      ) : null}
      <a
        className={`${v2Type.bodyStrong} mt-4 block text-center text-[color:var(--v2-brand)] hover:underline`}
        href={v2Href("/v2/brand-facts", data.brandId)}
      >
        View source evidence
      </a>
      <span className="sr-only">
        Publication verification:{" "}
        {valueText(data.publication.verified, (verified) =>
          verified ? "Verified" : "Not verified",
        )}
      </span>
    </Panel>
  );
}

export function ContentTaskEditor({
  data,
  staleAsOf,
  actions,
}: {
  data: ContentTaskBoard;
  staleAsOf?: string;
  actions?: ContentTaskActions;
}) {
  const [localStatus, setLocalStatus] = useState<string>();
  // The mutation's own pending/error state outranks the optimistic label
  // `onStatusChange` set on blur: a save that is still in flight, or one the
  // server rejected, is what actually happened - the optimistic "Draft
  // saved" was a guess made before the response came back.
  const savedStatus = actions?.saveDraft.pending
    ? "Saving draft"
    : actions?.saveDraft.error
      ? `Draft not saved: ${actions.saveDraft.error}`
      : localStatus;
  const status = savedStatus
    ? { kind: "measured" as const, value: savedStatus }
    : data.draft.status;

  return (
    <div
      className="flex min-h-[calc(100vh-52px)] min-w-0 flex-col bg-[var(--v2-paper)] lg:flex-row"
      data-testid={`v2-${data.board}-content-task`}
    >
      <main className="min-w-0 flex-1 px-7 pt-7 pb-0">
        <div className="mx-auto max-w-[920px]">
          <h1 className={v2Type.pageTitle}>{valueText(data.task.title, (title) => title)}</h1>
          <EditorSteps steps={data.task.steps} />
          {staleAsOf ? (
            <p className={`${v2Type.meta} mt-4`}>
              Source evidence is stale. Last updated {staleAsOf}.
            </p>
          ) : null}
          <div className="mt-5">
            <Chip tone="brand" leadingDot>
              {valueText(status, (value) => value)}
            </Chip>
          </div>
          <Panel className="mt-3 overflow-hidden" padding="none">
            <EditorToolbar />
            <DraftContent
              draft={data.draft}
              onStatusChange={setLocalStatus}
              saveDraft={actions?.saveDraft}
            />
          </Panel>
          <Toast
            tone="brand"
            message={valueText(data.toast, (value) => value)}
            className={
              data.board === "services"
                ? "fixed right-7 bottom-7 z-20 w-[min(490px,calc(100vw-3.5rem))] shadow-md"
                : "mt-5 rounded-none border-x-0 border-b-0 px-0 py-3"
            }
          />
        </div>
      </main>
      <aside className="w-full shrink-0 border-t border-[var(--v2-line)] px-7 py-7 lg:w-[322px] lg:border-t-0 lg:border-l">
        <TaskBrief data={data} submit={actions?.submit} />
      </aside>
    </div>
  );
}
