import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Download,
  FileText,
  Flag,
  GripVertical,
  Lightbulb,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import type { BrandPrompt } from "@shared/schema";
import type { PromptScoreHistory } from "@/hooks/usePrompts";

// ─── Prompts table ───────────────────────────────────────────────────────────
// Ported from the reference Prompts tab (captured DOM + computed styles).
// Measured spec:
//   toolbar      min-h-12, px-8, search w-64 h-8, buttons h-8 px-2.5 rounded
//   header row   h-10, sticky, bg-muted/50, 10px/500 uppercase tracking-wider
//   row          h-11, px-4, gap-1.5, 13px prompt text, hairline bottom
//   columns      drag w-4 · select w-5 · prompt flex-1 · vol w-16 · 7d w-12
//                · score w-10 · Δ w-10 · on w-8 · added w-24 · actions w-16
//   footer       h-7, 10px, "Showing X of Y prompts"
//
// TWO REFERENCE FEATURES ARE DELIBERATELY NOT REPRODUCED, on different
// grounds:
//   * AI VOL renders as a dash. It is a per-row VALUE with no source yet —
//     the same treatment the Dashboard gives its unbacked metrics.
//   * Tags and Audiences (the column, the two sibling tabs, the filters) are
//     omitted entirely. Those are whole features with interactive controls,
//     and a control that cannot do anything is worse than an absent one.
// See docs/dashboard-reference.md for the same distinction applied to
// the dashboard's Share menu.

export type PromptRowModel = {
  prompt: BrandPrompt;
  history: PromptScoreHistory | undefined;
  /** Cited on zero platforms in the latest run — the reference's "blind spot". */
  blindSpot: boolean;
};

type SortKey = "manual" | "score" | "delta" | "added" | "az";
type ViewKey = "all" | "blind" | "movers" | "attention";
type StatusFilter = "all" | "active" | "inactive";

const VIEWS: { key: ViewKey; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Everything, manually sorted" },
  { key: "movers", label: "Movers", hint: "Biggest changes first" },
  { key: "attention", label: "Attention", hint: "Low scores · losing ground" },
  { key: "blind", label: "Blind spots", hint: "Where you’re invisible" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "manual", label: "Manual order" },
  { key: "score", label: "Score" },
  { key: "delta", label: "Biggest change" },
  { key: "added", label: "Date added" },
  { key: "az", label: "A → Z" },
];

