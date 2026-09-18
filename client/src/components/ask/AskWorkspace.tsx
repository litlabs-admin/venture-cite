// Top-level Ask layout: thread list (330px) + conversation column, matching
// Trakkr's measured proportions (01-trakkr-teardown.md §1.3). The
// conversation column centres in the space right of the thread list, not
// the viewport - same reasoning as that measurement.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeft, Plus, Brain, Clock } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { apiRequest } from "@/lib/queryClient";
import { useAskThreads } from "@/hooks/useAskThreads";
import { useAskRun, type AskMessageView } from "@/hooks/useAskRun";
import { AskThreadList } from "./AskThreadList";
import { AskEmptyState } from "./AskEmptyState";
import { AskUserMessage, AskAgentMessage } from "./AskMessage";
import { AskComposer, type AskComposerHandle } from "./AskComposer";
import { ASK_FOCUS_COMPOSER_EVENT } from "@/lib/askComposerFocus";
import { AskActionFilterBar, type AskActionFilter } from "./AskActionFilterBar";
import type { AskActionCard as AskActionCardType } from "@shared/ask/actions";
import { ASK_SUGGESTION_PALETTE } from "@shared/ask/suggestions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AskContextDrawer, ASK_CONTEXT_DRAWER_TOOLTIP } from "./AskContextDrawer";
import { useAskBrief } from "@/hooks/useAskBrief";
import { cn } from "@/lib/utils";

type ThreadDetailResponse = {
  success: boolean;
  data: {
    thread: {
      id: string;
      title: string;
      brandId: string | null;
      temporaryInstructions: string | null;
    };
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      createdAt: string;
      blocks: unknown[];
      evidence: unknown[];
      suggestions: string[];
      durationMs: number | null;
      pagesRead: number;
      runStatus: string | null;
      degradedReasons: string[];
      steps: Array<{
        ordinal: number;
        toolName: string;
        label: string;
        category: string | null;
        summary: string | null;
        durationMs: number | null;
        status: "ok" | "failed";
      }>;
      actionCards: AskActionCardType[];
    }>;
  };
};

