import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type Board07Unavailable =
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stale"; reason: string; asOf: string }
  | { kind: "empty"; reason: string };

export type Board07Value<T> = { kind: "available"; value: T } | Board07Unavailable;

export type Board07FactReview =
  { kind: "confirmed" } | { kind: "needs-review" } | { kind: "dismissed" };

export type Board07Fact = {
  id: string;
  name: string;
  value: Board07Value<string>;
  source: Board07Value<string>;
  sourceClass: Board07Value<"first-party" | "user-supplied" | "other">;
  scope: Board07Value<string>;
  effectiveDate: Board07Value<string>;
  expiry: Board07Value<string>;
  reviewer: Board07Value<string>;
  conflict: Board07Value<string>;
  lastCheck: Board07Value<string>;
  excerpt: Board07Value<string>;
  extractedAt: Board07Value<string>;
  review: Board07FactReview;
};

export type Board07Page = {
  path: string;
  factCount: Board07Value<number>;
  scannedAt: Board07Value<string>;
  sourceKind: "document" | "site";
};

export type Board07Data = {
  brand: {
    id: string;
    name: Board07Value<string>;
    displayName: Board07Value<string>;
  };
  navigation: {
    brandId: string;
    mode: "guided" | "expert";
  };
  facts: readonly Board07Fact[];
  pages: Board07Value<readonly Board07Page[]>;
  progress: {
    level: Board07Value<number>;
    levelName: Board07Value<string>;
    workPoints: Board07Value<number>;
    target: Board07Value<string>;
    stepPoints: Board07Value<number>;
    completedSteps: Board07Value<number>;
    requiredSteps: Board07Value<number>;
  };
  selectedFactId: string;
  actions: {
    approveFact: (factId: string) => Promise<void>;
    amendFact: (factId: string, factValue: string) => Promise<void>;
  };
};

type V2StateName = "not-measured" | "failed" | "stale";

function stateLabel(state: Board07Unavailable): ReactNode {
  if (state.kind === "empty") return <span className={v2Type.meta}>Empty</span>;

  const name: V2StateName = state.kind;
  return (
    <span title={state.kind === "stale" ? `${state.reason} As of ${state.asOf}.` : state.reason}>
      <StateLabel state={name} />
    </span>
  );
}

function Availability<T>({
  value,
  children,
}: {
  value: Board07Value<T>;
  children: (available: T) => ReactNode;
}) {
  return value.kind === "available" ? children(value.value) : stateLabel(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

function sourceLabel(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    return value;
  }
}

function internalHref(path: string, navigation: Board07Data["navigation"]): string {
  const params = new URLSearchParams();
  if (navigation.brandId) params.set("brandId", navigation.brandId);
  params.set("mode", navigation.mode);
  return `${path}?${params.toString()}`;
}

function ReviewLabel({ review }: { review: Board07FactReview }) {
  const definition = {
    confirmed: { icon: "check" as const, label: "Confirmed", tone: "var(--v2-ok)" },
    "needs-review": { icon: "warn" as const, label: "Needs review", tone: "var(--v2-bad)" },
    dismissed: { icon: "warn" as const, label: "Dismissed", tone: "var(--v2-ink3)" },
  }[review.kind];

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
      style={{ color: definition.tone }}
      data-review-state={review.kind}
    >
      <V2Icon name={definition.icon} size={14} />
      <span className={v2Type.meta}>{definition.label}</span>
    </span>
  );
}

function HexLevelBadge() {
  return (
    <svg aria-hidden="true" className="h-[46px] w-[46px] shrink-0" viewBox="0 0 52 52">
      <path
        d="M26 2.6 45.5 13.9v22.2L26 47.4 6.5 36.1V13.9z"
        fill="var(--v2-inset)"
        stroke="var(--v2-line2)"
        strokeWidth="1.5"
      />
      <circle cx="26" cy="26" r="5.4" fill="var(--v2-ink4)" />
    </svg>
  );
}

function ProgressNumber({ value }: { value: Board07Value<number> }) {
  return (
    <Availability value={value}>
      {(number) => <span className={v2Type.num}>{number}</span>}
    </Availability>
  );
}

function SetupStep({ label, points }: { label: string; points: Board07Value<number> }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--v2-line)] py-[9px] last:border-b-0">
      <span className="flex min-w-0 items-center gap-2">
        <V2Icon name="check" size={16} className="shrink-0 text-[color:var(--v2-ink3)]" />
        <span className={v2Type.meta}>{label}</span>
      </span>
      <ProgressNumber value={points} />
    </li>
  );
}

