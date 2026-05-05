// MentionsTab — Task 20, Mentions Rebuild plan.
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
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, CheckSquare, Square, Loader2 } from "lucide-react";

import { useMentions } from "@/hooks/useMentions";
import { ScanStatusPanel } from "@/components/geo-tools/ScanStatusPanel";
import MentionCard from "@/components/geo-tools/MentionCard";
import MentionDetailSheet from "@/components/geo-tools/MentionDetailSheet";
import MentionsFilters from "@/components/geo-tools/MentionsFilters";
import { AddMentionDialog } from "@/components/geo-tools/AddMentionDialog";

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
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { BrandMention, ScanJob } from "@shared/schema";
import type { Brand } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MentionsTabProps = {
  brandId: string | null;
};

// ---------------------------------------------------------------------------
// Helper: stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-lg border bg-card px-3 py-2 text-center">
      <span className={cn("text-xl font-bold tabular-nums", accent ?? "text-foreground")}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MentionsTab
// ---------------------------------------------------------------------------

export default function MentionsTab({ brandId }: MentionsTabProps) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();

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

  // ── Last completed scan — fetched from dedicated endpoint ─────────────────

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

  const openMentionId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("mention");
  }, [searchString]);

  const activeMention = useMemo(
    () => (openMentionId ? (mentions.find((m) => m.id === openMentionId) ?? null) : null),
    [openMentionId, mentions],
  );

  const openDetailSheet = useCallback(
    (mention: BrandMention) => {
      const params = new URLSearchParams(searchString);
      params.set("mention", mention.id);
      const qs = params.toString();
      const path = location.split("?")[0];
      setLocation(qs ? `${path}?${qs}` : path, { replace: true });
    },
    [location, searchString, setLocation],
  );

  const closeDetailSheet = useCallback(() => {
    const params = new URLSearchParams(searchString);
    params.delete("mention");
    const qs = params.toString();
    const path = location.split("?")[0];
    setLocation(qs ? `${path}?${qs}` : path, { replace: true });
  }, [location, searchString, setLocation]);

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

  // ── Render ────────────────────────────────────────────────────────────────

  // Early: no brand selected
  if (showNoBrand) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">Select a brand to view mentions.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 1. Scan status panel ─────────────────────────────────────────── */}
      <ScanStatusPanel
        brandId={brandId}
        brandName={brandName}
        brandMonitorMentions={brand?.monitorMentions ?? false}
        variations={brand?.nameVariations ?? []}
        activeScan={activeScan}
        lastCompletedScan={lastCompletedScan}
        scanCooldown={scanCooldown}
        consecutiveAutoFailures={0}
        sentimentCapped={false}
        onStartScan={startScan}
        onAddVariation={() => {
          // Variation management lives on the brands page. Navigate there;
          // the brand row exposes the name-variations editor.
          setLocation("/brands");
        }}
        onToggleMonitor={handleToggleMonitor}
      />

      {/* ── 2. Stats row ────────────────────────────────────────────────── */}
      {stats && (
        <div className="flex gap-2" aria-label="Mention statistics">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Positive" value={stats.bySentiment.positive} accent="text-green-600" />
          <StatCard label="Neutral" value={stats.bySentiment.neutral} />
          <StatCard label="Negative" value={stats.bySentiment.negative} accent="text-destructive" />
        </div>
      )}

      {/* ── 3. Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Add manually */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add manually
        </Button>

        {/* Bulk select toggle */}
        <Button
          size="sm"
          variant={bulkMode ? "secondary" : "outline"}
          className="h-8 gap-1.5 text-xs"
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

        {/* Delete selected — visible when bulk mode active and items selected */}
        {bulkMode && selectedIds.size > 0 && (
          <Button
            size="sm"
            variant="destructive"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete selected ({selectedIds.size})
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Delete all for brand — danger zone */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteAllOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete all for brand
        </Button>
      </div>

      {/* ── 4. Filters ───────────────────────────────────────────────────── */}
      <MentionsFilters filters={filters} onChange={setFilter} onClear={clearFilters} />

      {/* ── 5. List ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2
            className="h-6 w-6 animate-spin text-muted-foreground"
            aria-label="Loading mentions"
          />
        </div>
      ) : (
        <>
          {/* Empty states */}
          {showNoScans && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No scans yet.</p>
              <p className="text-xs text-muted-foreground">Run your first scan to find mentions.</p>
            </div>
          )}

          {showNoMentionsAfterScan && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No mentions found yet.</p>
              <p className="text-xs text-muted-foreground">
                {"We'll keep checking daily. Add variations to widen the search."}
              </p>
            </div>
          )}

          {showFilteredEmpty && (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">No mentions match these filters.</p>
              <Button size="sm" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          )}

          {/* The list */}
          {mentions.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Mentions list">
              {mentions.map((mention) => (
                <li key={mention.id} className="flex items-start gap-2">
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
                      className="mt-3 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => toggleSelect(mention.id)}
                    >
                      {selectedIds.has(mention.id) ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
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
              <Button variant="outline" size="sm" onClick={loadMore} className="text-xs">
                Load more
              </Button>
            </div>
          )}
        </>
      )}

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
    </div>
  );
}
