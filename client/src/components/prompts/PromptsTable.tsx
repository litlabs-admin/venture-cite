import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Download,
  GripVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { BrandPrompt } from "@shared/schema";
import type { PromptScoreHistory, PromptTag } from "@/hooks/usePrompts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SparklineCell } from "./SparklineCell";
import { TagChip } from "./TagChip";

// Small per-row tag-attach control: click the Tags cell to see every tag on
// the brand with a checkbox for whether this prompt has it. Toggling calls
// attach/detach directly - there is no separate "save" step, matching how
// the pause toggle and inline-edit already commit immediately.
function TagPickerCell({
  promptId,
  tags,
  attachedIds,
  onAttach,
  onDetach,
}: {
  promptId: string;
  tags: PromptTag[];
  attachedIds: string[];
  onAttach: (promptId: string, tagId: string) => void;
  onDetach: (promptId: string, tagId: string) => void;
}) {
  const attached = new Set(attachedIds);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Edit tags"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-vc-hover hover:bg-vc-muted/60 hover:text-vc-tertiary"
        >
          {attachedIds.length === 0 ? (
            <span className="text-data">–</span>
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        {tags.length === 0 ? (
          <p className="px-1 py-1 text-caption text-vc-tertiary">
            No tags yet - create one from the Tags tab.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {tags.map((tag) => {
              const on = attached.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => (on ? onDetach(promptId, tag.id) : onAttach(promptId, tag.id))}
                  className="flex items-center gap-2 rounded px-2 py-1 text-left text-caption hover:bg-vc-muted/60"
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                      on ? "border-vc-accent bg-vc-accent" : "border-vc-default"
                    }`}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}
                  </span>
                  <TagChip tag={tag} />
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Prompts table (full rebuild for /prompts) ──────────────────────────
// Extends client/src/components/citations/PromptsTable.tsx's toolbar /
// bulk-select / drag-reorder / inline-edit behavior (kept as-is, copied
// forward) with the columns that table deliberately dropped: Tags, 7D
// sparkline, Score, Δ, and the ON/OFF toggle - all backed by real data now
// (usePromptScoreHistory's series was always there, just never surfaced;
// paused is migration 0096; tags are migration 0096's prompt_tags table).
// Row click navigates to /prompts/$promptId - the detail page this table's
// predecessor had removed along with the click.
//
// Deliberately NOT added: an "AI Vol" column (no data source, and the user
// chose not to fake an LLM estimate either) and rows for Meta AI / Google AI
// Overviews anywhere in this feature (only the 6 real wired platforms).

export type PromptRowModel = { prompt: BrandPrompt };

type SortKey = "manual" | "added" | "az" | "score";
type StatusFilter = "all" | "active" | "inactive";

const BTN =
  "h-8 px-2.5 flex items-center gap-1.5 rounded border border-vc-default text-caption text-vc-secondary transition-colors hover:bg-vc-muted/50";
const MENU =
  "absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded border border-vc-default bg-vc-surface py-1 shadow-vc-overlay";
const MENU_LABEL = "px-3 pb-1 pt-2 text-label font-semibold uppercase tracking-wider text-vc-label";
const MENU_ITEM =
  "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-caption text-vc-secondary transition-colors hover:bg-vc-muted/60 hover:text-vc-primary";
const TH =
  "flex h-10 items-center gap-1 text-label font-medium uppercase tracking-wider text-vc-text-muted transition-colors duration-200 hover:text-vc-secondary";

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
            ? "border-vc-accent bg-vc-accent text-primary-foreground"
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
  tags,
  tagsByPrompt,
  scoreHistoryByPrompt,
  suggestionCount,
  onEdit,
  onArchive,
  onReorder,
  onCreate,
  onCreateMany,
  onSuggest,
  onExport,
  onTogglePaused,
  onAttachTag,
  onDetachTag,
  createPending,
  cap,
}: {
  rows: PromptRowModel[];
  tags: PromptTag[];
  tagsByPrompt: Record<string, string[]>;
  scoreHistoryByPrompt: Record<string, PromptScoreHistory>;
  suggestionCount: number;
  onEdit: (p: BrandPrompt, text: string) => void;
  onArchive: (p: BrandPrompt) => void;
  onReorder: (ids: string[]) => void;
  onCreate: (text: string) => void;
  onCreateMany: (texts: string[]) => void;
  onSuggest: () => void;
  onExport: () => void;
  onTogglePaused: (promptId: string, paused: boolean) => void;
  onAttachTag: (promptId: string, tagId: string) => void;
  onDetachTag: (promptId: string, tagId: string) => void;
  createPending: boolean;
  cap: number;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("manual");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<null | "filter" | "add">(null);
  const [draft, setDraft] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const close = () => setOpenMenu(null);
  const filterRef = useDismiss<HTMLDivElement>(openMenu === "filter", close);
  const addRef = useDismiss<HTMLDivElement>(openMenu === "add", close);
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => (q ? r.prompt.prompt.toLowerCase().includes(q) : true));

    if (status === "active") out = out.filter((r) => r.prompt.status === "tracked");
    if (status === "inactive") out = out.filter((r) => r.prompt.status !== "tracked");

    const sorted = [...out];
    if (sort === "added")
      sorted.sort(
        (a, b) =>
          new Date(b.prompt.createdAt ?? 0).getTime() - new Date(a.prompt.createdAt ?? 0).getTime(),
      );
    if (sort === "az") sorted.sort((a, b) => a.prompt.prompt.localeCompare(b.prompt.prompt));
    if (sort === "score")
      sorted.sort((a, b) => {
        const sa = scoreHistoryByPrompt[a.prompt.id]?.score ?? -Infinity;
        const sb = scoreHistoryByPrompt[b.prompt.id]?.score ?? -Infinity;
        return sb - sa;
      });
    if (dir === "asc" && sort !== "manual") sorted.reverse();
    return sorted;
  }, [rows, query, status, sort, dir, scoreHistoryByPrompt]);

  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.prompt.id));

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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canDrag = sort === "manual" && !query;

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
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              className={BTN}
              aria-expanded={openMenu === "filter"}
              onClick={() => setOpenMenu(openMenu === "filter" ? null : "filter")}
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden />
              Filter
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

          <button type="button" className={BTN} onClick={onExport}>
            <Download className="h-3 w-3" aria-hidden />
            Export
          </button>

          <div className="relative" ref={addRef}>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded bg-vc-accent-subtle pl-2.5 pr-2 text-caption font-medium text-vc-accent transition-colors hover:bg-vc-accent hover:text-primary-foreground"
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
        <div className="hidden w-32 shrink-0 items-center text-label font-medium uppercase tracking-wider text-vc-text-muted lg:flex">
          Tags
        </div>
        <div className="hidden w-12 shrink-0 items-center text-label font-medium uppercase tracking-wider text-vc-text-muted sm:flex">
          7D
        </div>
        <div className="flex w-10 shrink-0 items-center">
          <SortHeader label="Score" sortKey="score" />
        </div>
        <div className="hidden w-10 shrink-0 items-center text-label font-medium uppercase tracking-wider text-vc-text-muted sm:flex">
          Δ
        </div>
        <div className="flex w-8 shrink-0 items-center text-label font-medium uppercase tracking-wider text-vc-text-muted">
          On
        </div>
        <div className="flex w-24 shrink-0 items-center">
          <SortHeader label="Added" sortKey="added" />
        </div>
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((r) => {
          const p = r.prompt;
          const active = p.status === "tracked";
          const hist = scoreHistoryByPrompt[p.id];
          const series = (hist?.series ?? []).slice(-7).map((pt) => pt.score);
          const promptTags = (tagsByPrompt[p.id] ?? [])
            .map((id) => tagsById.get(id))
            .filter((t): t is PromptTag => !!t);

          return (
            <div
              key={p.id}
              draggable={canDrag}
              onDragStart={() => canDrag && setDragId(p.id)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => canDrag && handleDrop(p.id)}
              onClick={() => editingId !== p.id && navigate({ to: `/prompts/${p.id}` as never })}
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
                  <input
                    autoFocus
                    value={editDraft}
                    maxLength={500}
                    onClick={(e) => e.stopPropagation()}
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
                    className="w-full rounded border border-vc-accent bg-vc-surface px-2 py-1 text-body text-vc-primary outline-none ring-2 ring-vc-accent/20"
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
                  </div>
                )}
              </div>

              <div className="hidden w-32 shrink-0 items-center gap-1 overflow-hidden lg:flex">
                {promptTags.length > 0 && (
                  <span className="flex items-center gap-1 overflow-hidden">
                    {promptTags.slice(0, 2).map((t) => (
                      <TagChip key={t.id} tag={t} />
                    ))}
                  </span>
                )}
                <TagPickerCell
                  promptId={p.id}
                  tags={tags}
                  attachedIds={tagsByPrompt[p.id] ?? []}
                  onAttach={onAttachTag}
                  onDetach={onDetachTag}
                />
              </div>

              <div className="hidden w-12 shrink-0 sm:block">
                <SparklineCell values={series} />
              </div>

              <div className="w-10 shrink-0">
                <span className="font-mono text-data tabular-nums text-vc-secondary">
                  {hist?.score ?? "–"}
                </span>
              </div>

              <div className="hidden w-10 shrink-0 sm:block">
                {hist?.delta === null || hist?.delta === undefined ? (
                  <span className="font-mono text-data tabular-nums text-vc-hover">–</span>
                ) : (
                  <span
                    className={`font-mono text-data tabular-nums ${
                      hist.delta > 0
                        ? "text-positive"
                        : hist.delta < 0
                          ? "text-destructive"
                          : "text-vc-tertiary"
                    }`}
                  >
                    {hist.delta > 0 ? "+" : ""}
                    {hist.delta.toFixed(1)}
                  </span>
                )}
              </div>

              <div className="w-8 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-pressed={!p.paused}
                  aria-label={p.paused ? "Resume prompt" : "Pause prompt"}
                  onClick={() => onTogglePaused(p.id, !p.paused)}
                  disabled={!active}
                  title={p.paused ? "Paused - excluded from the next run" : "Active"}
                  className="flex h-7 w-7 items-center justify-center rounded text-vc-tertiary transition-colors hover:bg-vc-muted/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {p.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                </button>
              </div>

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
            </div>
          );
        })}

        {visible.length === 0 && (
          <p className="px-4 py-6 text-caption text-vc-tertiary">
            {rows.length === 0
              ? "No prompts yet."
              : "No prompts match. Clear the search or change the filter."}
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
              atCap ? `At the ${cap}-prompt limit - archive one to free a slot` : "Add a prompt..."
            }
            className="min-w-0 flex-1 bg-transparent text-body text-vc-primary outline-none placeholder:text-vc-text-muted disabled:cursor-not-allowed"
          />
        </div>

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

      {/* Paste-a-list dialog */}
      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-lg rounded-lg border border-vc-default bg-vc-surface p-5 shadow-vc-overlay">
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
                className="flex h-8 items-center rounded bg-vc-accent px-3 text-caption font-medium text-primary-foreground hover:bg-vc-accent-hover"
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
