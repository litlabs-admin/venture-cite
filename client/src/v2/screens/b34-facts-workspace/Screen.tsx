import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { DonutChart } from "@/v2/shared/charts/DonutChart";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { FilterSelect } from "@/v2/shared/ui/FilterSelect";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { Panel } from "@/v2/shared/ui/Panel";
import { SearchInput } from "@/v2/shared/ui/SearchInput";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

// Board 34: the steady-state fact workspace. Board 07 is the one-time Level 1
// gate; this is where the fact sheet lives after that gate is passed - every
// fact, grouped, searchable, and actionable, for as long as the brand exists.
//
// EVERY WRITE IS EXPLICIT. Accept, dismiss and recheck are one button each,
// scoped to the one fact whose row the person is looking at - never a bulk
// control that acts on rows it has not named (`FactReview.tsx`'s old
// reasoning for refusing a bulk-accept applies here unchanged). Amending is
// the same two-step gate board 07 uses: typing a new value does not approve
// it, and pressing "Save and approve" is the explicit act that does.

export type Board34Status = "approved" | "needs_confirmation" | "stale";

export type Board34Unavailable = { kind: "not-measured"; reason: string };
export type Board34Value<T> = { kind: "available"; value: T } | Board34Unavailable;

export type Board34Fact = {
  id: string;
  label: string;
  value: string;
  evidenceUrl: string | null;
  evidenceLabel: string;
  verificationType: "Website" | "User supplied" | "Cross-source";
  owner: string | null;
  lastCheckedAt: string | null;
  status: Board34Status;
  excerpt: string | null;
  /** A scrape may never overwrite this fact again, and neither may a recheck
   *  - `reverifyFact()` refuses `userOverridden` rows server-side. The
   *  action is disabled here for the same reason, with the same words. */
  userOverridden: boolean;
};

export type Board34Category = {
  id: string;
  label: string;
  facts: readonly Board34Fact[];
};

export type Board34FactSummary = {
  approvedCount: number;
  confirmationCount: number;
  staleCount: number;
  totalCount: number;
};

export type Board34Data = {
  brand: { id: string; name: string };
  navigation: { brandId: string; mode: "guided" | "expert" };
  categories: readonly Board34Category[];
  factSummary: Board34FactSummary;
  sourcesInspected: Board34Value<number>;
  nextReviewAt: Board34Value<string>;
  /** The first fact still needing a decision, or the first with disagreeing
   *  sources - the target "Review conflict" scrolls to and opens. `null`
   *  when nothing is outstanding. */
  firstConfirmationFactId: string | null;
  domainOptions: readonly { id: string; label: string }[];
  actions: {
    acceptFact: (factId: string) => Promise<void>;
    dismissFact: (factId: string) => Promise<void>;
    amendFact: (factId: string, factValue: string) => Promise<void>;
    addFact: (input: {
      domain: string;
      label: string;
      factValue: string;
      sourceUrl: string;
    }) => Promise<void>;
    recheckFact: (factId: string) => Promise<void>;
  };
};

const STATUS_DEFS: Record<
  Board34Status,
  { label: string; icon: "check" | "warn" | "cdown"; tone: "ok" | "warn" | "bad" }
> = {
  approved: { label: "Approved", icon: "check", tone: "ok" },
  needs_confirmation: { label: "Needs confirmation", icon: "warn", tone: "warn" },
  stale: { label: "Stale", icon: "cdown", tone: "bad" },
};

function StatusBadge({ status }: { status: Board34Status }) {
  const def = STATUS_DEFS[status];
  const toneColor = { ok: "var(--v2-ok)", warn: "var(--v2-warn)", bad: "var(--v2-bad)" }[def.tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
      style={{ color: toneColor }}
      data-status={status}
    >
      <V2Icon name={def.icon} size={14} />
      {def.label}
    </span>
  );
}

function evidenceHost(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

function Availability<T>({
  value,
  children,
}: {
  value: Board34Value<T>;
  children: (available: T) => ReactNode;
}) {
  if (value.kind === "available") return <>{children(value.value)}</>;
  return (
    <span className="text-[12.5px] text-[color:var(--v2-ink3)]" title={value.reason}>
      Not measured
    </span>
  );
}

function SummaryCounts({ summary }: { summary: Board34FactSummary }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5" data-testid="v2-facts-summary-counts">
      <span className={v2Type.body}>
        <span className={`${v2Type.bodyStrong} tabular-nums`}>{summary.approvedCount}</span>{" "}
        Approved
      </span>
      <span className={v2Type.body}>
        <span className={`${v2Type.bodyStrong} tabular-nums`}>{summary.confirmationCount}</span>{" "}
        Need confirmation
      </span>
      <span className={v2Type.body}>
        <span className={`${v2Type.bodyStrong} tabular-nums`}>{summary.staleCount}</span> Stale
      </span>
    </div>
  );
}

