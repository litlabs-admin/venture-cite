import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, Plus, Search, Trash2, Upload, X } from "lucide-react";
import {
  BRANDS,
  BRAND_SWATCH,
  brandTint,
  COLUMNS,
  KIND_LABEL,
  KIND_SWATCH,
  WEIGHT_LABEL,
  blankTicket,
  type BoardId,
  type Column,
  type Kind,
  type Ticket,
  type Weight,
} from "./types";

// ─── One kanban board ────────────────────────────────────────────────────────
// Every tab on /internal-page that holds tasks renders this. The board id picks
// which server row it reads and writes, so the boards never overwrite each
// other (see server/routes/board.ts).
//
// STORAGE: the board lives on the server. Every visitor reads and writes the
// same row, so a change is permanent and shared.

const SAVE_LABEL: Record<"idle" | "saving" | "saved" | "failed", string> = {
  idle: "shared board",
  saving: "saving...",
  saved: "saved for everyone",
  failed: "save failed",
};

async function loadBoard(boardId: BoardId): Promise<Ticket[] | null> {
  try {
    const res = await fetch(`/api/board/${boardId}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { tickets: Ticket[] | null };
    return body.tickets && body.tickets.length ? body.tickets : null;
  } catch {
    return null;
  }
}

async function saveBoard(boardId: BoardId, tickets: Ticket[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/board/${boardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickets }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function Board({
  boardId,
  title,
  blurb,
  seed,
  newKind = "task",
}: {
  boardId: BoardId;
  title: string;
  blurb: string;
  seed: Ticket[];
  newKind?: Kind;
}) {
  const [tickets, setTickets] = useState<Ticket[]>(seed);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  // A ref, not state. dragstart and drop can land in the same render, and a
  // state value read inside the drop handler would still be null.
  const dragRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read this board once per board change. `ready` gates the save effect below,
  // so switching tabs never writes one board's seed over another board's row.
  useEffect(() => {
    let alive = true;
    setReady(false);
    setTickets(seed);
    void loadBoard(boardId).then((fromServer) => {
      if (!alive) return;
      if (fromServer) setTickets(fromServer);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [boardId, seed]);

  // Write the whole board back after a change, debounced so a drag that touches
  // several cards makes one request rather than several.
  useEffect(() => {
    if (!ready) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      void saveBoard(boardId, tickets).then((ok) => setSaveState(ok ? "saved" : "failed"));
    }, 400);
    return () => clearTimeout(timer);
  }, [tickets, ready, boardId]);

  // Only offer the brand filter when this board actually spans brands.
  const brandsPresent = useMemo(
    () => BRANDS.filter((b) => tickets.some((t) => t.brand === b)),
    [tickets],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (brandFilter !== "all" && t.brand !== brandFilter) return false;
      if (!q) return true;
      return `${t.title} ${t.detail} ${t.area} ${t.assignee} ${t.status} ${t.notes} ${t.evidence}`
        .toLowerCase()
        .includes(q);
    });
  }, [tickets, query, brandFilter]);

  const move = useCallback((id: string, column: Column) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, column } : t)));
  }, []);

  function save(next: Ticket) {
    setTickets((prev) =>
      prev.some((t) => t.id === next.id)
        ? prev.map((t) => (t.id === next.id ? next : t))
        : [...prev, next],
    );
    setEditing(null);
  }

  function remove(id: string) {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setEditing(null);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(tickets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${boardId}-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Ticket[];
        if (Array.isArray(parsed)) setTickets(parsed);
      } catch {
        // A bad file must not empty the board.
      }
    });
  }

  const counts = useMemo(() => {
    const open = tickets.filter((t) => t.column !== "done").length;
    const blocked = tickets.filter((t) => t.column === "blocked").length;
    const shipped = tickets.filter((t) => t.column === "done").length;
    return { total: tickets.length, open, blocked, shipped };
  }, [tickets]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-vc-default px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-vc-primary">{title}</h1>
            <p className="mt-1 text-xs text-vc-tertiary">
              {counts.total} items · {counts.open} open · {counts.blocked} blocked ·{" "}
              {counts.shipped} done · {SAVE_LABEL[saveState]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-vc-default px-2.5 text-xs text-vc-secondary transition-colors hover:border-vc-hover hover:text-vc-primary"
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            />
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-vc-default px-2.5 text-xs text-vc-secondary transition-colors hover:border-vc-hover hover:text-vc-primary"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button
              type="button"
              onClick={() => setEditing(blankTicket(newKind))}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-vc-accent px-3 text-xs font-medium text-white transition-colors hover:bg-vc-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" /> New task
            </button>
          </div>
        </div>

        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-vc-tertiary">{blurb}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-vc-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks"
              className="h-8 w-56 rounded-md border border-vc-default bg-transparent pl-7 pr-2 text-xs text-vc-primary outline-none placeholder:text-vc-placeholder focus:border-vc-accent"
            />
          </div>
          {brandsPresent.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setBrandFilter("all")}
                className={`h-8 rounded-md border px-2.5 text-xs transition-colors ${
                  brandFilter === "all"
                    ? "border-vc-accent bg-vc-accent-subtle text-vc-accent"
                    : "border-vc-default text-vc-tertiary hover:border-vc-hover hover:text-vc-primary"
                }`}
              >
                All brands
              </button>
              {brandsPresent.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBrandFilter(b)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                    brandFilter === b
                      ? "border-vc-accent bg-vc-accent-subtle text-vc-accent"
                      : "border-vc-default text-vc-tertiary hover:border-vc-hover hover:text-vc-primary"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: BRAND_SWATCH[b] }}
                  />
                  {b}
                </button>
              ))}
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {COLUMNS.map((col) => {
          const items = visible.filter((t) => t.column === col.key);
          return (
            <section
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragRef.current) move(dragRef.current, col.key);
                dragRef.current = null;
              }}
              className="flex w-[300px] shrink-0 flex-col rounded-lg border border-vc-default bg-vc-muted"
            >
              <div className="flex items-center justify-between border-b border-vc-default px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-vc-label">
                  {col.label}
                </span>
                <span className="text-xs text-vc-tertiary">{items.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {items.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    dragRef={dragRef}
                    onOpen={() => setEditing(t)}
                  />
                ))}
                {!items.length && (
                  <p className="px-1 py-6 text-center text-xs text-vc-tertiary">Nothing here</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {editing && (
        <TicketDialog
          ticket={editing}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Small colour-coded brand chip. Exported because the dashboard shows the
 *  same three brands and they must not drift apart visually. */
export function BrandBadge({ brand }: { brand: string }) {
  const swatch = BRAND_SWATCH[brand] ?? "var(--fg-tertiary)";
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: brandTint(swatch), color: swatch }}
    >
      {brand}
    </span>
  );
}

function TicketCard({
  ticket: t,
  dragRef,
  onOpen,
}: {
  ticket: Ticket;
  dragRef: React.MutableRefObject<string | null>;
  onOpen: () => void;
}) {
  return (
    <article
      draggable
      onDragStart={() => (dragRef.current = t.id)}
      onDragEnd={() => (dragRef.current = null)}
      onClick={onOpen}
      className="cursor-pointer rounded-md border border-vc-default bg-vc-surface p-2.5 transition-colors hover:border-vc-hover"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: KIND_SWATCH[t.kind] }}
        />
        <span className="text-xs uppercase tracking-wider text-vc-label">{KIND_LABEL[t.kind]}</span>
        <span className="ml-auto text-xs text-vc-tertiary">{WEIGHT_LABEL[t.weight]}</span>
      </div>

      <h3 className="mt-1.5 text-sm font-medium leading-snug text-vc-primary">{t.title}</h3>

      {t.brand && (
        <div className="mt-1.5">
          <BrandBadge brand={t.brand} />
        </div>
      )}

      {/* The spreadsheet's own wording, kept because it often says more than the
          lane does ("Ben to Record", "Waiting on Ben Feedback"). */}
      {t.status && <p className="mt-1.5 text-xs leading-snug text-vc-tertiary">{t.status}</p>}

      <div className="mt-1.5 flex items-center gap-2">
        {t.assignee && <span className="text-xs text-vc-secondary">{t.assignee}</span>}
        {t.link && (
          <a
            href={t.link}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto text-vc-tertiary transition-colors hover:text-vc-accent"
            aria-label="Open resource link"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}

function TicketDialog({
  ticket,
  onSave,
  onDelete,
  onClose,
}: {
  ticket: Ticket;
  onSave: (t: Ticket) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Ticket>(ticket);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const field =
    "w-full rounded-md border border-vc-default bg-transparent px-2 py-1.5 text-sm text-vc-primary outline-none focus:border-vc-accent";
  const label = "text-xs uppercase tracking-wider text-vc-label";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-[600px] overflow-y-auto rounded-lg border border-vc-default bg-vc-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-sm font-semibold text-vc-primary">Task</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-vc-tertiary hover:text-vc-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={label}>Title</span>
            <input
              className={`${field} mt-1`}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>

          <label className="block">
            <span className={label}>Detail</span>
            <textarea
              className={`${field} mt-1 min-h-[90px]`}
              value={draft.detail}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>Brand</span>
              <select
                className={`${field} mt-1`}
                value={draft.brand}
                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              >
                <option value="">None</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Assignee</span>
              <input
                className={`${field} mt-1`}
                value={draft.assignee}
                onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={label}>Kind</span>
              <select
                className={`${field} mt-1`}
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}
              >
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Weight</span>
              <select
                className={`${field} mt-1`}
                value={draft.weight}
                onChange={(e) => setDraft({ ...draft, weight: e.target.value as Weight })}
              >
                {(Object.keys(WEIGHT_LABEL) as Weight[]).map((w) => (
                  <option key={w} value={w}>
                    {WEIGHT_LABEL[w]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Column</span>
              <select
                className={`${field} mt-1`}
                value={draft.column}
                onChange={(e) => setDraft({ ...draft, column: e.target.value as Column })}
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Status note</span>
              <input
                className={`${field} mt-1`}
                value={draft.status}
                placeholder="Free text, e.g. Ben to Record"
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              />
            </label>
          </div>

          <label className="block">
            <span className={label}>Resource link</span>
            <input
              className={`${field} mt-1`}
              value={draft.link}
              placeholder="https://"
              onChange={(e) => setDraft({ ...draft, link: e.target.value })}
            />
          </label>

          <label className="block">
            <span className={label}>Notes</span>
            <textarea
              className={`${field} mt-1 min-h-[60px]`}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={label}>Area</span>
              <input
                className={`${field} mt-1`}
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={label}>Source</span>
              <input
                className={`${field} mt-1`}
                value={draft.evidence}
                placeholder="Where this came from"
                onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onDelete(draft.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-vc-default px-2.5 text-xs text-vc-tertiary transition-colors hover:text-[color:var(--negative)]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-vc-default px-3 text-xs text-vc-secondary transition-colors hover:border-vc-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.title.trim()}
              onClick={() => onSave(draft)}
              className="h-8 rounded-md bg-vc-accent px-3 text-xs font-medium text-white transition-colors hover:bg-vc-accent-hover disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
