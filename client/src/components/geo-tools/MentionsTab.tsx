// MentionsTab - Task 20, Mentions Rebuild plan.
// Spec §3.12. Composition layer: wires useMentions hook to the Mentions UI.
//
// Layout (top to bottom):
//   1. ScanStatusPanel (always visible when brandId set)
//   2. Stats row (4 cards: Total / Positive / Neutral / Negative)
//   3. Toolbar: Add manually | Bulk select | Delete all for brand
//   4. MentionsFilters
//   5. Mention list + Load more
//   6. Empty states (no brand / no scans / no results / filtered-empty)
//
// URL-driven side panel: ?mention=<id> opens MentionDetailSheet.
// Typed-confirm AlertDialog for "Delete all for brand".
// Bulk-select mode with checkboxes on each card.

import React, { useState, useCallback, useMemo } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, CheckSquare, Square, ThumbsUp, ThumbsDown } from "lucide-react";

import { useMentions } from "@/hooks/useMentions";
import { ScanStatusPanel } from "@/components/geo-tools/ScanStatusPanel";
import MentionCard from "@/components/geo-tools/MentionCard";
import MentionDetailSheet from "@/components/geo-tools/MentionDetailSheet";
import MentionsFilters from "@/components/geo-tools/MentionsFilters";
import { AddMentionDialog } from "@/components/geo-tools/AddMentionDialog";

import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { BrandMention, ScanJob } from "@shared/schema";
import type { Brand } from "@shared/schema";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MentionsTabProps = {
  brandId: string | null;
};

// ---------------------------------------------------------------------------
// Helper: stat card
// ---------------------------------------------------------------------------

