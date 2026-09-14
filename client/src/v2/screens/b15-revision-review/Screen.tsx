import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Chip } from "@/v2/shared/ui/Chip";
import { DiffHighlight } from "@/v2/shared/ui/DiffHighlight";
import { Divider } from "@/v2/shared/ui/Divider";
import { Panel } from "@/v2/shared/ui/Panel";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";

export type Board15Value<T> =
  | { kind: "measured"; value: T }
  | { kind: "not-measured"; reason: string };

export type Board15TextPart = {
  text: string;
  changed: boolean;
};

export type Board15Content = {
  title: Board15Value<readonly Board15TextPart[]>;
  paragraph: Board15Value<readonly Board15TextPart[]>;
  section: Board15Value<readonly Board15TextPart[]>;
  questions: Board15Value<ReadonlyArray<readonly Board15TextPart[]>>;
};

export type Board15Evidence =
  | { kind: "confirmed"; sourceLabel: string; sourceUrl: string }
  | { kind: "not-confirmed"; message: string }
  | { kind: "not-measured"; reason: string };

export type Board15Claim = {
  id: string;
  current: Board15Value<readonly Board15TextPart[]>;
  proposed: Board15Value<readonly Board15TextPart[]>;
  evidence: Board15Evidence;
};

export type Board15Data = {
  context: Board15Value<string>;
  revision: {
    currentPublishedAt: Board15Value<string>;
    proposedEditedAt: Board15Value<string>;
    changeCount: Board15Value<number>;
    currentContent: Board15Content;
    proposedContent: Board15Content;
    approvalState: "pending" | "blocked" | "approved" | "requested-edits";
    rewardPoints: Board15Value<number>;
  };
  claims: Board15Value<readonly Board15Claim[]>;
};

export function Board15Screen({ data, staleAsOf }: V2ScreenProps<Board15Data>) {
  const hasBlockingEvidence =
    data.claims.kind !== "measured" ||
    data.claims.value.some((claim) => claim.evidence.kind !== "confirmed");
  const approvalBlocked = hasBlockingEvidence || data.revision.approvalState === "blocked";

  return (
    <section
      className="v2-mono min-h-screen bg-[var(--v2-paper)] text-[color:var(--v2-ink)] text-[14px] leading-[1.5]"
      data-testid="v2-board15"
    >
      <header className="flex h-[58px] items-center justify-between border-b-0 px-[27px]">
        <div className={cn(v2Type.bodyStrong, "text-[color:var(--v2-brand)]")}>
          <span>My work</span>
          <span className="ml-2 text-[color:var(--v2-ink)]">/ &nbsp;</span>
          <span className="text-[color:var(--v2-ink)]">Revision review</span>
        </div>
        <div className={v2Type.meta}>{renderScalar(data.context)}</div>
      </header>

      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_302px]">
        <main className="min-w-0 px-[27px] pb-[34px] pt-[27px]">
          <div className="mb-[14px]">
            <h1 className={v2Type.pageTitle}>Review changes before publication</h1>
            <p className={cn(v2Type.pageSub, "mt-1")}>Compare the current page with your proposed revision. Check each change for accuracy and approve when ready.</p>
          </div>

          {staleAsOf ? (
            <div className="mb-3 flex items-center gap-2 rounded-[var(--v2-radius)] border border-[var(--v2-warn)] bg-[var(--v2-warn-soft)] px-3 py-2">
              <StateLabel state="stale" />
              <span className={v2Type.meta}>Source evidence is stale as of {staleAsOf}. Refresh before approval.</span>
            </div>
          ) : null}

          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            <RevisionDocument
              content={data.revision.currentContent}
              date={data.revision.currentPublishedAt}
              dateLabel="Published on"
              heading="Current page"
              proposed={false}
            />
            <RevisionDocument
              changeCount={data.revision.changeCount}
              content={data.revision.proposedContent}
              date={data.revision.proposedEditedAt}
              dateLabel="Last edited"
              heading="Proposed revision"
              proposed
            />
          </div>

          <div className={cn(v2Type.sectionTitle, "mb-1 mt-4")}>{renderClaimHeading(data.revision.changeCount)}</div>
          <ClaimList claims={data.claims} />

          {data.claims.kind === "measured" ? (
            data.claims.value.some((claim) => claim.evidence.kind === "not-confirmed") ? (
              <ReviewAlert>
                Change #3 includes a claim about industries that is not confirmed in your approved facts. Please verify or request edits.
              </ReviewAlert>
            ) : null
          ) : (
            <ReviewAlert>
              Claim evidence is not measured. Approval is blocked until the revision review data is available.
            </ReviewAlert>
          )}
        </main>

        <aside className="min-w-0 px-[27px] pb-[26px] pt-[116px] lg:px-[20px]">
          <TaskBrief approvalBlocked={approvalBlocked} rewardPoints={data.revision.rewardPoints} />
        </aside>
      </div>
    </section>
  );
}