function AddFactForm({
  domainOptions,
  onCancel,
  onSubmit,
}: {
  domainOptions: readonly { id: string; label: string }[];
  onCancel: () => void;
  onSubmit: (input: {
    domain: string;
    label: string;
    factValue: string;
    sourceUrl: string;
  }) => void;
}) {
  const [domain, setDomain] = useState(domainOptions[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!domain || !label.trim() || !value.trim()) return;
    onSubmit({ domain, label: label.trim(), factValue: value.trim(), sourceUrl: sourceUrl.trim() });
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2.5 rounded-[var(--v2-radius-panel)] border border-[var(--v2-line)] bg-[var(--v2-inset)] p-3.5"
      data-testid="v2-add-fact-form"
      onSubmit={handleSubmit}
    >
      <FilterSelect
        label="Category"
        onValueChange={setDomain}
        options={domainOptions.map((option) => ({ value: option.id, label: option.label }))}
        value={domain}
      />
      <input
        aria-label="Fact name"
        className="h-9 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] px-3 text-[13px] text-[color:var(--v2-ink)]"
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Fact name, e.g. Founded"
        value={label}
      />
      <input
        aria-label="Fact value"
        className="h-9 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] px-3 text-[13px] text-[color:var(--v2-ink)]"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Value"
        value={value}
      />
      <input
        aria-label="Source URL (optional)"
        className="h-9 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] px-3 text-[13px] text-[color:var(--v2-ink)]"
        onChange={(event) => setSourceUrl(event.target.value)}
        placeholder="Source URL (optional)"
        value={sourceUrl}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={!domain || !label.trim() || !value.trim()} size="sm" type="submit">
          Add fact
        </Button>
      </div>
    </form>
  );
}