export function AskWorkspace() {
  const navigate = useNavigate();
  // strict: false widens the search type across the whole route tree
  // (matching AppShell.tsx's own use of this hook) - a runtime narrow below
  // reads threadId out of it rather than a cast.
  const search = useSearch({ strict: false });
  const { selectedBrandId, selectedBrand } = useBrandSelection();

  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<AskActionFilter>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const threadIdFromUrl = (() => {
    const raw = (search as Record<string, unknown>).threadId;
    return typeof raw === "string" ? raw : null;
  })();
  const qFromUrl = (() => {
    const raw = (search as Record<string, unknown>).q;
    return typeof raw === "string" ? raw : undefined;
  })();

  const { threads, createThread, archiveThread, restoreThread, renameThread } = useAskThreads({
    enabled: !!selectedBrandId,
    brandId: selectedBrandId || null,
  });

  const activeThreadId = threadIdFromUrl ?? threads[0]?.id ?? null;

  const { messages, loadHistory, run, stop, isRunning, error, budgetExceeded } =
    useAskRun(activeThreadId);

  // One-shot ?q= from the Ask window (CommandPalette.tsx): it already
  // created the thread, so `threadId` is on the URL from the very first
  // render and `activeThreadId` needs no wait on the threads list query.
  // Strip `q` immediately so a refresh/back-nav never re-sends it.
  //
  // `consumedQRef` is a second, independent guard against the same
  // double-send this effect is exactly shaped to trigger (React StrictMode
  // double-invokes a mount effect's first call synchronously in
  // development, before `navigate`'s URL-stripping update has landed) -
  // useAskRun's own `run()` already refuses a second concurrent call, but
  // catching it here too means the second invocation never reaches the
  // network at all, not even to be turned away.
  const consumedQRef = useRef<string | null>(null);
  useEffect(() => {
    if (!qFromUrl || !activeThreadId) return;
    if (consumedQRef.current === qFromUrl) return;
    consumedQRef.current = qFromUrl;
    const rest = { ...(search as Record<string, unknown>) };
    delete rest.q;
    navigate({ to: "/agent", search: rest, replace: true });
    run(qFromUrl, activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFromUrl, activeThreadId]);

  // ⌘K / the sidebar Ask pill focus this page's composer instead of
  // opening the Ask window while already here (askComposerFocus.ts).
  const composerRef = useRef<AskComposerHandle>(null);
  useEffect(() => {
    const onFocusComposer = () => composerRef.current?.focus();
    window.addEventListener(ASK_FOCUS_COMPOSER_EVENT, onFocusComposer);
    return () => window.removeEventListener(ASK_FOCUS_COMPOSER_EVENT, onFocusComposer);
  }, []);

  const threadDetail = useQuery<ThreadDetailResponse>({
    queryKey: ["/api/ask/threads", activeThreadId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ask/threads/${activeThreadId}`);
      return res.json();
    },
    enabled: !!activeThreadId,
  });

  // "Just for one conversation" (Your preferences tab) - surfaced as a
  // small badge under the thread title, since nothing else on this page
  // shows that a thread is running under a temporary override.
  const activeThreadTemporaryInstructions =
    threadDetail.data?.data.thread.temporaryInstructions ?? null;

  useEffect(() => {
    // Never while a run is live: the GET below reflects what was persisted
    // BEFORE this turn (a brand-new thread's first turn persists nothing
    // until the very end - server/routes/ask.ts's runOneAskTurn), so
    // applying it mid-run would overwrite the in-flight optimistic +
    // streamed messages with an empty or stale list. This used to only
    // bite occasionally, on the empty-state's first send; making it start
    // the run the same render the thread id lands on `q`-effect above)
    // made it fire every time, so it needed fixing here rather than
    // papering over it with another setTimeout.
    if (isRunning) return;
    if (!threadDetail.data) return;
    const loaded: AskMessageView[] = threadDetail.data.data.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      steps: m.steps.map((s) => ({
        stepId: `${m.id}-${s.ordinal}`,
        ordinal: s.ordinal,
        label: s.label,
        category: s.category ?? "",
        summary: s.summary,
        durationMs: s.durationMs,
        status: s.status,
      })),
      blocks: m.blocks as AskMessageView["blocks"],
      evidence: m.evidence as AskMessageView["evidence"],
      actionCards: m.actionCards,
      suggestions: m.suggestions,
      statusLine: null,
      runStatus: (m.runStatus as AskMessageView["runStatus"]) ?? "ok",
      degradedReasons: m.degradedReasons,
      pagesRead: m.pagesRead,
      durationMs: m.durationMs,
      truncated: false,
    }));
    loadHistory(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadDetail.data]);

  const heroQuery = useQuery<{
    success: boolean;
    data: { visibilityScore: number; lastScanAt: string | null };
  }>({
    queryKey: [`/api/dashboard/hero/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const { brief } = useAskBrief(selectedBrandId ?? null);
  const briefReadyForReview = brief?.status === "draft" && brief.hasAnyContent;

  const actionsQuery = useQuery<{ success: boolean; data: { cards: AskActionCardType[] } }>({
    queryKey: ["/api/ask/actions", selectedBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ask/actions?brandId=${selectedBrandId}`);
      return res.json();
    },
    enabled: !!selectedBrandId,
  });

  const allCards = actionsQuery.data?.data.cards ?? [];
  const pendingCount = allCards.filter((c) => c.status === "pending").length;
  const doneCount = allCards.filter((c) => c.status === "done").length;
  const errorCount = messages.filter((m) => m.runStatus === "degraded").length;

  const handleNewThread = async () => {
    const thread = await createThread.mutateAsync();
    navigate({ to: "/agent", search: { ...search, threadId: thread.id } });
  };

  const handleSelectThread = (id: string) => {
    navigate({ to: "/agent", search: { ...search, threadId: id } });
  };

  const handleSend = async (message: string) => {
    if (!activeThreadId) {
      const thread = await createThread.mutateAsync();
      navigate({ to: "/agent", search: { ...search, threadId: thread.id } });
      // Pass the new thread id explicitly - `activeThreadId` (and the
      // hook's closed-over `threadId`) won't reflect it until the next
      // render, so a bare `run(message)` here silently dropped the first
      // message on a brand-new thread.
      run(message, thread.id);
      return;
    }
    run(message);
  };

  const brandName = selectedBrand?.name ?? "your brand";

  return (
    <div className="flex h-[calc(100vh-1px)]">
      {!collapsed && (
        <AskThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={handleSelectThread}
          onNewThread={handleNewThread}
          brandName={brandName}
          visibilityScore={heroQuery.data?.data.visibilityScore ?? null}
          lastScanLabel={
            heroQuery.data?.data.lastScanAt
              ? new Date(heroQuery.data.data.lastScanAt).toLocaleDateString()
              : null
          }
          archiveThread={archiveThread}
          restoreThread={restoreThread}
          renameThread={renameThread}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 56px, matching the thread list's header and Sidebar's brand row
            (AskThreadList.tsx's own comment) - the three hairlines used to
            sit at three different heights (48/56/~73px). */}
        <div className="flex h-[56px] shrink-0 items-center gap-2 border-b border-vc-default px-4">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-md p-1 text-vc-tertiary hover:bg-vc-hover"
            aria-label={collapsed ? "Show thread list" : "Hide thread list"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <p className="truncate text-caption font-medium text-vc-primary">
            {threads.find((t) => t.id === activeThreadId)?.title ?? "New thread"}
          </p>
          {activeThreadTemporaryInstructions && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-vc-accent-subtle px-2 py-0.5 text-data font-medium text-vc-accent animate-fade-in motion-reduce:animate-none">
                    <Clock className="h-3 w-3" />
                    Temporary instructions active
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  {activeThreadTemporaryInstructions}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Top-right controls (business-context.md): Business context,
              + (new thread), and the brain icon opening the "What I know"
              drawer. */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => navigate({ to: "/agent/context", search: { tab: "brief" } })}
              className="rounded-md px-2.5 py-1.5 text-caption font-medium text-vc-secondary transition-colors hover:bg-vc-hover hover:text-vc-primary"
            >
              Business context
            </button>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleNewThread}
                    aria-label="New thread"
                    className="rounded-md p-1.5 text-vc-tertiary transition-colors hover:bg-vc-hover hover:text-vc-primary"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">New thread</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    aria-label={ASK_CONTEXT_DRAWER_TOOLTIP}
                    className={cn(
                      "rounded-md p-1.5 transition-colors hover:bg-vc-hover",
                      drawerOpen ? "text-vc-accent" : "text-vc-tertiary hover:text-vc-primary",
                    )}
                  >
                    <Brain className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{ASK_CONTEXT_DRAWER_TOOLTIP}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <AskContextDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          brandId={selectedBrandId ?? null}
          brandName={brandName}
        />

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Content column caps at ~790px and centres in the space right of
              the thread list (not the viewport) - the measured proportion
              from 01-trakkr-teardown.md §1.3. */}
          <div className="mx-auto max-w-[790px]">
            {activeThreadId && (
              <AskActionFilterBar
                filter={filter}
                onChange={setFilter}
                pendingCount={pendingCount}
                doneCount={doneCount}
                errorCount={errorCount}
              />
            )}

            {messages.length === 0 && !threadDetail.isLoading ? (
              <AskEmptyState
                brandName={brandName}
                hasScore={!!heroQuery.data?.data.visibilityScore}
                questions={ASK_SUGGESTION_PALETTE.map((s) => s.text)}
                onPick={handleSend}
                briefReadyForReview={briefReadyForReview}
              />
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <AskUserMessage key={m.id} content={m.content} createdAt={m.createdAt} />
                ) : (
                  <AskAgentMessage key={m.id} message={m} onFollowup={handleSend} />
                ),
              )
            )}

            {error && <p className="mb-3 text-caption text-destructive">{error}</p>}
            {budgetExceeded && (
              <p className="mb-3 text-caption text-destructive">
                Daily Ask budget reached. Resets at midnight UTC.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 px-6 pb-6">
          <div className="mx-auto max-w-[790px]">
            <AskComposer
              ref={composerRef}
              isRunning={isRunning}
              disabled={!selectedBrandId}
              onSend={handleSend}
              onStop={stop}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
