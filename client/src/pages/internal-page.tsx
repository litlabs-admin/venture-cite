import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Internal board ──────────────────────────────────────────────────────────
// A private kanban for the team. It holds the work we found in the codebase
// audit, plus anything we add later.
//
// Administrators can read and edit this shared board.
//
// ponytail: one row in a table that already exists, not a new table. The board
// needs no migration and no schema decision.
//
// The seed list below comes from a full read of the codebase on 2026-08-10.
// Each seeded ticket names the file that proves it. Nothing here is a guess.

export type Column = "backlog" | "next" | "doing" | "blocked" | "done";
export type Kind = "feature" | "upgrade";
export type Weight = "high" | "medium" | "low";

export interface Ticket {
  id: string;
  title: string;
  detail: string;
  kind: Kind;
  weight: Weight;
  area: string;
  evidence: string;
  column: Column;
  order: number;
}

const COLUMNS: { key: Column; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "next", label: "Next" },
  { key: "doing", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

const KIND_LABEL: Record<Kind, string> = {
  feature: "New feature",
  upgrade: "Upgrade",
};

// Warm ramp only. Every colour is a token, never a literal.
const KIND_SWATCH: Record<Kind, string> = {
  feature: "var(--brand-accent)",
  upgrade: "var(--success-accent)",
};

const WEIGHT_LABEL: Record<Weight, string> = { high: "High", medium: "Medium", low: "Low" };

const SAVE_LABEL: Record<"idle" | "saving" | "saved" | "failed", string> = {
  idle: "shared board",
  saving: "saving...",
  saved: "saved for everyone",
  failed: "save failed",
};

let seedCounter = 0;
function seed(t: Omit<Ticket, "id" | "order" | "column"> & { column?: Column }): Ticket {
  return { ...t, id: `seed-${++seedCounter}`, order: seedCounter, column: t.column ?? "backlog" };
}

// ─── The seed board ──────────────────────────────────────────────────────────
// Group 1: defects the audit proved. These are the cheapest wins.
const SEED: Ticket[] = [
  // Group 2: the measurement gaps. These change what the product can say.
  seed({
    title: "Explain one question, end to end",
    detail:
      "Today diagnose.tsx is a 51 line shell with three tabs. Build a real per-question report: the score, the best position, which models answered, the blockers, the fixes, and the sources. Each fix must create a task.",
    kind: "feature",
    weight: "high",
    area: "Diagnose",
    evidence: "client/src/pages/diagnose.tsx, 51 lines",
  }),
  seed({
    title: "Add presence, best position and share of first place",
    detail:
      "One visibility number hides the shape of the result. Presence counts the answers that name the brand at all. Share of first place counts the answers that name the brand first. Both are cheap, because the run already stores each position.",
    kind: "upgrade",
    weight: "high",
    area: "Measurement",
    evidence: "server/lib computeVisibilityScore",
    column: "doing",
  }),
  seed({
    title: "Group prompts by audience and buying stage",
    detail:
      "One brand wide score hides a wide spread between buyer types. Group each prompt under an audience and a stage. Show the score per audience.",
    kind: "feature",
    weight: "medium",
    area: "Prompts",
    evidence: "server/routes/prompts.ts",
    column: "doing",
  }),
  seed({
    title: "Build the pivot view",
    detail:
      "Let a user choose the rows, for example model or prompt. Let a user choose the measures, for example visibility, presence, average rank and mentions. Export the table as CSV.",
    kind: "feature",
    weight: "medium",
    area: "Reporting",
    evidence: "no equivalent page exists",
    column: "doing",
  }),
  seed({
    title: "Rank rivals with trend, head to head and win rate",
    detail:
      "The competitors page lists rivals. It shows no movement, no duel record and no win rate. The run data already holds each position, so the arithmetic is available.",
    kind: "upgrade",
    weight: "high",
    area: "Competitors",
    evidence: "client/src/pages/competitors.tsx",
  }),
  seed({
    title: "Split citations into sources, queries and gaps",
    detail:
      "The citations page shows one list. Add a source view, a query view, and a gap view that lists publishers who cite a rival but not us. The gap view is the one that creates outreach work.",
    kind: "upgrade",
    weight: "high",
    area: "Citations",
    evidence: "client/src/pages/citations.tsx",
  }),

  // Group 3: the work loop. Nothing today turns a finding into a job.
  seed({
    title: "Turn findings into a work queue",
    detail:
      "Wire agent_tasks to a page. Give each task a state: found, planned, measuring, earned. Let diagnose, site health and the citation gap view all write into it. This closes the loop between a finding and a fix.",
    kind: "feature",
    weight: "high",
    area: "Actions",
    evidence: "agent_tasks exists with no route",
  }),
  seed({
    title: "Let a rule watch and act without us",
    detail:
      "Build a rule with four parts: what to watch, what to check, what to do, and who to tell. Add a permission ladder, so a rule can notify only, or draft, or apply after approval. Nothing runs until a person turns it on.",
    kind: "feature",
    weight: "medium",
    area: "Automations",
    evidence: "only weekly_catchup exists",
  }),
  seed({
    title: "Group articles into campaigns and track the live ones",
    detail:
      "Articles stand alone today. Group them under a campaign. Add a live view that shows which published article now gets cited. That is the only proof the work paid off.",
    kind: "upgrade",
    weight: "medium",
    area: "Content",
    evidence: "server/routes/articles.ts",
  }),

  // Group 4: data we do not collect yet.
  seed({
    title: "Count real AI crawler visits",
    detail:
      "The product checks robots.txt for permission. It never counts a visit. Add an endpoint that accepts a request log from the customer site, match the user agent against the known AI crawlers, and count each hit. This is the only honest source for crawler data.",
    kind: "feature",
    weight: "high",
    area: "Traffic",
    evidence: "server/routes/geoSignals.ts, robots check only",
    column: "doing",
  }),
  seed({
    title: "Connect Google Analytics and Search Console",
    detail:
      "The product cannot show a visit from an AI assistant, because no analytics account is connected. Add both connections. Show the search numbers beside the AI numbers.",
    kind: "feature",
    weight: "medium",
    area: "Traffic",
    evidence: "no GA or GSC integration exists",
  }),
  seed({
    title: "Serve AI crawlers a clean version of a page",
    detail:
      "Most AI crawlers do not run JavaScript. Detect the crawler at the edge. Serve clean structure and schema. Keep the normal page for a human visitor. Log every crawler request.",
    kind: "feature",
    weight: "low",
    area: "Traffic",
    evidence: "no equivalent exists",
    column: "doing",
  }),

  // Group 5: platform and reach.
  seed({
    title: "Make every view shareable with a link",
    detail:
      "A filter, a tab and a sort do not appear in the URL today. A user cannot send a colleague the exact view. Put the tab and the main filters into the query string.",
    kind: "upgrade",
    weight: "medium",
    area: "Platform",
    evidence: "client routes carry no view state",
    column: "doing",
  }),
  seed({
    title: "Publish a read API and an MCP server",
    detail:
      "Customers cannot reach their own data from outside the app. Publish a documented read API. Add an MCP server, so a customer can query the data from Claude or Cursor.",
    kind: "feature",
    weight: "medium",
    area: "Platform",
    evidence: "no public API exists",
  }),
  seed({
    title: "Add teams and seats",
    detail:
      "One account equals one person today. Agencies need many seats and a role for each seat. This blocks every agency plan feature.",
    kind: "feature",
    weight: "medium",
    area: "Account",
    evidence: "no team table in shared/schema.ts",
  }),
  seed({
    title: "Gate features, not only quotas",
    detail:
      "Billing checks quantity only, for example the article count and the brand count. No feature is gated. A plan cannot sell a capability today, only a volume.",
    kind: "upgrade",
    weight: "medium",
    area: "Billing",
    evidence: "server/routes/billing.ts, quota checks only",
    column: "doing",
  }),
  seed({
    title: "Send events to other systems",
    detail:
      "Buffer is the only outbound connection. Add outbound webhooks first, because one webhook reaches Zapier, Slack and every task tracker at once.",
    kind: "feature",
    weight: "low",
    area: "Integrations",
    evidence: "server/routes/buffer.ts is the only connector",
    column: "doing",
  }),

  // Keep these strengths during future changes.
];

// The board lives on the server, in one `system_state` row. Every visitor sees
// the same board, and a change survives a refresh, a new browser and a deploy.
// The server returns null when nobody has saved yet, so the seed above is the
// first board anyone sees.
async function loadFromServer(): Promise<Ticket[] | null> {
  try {
    const res = await apiRequest("GET", "/api/board");
    const body = (await res.json()) as { tickets: Ticket[] | null };
    return body.tickets && body.tickets.length ? body.tickets : null;
  } catch {
    return null;
  }
}

async function saveToServer(tickets: Ticket[]): Promise<boolean> {
  try {
    await apiRequest("PUT", "/api/board", { tickets });
    return true;
  } catch {
    return false;
  }
}

export default function InternalPage() {
  const [tickets, setTickets] = useState<Ticket[]>(SEED);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  // A ref, not state. dragstart and drop can land in the same render, and a
  // state value read inside the drop handler would still be null.
  const dragRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read the shared board once on mount.
  useEffect(() => {
    let alive = true;
    void loadFromServer().then((fromServer) => {
      if (!alive) return;
      if (fromServer) setTickets(fromServer);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Write the whole board back after a change. The save is debounced, so a
  // drag that touches several cards makes one request, not several.
  useEffect(() => {
    if (!ready) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      void saveToServer(tickets).then((ok) => setSaveState(ok ? "saved" : "failed"));
    }, 400);
    return () => clearTimeout(timer);
  }, [tickets, ready]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (!q) return true;
      return `${t.title} ${t.detail} ${t.area} ${t.evidence}`.toLowerCase().includes(q);
    });
  }, [tickets, query, kindFilter]);

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
    a.download = `internal-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    file.text().then((text) => {
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
    const shipped = tickets.filter((t) => t.column === "done").length;
    return { total: tickets.length, open, shipped };
  }, [tickets]);

  return (
    <div className="flex h-full flex-col bg-vc-page">
      <header className="border-b border-vc-default px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-vc-primary">Internal board</h1>
            <p className="mt-1 text-xs text-vc-tertiary">
              {counts.total} items · {counts.open} open · {counts.shipped} shipped ·{" "}
              {SAVE_LABEL[saveState]}
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
              onClick={() =>
                setEditing({
                  id: `t-${Date.now()}`,
                  title: "",
                  detail: "",
                  kind: "feature",
                  weight: "medium",
                  area: "",
                  evidence: "",
                  column: "backlog",
                  order: Date.now(),
                })
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-vc-accent px-3 text-xs font-medium text-white transition-colors hover:bg-vc-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" /> New ticket
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-vc-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets"
              className="h-8 w-56 rounded-md border border-vc-default bg-transparent pl-7 pr-2 text-xs text-vc-primary outline-none placeholder:text-vc-placeholder focus:border-vc-accent"
            />
          </div>
          {(["all", "feature", "upgrade"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`h-8 rounded-md border px-2.5 text-xs transition-colors ${
                kindFilter === k
                  ? "border-vc-accent bg-vc-accent-subtle text-vc-accent"
                  : "border-vc-default text-vc-tertiary hover:border-vc-hover hover:text-vc-primary"
              }`}
            >
              {k === "all" ? "All" : KIND_LABEL[k]}
            </button>
          ))}
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
                  <article
                    key={t.id}
                    draggable
                    onDragStart={() => (dragRef.current = t.id)}
                    onDragEnd={() => (dragRef.current = null)}
                    onClick={() => setEditing(t)}
                    className="cursor-pointer rounded-md border border-vc-default bg-vc-surface p-2.5 transition-colors hover:border-vc-hover"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: KIND_SWATCH[t.kind] }}
                      />
                      <span className="text-xs uppercase tracking-wider text-vc-label">
                        {KIND_LABEL[t.kind]}
                      </span>
                      <span className="ml-auto text-xs text-vc-tertiary">
                        {WEIGHT_LABEL[t.weight]}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-medium leading-snug text-vc-primary">
                      {t.title}
                    </h3>
                    {t.area && <p className="mt-1 text-xs text-vc-tertiary">{t.area}</p>}
                  </article>
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-[560px] overflow-y-auto rounded-lg border border-vc-default bg-vc-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-sm font-semibold text-vc-primary">Ticket</h2>
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
            <span className="text-xs uppercase tracking-wider text-vc-label">Title</span>
            <input
              className={`${field} mt-1`}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-vc-label">Detail</span>
            <textarea
              className={`${field} mt-1 min-h-[110px]`}
              value={draft.detail}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-vc-label">Kind</span>
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
              <span className="text-xs uppercase tracking-wider text-vc-label">Weight</span>
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
              <span className="text-xs uppercase tracking-wider text-vc-label">Area</span>
              <input
                className={`${field} mt-1`}
                value={draft.area}
                onChange={(e) => setDraft({ ...draft, area: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-vc-label">Column</span>
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
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-vc-label">Evidence</span>
            <input
              className={`${field} mt-1`}
              value={draft.evidence}
              placeholder="The file that proves it"
              onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
            />
          </label>
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
