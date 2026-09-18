// Left column: brand header (score + run age), search, a "Waiting on you"
// group for threads with an undecided action card, thread groups, and a
// row hover menu (Rename/Archive). 330px measured width
// (01-trakkr-teardown.md §1.3); header locked to the same 56px as the
// Sidebar's brand row and AppShell's context bar so all three hairlines
// meet in one line (previously py-3 + two text lines drifted to ~73px).
import { useMemo, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Plus, Search, MoreHorizontal, Pencil, Archive, Inbox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AskThreadSummary } from "@/hooks/useAskThreads";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function AskThreadList({
  threads,
  activeThreadId,
  onSelect,
  onNewThread,
  brandName,
  visibilityScore,
  lastScanLabel,
  archiveThread,
  restoreThread,
  renameThread,
}: {
  threads: AskThreadSummary[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNewThread: () => void;
  brandName: string;
  visibilityScore: number | null;
  lastScanLabel: string | null;
  // AskWorkspace already owns one useAskThreads() call for the list itself
  // (`threads` above) - these are its mutations, threaded through rather
  // than mounting a second, disabled instance of the hook here.
  archiveThread: UseMutationResult<void, Error, string>;
  restoreThread: UseMutationResult<void, Error, string>;
  renameThread: UseMutationResult<void, Error, { threadId: string; title: string }>;
}) {
  const [query, setQuery] = useState("");
  const { toast } = useToast();

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? threads.filter((t) => t.title.toLowerCase().includes(trimmed))
    : threads;

  const waitingOnYou = useMemo(() => filtered.filter((t) => t.pendingActionCount > 0), [filtered]);
  const today = filtered.filter((t) => isToday(t.updatedAt));
  const earlier = filtered.filter((t) => !isToday(t.updatedAt));

  const handleArchive = (thread: AskThreadSummary) => {
    archiveThread.mutate(thread.id, {
      onSuccess: () => {
        toast({
          description: `Archived "${thread.title}"`,
          action: (
            <ToastAction altText="Undo" onClick={() => restoreThread.mutate(thread.id)}>
              Undo
            </ToastAction>
          ),
        });
      },
    });
  };

  const handleRename = (thread: AskThreadSummary, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle === thread.title) return;
    renameThread.mutate({ threadId: thread.id, title: trimmedTitle });
  };

  return (
    <div className="flex h-full w-[330px] shrink-0 flex-col border-r border-vc-default bg-vc-surface">
      <div className="flex h-[56px] shrink-0 flex-col justify-center border-b border-vc-default px-4">
        <p className="truncate text-caption font-semibold text-vc-primary">{brandName}</p>
        {visibilityScore !== null ? (
          <p className="text-data tabular-nums text-vc-tertiary">
            {visibilityScore.toFixed(1)}/100 {lastScanLabel ? `· ${lastScanLabel}` : ""}
          </p>
        ) : (
          <p className="text-data text-vc-tertiary">No score yet</p>
        )}
      </div>

      <div className="shrink-0 border-b border-vc-default px-2 py-2">
        <div className="flex items-center gap-1.5 rounded-md border border-vc-default bg-vc-page px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-vc-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search threads"
            className="w-full bg-transparent text-caption text-vc-primary placeholder:text-vc-tertiary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {waitingOnYou.length > 0 && (
          <ThreadGroup
            label="Waiting on you"
            threads={waitingOnYou}
            activeThreadId={activeThreadId}
            onSelect={onSelect}
            onRename={handleRename}
            onArchive={handleArchive}
            subtitleFor={(t) =>
              `${t.pendingActionCount} thing${t.pendingActionCount === 1 ? "" : "s"} to decide`
            }
          />
        )}
        {today.length > 0 && (
          <ThreadGroup
            label="Today"
            threads={today}
            activeThreadId={activeThreadId}
            onSelect={onSelect}
            onRename={handleRename}
            onArchive={handleArchive}
          />
        )}
        {earlier.length > 0 && (
          <ThreadGroup
            label="Earlier"
            threads={earlier}
            activeThreadId={activeThreadId}
            onSelect={onSelect}
            onRename={handleRename}
            onArchive={handleArchive}
          />
        )}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-caption text-vc-tertiary">
            {trimmed ? "No threads match." : "No threads yet."}
          </p>
        )}
      </div>

      <div className="border-t border-vc-default p-2">
        <button
          type="button"
          onClick={onNewThread}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption text-vc-secondary hover:bg-vc-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          New thread
        </button>
      </div>
    </div>
  );
}

function ThreadGroup({
  label,
  threads,
  activeThreadId,
  onSelect,
  onRename,
  onArchive,
  subtitleFor,
}: {
  label: string;
  threads: AskThreadSummary[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onRename: (thread: AskThreadSummary, title: string) => void;
  onArchive: (thread: AskThreadSummary) => void;
  subtitleFor?: (thread: AskThreadSummary) => string;
}) {
  return (
    <div className="mb-2">
      <p className="flex items-center gap-1 px-2 py-1 text-caption font-medium text-vc-tertiary">
        {label === "Waiting on you" && <Inbox className="h-3 w-3" />}
        {label}
      </p>
      {threads.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          active={t.id === activeThreadId}
          onSelect={onSelect}
          onRename={onRename}
          onArchive={onArchive}
          subtitle={subtitleFor?.(t)}
        />
      ))}
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  onSelect,
  onRename,
  onArchive,
  subtitle,
}: {
  thread: AskThreadSummary;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (thread: AskThreadSummary, title: string) => void;
  onArchive: (thread: AskThreadSummary) => void;
  subtitle?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thread.title);

  const commit = () => {
    setEditing(false);
    onRename(thread, draft);
  };

  if (editing) {
    return (
      <div className="px-2 py-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(thread.title);
              setEditing(false);
            }
          }}
          className="w-full rounded-sm border border-vc-accent bg-vc-surface px-1.5 py-1 text-caption text-vc-primary focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1 rounded-md pl-2 pr-1",
        active ? "bg-positive-subtle" : "hover:bg-vc-hover",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        className="min-w-0 flex-1 py-1.5 text-left"
      >
        <span className="block truncate text-caption text-vc-secondary">{thread.title}</span>
        {subtitle && <span className="block text-data text-vc-tertiary">{subtitle}</span>}
      </button>
      {!subtitle && (
        <span className="shrink-0 text-data text-vc-tertiary group-hover:hidden">
          {relativeTime(thread.updatedAt)}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Thread options"
            onClick={(e) => e.stopPropagation()}
            className="hidden shrink-0 rounded-sm p-1 text-vc-tertiary hover:bg-vc-muted hover:text-vc-primary group-hover:flex"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => {
              setDraft(thread.title);
              setEditing(true);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onArchive(thread)}>
            <Archive className="mr-2 h-3.5 w-3.5" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