function RevisionDocument({
  changeCount,
  content,
  date,
  dateLabel,
  heading,
  proposed,
}: {
  changeCount?: Board15Value<number>;
  content: Board15Content;
  date: Board15Value<string>;
  dateLabel: string;
  heading: string;
  proposed: boolean;
}) {
  return (
    <Panel className="h-[404px] overflow-hidden px-[19px] pb-[18px] pt-4" padding="none">
      <div className="flex items-center gap-2">
        <h2 className={v2Type.bodyStrong}>{heading}</h2>
        {proposed && changeCount ? (
          <Chip tone="brand" className="px-2 py-[3px]">
            {renderChangeCount(changeCount)}
          </Chip>
        ) : null}
      </div>
      <div className={cn(v2Type.meta, "border-b border-[var(--v2-line)] pb-[14px] pt-0.5")}>
        {renderLabeledDate(dateLabel, date)}
      </div>
      <div className="pt-[18px]">
        <h3 className={cn(v2Type.cardTitle, "mb-4 max-w-[25ch]")}>{renderTextValue(content.title)}</h3>
        <p className={cn(v2Type.body, "mb-5 max-w-[52ch] text-[14.5px]")}>{renderTextValue(content.paragraph)}</p>
        <h4 className={cn(v2Type.sectionTitle, "mb-[11px]")}>{renderTextValue(content.section)}</h4>
        <QuestionList questions={content.questions} />
      </div>
    </Panel>
  );
}

function TaskBrief({
  approvalBlocked,
  rewardPoints,
}: {
  approvalBlocked: boolean;
  rewardPoints: Board15Value<number>;
}) {
  return (
    <Panel className="px-[21px] pb-8 pt-[21px]" padding="none">
      <h2 className={cn(v2Type.bodyStrong, "mb-4")}>Task brief</h2>
      <p className={cn(v2Type.body, "text-[13px] text-[color:var(--v2-ink2)]")}>Review the proposed revision and make sure it’s accurate, on brand, and ready to publish.</p>
      <Divider className="my-[22px]" />
      <h3 className={cn(v2Type.label, "mb-4")}>Requirements</h3>
      <Requirement number="1">Review every change and compare the content.</Requirement>
      <Requirement number="2">Confirm factual claims using the provided sources.</Requirement>
      <Requirement number="3">Approve the revision when you’re satisfied.</Requirement>
      <Divider className="my-[22px]" />
      <h3 className={cn(v2Type.label, "mb-4")}>Completion reward</h3>
      <div className="mb-9 flex items-start gap-3">
        <RewardGlyph />
        <div className={cn(v2Type.body, "text-[12.5px] text-[color:var(--v2-ink2)]")}>
          {rewardPoints.kind === "measured" ? (
            <>
              <span className="font-mono tabular-nums">{rewardPoints.value}</span> work points after verified approval
            </>
          ) : (
            <UnavailableValue value={rewardPoints} />
          )}
        </div>
      </div>
      <Button
        className="h-10 w-full rounded-lg px-4 text-[13.5px] font-semibold"
        disabled={approvalBlocked}
        type="button"
      >
        Approve revision
      </Button>
      <Button
        className="mt-3 h-10 w-full rounded-lg border-[var(--v2-brand)] bg-[var(--v2-paper)] px-4 text-[13.5px] font-semibold text-[color:var(--v2-brand)] hover:bg-[var(--v2-brand-soft)] hover:text-[color:var(--v2-brand)]"
        disabled
        title="Requesting edits is not available yet."
        type="button"
        variant="outline"
      >
        Request edits
      </Button>
    </Panel>
  );
}