function FactRow({
  fact,
  expanded,
  onToggle,
  onAccept,
  onDismiss,
  onAmend,
  onRecheck,
  pending,
  error,
}: {
  fact: Board34Fact;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  onAmend: (value: string) => void;
  onRecheck: () => void;
  pending: "accept" | "dismiss" | "amend" | "recheck" | null;
  error: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.value);
  const busy = pending !== null;

  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--v2-line)] last:border-b-0 hover:bg-[var(--v2-inset)]"
        data-fact-id={fact.id}
        data-testid="v2-workspace-fact-row"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          <span className={v2Type.body}>{fact.label}</span>
        </td>
        <td className="max-w-[220px] truncate px-3 py-2.5">
          <span className={v2Type.bodyStrong}>{fact.value}</span>
        </td>
        <td className="px-3 py-2.5">
          {fact.evidenceUrl ? (
            <a
              className="text-[13px] text-[color:var(--v2-brand)] hover:underline"
              href={fact.evidenceUrl}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              {evidenceHost(fact.evidenceUrl)}
            </a>
          ) : (
            <span className={v2Type.meta}>{fact.evidenceLabel}</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className={v2Type.meta}>{fact.verificationType}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={v2Type.meta}>{fact.owner ?? "—"}</span>
        </td>
        <td className="px-3 py-2.5">
          <span className={v2Type.mono}>
            {fact.lastCheckedAt ? formatDate(fact.lastCheckedAt) : "—"}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={fact.status} />
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[var(--v2-line)] bg-[var(--v2-inset)] last:border-b-0">
          <td className="px-3 py-3.5" colSpan={7}>
            <div className="flex flex-col gap-3">
              {fact.excerpt ? (
                <blockquote className="border-l-2 border-[var(--v2-brand)] pl-3.5 text-[13.5px] leading-[1.55] text-[color:var(--v2-ink)]">
                  {`“${fact.excerpt}”`}
                </blockquote>
              ) : (
                <p className={v2Type.meta}>No source excerpt was captured for this value.</p>
              )}

              {editing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Edit ${fact.label}`}
                    className="h-9 min-w-0 flex-1 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] px-3 text-[13px] text-[color:var(--v2-ink)]"
                    data-testid="v2-workspace-amend-input"
                    onChange={(event) => setDraft(event.target.value)}
                    value={draft}
                  />
                  <Button
                    data-testid="v2-workspace-save-amend"
                    disabled={
                      busy || draft.trim().length === 0 || draft.trim() === fact.value.trim()
                    }
                    onClick={() => onAmend(draft.trim())}
                    size="sm"
                    type="button"
                  >
                    {pending === "amend" ? "Saving…" : "Save and approve"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setDraft(fact.value);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    data-testid="v2-workspace-accept"
                    disabled={busy || fact.status === "approved"}
                    onClick={onAccept}
                    size="sm"
                    type="button"
                  >
                    {pending === "accept"
                      ? "Approving…"
                      : fact.status === "approved"
                        ? "Approved"
                        : "Accept"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setEditing(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Amend value
                  </Button>
                  <Button
                    data-testid="v2-workspace-dismiss"
                    disabled={busy}
                    onClick={onDismiss}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {pending === "dismiss" ? "Dismissing…" : "Dismiss"}
                  </Button>
                  <Button
                    data-testid="v2-workspace-recheck"
                    disabled={busy || fact.userOverridden}
                    onClick={onRecheck}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {pending === "recheck" ? "Rechecking…" : "Recheck"}
                  </Button>
                  {fact.userOverridden ? (
                    <span className={v2Type.meta}>
                      You edited this value, so a recheck will not overwrite it.
                    </span>
                  ) : null}
                </div>
              )}

              {error ? (
                <p className="text-[12.5px] text-[color:var(--v2-bad)]" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CategorySection({
  category,
  expandedCategory,
  onToggleCategory,
  expandedFactId,
  onToggleFact,
  actionState,
  onAccept,
  onDismiss,
  onAmend,
  onRecheck,
}: {
  category: Board34Category;
  expandedCategory: boolean;
  onToggleCategory: () => void;
  expandedFactId: string | null;
  onToggleFact: (factId: string) => void;
  actionState: Record<
    string,
    { pending: "accept" | "dismiss" | "amend" | "recheck" | null; error: string | null }
  >;
  onAccept: (factId: string) => void;
  onDismiss: (factId: string) => void;
  onAmend: (factId: string, value: string) => void;
  onRecheck: (factId: string) => void;
}) {
  return (
    <section
      className="border-b border-[var(--v2-line)] py-4 last:border-b-0"
      data-category-id={category.id}
      data-testid="v2-fact-category"
    >
      <button
        aria-expanded={expandedCategory}
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={onToggleCategory}
        type="button"
      >
        <span className="flex items-center gap-2.5">
          <V2Icon className="text-[color:var(--v2-ink3)]" name="facts" size={16} />
          <span className={v2Type.sectionTitle}>{category.label}</span>
          <span className={v2Type.meta}>
            {category.facts.length} fact{category.facts.length === 1 ? "" : "s"}
          </span>
        </span>
        <V2Icon
          className={`text-[color:var(--v2-ink3)] transition-transform ${expandedCategory ? "rotate-180" : ""}`}
          name="chev"
          size={16}
        />
      </button>

      {expandedCategory ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse" data-testid="v2-workspace-table">
            <thead>
              <tr className="border-b border-[var(--v2-line)] text-left">
                <th className={`${v2Type.caps} px-3 pb-2`}>Fact</th>
                <th className={`${v2Type.caps} px-3 pb-2`}>Value</th>
                <th className={`${v2Type.caps} px-3 pb-2`}>Evidence URL</th>
                <th className={`${v2Type.caps} px-3 pb-2`}>Verification</th>
                <th className={`${v2Type.caps} px-3 pb-2`}>Owner</th>
                <th className={`${v2Type.caps} px-3 pb-2`}>Last checked</th>
                <th className={`${v2Type.caps} px-3 pb-2`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {category.facts.map((fact) => {
                const state = actionState[fact.id] ?? { pending: null, error: null };
                return (
                  <FactRow
                    error={state.error}
                    expanded={expandedFactId === fact.id}
                    fact={fact}
                    key={fact.id}
                    onAccept={() => onAccept(fact.id)}
                    onAmend={(value) => onAmend(fact.id, value)}
                    onDismiss={() => onDismiss(fact.id)}
                    onRecheck={() => onRecheck(fact.id)}
                    onToggle={() => onToggleFact(fact.id)}
                    pending={state.pending}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function FactHealthRail({
  data,
  onReviewConflict,
}: {
  data: Board34Data;
  onReviewConflict: () => void;
}) {
  const { factSummary } = data;
  const segments = [
    { id: "approved", label: "Approved", value: factSummary.approvedCount },
    { id: "confirmation", label: "Need confirmation", value: factSummary.confirmationCount },
    { id: "stale", label: "Stale", value: factSummary.staleCount },
  ];

  return (
    <aside aria-label="Fact health" className="flex flex-col gap-5">
      <Panel>
        <h2 className={v2Type.sectionTitle}>Fact health</h2>
        <div className="mt-4 flex justify-center">
          <DonutChart
            centreCaption="facts"
            centreValue={factSummary.totalCount}
            legend
            segments={segments}
            size={148}
            thickness={16}
          />
        </div>
      </Panel>

      <Panel>
        <h3 className={v2Type.caps}>Sources inspected</h3>
        <p className={`${v2Type.statBig} mt-1`}>
          <Availability value={data.sourcesInspected}>{(count) => count}</Availability>
        </p>
        <p className={`${v2Type.meta} mt-1`}>
          Unique websites and documents analyzed in the last 7 days.
        </p>
      </Panel>

      <Panel>
        <h3 className={v2Type.caps}>Pending confirmations</h3>
        <p className={`${v2Type.statBig} mt-1`}>{factSummary.confirmationCount}</p>
        <p className={`${v2Type.meta} mt-1`}>
          Facts that have not yet been approved, or whose sources disagree.
        </p>
        {data.firstConfirmationFactId ? (
          <button
            className="mt-2 inline-flex"
            data-testid="v2-review-conflict"
            onClick={onReviewConflict}
            type="button"
          >
            <LinkWithArrow>Review conflict</LinkWithArrow>
          </button>
        ) : null}
      </Panel>

      <Panel>
        <h3 className={v2Type.caps}>Next scheduled review</h3>
        <p className={`${v2Type.bodyStrong} mt-1`}>
          <Availability value={data.nextReviewAt}>{(date) => formatDate(date)}</Availability>
        </p>
        <p className={`${v2Type.meta} mt-1`}>
          Approved facts older than 30 days are automatically re-checked against their source.
        </p>
      </Panel>

      <InfoNote>
        Facts are extracted from trusted sources across the web, but they can be incomplete or
        incorrect. You review and approve each fact before it becomes part of your source of truth.
      </InfoNote>
    </aside>
  );
}

export function Board34Screen({ data }: V2ScreenProps<Board34Data>) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Board34Status>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(data.categories.slice(0, 1).map((category) => category.id)),
  );
  const [expandedFactId, setExpandedFactId] = useState<string | null>(null);
  const [addingFact, setAddingFact] = useState(false);
  const [actionState, setActionState] = useState<
    Record<
      string,
      { pending: "accept" | "dismiss" | "amend" | "recheck" | null; error: string | null }
    >
  >({});
  const [recheckingAll, setRecheckingAll] = useState(false);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.categories
      .map((category) => ({
        ...category,
        facts: category.facts.filter((fact) => {
          if (statusFilter !== "all" && fact.status !== statusFilter) return false;
          if (!query) return true;
          return (
            fact.label.toLowerCase().includes(query) || fact.value.toLowerCase().includes(query)
          );
        }),
      }))
      .filter((category) => category.facts.length > 0);
  }, [data.categories, search, statusFilter]);

  function setFactState(
    factId: string,
    update: Partial<{
      pending: "accept" | "dismiss" | "amend" | "recheck" | null;
      error: string | null;
    }>,
  ) {
    setActionState((previous) => {
      const current = previous[factId] ?? { pending: null, error: null };
      return { ...previous, [factId]: { ...current, ...update } };
    });
  }

  async function runAction(
    factId: string,
    kind: "accept" | "dismiss" | "amend" | "recheck",
    run: () => Promise<void>,
  ) {
    setFactState(factId, { pending: kind, error: null });
    try {
      await run();
      setFactState(factId, { pending: null });
    } catch (error) {
      setFactState(factId, {
        pending: null,
        error: error instanceof Error ? error.message : "That action could not be completed.",
      });
    }
  }

  function toggleCategory(categoryId: string) {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function openFact(factId: string, categoryId: string) {
    setExpandedFactId((previous) => (previous === factId ? null : factId));
    setExpandedCategories((previous) => new Set(previous).add(categoryId));
  }

  function reviewConflict() {
    if (!data.firstConfirmationFactId) return;
    const category = data.categories.find((candidate) =>
      candidate.facts.some((fact) => fact.id === data.firstConfirmationFactId),
    );
    if (!category) return;
    openFact(data.firstConfirmationFactId, category.id);
    const factId = data.firstConfirmationFactId;
    const row = Array.from(document.querySelectorAll("[data-fact-id]")).find(
      (element) => element.getAttribute("data-fact-id") === factId,
    );
    row?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  async function recheckStale() {
    const staleIds = data.categories
      .flatMap((category) => category.facts)
      .filter((fact) => fact.status === "stale" && !fact.userOverridden)
      .map((fact) => fact.id);
    if (staleIds.length === 0) return;
    setRecheckingAll(true);
    for (const factId of staleIds) {
      // Sequential, on purpose: each recheck is a real fetch-and-compare
      // against the fact's source plus one LLM call, and running the whole
      // stale set at once would burst the brand's LLM budget for one click.
      await runAction(factId, "recheck", () => data.actions.recheckFact(factId));
    }
    setRecheckingAll(false);
  }

  const staleCount = data.factSummary.staleCount;

  return (
    <div className="grid min-h-[calc(100vh-52px)] min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 px-7 py-7 lg:px-8">
        <h1 className={v2Type.pageTitle}>Keep your source of truth current</h1>
        <p className={`${v2Type.pageSub} mt-2 max-w-2xl`}>
          We extract facts about {data.brand.name} from across the web. Review and approve them to
          create your source of truth for AI and search.
        </p>

        <SummaryCounts summary={data.factSummary} />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SearchInput
            aria-label="Search facts"
            className="w-full sm:w-64"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search facts"
            value={search}
          />
          <FilterSelect
            label="Status"
            onValueChange={(value) => setStatusFilter(value as "all" | Board34Status)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "approved", label: "Approved" },
              { value: "needs_confirmation", label: "Needs confirmation" },
              { value: "stale", label: "Stale" },
            ]}
            value={statusFilter}
          />
        </div>

        <div className="mt-5">
          {filteredCategories.length === 0 ? (
            <EmptyState
              description={
                data.factSummary.totalCount === 0
                  ? "No fact has been extracted or added for this brand yet."
                  : "No fact matches this search and filter."
              }
              icon="facts"
              title={
                data.factSummary.totalCount === 0 ? "Nothing in the workspace yet" : "No matches"
              }
            />
          ) : (
            filteredCategories.map((category) => (
              <CategorySection
                actionState={actionState}
                category={category}
                expandedCategory={expandedCategories.has(category.id)}
                expandedFactId={expandedFactId}
                key={category.id}
                onAccept={(factId) =>
                  void runAction(factId, "accept", () => data.actions.acceptFact(factId))
                }
                onAmend={(factId, value) =>
                  void runAction(factId, "amend", () => data.actions.amendFact(factId, value))
                }
                onDismiss={(factId) =>
                  void runAction(factId, "dismiss", () => data.actions.dismissFact(factId))
                }
                onRecheck={(factId) =>
                  void runAction(factId, "recheck", () => data.actions.recheckFact(factId))
                }
                onToggleCategory={() => toggleCategory(category.id)}
                onToggleFact={(factId) => openFact(factId, category.id)}
              />
            ))
          )}
        </div>
      </main>

      <div className="border-t border-[var(--v2-line)] px-7 py-7 lg:border-l lg:border-t-0 lg:px-6">
        <FactHealthRail data={data} onReviewConflict={reviewConflict} />

        <div className="mt-5 flex flex-col gap-2">
          {addingFact ? (
            <AddFactForm
              domainOptions={data.domainOptions}
              onCancel={() => setAddingFact(false)}
              onSubmit={(input) => {
                void data.actions
                  .addFact({
                    domain: input.domain,
                    label: input.label,
                    factValue: input.factValue,
                    sourceUrl: input.sourceUrl,
                  })
                  .then(() => setAddingFact(false));
              }}
            />
          ) : (
            <Button
              data-testid="v2-add-fact"
              onClick={() => setAddingFact(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              Add fact
            </Button>
          )}
          <Button
            data-testid="v2-recheck-sources"
            disabled={staleCount === 0 || recheckingAll}
            onClick={() => void recheckStale()}
            size="sm"
            title={staleCount === 0 ? "No stale facts to recheck" : undefined}
            type="button"
            variant="outline"
          >
            {recheckingAll ? "Rechecking…" : "Recheck sources"}
          </Button>
          {data.firstConfirmationFactId ? (
            <Button onClick={reviewConflict} size="sm" type="button" variant="outline">
              Review conflict
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
