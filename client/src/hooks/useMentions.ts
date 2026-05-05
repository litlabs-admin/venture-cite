// useMentions — single source of truth for the Mentions tab data layer.
//
// Owns: paginated mention list (infinite scroll), filter state (URL-persisted),
// stats derived from first page, active-scan polling, scan cooldown, and all
// mutations (updateStatus, deleteMention, bulkDelete, deleteAllForBrand,
// markFalsePositive, manualAdd).
//
// All server interactions go through TanStack Query so cache invalidation is
// automatic. Filter state is URL-persisted via wouter's useSearch / useLocation
// so filters survive refresh and are shareable.

import React, { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  InfiniteData,
} from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { apiRequest, isApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";
import type { BrandMention, ScanJob } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MentionFilters {
  status?: string;
  platform?: string;
  sentiment?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  newSinceLastScan?: boolean;
}

export interface MentionStats {
  total: number;
  byPlatform: Record<string, number>;
  bySentiment: { positive: number; neutral: number; negative: number };
  byStatus: Record<string, number>;
}

interface MentionPage {
  rows: BrandMention[];
  nextCursor: string | null;
  stats: MentionStats | null;
}

// ---------------------------------------------------------------------------
// Query key helpers
// ---------------------------------------------------------------------------

const listKey = (brandId: string | null, filters: MentionFilters) =>
  ["/api/brand-mentions", brandId, filters] as const;

const activeScansKey = (brandId: string | null) =>
  ["/api/brand-mentions/scans/active", brandId] as const;

// ---------------------------------------------------------------------------
// Filter param names — must match what the server reads from the query string.
// ---------------------------------------------------------------------------

const FILTER_KEYS: (keyof MentionFilters)[] = [
  "status",
  "platform",
  "sentiment",
  "from",
  "to",
  "q",
  "sort",
  "newSinceLastScan",
];

// ---------------------------------------------------------------------------
// restoreMention — approximate "undo delete" via a fresh manual-add POST.
//
// LIMITATION: This is not a true DB-level undelete. It re-submits the row as
// a manual-add, which runs the brand-presence gate again server-side. For
// accidentally deleted rows the data generally re-appears. If the server rejects
// the URL (e.g., no longer matches brand-presence gate) the restore silently
// fails — the hook shows a failure toast in that case.
// ---------------------------------------------------------------------------

async function restoreMention(row: BrandMention, brandId: string): Promise<void> {
  await apiRequest("POST", "/api/brand-mentions", {
    brandId,
    platform: row.platform,
    sourceUrl: row.sourceUrl,
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMentions(brandId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const searchString = useSearch();

  // -------------------------------------------------------------------------
  // Filter state — URL is the single source of truth
  // -------------------------------------------------------------------------

  const filters = useMemo<MentionFilters>(() => {
    const params = new URLSearchParams(searchString);
    const f: MentionFilters = {};
    for (const key of FILTER_KEYS) {
      const raw = params.get(key);
      if (raw === null || raw === "") continue;
      if (key === "newSinceLastScan") {
        f[key] = raw === "true";
      } else {
        (f as Record<string, string>)[key] = raw;
      }
    }
    return f;
  }, [searchString]);

  const setFilter = useCallback(
    (key: string, value: string | undefined | boolean) => {
      const params = new URLSearchParams(searchString);
      if (value === undefined || value === "" || value === false) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
      const qs = params.toString();
      const path = location.split("?")[0];
      setLocation(qs ? `${path}?${qs}` : path, { replace: true });
    },
    [location, searchString, setLocation],
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchString);
    for (const key of FILTER_KEYS) {
      params.delete(key);
    }
    const qs = params.toString();
    const path = location.split("?")[0];
    setLocation(qs ? `${path}?${qs}` : path, { replace: true });
  }, [location, searchString, setLocation]);

  // -------------------------------------------------------------------------
  // List query — infinite scroll
  // -------------------------------------------------------------------------

  const listQuery = useInfiniteQuery<MentionPage, Error>({
    queryKey: listKey(brandId, filters),
    queryFn: async ({ pageParam }) => {
      if (!brandId) {
        return { rows: [], nextCursor: null, stats: null } as unknown as MentionPage;
      }
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam as string);
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== "" && v !== false) {
          params.set(k, String(v));
        }
      }
      const qs = params.toString();
      const res = await apiRequest("GET", `/api/brand-mentions/${brandId}${qs ? `?${qs}` : ""}`);
      return (await res.json()) as MentionPage;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!brandId,
    staleTime: 30_000,
  });

  const mentions = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.rows) ?? [],
    [listQuery.data],
  );

  const hasMore = !!listQuery.hasNextPage;

  const loadMore = useCallback(() => {
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
      listQuery.fetchNextPage();
    }
  }, [listQuery]);

  // Stats come from the first page (server computes across the full set)
  const stats = listQuery.data?.pages[0]?.stats ?? null;

  // -------------------------------------------------------------------------
  // Active scan polling
  // -------------------------------------------------------------------------

  const activeScansQuery = useQuery<{ rows: ScanJob[] }, Error>({
    queryKey: activeScansKey(brandId),
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/brand-mentions/scans/active?brandId=${brandId ?? ""}`,
      );
      return (await res.json()) as { rows: ScanJob[] };
    },
    enabled: !!brandId,
    refetchInterval: (query) => {
      const data = query.state.data;
      const rows = data?.rows ?? [];
      const hasActive = rows.some(
        (s) => s.brandId === brandId && (s.status === "queued" || s.status === "running"),
      );
      return hasActive ? 2000 : false;
    },
    staleTime: 0,
  });

  // The single active scan for this brand (most recent queued/running)
  const activeScan = useMemo<ScanJob | null>(() => {
    const rows = activeScansQuery.data?.rows ?? [];
    return (
      rows.find(
        (s) => s.brandId === brandId && (s.status === "queued" || s.status === "running"),
      ) ?? null
    );
  }, [activeScansQuery.data, brandId]);

  // When activeScan transitions from non-null → null, the scan just finished.
  // Invalidate the dependent queries so the UI reflects the new mentions +
  // updated last-scan summary.
  const prevActiveScanRef = React.useRef<ScanJob | null>(null);
  React.useEffect(() => {
    if (prevActiveScanRef.current && !activeScan && brandId) {
      // Prefix-match invalidation hits all filter combinations of the list.
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-mentions", brandId],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/brand-mentions/scans/last", brandId],
      });
    }
    prevActiveScanRef.current = activeScan;
  }, [activeScan, brandId, queryClient]);

  // -------------------------------------------------------------------------
  // Scan cooldown
  // -------------------------------------------------------------------------
  // Optimistic default: canStart=true. If the server returns 429 on POST /scans
  // it includes `nextAvailableAt`; the startScan mutation captures it.
  const [cooldownNextAt, setCooldownNextAt] = React.useState<Date | null>(null);

  const scanCooldown = useMemo(() => {
    if (activeScan) return { canStart: false, nextAvailableAt: null };
    if (cooldownNextAt && cooldownNextAt > new Date()) {
      return { canStart: false, nextAvailableAt: cooldownNextAt };
    }
    return { canStart: true, nextAvailableAt: null };
  }, [activeScan, cooldownNextAt]);

  // -------------------------------------------------------------------------
  // startScan mutation
  // -------------------------------------------------------------------------

  const startScanMutation = useMutation<{ scanId: string }, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brand-mentions/scans/${brandId}`);
      return (await res.json()) as { scanId: string };
    },
    onSuccess: () => {
      // Kick off polling by invalidating the active-scans query
      queryClient.invalidateQueries({ queryKey: activeScansKey(brandId) });
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 429) {
        // Try to extract nextAvailableAt from the error body
        const body = err.body as Record<string, unknown> | null;
        const raw = body?.nextAvailableAt;
        if (raw) setCooldownNextAt(new Date(raw as string));
        toast({
          title: "Scan cooldown active",
          description: raw
            ? `Next manual scan available at ${new Date(raw as string).toLocaleTimeString()}.`
            : "Please wait before starting another scan.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Scan failed to start",
          description: err.message,
          variant: "destructive",
        });
      }
    },
  });

  const startScan = useCallback(() => {
    if (!brandId || !scanCooldown.canStart) return;
    startScanMutation.mutate();
  }, [brandId, scanCooldown.canStart, startScanMutation]);

  // -------------------------------------------------------------------------
  // updateStatus — optimistic mutation
  // -------------------------------------------------------------------------

  const updateStatusMutation = useMutation<
    void,
    Error,
    { id: string; status: string },
    { previous: InfiniteData<MentionPage> | undefined }
  >({
    mutationFn: async ({ id, status }) => {
      await apiRequest("PATCH", `/api/brand-mentions/${id}`, { status });
    },
    onMutate: async ({ id, status }) => {
      const key = listKey(brandId, filters);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<MentionPage>>(key);
      queryClient.setQueryData<InfiniteData<MentionPage>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            rows: page.rows.map((row) => (row.id === id ? { ...row, status } : row)),
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(listKey(brandId, filters), ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey(brandId, filters) });
    },
  });

  const updateStatus = useCallback(
    (id: string, status: string) => {
      updateStatusMutation.mutate({ id, status });
    },
    [updateStatusMutation],
  );

  // -------------------------------------------------------------------------
  // deleteMention — optimistic + 5s undo toast
  // -------------------------------------------------------------------------

  const deleteMentionMutation = useMutation<
    void,
    Error,
    string,
    { previous: InfiniteData<MentionPage> | undefined; deleted: BrandMention | undefined }
  >({
    mutationFn: async (id) => {
      await apiRequest("DELETE", `/api/brand-mentions/${id}`);
    },
    onMutate: async (id) => {
      const key = listKey(brandId, filters);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<MentionPage>>(key);

      let deleted: BrandMention | undefined;
      queryClient.setQueryData<InfiniteData<MentionPage>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => {
            const found = page.rows.find((r) => r.id === id);
            if (found) deleted = found;
            return {
              ...page,
              rows: page.rows.filter((r) => r.id !== id),
            };
          }),
        };
      });
      return { previous, deleted };
    },
    onSuccess: (_v, _id, ctx) => {
      const row = ctx?.deleted;
      if (!row || !brandId) return;
      // Show a 5-second undo toast. Undo re-submits via manualAdd (approximate
      // undelete — see restoreMention comment above).
      toast({
        title: "Mention deleted",
        description: row.sourceTitle ?? row.sourceUrl,
        action: React.createElement(
          ToastAction,
          {
            altText: "Undo",
            onClick: () => {
              restoreMention(row, brandId)
                .then(() =>
                  queryClient.invalidateQueries({
                    queryKey: listKey(brandId, filters),
                  }),
                )
                .catch(() => {
                  toast({
                    title: "Undo failed",
                    description: "The mention could not be restored. You can re-add it manually.",
                    variant: "destructive",
                  });
                });
            },
          },
          "Undo",
        ) as unknown as ToastActionElement,
        duration: 5000,
      });
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(listKey(brandId, filters), ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey(brandId, filters) });
    },
  });

  const deleteMention = useCallback(
    (id: string) => {
      deleteMentionMutation.mutate(id);
    },
    [deleteMentionMutation],
  );

  // -------------------------------------------------------------------------
  // bulkDelete
  // The component owns the confirm dialog; the hook just exposes the mutation.
  // -------------------------------------------------------------------------

  const bulkDeleteMutation = useMutation<void, Error, string[]>({
    mutationFn: async (ids) => {
      await apiRequest("POST", "/api/brand-mentions/bulk-delete", { ids });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey(brandId, filters) });
    },
    onError: (err) => {
      toast({
        title: "Bulk delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const bulkDelete = useCallback(
    (ids: string[]) => {
      bulkDeleteMutation.mutate(ids);
    },
    [bulkDeleteMutation],
  );

  // -------------------------------------------------------------------------
  // deleteAllForBrand
  // Component owns the typed-confirm dialog.
  // -------------------------------------------------------------------------

  const deleteAllMutation = useMutation<void, Error, string>({
    mutationFn: async (brandName) => {
      await apiRequest("POST", `/api/brand-mentions/delete-all/${brandId}`, { brandName });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey(brandId, filters) });
    },
    onError: (err) => {
      toast({
        title: "Delete all failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteAllForBrand = useCallback(
    (brandName: string) => {
      deleteAllMutation.mutate(brandName);
    },
    [deleteAllMutation],
  );

  // -------------------------------------------------------------------------
  // markFalsePositive — sugar over updateStatus
  // -------------------------------------------------------------------------

  const markFalsePositive = useCallback(
    (id: string) => {
      updateStatus(id, "false_positive");
    },
    [updateStatus],
  );

  // -------------------------------------------------------------------------
  // manualAdd
  // -------------------------------------------------------------------------

  const manualAddMutation = useMutation<void, Error, { platform: string; sourceUrl: string }>({
    mutationFn: async ({ platform, sourceUrl }) => {
      await apiRequest("POST", "/api/brand-mentions", {
        brandId,
        platform,
        sourceUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey(brandId, filters) });
    },
  });

  const manualAdd = useCallback(
    async (input: { platform: string; sourceUrl: string }): Promise<void> => {
      await manualAddMutation.mutateAsync(input);
    },
    [manualAddMutation],
  );

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // List
    mentions,
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    hasMore,
    loadMore,

    // Filters
    filters,
    setFilter,
    clearFilters,

    // Stats
    stats,

    // Scan
    activeScan,
    startScan,
    scanCooldown,

    // Mutations
    updateStatus,
    deleteMention,
    bulkDelete,
    deleteAllForBrand,
    markFalsePositive,
    manualAdd,
  };
}