function Requirement({ children, number }: { children: string; number: string }) {
  return (
    <div className="mb-6 grid grid-cols-[29px_1fr] items-start gap-[13px]">
      <span className="grid h-[27px] w-[27px] place-items-center rounded-full bg-[var(--v2-brand-soft)] font-mono text-[12px] font-semibold text-[color:var(--v2-brand)]">
        {number}
      </span>
      <span className={cn(v2Type.body, "text-[12.5px] text-[color:var(--v2-ink2)]")}>{children}</span>
    </div>
  );
}

function ClaimList({ claims }: { claims: Board15Value<readonly Board15Claim[]> }) {
  if (claims.kind === "not-measured") {
    return (
      <div className="border-t border-[var(--v2-line)] py-4">
        <UnavailableValue value={claims} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] border-t border-[var(--v2-line)]">
        {claims.value.map((claim, index) => (
          <ClaimRow claim={claim} key={claim.id} number={index + 1} />
        ))}
      </div>
    </div>
  );
}

function ClaimRow({ claim, number }: { claim: Board15Claim; number: number }) {
  return (
    <div className="grid min-h-[74px] grid-cols-[44px_minmax(0,1fr)_34px_minmax(0,1.06fr)_minmax(210px,1.12fr)] items-start border-b border-[var(--v2-line)]">
      <span className="mt-[9px] grid h-7 w-7 place-items-center rounded-full bg-[var(--v2-brand-soft)] font-mono text-[12.5px] font-semibold text-[color:var(--v2-brand)]">
        {number}
      </span>
      <ClaimCell label="Current" value={claim.current} />
      <span className="grid h-[74px] place-items-center text-[color:var(--v2-ink3)]">
        <V2Icon name="arrow" size={17} />
      </span>
      <ClaimCell label="Proposed" value={claim.proposed} />
      <EvidenceCell evidence={claim.evidence} />
    </div>
  );
}

function ClaimCell({ label, value }: { label: string; value: Board15Value<readonly Board15TextPart[]> }) {
  return (
    <div className="min-w-0 px-[9px] py-2">
      <span className={cn(v2Type.meta, "mb-0.5 block text-[11px]")}>{label}</span>
      <span className={cn(v2Type.body, "block text-[12.5px] leading-[1.4]")}>{renderTextValue(value)}</span>
    </div>
  );
}

function EvidenceCell({ evidence }: { evidence: Board15Evidence }) {
  if (evidence.kind === "not-measured") {
    return (
      <div className="min-w-0 border-l border-[var(--v2-line)] px-[9px] py-2">
        <span className={cn(v2Type.meta, "mb-0.5 block text-[11px]")}>Evidence</span>
        <UnavailableValue value={evidence} />
      </div>
    );
  }

  const confirmed = evidence.kind === "confirmed";
  return (
    <div className="relative min-w-0 border-l border-[var(--v2-line)] px-[9px] py-2 pr-1">
      <span className={cn(v2Type.meta, "mb-0.5 block text-[11px]")}>Evidence</span>
      <span className={cn(v2Type.meta, "absolute right-1 top-[9px] text-[11px]", confirmed ? "text-[color:var(--v2-ok)]" : "text-[color:var(--v2-bad)]")}>
        {confirmed ? "Confirmed" : "Not confirmed"}
      </span>
      <span className={cn(v2Type.meta, "flex items-center gap-1.5 text-[11px]", confirmed ? "text-[color:var(--v2-ok)]" : "text-[color:var(--v2-bad)]")}>
        <V2Icon name={confirmed ? "check" : "warn"} size={15} />
        {confirmed ? evidence.sourceLabel : evidence.message}
      </span>
      {confirmed ? (
        <a className={cn(v2Type.mono, "block truncate text-[11px] text-[color:var(--v2-brand)] underline underline-offset-2")} href={evidence.sourceUrl} rel="noreferrer" target="_blank">
          {evidence.sourceUrl}
        </a>
      ) : (
        <span className={cn(v2Type.meta, "block text-[11px] text-[color:var(--v2-ink3)]")}>—</span>
      )}
    </div>
  );
}