// Sentiment tone: renders as neutral text + an icon, never as a coloured
// number by itself - and only once there's data to report. A zero count
// (including cold start, before any scan has run) is a "nothing yet"
// state and stays neutral rather than rendering as a false signal.
// `--positive` is reserved for data-viz series per the colour-system
// decision, not for status chips like this one.
function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative";
}) {
  const showAccent = !!tone && value > 0;
  const Icon = tone === "positive" ? ThumbsUp : tone === "negative" ? ThumbsDown : null;
  return (
    <div className="flex flex-1 flex-col items-center rounded-lg border bg-card px-3 py-2 text-center">
      <span
        className={cn(
          "inline-flex items-center gap-1 text-page font-semibold tabular-nums",
          showAccent && tone === "negative" ? "text-destructive" : "text-foreground",
        )}
      >
        {showAccent && Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        {value}
      </span>
      <span className="text-caption text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: loading placeholder shaped like a mention row
// ---------------------------------------------------------------------------

function MentionCardSkeleton() {
  return (
    <div className="w-full rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
        <Skeleton className="h-4 min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MentionsTab
// ---------------------------------------------------------------------------

// Tour engine targets (literal data-tour-id strings included so the
// verify-tour-targets script can statically discover them):
//   data-tour-id="mentions.firstResult"
export default function MentionsTab({ brandId }: MentionsTabProps) {
  // Mounted under more than one route (the /monitor?tab=mentions spine tab
  // and the legacy /geo-tools page), so - like SpineShell - this reads/writes
  // search loosely ({ strict: false } / to: location) rather than against
  // one route's typed `Route.useSearch()` - see native-api-contract.md rule
  // 3. `mention` is declared (as an optional string) on /monitor's schema in
  // src/routes/-shared/searchSchemas.ts; `useSearch({ strict: false })`'s
  // FullSearchSchema merges across the whole route tree, so it types here
  // too even when mounted under /geo-tools, which doesn't declare it itself.
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false });

  // ── Hook ─────────────────────────────────────────────────────────────────

  const {
    mentions,
    isLoading,
    hasMore,
    loadMore,
    filters,
    setFilter,
    clearFilters,
    stats,
    activeScan,
    startScan,
    scanCooldown,
    updateStatus,
    deleteMention,
    bulkDelete,
    deleteAllForBrand,
    markFalsePositive,
    manualAdd,
  } = useMentions(brandId);

  // ── Brand data (from global cache populated by useBrandSelection) ─────────

  const { data: brandsResponse } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
    enabled: !!brandId,
    staleTime: 30_000,
  });
  const brand = useMemo(
    () => brandsResponse?.data?.find((b) => b.id === brandId) ?? null,
    [brandsResponse, brandId],
  );

  // ── Last completed scan - fetched from dedicated endpoint ─────────────────

  const { data: lastScanData } = useQuery<{ data: ScanJob | null }>({
    queryKey: ["/api/brand-mentions/scans/last", brandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brand-mentions/scans/last/${brandId}`);
      return (await res.json()) as { data: ScanJob | null };
    },
    enabled: !!brandId,
    staleTime: 30_000,
  });
  const lastCompletedScan = lastScanData?.data ?? null;

  // ── URL-driven detail sheet ───────────────────────────────────────────────

  const openMentionId = useMemo(
    () => (typeof search.mention === "string" ? search.mention : null),
    [search.mention],
  );

  const activeMention = useMemo(
    () => (openMentionId ? (mentions.find((m) => m.id === openMentionId) ?? null) : null),
    [openMentionId, mentions],
  );

  const openDetailSheet = useCallback(
    (mention: BrandMention) => {
      // `to: location` rather than a route literal: this tab mounts under
      // more than one route (see the comment above), so `location` (the
      // current pathname) is a runtime `string`, not a literal - TanStack
      // Router accepts a plain `string` `to` for exactly this case. `search`
      // is a function of the previous search object so every existing param
      // (notably `brandId`, read by useBrandSelection() from nearly every
      // page) survives - only `mention` changes.
      navigate({
        to: location,
        search: (prev: Record<string, unknown>) => ({ ...prev, mention: mention.id }),
        replace: true,
      });
    },
    [location, navigate],
  );

  const closeDetailSheet = useCallback(() => {
    navigate({
      to: location,
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev };
        delete next.mention;
        return next;
      },
      replace: true,
    });
  }, [location, navigate]);

  // ── Bulk select ───────────────────────────────────────────────────────────

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const handleBulkDelete = useCallback(() => {
    bulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    setBulkMode(false);
    setBulkDeleteOpen(false);
  }, [bulkDelete, selectedIds]);

  // ── Add mention dialog ────────────────────────────────────────────────────

  const [addOpen, setAddOpen] = useState(false);

  // ── Delete all dialog ─────────────────────────────────────────────────────

  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmInput, setDeleteAllConfirmInput] = useState("");

  // Mirror server-side `collectVariations`: brand name first, then
  // nameVariations, deduped case-insensitively, drop entries < 2 chars.
  // Shared by ScanStatusPanel (search-terms line) and the empty state below,
  // so both surfaces report the exact same terms the scanner used.
  const searchVariations = useMemo(() => {
    const all = [brand?.name, ...(brand?.nameVariations ?? [])];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of all) {
      if (typeof raw !== "string") continue;
      const v = raw.trim();
      if (v.length < 2) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }, [brand?.name, brand?.nameVariations]);

  const brandName = brand?.name ?? "";
  const deleteAllConfirmEnabled = deleteAllConfirmInput.trim() === brandName && brandName !== "";

  const handleDeleteAll = useCallback(() => {
    deleteAllForBrand(brandName);
    setDeleteAllOpen(false);
    setDeleteAllConfirmInput("");
  }, [deleteAllForBrand, brandName]);

  // ── Toggle monitor ────────────────────────────────────────────────────────

  const queryClient = useQueryClient();

  const handleToggleMonitor = useCallback(
    async (enabled: boolean) => {
      if (!brandId) return;
      try {
        await apiRequest("PATCH", `/api/brand-mentions/brands/${brandId}/monitor-mentions`, {
          enabled,
        });
        // Refresh the brand cache so the toggle reflects the new state.
        await queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      } catch {
        // Errors surfaced via TanStack Query invalidation; swallow here.
      }
    },
    [brandId, queryClient],
  );

  // ── Derived: filter state ────────────────────────────────────────────────

  const hasActiveFilters = Object.keys(filters).length > 0;
  const hasFiltered = hasActiveFilters && mentions.length === 0 && !isLoading;

  // ── Empty state logic ─────────────────────────────────────────────────────
  //
  //  Priority:
  //    1. No brandId selected
  //    2. brandId set, no scans ever run
  //    3. brandId set, scan ran, 0 mentions (no active filters)
  //    4. brandId set, active filters, 0 results

  const showNoBrand = !brandId;
  const showNoScans =
    !!brandId &&
    !isLoading &&
    lastCompletedScan === null &&
    activeScan === null &&
    mentions.length === 0;
  const showNoMentionsAfterScan =
    !!brandId &&
    !isLoading &&
    lastCompletedScan !== null &&
    mentions.length === 0 &&
    !hasActiveFilters;
  const showFilteredEmpty = !!brandId && hasFiltered && !showNoMentionsAfterScan;

  // A source that refused the request did not "find nothing" - it was never
  // searched. Reddit blocks unauthenticated datacenter traffic (403/429), so
  // without this the empty state would claim a search that never happened.
  const blockedSources = Object.entries(
    (lastCompletedScan?.perSource ?? {}) as Record<string, { reason?: string } | undefined>,
  )
    .filter(([, v]) => typeof v?.reason === "string" && v.reason.length > 0)
    .map(([source, v]) => ({ source, reason: v!.reason as string }));

  // ── Render ────────────────────────────────────────────────────────────────

  // Early: no brand selected
  if (showNoBrand) {
    return (
      <PanelPage>
        <PanelRow cols={1} last>
          <Panel width="wide" border="last">
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-caption text-vc-tertiary">Select a brand to view mentions.</p>
            </div>
          </Panel>
        </PanelRow>
      </PanelPage>
    );
  }

  return (
    <PanelPage>
      {/* ── 1. Scan status panel ─────────────────────────────────────────── */}
      <PanelRow cols={1}>
        <Panel width="wide" border="last">
          <ScanStatusPanel
            brandId={brandId}
            brandName={brandName}
            brandMonitorMentions={brand?.monitorMentions ?? false}
            variations={searchVariations}
            activeScan={activeScan}
            lastCompletedScan={lastCompletedScan}
            scanCooldown={scanCooldown}
            onStartScan={startScan}
            onAddVariation={() => {
              // Variation management lives on the brands page. Navigate there;
              // the brand row exposes the name-variations editor.
              navigate({ to: "/brands" });
            }}
            onToggleMonitor={handleToggleMonitor}
          />
        </Panel>
      </PanelRow>

      <PanelRow cols={1} last>
        <Panel width="wide" border="last">
          <div className="flex flex-col gap-4">
            {/* ── 2. Stats row ────────────────────────────────────────────── */}
            {stats && (
              <div className="flex gap-2" aria-label="Mention statistics">
                <StatCard label="Total" value={stats.total} />
                <StatCard label="Positive" value={stats.bySentiment.positive} tone="positive" />
                <StatCard label="Neutral" value={stats.bySentiment.neutral} />
                <StatCard label="Negative" value={stats.bySentiment.negative} tone="negative" />
              </div>
            )}

            {/* ── 3. Toolbar ──────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Add manually */}
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-caption"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add manually
              </Button>

              {/* Bulk select toggle */}
              <Button
                size="sm"
                variant={bulkMode ? "secondary" : "outline"}
                className="h-8 gap-1.5 text-caption"
                onClick={() => {
                  setBulkMode((v) => !v);
                  setSelectedIds(new Set());
                }}
                aria-pressed={bulkMode}
              >
                {bulkMode ? (
                  <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Bulk select
              </Button>

              {/* Delete selected - visible when bulk mode active and items selected */}
              {bulkMode && selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 gap-1.5 text-caption"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete selected ({selectedIds.size})
                </Button>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Delete all for brand - danger zone */}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-caption text-destructive hover:bg-destructive-subtle hover:text-destructive"
                onClick={() => setDeleteAllOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete all for brand
              </Button>
            </div>

            {/* ── 4. Filters ───────────────────────────────────────────────── */}
            <MentionsFilters filters={filters} onChange={setFilter} onClear={clearFilters} />

            {/* ── 5. List ─────────────────────────────────────────────────── */}
            {isLoading ? (
              <div className="flex flex-col gap-2" aria-label="Loading mentions" role="status">
                <MentionCardSkeleton />
                <MentionCardSkeleton />
                <MentionCardSkeleton />
              </div>
            ) : (
              <>
                {/* Empty states */}
                {showNoScans && (
                  <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-vc-default p-8 text-center">
                    <p className="text-caption font-medium">No scans yet.</p>
                    <p className="text-caption text-vc-tertiary">
                      Run your first scan to find mentions.
                    </p>
                  </div>
                )}

                {showNoMentionsAfterScan && lastCompletedScan && (
                  <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-vc-default p-8 text-center">
                    <p className="text-caption font-medium">No mentions found yet.</p>
                    <p className="text-caption text-vc-tertiary">
                      Last scan{" "}
                      {formatDistanceToNow(
                        new Date(lastCompletedScan.completedAt ?? lastCompletedScan.createdAt),
                        { addSuffix: true },
                      )}{" "}
                      searched Reddit and Hacker News for{" "}
                      {searchVariations.length === 0
                        ? "no search terms"
                        : searchVariations.map((v, i) => (
                            <React.Fragment key={v}>
                              {i > 0 && " or "}
                              <code className="rounded bg-muted px-1 py-0.5 font-mono">{v}</code>
                            </React.Fragment>
                          ))}
                      .{" "}
                      {blockedSources.length > 0 ? (
                        <>
                          {blockedSources.map((b) => b.source).join(" and ")}{" "}
                          {blockedSources.length === 1 ? "refused" : "refused"} the request, so that
                          source was not actually searched:{" "}
                          <span className="text-vc-secondary">{blockedSources[0].reason}</span>.
                          Re-run the scan later.{" "}
                        </>
                      ) : (
                        <>
                          That is an honest result, not a broken scan - real-world discussion may
                          genuinely not exist under these terms yet.{" "}
                        </>
                      )}
                      <button
                        onClick={() => navigate({ to: "/brands" })}
                        className="text-primary underline-offset-2 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Add a search variation
                      </button>{" "}
                      to widen the search.
                    </p>
                  </div>
                )}

                {showFilteredEmpty && (
                  <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-vc-default p-8 text-center">
                    <p className="text-caption text-vc-tertiary">
                      No mentions match these filters.
                    </p>
                    <Button size="sm" variant="outline" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </div>
                )}

                {/* The list */}
                {mentions.length > 0 && (
                  <ul className="flex flex-col gap-2" aria-label="Mentions list">
                    {mentions.map((mention, index) => (
                      <li
                        key={mention.id}
                        className="flex items-start gap-2"
                        data-tour-id={index === 0 ? "mentions.firstResult" : undefined}
                      >
                        {/* Bulk-select checkbox */}
                        {bulkMode && (
                          <button
                            type="button"
                            aria-label={
                              selectedIds.has(mention.id)
                                ? `Deselect mention ${mention.id}`
                                : `Select mention ${mention.id}`
                            }
                            aria-checked={selectedIds.has(mention.id)}
                            role="checkbox"
                            className="mt-3 shrink-0 rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={() => toggleSelect(mention.id)}
                          >
                            {selectedIds.has(mention.id) ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-vc-tertiary" />
                            )}
                          </button>
                        )}

                        <div className="min-w-0 flex-1">
                          <MentionCard
                            mention={mention}
                            onOpen={openDetailSheet}
                            onChangeStatus={updateStatus}
                            onDelete={deleteMention}
                            onMarkFalsePositive={markFalsePositive}
                            isActive={mention.id === openMentionId}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Load more */}
                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" size="sm" onClick={loadMore} className="text-caption">
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>
      </PanelRow>

      {/* ── Detail sheet ─────────────────────────────────────────────────── */}
      <MentionDetailSheet
        mention={activeMention}
        onClose={closeDetailSheet}
        onChangeStatus={updateStatus}
        onDelete={deleteMention}
        onMarkFalsePositive={markFalsePositive}
      />

      {/* ── Add mention dialog ────────────────────────────────────────────── */}
      {brandId && (
        <AddMentionDialog
          brandId={brandId}
          open={addOpen}
          onOpenChange={setAddOpen}
          onSubmit={manualAdd}
        />
      )}

      {/* ── Bulk delete confirm dialog ────────────────────────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} selected mentions?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete all for brand confirm dialog ───────────────────────────── */}
      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all mentions for {brandName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete every mention for this brand. It cannot be undone.
                </p>
                <p>
                  Type <strong>{brandName}</strong> to confirm.
                </p>
                <Input
                  value={deleteAllConfirmInput}
                  onChange={(e) => setDeleteAllConfirmInput(e.target.value)}
                  placeholder={brandName}
                  aria-label={`Type ${brandName} to confirm deletion`}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteAllConfirmInput("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteAllConfirmEnabled}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
              onClick={handleDeleteAll}
            >
              Delete all mentions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelPage>
  );
}