function TabLink({
  active,
  label,
  number,
  href,
}: {
  active: boolean;
  label: string;
  number: number;
  href: string;
}) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={`-mb-px inline-flex items-center gap-2 border-b-2 pb-2.5 ${
        active
          ? "border-[var(--v2-brand)] text-[color:var(--v2-brand)]"
          : "border-transparent text-[color:var(--v2-ink2)] hover:text-[color:var(--v2-brand)]"
      }`}
      href={href}
    >
      <span
        className={`grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-semibold ${
          active
            ? "bg-[var(--v2-brand)] text-[color:var(--v2-paper)]"
            : "bg-[var(--v2-line)] text-[color:var(--v2-ink3)]"
        }`}
      >
        {number}
      </span>
      <span className={v2Type.body}>{label}</span>
    </a>
  );
}

function FactRow({
  fact,
  selected,
  value,
  review,
  onSelect,
}: {
  fact: Board07Fact;
  selected: boolean;
  value: Board07Value<string>;
  review: Board07FactReview;
  onSelect: () => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <tr
      className={selected ? "bg-[var(--v2-brand-soft)]" : "bg-[var(--v2-paper)]"}
      data-fact-id={fact.id}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <td className="px-3 py-[10px] text-[color:var(--v2-ink2)]">
        <span className={v2Type.body}>{fact.name}</span>
      </td>
      <td className="px-3 py-[10px]">
        <Availability value={value}>
          {(text) => <span className={v2Type.bodyStrong}>{text}</span>}
        </Availability>
      </td>
      <td className="px-3 py-[10px]">
        <Availability value={fact.source}>
          {(source) => (
            <span
              className={
                source === "User supplied"
                  ? v2Type.meta
                  : "text-[13px] text-[color:var(--v2-brand)]"
              }
            >
              {source === "User supplied" ? source : sourceLabel(source)}
            </span>
          )}
        </Availability>
      </td>
      <td className="px-3 py-[10px]">
        <ReviewLabel review={review} />
      </td>
    </tr>
  );
}

function PageRows({ pages }: { pages: Board07Value<readonly Board07Page[]> }) {
  return (
    <section aria-label="Pages scanned for these facts" className="mt-[26px]">
      <h3 className={v2Type.caps}>Pages scanned for these facts</h3>
      {pages.kind === "available" ? (
        <ul className="mt-2 border-t border-[var(--v2-line)]">
          {pages.value.map((page) => (
            <li
              className="flex items-center justify-between gap-4 border-b border-[var(--v2-line)] px-0 py-[11px]"
              key={page.path}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[6px] bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]">
                  <V2Icon name={page.sourceKind === "site" ? "globe" : "doc"} size={14} />
                </span>
                <span className={v2Type.num}>{page.path}</span>
                <Availability value={page.factCount}>
                  {(count) => (
                    <span className={v2Type.meta}>
                      {count === 0
                        ? "No facts found"
                        : `${count} fact${count === 1 ? "" : "s"} extracted`}
                    </span>
                  )}
                </Availability>
              </span>
              <Availability value={page.scannedAt}>
                {(date) => <span className={v2Type.mono}>{formatDate(date)}</span>}
              </Availability>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">{stateLabel(pages)}</div>
      )}
    </section>
  );
}

function getFactValue(fact: Board07Fact, localValue: string | undefined): Board07Value<string> {
  if (localValue !== undefined) return { kind: "available", value: localValue };
  return fact.value;
}

function Board07Rail({ progress }: { progress: Board07Data["progress"] }) {
  let levelLabel: ReactNode;
  if (progress.level.kind === "available" && progress.levelName.kind === "available") {
    levelLabel = (
      <span className={v2Type.cardTitle}>
        Level {progress.level.value} · {progress.levelName.value}
      </span>
    );
  } else if (progress.level.kind !== "available") {
    levelLabel = stateLabel(progress.level);
  } else if (progress.levelName.kind !== "available") {
    levelLabel = stateLabel(progress.levelName);
  } else {
    levelLabel = (
      <span className={v2Type.cardTitle}>
        Level {progress.level.value} · {progress.levelName.value}
      </span>
    );
  }

  return (
    <aside aria-label="Level progress" className="min-w-0">
      <div className="mb-5 flex items-center gap-3">
        <HexLevelBadge />
        <div className="min-w-0">
          {levelLabel}
          <p className={`${v2Type.meta} mt-0.5`}>
            <ProgressNumber value={progress.workPoints} /> <span>work points</span>
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--v2-line)] pt-[18px]">
        <h2 className={v2Type.bodyStrong}>
          <Availability value={progress.target}>{(target) => target}</Availability>
        </h2>
        <ul className="mt-2">
          <SetupStep label="Approve essential facts" points={progress.stepPoints} />
          <SetupStep label="Approve buyer questions" points={progress.stepPoints} />
          <SetupStep label="Review baseline coverage" points={progress.stepPoints} />
        </ul>
        <p className={`${v2Type.meta} mt-3`}>All three steps are required.</p>
      </div>

      <div className="mt-[26px] border-t border-[var(--v2-line)] pt-5">
        <h2 className={v2Type.bodyStrong}>Why this matters</h2>
        <p className={`${v2Type.meta} mt-2 leading-[1.7]`}>
          Approved facts help separate real conflicts from extraction errors.
        </p>
        <p className={`${v2Type.meta} mt-2 leading-[1.7]`}>
          Your confirmation establishes business accuracy. A page check establishes what the page
          says.
        </p>
        <p className={`${v2Type.meta} mt-2 leading-[1.7]`}>
          Nothing is measured until all three steps are done.
        </p>
      </div>

      <div className="mt-6 border-t border-[var(--v2-line)] pt-[18px]">
        <h2 className={v2Type.bodyStrong}>After Level 2</h2>
        <p className={`${v2Type.meta} mt-2 leading-[1.7]`}>
          Your first observation runs, and the ranked task list on Today opens.
        </p>
      </div>
    </aside>
  );
}