const COLUMNS = [
  { key: "vol", label: "AI volume" },
  { key: "spark", label: "7-day trend" },
  { key: "score", label: "Score" },
  { key: "delta", label: "Change" },
  { key: "on", label: "Active" },
  { key: "added", label: "Date added" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];

const BTN =
  "h-8 px-2.5 flex items-center gap-1.5 rounded border border-vc-default text-caption text-vc-secondary transition-colors hover:bg-vc-muted/50";
const MENU =
  "absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded border border-vc-default bg-white py-1 shadow-vc-overlay";
const MENU_LABEL = "px-3 pb-1 pt-2 text-label font-semibold uppercase tracking-wider text-vc-label";
const MENU_ITEM =
  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-caption text-vc-secondary transition-colors hover:bg-vc-muted/60 hover:text-vc-primary";
const TH =
  "flex h-10 items-center gap-1 text-label font-medium uppercase tracking-wider text-vc-text-muted transition-colors duration-200 hover:text-vc-secondary";

/** Close a popover on outside click / Escape. */
function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** 48×14 sparkline of a prompt's recent scores. Flat line when a single run
 *  exists — one point is a position, not a trend, so it is drawn as such. */
function Sparkline({ series }: { series: PromptScoreHistory["series"] }) {
  if (!series.length) {
    return <div className="h-3.5 w-12" aria-hidden />;
  }
  const w = 48;
  const h = 14;
  const values = series.map((p) => p.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = values.length > 1 ? i * step : w / 2;
    const y = h - 2 - ((v - min) / span) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d =
    values.length === 1
      ? `M0,${(h / 2).toFixed(1)} L${w},${(h / 2).toFixed(1)}`
      : `M${points.join(" L")}`;
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={rising ? "var(--brand-accent)" : "var(--negative)"}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={values.length === 1 ? 0.35 : 1}
      />
    </svg>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="group/select flex h-full w-full items-center justify-center"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
          checked
            ? "border-vc-accent bg-vc-accent text-white"
            : "border-vc-default group-hover/select:border-vc-hover"
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 6.5l2.5 2.5 4.5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}

export function PromptsTable({
  rows,
  historyLoading,
  suggestionCount,
  onOpen,
  onEdit,
  onDuplicate,
  onDiagnose,
  onCreateContent,
  onArchive,
  onToggle,
  onReorder,
  onCreate,
  onCreateMany,
  onSuggest,
  onExport,
  createPending,
  cap,
}: {
  rows: PromptRowModel[];
  historyLoading: boolean;
  suggestionCount: number;
  onOpen: (p: BrandPrompt) => void;
  onEdit: (p: BrandPrompt, text: string) => void;
  onDuplicate: (p: BrandPrompt) => void;
  onDiagnose: (p: BrandPrompt) => void;
  onCreateContent: (p: BrandPrompt) => void;
  onArchive: (p: BrandPrompt) => void;
  onToggle: (p: BrandPrompt, next: "tracked" | "archived") => void;
  onReorder: (ids: string[]) => void;
  onCreate: (text: string) => void;
  onCreateMany: (texts: string[]) => void;
  onSuggest: () => void;
  onExport: () => void;
  createPending: boolean;
  cap: number;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewKey>("all");
  const [sort, setSort] = useState<SortKey>("manual");
  // Defaults to the tracked set, like the reference. The table is fed every
  // status so a paused prompt can be switched back on, but opening on all of
  // them buries 9 live prompts under 27 archived ones.
  const [status, setStatus] = useState<StatusFilter>("active");
  const [hidden, setHidden] = useState<Set<ColumnKey>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<null | "filter" | "display" | "add">(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const close = () => setOpenMenu(null);
  const filterRef = useDismiss<HTMLDivElement>(openMenu === "filter", close);
  const displayRef = useDismiss<HTMLDivElement>(openMenu === "display", close);
  const addRef = useDismiss<HTMLDivElement>(openMenu === "add", close);
  const rowMenuRef = useDismiss<HTMLDivElement>(!!rowMenu, () => setRowMenu(null));

  const shown = (k: ColumnKey) => !hidden.has(k);
  const toggleColumn = (k: ColumnKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => (q ? r.prompt.prompt.toLowerCase().includes(q) : true));

    if (status === "active") out = out.filter((r) => r.prompt.status === "tracked");
    if (status === "inactive") out = out.filter((r) => r.prompt.status !== "tracked");

    if (view === "blind") out = out.filter((r) => r.blindSpot);
    if (view === "movers") out = out.filter((r) => (r.history?.delta ?? 0) !== 0);
    if (view === "attention")
      out = out.filter((r) => (r.history?.score ?? 0) < 50 || (r.history?.delta ?? 0) < 0);

    const sorted = [...out];
    if (sort === "score")
      sorted.sort((a, b) => (b.history?.score ?? -1) - (a.history?.score ?? -1));
    if (sort === "delta")
      sorted.sort((a, b) => Math.abs(b.history?.delta ?? 0) - Math.abs(a.history?.delta ?? 0));
    if (sort === "added")
      sorted.sort(
        (a, b) =>
          new Date(b.prompt.createdAt ?? 0).getTime() - new Date(a.prompt.createdAt ?? 0).getTime(),
      );
    if (sort === "az") sorted.sort((a, b) => a.prompt.prompt.localeCompare(b.prompt.prompt));
    // Manual order is the stored orderIndex and has no meaningful reverse —
    // flipping it would fight the drag-reorder the user just performed.
    if (dir === "asc" && sort !== "manual") sorted.reverse();
    return sorted;
  }, [rows, query, status, view, sort, dir]);

  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.prompt.id));

  /** Clicking a header sorts by it; clicking the active header flips
   *  direction. The icon states are distinct so the current sort is legible
   *  without hovering. */
  function sortBy(key: SortKey) {
    if (sort === key) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(key);
      setDir("desc");
    }
  }

  function SortHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    const active = sort === sortKey;
    const Icon = !active ? ChevronsUpDown : dir === "desc" ? ArrowDown : ArrowUp;
    return (
      <button
        type="button"
        onClick={() => sortBy(sortKey)}
        aria-label={`Sort by ${label}`}
        className={`${TH} ${active ? "text-vc-secondary" : ""}`}
      >
        {label}
        <Icon
          className={`h-2.5 w-2.5 ${active ? "text-vc-accent" : "text-vc-hover"}`}
          aria-hidden
        />
      </button>
    );
  }

  // Header summary, mirroring the reference's "↑3 ↓1 ⚑21 blind spots" chip.
  // Every figure is counted from data already on screen.
  const summary = useMemo(() => {
    let up = 0;
    let down = 0;
    for (const r of rows) {
      const d = r.history?.delta;
      if (d === null || d === undefined) continue;
      if (d > 0) up += 1;
      else if (d < 0) down += 1;
    }
    const lastRun = rows
      .map((r) => r.history?.lastRunAt)
      .filter(Boolean)
      .sort()
      .pop();
    return { up, down, blind: rows.filter((r) => r.blindSpot).length, lastRun };
  }, [rows]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Drag-reorder is only coherent against the stored manual order; under any
  // other sort the drop position would not map to an orderIndex.
  const canDrag = sort === "manual" && view === "all" && !query;

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = rows.map((r) => r.prompt.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(ids);
    setDragId(null);
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    onCreate(text);
    setDraft("");
  }

  const trackedCount = rows.filter((r) => r.prompt.status === "tracked").length;
  const atCap = trackedCount >= cap;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-b border-vc-subtle px-4 py-2 sm:px-8">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="group relative w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-vc-text-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts..."
              aria-label="Search prompts"
              className="h-8 w-full rounded border border-vc-default pl-8 pr-8 text-caption text-vc-primary outline-none transition-all placeholder:text-vc-text-muted focus:border-vc-accent focus:ring-2 focus:ring-vc-accent/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-vc-text-muted hover:text-vc-secondary"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
          {/* Run summary — same figures as the reference's header chip. */}
          <span className="mr-1 hidden items-center gap-2.5 text-data lg:flex">
            {summary.lastRun && (
              <span className="flex items-center gap-1.5 text-vc-text-muted">
                <span className="h-1 w-1 shrink-0 rounded-full bg-vc-accent/50" aria-hidden />
                Last run{" "}
                {new Date(summary.lastRun).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            <span className="flex items-center gap-1 text-vc-secondary" title="Prompts that gained">
              <ArrowUp className="h-2.5 w-2.5 text-positive" aria-hidden />
              <span className="tabular-nums">{summary.up}</span>
            </span>
            <span
              className="flex items-center gap-1 text-vc-secondary"
              title="Prompts that lost ground"
            >
              <ArrowDown className="h-2.5 w-2.5 text-destructive" aria-hidden />
              <span className="tabular-nums">{summary.down}</span>
            </span>
            <button
              type="button"
              onClick={() => setView("blind")}
              title="Show only prompts where no engine cited you"
              className="flex items-center gap-1 text-vc-secondary transition-colors hover:text-vc-accent"
            >
              <Flag className="h-2.5 w-2.5 text-vc-text-muted" aria-hidden />
              <span className="tabular-nums">{summary.blind}</span>
              <span className="text-vc-text-muted">blind spots</span>
            </button>
          </span>

          <div className="relative" ref={filterRef}>
            <button
              type="button"
              className={BTN}
              aria-expanded={openMenu === "filter"}
              onClick={() => setOpenMenu(openMenu === "filter" ? null : "filter")}
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden />
              Filter
              {/* Counts only a filter the user actually chose — "active" is
                  the default and must not read as an applied filter. */}
              {status !== "active" && (
                <span className="rounded bg-vc-accent-subtle px-1 font-mono text-label text-vc-accent">
                  1
                </span>
              )}
            </button>
            {openMenu === "filter" && (
              <div className={MENU}>
                <p className={MENU_LABEL}>Status</p>
                {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={MENU_ITEM}
                    onClick={() => {
                      setStatus(s);
                      close();
                    }}
                  >
                    <span className="capitalize">{s}</span>
                    {status === s && <span className="text-vc-accent">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={displayRef}>
            <button
              type="button"
              className={BTN}
              aria-expanded={openMenu === "display"}
              onClick={() => setOpenMenu(openMenu === "display" ? null : "display")}
            >
              Display
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
            {openMenu === "display" && (
              <div className={MENU}>
                <p className={MENU_LABEL}>View</p>
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className={MENU_ITEM}
                    onClick={() => {
                      setView(v.key);
                      close();
                    }}
                  >
                    <span>
                      {v.label}
                      <span className="block text-label text-vc-text-muted">{v.hint}</span>
                    </span>
                    {view === v.key && <span className="text-vc-accent">✓</span>}
                  </button>
                ))}
                <p className={MENU_LABEL}>Sort</p>
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={MENU_ITEM}
                    onClick={() => {
                      setSort(s.key);
                      close();
                    }}
                  >
                    <span>{s.label}</span>
                    {sort === s.key && <span className="text-vc-accent">✓</span>}
                  </button>
                ))}
                <p className={MENU_LABEL}>Columns</p>
                {COLUMNS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={MENU_ITEM}
                    onClick={() => toggleColumn(c.key)}
                  >
                    <span>{c.label}</span>
                    {shown(c.key) && <span className="text-vc-accent">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className={BTN} onClick={onExport}>
            <Download className="h-3 w-3" aria-hidden />
            Export
          </button>

          <div className="relative" ref={addRef}>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded bg-vc-accent-subtle pl-2.5 pr-2 text-caption font-medium text-vc-accent transition-colors hover:bg-vc-accent hover:text-white"
              aria-expanded={openMenu === "add"}
              onClick={() => setOpenMenu(openMenu === "add" ? null : "add")}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
            {openMenu === "add" && (
              <div className={MENU}>
                <button
                  type="button"
                  className={MENU_ITEM}
                  onClick={() => {
                    close();
                    document.getElementById("prompt-inline-add")?.focus();
                  }}
                >
                  <span>
                    Add manually
                    <span className="block text-label text-vc-text-muted">Write your own</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={MENU_ITEM}
                  onClick={() => {
                    close();
                    onSuggest();
                  }}
                >
                  <span>
                    Suggest prompts
                    <span className="block text-label text-vc-text-muted">
                      Let AI find your gaps
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={MENU_ITEM}
                  onClick={() => {
                    close();
                    setPasteOpen(true);
                  }}
                >
                  <span>
                    Paste a list
                    <span className="block text-label text-vc-text-muted">Add many at once</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-vc-accent/10 bg-vc-accent-subtle/30 px-4 py-2">
          <span className="font-mono text-data tabular-nums text-vc-accent">{selected.size}</span>
          <span className="text-caption text-vc-secondary">selected</span>
          <div className="flex-1" />
          <button
            type="button"
            className="text-data font-medium text-vc-secondary hover:text-vc-primary"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
          <button
            type="button"
            className="flex items-center gap-1 text-data font-medium text-destructive hover:text-destructive"
            onClick={() => {
              rows.filter((r) => selected.has(r.prompt.id)).forEach((r) => onArchive(r.prompt));
              setSelected(new Set());
            }}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Archive
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="sticky top-0 z-10 flex h-10 w-full min-w-0 items-center gap-1.5 border-b border-vc-default bg-vc-muted/50 px-4 backdrop-blur-sm">
        <div className="w-4 shrink-0" />
        <div className="flex w-5 shrink-0 items-center">
          <Checkbox
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.prompt.id)))
            }
          />
        </div>
        <div className="relative flex min-w-0 flex-1 items-center">
          <SortHeader label="Prompt" sortKey="az" />
        </div>
        {shown("vol") && (
          <div className="flex w-16 shrink-0 items-center justify-end">
            <span className={TH} title="No search-volume source is connected yet">
              AI Vol
            </span>
          </div>
        )}
        {shown("spark") && <div className="w-12 shrink-0" />}
        {shown("score") && (
          <div className="flex w-10 shrink-0 items-center justify-end">
            <SortHeader label="Score" sortKey="score" />
          </div>
        )}
        {shown("delta") && (
          <div className="flex w-10 shrink-0 items-center justify-end">
            <SortHeader label="Δ" sortKey="delta" />
          </div>
        )}
        {shown("on") && (
          <div className="flex w-8 shrink-0 items-center">
            <span className={TH}>On</span>
          </div>
        )}
        {shown("added") && (
          <div className="flex w-24 shrink-0 items-center">
            <SortHeader label="Added" sortKey="added" />
          </div>
        )}
        <div className="w-16 shrink-0" />
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((r) => {
          const p = r.prompt;
          const active = p.status === "tracked";
          const h = r.history;
          return (
            <div
              key={p.id}
              draggable={canDrag}
              onDragStart={() => canDrag && setDragId(p.id)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => canDrag && handleDrop(p.id)}
              onClick={() => onOpen(p)}
              className={`group flex h-11 w-full min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden border-b border-vc-subtle px-4 transition-colors duration-150 hover:bg-vc-muted/50 ${
                dragId === p.id ? "opacity-40" : ""
              }`}
            >
              <div className="w-4 shrink-0">
                {canDrag && (
                  <span
                    className="inline-flex cursor-grab rounded p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 active:cursor-grabbing"
                    aria-hidden
                  >
                    <GripVertical className="h-3.5 w-3.5 text-vc-hover" />
                  </span>
                )}
              </div>

              <div className="flex w-5 shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
              </div>

              <div
                className="min-w-0 flex-1 overflow-hidden"
                onClick={(e) => editingId === p.id && e.stopPropagation()}
              >
                {editingId === p.id ? (
                  // Edit in place, like the reference — the row becomes an
                  // input rather than opening a dialog over the table.
                  <input
                    autoFocus
                    value={editDraft}
                    maxLength={500}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const text = editDraft.trim();
                        if (text && text !== p.prompt) onEdit(p, text);
                        setEditingId(null);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => {
                      const text = editDraft.trim();
                      if (text && text !== p.prompt) onEdit(p, text);
                      setEditingId(null);
                    }}
                    className="w-full rounded border border-vc-accent bg-white px-2 py-1 text-body text-vc-primary outline-none ring-2 ring-vc-accent/20"
                  />
                ) : (
                  <div className="group/prompt flex min-w-0 items-center gap-2">
                    <p
                      className={`line-clamp-1 min-w-0 text-body ${
                        active ? "text-vc-primary" : "text-vc-text-muted"
                      }`}
                    >
                      {p.prompt}
                    </p>
                    <button
                      type="button"
                      aria-label="Edit prompt"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(p.id);
                        setEditDraft(p.prompt);
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-vc-text-muted opacity-0 transition-all duration-150 hover:bg-vc-muted/60 hover:text-vc-secondary group-hover/prompt:opacity-100"
                    >
                      <Pencil className="h-3 w-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Copy prompt"
                      onClick={(e) => {
                        e.stopPropagation();
                        void navigator.clipboard?.writeText(p.prompt);
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-vc-text-muted opacity-0 transition-all duration-150 hover:bg-vc-muted/60 hover:text-vc-secondary group-hover/prompt:opacity-100"
                    >
                      <Copy className="h-3 w-3" aria-hidden />
                    </button>
                    {/* Rank slip — positive rankDelta means the mean placement
                        got worse since the previous run. */}
                    {h?.rankDelta !== null && h?.rankDelta !== undefined && h.rankDelta > 0 && (
                      <span
                        title={`Your rank slipped on this prompt (now ${h.rank})`}
                        className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded px-1 text-destructive/80"
                      >
                        <ArrowDown className="h-2.5 w-2.5" aria-hidden />
                        <span className="text-label font-semibold leading-none tabular-nums">
                          {h.rankDelta}
                        </span>
                      </span>
                    )}
                    {r.blindSpot && (
                      <span
                        title="No AI engine cited you on this prompt in the last run"
                        className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded px-1 text-destructive/80"
                      >
                        <Flag className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    )}
                  </div>
                )}
              </div>

              {shown("vol") && (
                <div className="w-16 shrink-0 text-right">
                  {/* No search-volume source exists; a dash, never a number. */}
                  <span className="font-mono text-data tabular-nums text-vc-hover">–</span>
                </div>
              )}

              {shown("spark") && (
                <div className="w-12 shrink-0">
                  {historyLoading ? (
                    <span className="block h-3 w-12 rounded-sm bg-vc-muted" aria-hidden />
                  ) : (
                    <Sparkline series={h?.series ?? []} />
                  )}
                </div>
              )}

              {shown("score") && (
                <div className="w-10 shrink-0 text-right">
                  <span
                    className={`font-mono text-data font-medium tabular-nums ${
                      h?.score === null || h?.score === undefined
                        ? "text-vc-hover"
                        : "text-vc-primary"
                    }`}
                  >
                    {h?.score ?? "–"}
                  </span>
                </div>
              )}

              {shown("delta") && (
                <div className="w-10 shrink-0 text-right">
                  <span
                    className={`font-mono text-data font-medium tabular-nums ${
                      h?.delta === null || h?.delta === undefined
                        ? "text-vc-hover"
                        : h.delta > 0
                          ? "text-positive"
                          : h.delta < 0
                            ? "text-destructive"
                            : "text-vc-tertiary"
                    }`}
                  >
                    {h?.delta === null || h?.delta === undefined
                      ? "–"
                      : `${h.delta > 0 ? "+" : ""}${h.delta}`}
                  </span>
                </div>
              )}

              {shown("on") && (
                <div className="w-8 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-label={active ? "Switch prompt off" : "Switch prompt on"}
                    onClick={() => onToggle(p, active ? "archived" : "tracked")}
                    className="group/toggle flex h-8 w-8 items-center justify-center rounded transition-colors duration-150 hover:bg-vc-muted/60 active:scale-[0.92]"
                  >
                    <span
                      className={`block h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                        active
                          ? "bg-vc-accent ring-[3px] ring-vc-accent/15 group-hover/toggle:ring-[5px] group-hover/toggle:ring-vc-accent/25"
                          : "bg-vc-hover ring-[3px] ring-transparent"
                      }`}
                    />
                  </button>
                </div>
              )}

              {shown("added") && (
                <div className="w-24 shrink-0">
                  <span className="font-mono text-data tabular-nums text-vc-secondary">
                    {p.createdAt
                      ? new Date(p.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "–"}
                  </span>
                </div>
              )}

              <div
                className="relative flex w-16 shrink-0 items-center justify-end gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {(r.blindSpot || (h?.rankDelta ?? 0) > 0) && (
                  <button
                    type="button"
                    aria-label="Diagnose"
                    title="Diagnose this query"
                    onClick={() => onDiagnose(p)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-vc-accent transition-all duration-100 hover:bg-vc-accent-subtle"
                  >
                    <Stethoscope className="h-3 w-3" aria-hidden />
                  </button>
                )}
                <div ref={rowMenu === p.id ? rowMenuRef : undefined}>
                  <button
                    type="button"
                    aria-label="More actions"
                    onClick={() => setRowMenu(rowMenu === p.id ? null : p.id)}
                    className="rounded p-1.5 text-vc-text-muted transition-all duration-100 hover:bg-vc-muted hover:text-vc-secondary"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {rowMenu === p.id && (
                    <div className={`${MENU} w-52`}>
                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          setRowMenu(null);
                          setEditingId(p.id);
                          setEditDraft(p.prompt);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Pencil className="h-3 w-3" aria-hidden />
                          Edit prompt
                        </span>
                      </button>
                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          setRowMenu(null);
                          void navigator.clipboard?.writeText(p.prompt);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Copy className="h-3 w-3" aria-hidden />
                          Copy prompt text
                        </span>
                      </button>
                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          setRowMenu(null);
                          onDuplicate(p);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="h-3 w-3" aria-hidden />
                          Duplicate
                        </span>
                      </button>

                      <div className="my-1 h-px bg-vc-subtle" />

                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          setRowMenu(null);
                          onOpen(p);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <BarChart3 className="h-3 w-3" aria-hidden />
                          View rank breakdown
                        </span>
                      </button>
                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          setRowMenu(null);
                          onDiagnose(p);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Stethoscope className="h-3 w-3" aria-hidden />
                          Diagnose this query
                        </span>
                      </button>
                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          setRowMenu(null);
                          onCreateContent(p);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="h-3 w-3" aria-hidden />
                          Create content
                        </span>
                      </button>

                      <div className="my-1 h-px bg-vc-subtle" />

                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          setRowMenu(null);
                          onToggle(p, active ? "archived" : "tracked");
                        }}
                      >
                        <span className="flex items-center gap-2">
                          {active ? (
                            <Pause className="h-3 w-3" aria-hidden />
                          ) : (
                            <Play className="h-3 w-3" aria-hidden />
                          )}
                          {active ? "Pause tracking" : "Resume tracking"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${MENU_ITEM} text-destructive hover:text-destructive`}
                        onClick={() => {
                          setRowMenu(null);
                          onArchive(p);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Trash2 className="h-3 w-3" aria-hidden />
                          Archive prompt
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <p className="px-4 py-6 text-caption text-vc-tertiary">
            {rows.length === 0
              ? "No prompts yet."
              : "No prompts match this view. Clear the search or switch views."}
          </p>
        )}

        {/* Inline add row */}
        <div className="flex h-11 w-full items-center gap-1.5 border-b border-vc-subtle px-4">
          <div className="w-9 shrink-0 text-vc-text-muted">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </div>
          <input
            id="prompt-inline-add"
            value={draft}
            disabled={atCap || createPending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitDraft()}
            onBlur={submitDraft}
            placeholder={
              atCap ? `At the ${cap}-prompt limit — switch one off first` : "Add a prompt..."
            }
            className="min-w-0 flex-1 bg-transparent text-body text-vc-primary outline-none placeholder:text-vc-text-muted disabled:cursor-not-allowed"
          />
        </div>

        {/* Suggestions callout */}
        {suggestionCount > 0 && (
          <div className="border-b border-vc-subtle px-4 py-2">
            <button
              type="button"
              onClick={onSuggest}
              className="group flex w-full items-center justify-center gap-2 rounded border border-dashed border-vc-default py-2.5 transition-all duration-200 hover:border-vc-accent/40 hover:bg-vc-accent-subtle/20"
            >
              <Plus className="h-3 w-3 text-vc-text-muted" aria-hidden />
              <span className="text-caption text-vc-text-muted transition-colors group-hover:text-vc-secondary">
                Explore{" "}
                <span className="font-mono font-medium tabular-nums text-vc-accent">
                  {suggestionCount}
                </span>{" "}
                prompt {suggestionCount === 1 ? "idea" : "ideas"} available
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex h-7 items-center justify-between border-t border-vc-subtle px-4 text-label text-vc-text-muted">
        <span>
          Showing <span className="font-mono tabular-nums text-vc-secondary">{visible.length}</span>{" "}
          of <span className="font-mono tabular-nums">{rows.length}</span> prompts
        </span>
        <span className="flex items-center gap-1">
          <Lightbulb className="h-3 w-3" aria-hidden />
          {trackedCount}/{cap} switched on
        </span>
      </div>

      {/* Paste-a-list dialog */}
      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-lg rounded-lg border border-vc-default bg-white p-5 shadow-vc-overlay">
            <h2 className="mb-1 text-[15px] font-semibold text-vc-primary">Paste a list</h2>
            <p className="mb-3 text-caption text-vc-tertiary">
              One prompt per line. {cap - trackedCount} slot
              {cap - trackedCount === 1 ? "" : "s"} left.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              className="w-full rounded border border-vc-default p-2 text-body text-vc-primary outline-none focus:border-vc-accent focus:ring-2 focus:ring-vc-accent/20"
              placeholder={"best crm for small teams\nalternatives to salesforce"}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className={BTN}
                onClick={() => {
                  setPasteOpen(false);
                  setPasteText("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex h-8 items-center rounded bg-vc-accent px-3 text-caption font-medium text-white hover:bg-vc-accent-hover"
                onClick={() => {
                  const lines = pasteText
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean);
                  if (lines.length) onCreateMany(lines);
                  setPasteOpen(false);
                  setPasteText("");
                }}
              >
                Add prompts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