function QuestionList({ questions }: { questions: Board15Value<ReadonlyArray<readonly Board15TextPart[]>> }) {
  if (questions.kind === "not-measured") return <UnavailableValue value={questions} />;

  return (
    <ul className={cn(v2Type.body, "list-disc space-y-[7px] pl-[22px] text-[14px]")}>
      {questions.value.map((question, index) => (
        <li className="pl-1" key={`question-${index}`}>
          {renderTextParts(question)}
        </li>
      ))}
    </ul>
  );
}

function ReviewAlert({ children }: { children: string }) {
  return (
    <div className="mt-[10px] flex items-start gap-3 rounded-[var(--v2-radius)] border border-[var(--v2-bad)] bg-[var(--v2-bad-soft)] px-3.5 py-2.5 text-[color:var(--v2-bad)]" role="alert">
      <V2Icon name="q" size={18} className="mt-0.5 shrink-0" />
      <span className={cn(v2Type.meta, "text-[12px] text-[color:var(--v2-bad)]")}>{children}</span>
    </div>
  );
}

function renderClaimHeading(value: Board15Value<number>) {
  if (value.kind === "not-measured") return <UnavailableValue value={value} />;
  return `Changed claims (${value.value})`;
}

function renderChangeCount(value: Board15Value<number>) {
  if (value.kind === "not-measured") return <UnavailableValue value={value} />;
  return `${value.value} changes`;
}

function renderLabeledDate(label: string, value: Board15Value<string>) {
  if (value.kind === "not-measured") return <UnavailableValue value={value} />;
  return `${label} ${formatDate(value.value)}`;
}

function renderScalar(value: Board15Value<string>) {
  if (value.kind === "not-measured") return <UnavailableValue value={value} />;
  return value.value;
}

function renderTextValue(value: Board15Value<readonly Board15TextPart[]>) {
  if (value.kind === "not-measured") return <UnavailableValue value={value} />;
  return renderTextParts(value.value);
}

function renderTextParts(parts: readonly Board15TextPart[]) {
  return parts.map((part, index) =>
    part.changed ? (
      <DiffHighlight
        className={cn(v2Type.body, part.text.includes("\n") ? "whitespace-pre-line" : undefined)}
        key={`${part.text}-${index}`}
      >
        {part.text}
      </DiffHighlight>
    ) : (
      <span className={v2Type.body} key={`${part.text}-${index}`}>
        {part.text}
      </span>
    ),
  );
}

function UnavailableValue<T extends { kind: "not-measured"; reason: string }>({
  value,
}: {
  value: T;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StateLabel state="not-measured" />
      <span className={v2Type.meta}>{value.reason}</span>
    </span>
  );
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function RewardGlyph() {
  return (
    <svg aria-hidden="true" className="mt-0.5 h-8 w-8 shrink-0 text-[color:var(--v2-brand)]" fill="none" viewBox="0 0 32 32">
      <path d="m16 3.7 10.2 5.6v13.4L16 28.3 5.8 22.7V9.3z" stroke="currentColor" strokeWidth="1.6" />
      <path d="m16 9.2 1.6 3.2 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