export function Board07Screen({ data }: V2ScreenProps<Board07Data>) {
  const [selectedId, setSelectedId] = useState(data.selectedFactId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => new Set());

  const activeFact = useMemo(
    () => data.facts.find((fact) => fact.id === selectedId) ?? data.facts[0],
    [data.facts, selectedId],
  );

  if (!activeFact) {
    return (
      <section className="px-7 py-7" role="status">
        <StateLabel state="not-measured" />
      </section>
    );
  }

  const factValue = getFactValue(activeFact, localValues[activeFact.id]);
  const review = confirmedIds.has(activeFact.id)
    ? { kind: "confirmed" as const }
    : activeFact.review;
  const canEdit = factValue.kind === "available";

  function selectFact(factId: string) {
    setSelectedId(factId);
    setEditing(false);
    setDraft("");
    setActionError("");
  }

  async function approveFact() {
    setPending(true);
    setActionError("");
    try {
      await data.actions.approveFact(activeFact.id);
      setConfirmedIds((previous) => new Set(previous).add(activeFact.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The approval could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function amendFact() {
    const value = draft.trim();
    if (!value || !canEdit || factValue.kind !== "available" || value === factValue.value) return;
    setPending(true);
    setActionError("");
    try {
      await data.actions.amendFact(activeFact.id, value);
      setLocalValues((previous) => ({ ...previous, [activeFact.id]: value }));
      setConfirmedIds((previous) => new Set(previous).add(activeFact.id));
      setEditing(false);
      setDraft("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The change could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-52px)] min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 px-7 py-7">
        <h1 className={v2Type.pageTitle}>Build a reliable starting point</h1>
        <p className={`${v2Type.pageSub} mt-2`}>
          Review what <Availability value={data.brand.displayName}>{(name) => name}</Availability>{" "}
          knows before measuring your visibility.
        </p>

        <nav
          aria-label="Brand facts setup steps"
          className="mt-5 flex flex-wrap gap-x-6 border-b border-[var(--v2-line)]"
        >
          <TabLink
            active
            label="Brand facts"
            number={1}
            href={internalHref("/v2/brand-facts", data.navigation)}
          />
          <TabLink
            active={false}
            label="Buyer questions"
            number={2}
            href={internalHref("/v2/onboarding/questions", data.navigation)}
          />
          <TabLink
            active={false}
            label="Baseline"
            number={3}
            href={internalHref("/v2/onboarding/baseline", data.navigation)}
          />
        </nav>

        <section aria-labelledby="board07-facts-heading" className="mt-5">
          <h2 id="board07-facts-heading" className={v2Type.sectionTitle}>
            Confirm your essential facts
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table
              className="w-full min-w-[650px] border-collapse"
              aria-label="Essential brand facts"
            >
              <thead>
                <tr className="border-b border-[var(--v2-line)] text-left">
                  <th className={`${v2Type.caps} w-[22%] px-3 pb-2`}>Fact</th>
                  <th className={`${v2Type.caps} w-[30%] px-3 pb-2`}>Extracted value</th>
                  <th className={`${v2Type.caps} w-[20%] px-3 pb-2`}>Source</th>
                  <th className={`${v2Type.caps} px-3 pb-2`}>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.facts.map((fact) => (
                  <FactRow
                    fact={fact}
                    key={fact.id}
                    onSelect={() => selectFact(fact.id)}
                    review={confirmedIds.has(fact.id) ? { kind: "confirmed" } : fact.review}
                    selected={fact.id === activeFact.id}
                    value={getFactValue(fact, localValues[fact.id])}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="board07-excerpt-heading" className="mt-[26px]">
          <h3 id="board07-excerpt-heading" className={v2Type.caps}>
            Source excerpt
          </h3>
          <blockquote className="mt-2 border-l-2 border-[var(--v2-brand)] pl-[15px] text-[15px] leading-[1.6] text-[color:var(--v2-ink)]">
            <Availability value={activeFact.excerpt}>{(excerpt) => `“${excerpt}”`}</Availability>
          </blockquote>
          <p className="mt-2 flex flex-wrap items-center gap-[22px]">
            <Availability value={activeFact.source}>
              {(source) => (
                <a
                  className="text-[12.5px] text-[color:var(--v2-brand)] hover:text-[var(--v2-brand-fill)]"
                  href={source}
                >
                  {sourceLabel(source)}
                </a>
              )}
            </Availability>
            <Availability value={activeFact.extractedAt}>
              {(date) => <span className={v2Type.mono}>Extracted {formatDate(date)}</span>}
            </Availability>
          </p>
        </section>

        <section
          className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-[var(--v2-line)] pt-5"
          aria-labelledby="board07-approved-heading"
        >
          <div>
            <h3 id="board07-approved-heading" className={v2Type.caps}>
              Approved service region
            </h3>
            <div className="mt-1 text-[16px] font-semibold text-[color:var(--v2-ink)]">
              <Availability
                value={
                  data.facts.find((fact) => fact.name === "Service region")?.value ?? {
                    kind: "not-measured",
                    reason: "The service region is not measured.",
                  }
                }
              >
                {(value) => value}
              </Availability>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {editing ? (
              <>
                <Button
                  className="h-10 rounded-lg px-4 text-[13.5px]"
                  disabled={pending}
                  onClick={() => void amendFact()}
                  type="button"
                >
                  {pending ? "Saving…" : "Save and approve"}
                </Button>
                <Button
                  className="h-10 rounded-lg px-4 text-[13.5px]"
                  disabled={pending}
                  onClick={() => {
                    setEditing(false);
                    setDraft("");
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-10 rounded-lg px-4 text-[13.5px]"
                  disabled={
                    pending || review.kind === "confirmed" || factValue.kind !== "available"
                  }
                  onClick={() => void approveFact()}
                  type="button"
                >
                  {pending
                    ? "Approving…"
                    : review.kind === "confirmed"
                      ? "Approved"
                      : "Approve this fact"}
                </Button>
                <Button
                  className="h-10 rounded-lg px-4 text-[13.5px]"
                  disabled={!canEdit || pending}
                  onClick={() => {
                    setEditing(true);
                    setDraft(factValue.kind === "available" ? factValue.value : "");
                  }}
                  type="button"
                  variant="outline"
                >
                  Edit value
                </Button>
              </>
            )}
          </div>
          {actionError ? (
            <p className={`${v2Type.meta} basis-full text-[color:var(--v2-bad)]`}>{actionError}</p>
          ) : null}
          {editing ? (
            <input
              aria-label="Edit fact value"
              className="h-9 w-full rounded-[var(--v2-radius)] border border-[var(--v2-line)] px-3 text-[13px] text-[color:var(--v2-ink)]"
              onChange={(event) => setDraft(event.target.value)}
              value={draft}
            />
          ) : null}
        </section>

        <PageRows pages={data.pages} />
      </main>
      <div className="border-t border-[var(--v2-line)] px-7 py-7 lg:border-l lg:border-t-0 lg:px-6">
        <Board07Rail progress={data.progress} />
      </div>
    </div>
  );
}
