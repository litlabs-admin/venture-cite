// Shared data-fetching layer for the Prompts feature (tracked prompts, tied
// to brandPrompts/geoRankings/citationRuns server-side, served by
// server/routes/prompts.ts).
//
// Before this file, citations.tsx, PromptsTab.tsx, ResultsTab.tsx,
// HistoryTab.tsx and geo-signals.tsx each hand-rolled their own useQuery /
// useMutation calls against these endpoints, with query keys that didn't
// match each other - e.g. citations.tsx used
// `[`/api/brand-prompts/${brandId}`]` (template-string) while geo-signals.tsx
// used `["/api/brand-prompts", brandId]` (array) for the SAME endpoint, so
// TanStack Query never deduped the two and the page double-fetched. Every
// consumer must now go through `promptKeys` so identical logical queries
// produce identical keys.

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BrandPrompt } from "@shared/schema";

// ============ Query key factory ============
//
// Every hook below builds its queryKey exclusively from these factories, and
// every mutation's invalidateQueries calls reference the same factories -
// so a rename/reshape here can't silently desync a consumer from the cache.
export const promptKeys = {
  list: (brandId: string | null | undefined) => ["/api/brand-prompts", brandId] as const,
  // Tracked + archived. Distinct key from `list` so the two result sets never
  // clobber one another.
  listAll: (brandId: string | null | undefined) => ["/api/brand-prompts", brandId, "all"] as const,
  suggestions: (brandId: string | null | undefined) =>
    ["/api/brand-prompts", brandId, "suggestions"] as const,
  // No `opts` (or an empty `since`) returns the bare 3-element prefix - used
  // for broad `invalidateQueries` calls that should catch every `since`
  // variant of this brand's results query (TanStack matches by prefix).
  // A concrete `since` appends the params segment, matching exactly what
  // `usePromptResults` builds its queryKey from.
  results: (brandId: string | null | undefined, opts?: { since?: string }) =>
    opts?.since
      ? (["/api/brand-prompts", brandId, "results", { since: opts.since }] as const)
      : (["/api/brand-prompts", brandId, "results"] as const),
  history: (brandId: string | null | undefined) =>
    ["/api/brand-prompts", brandId, "history"] as const,
  runDetails: (brandId: string | null | undefined, runId: string | null | undefined) =>
    ["/api/brand-prompts", brandId, "run", runId, "details"] as const,
  generations: (brandId: string | null | undefined) =>
    ["/api/brand-prompts", brandId, "generations"] as const,
  // Per-prompt score series (SCORE / Δ / sparkline columns). Distinct from
  // `history`, which is the brand-level list of citation runs.
  scoreHistory: (brandId: string | null | undefined) =>
    ["/api/brand-prompts", brandId, "prompt-history"] as const,
};

// ============ Response shapes (server/routes/prompts.ts) ============

type PromptListResponse = { success: boolean; data: BrandPrompt[] };

export type PlatformResultShape = {
  platform: string;
  isCited: boolean;
  /** Placement in the model's answer, when the run recorded one. */
  rank?: number | null;
  snippet: string | null;
  fullResponse: string | null;
  checkedAt: string;
  reDetectedAt: string | null;
};

export type PromptResultsData = {
  byPlatform: Array<{
    platform: string;
    cited: number;
    checks: number;
    citationRate: number;
    lastRun: string | null;
  }>;
  byPrompt: Array<{
    promptId: string;
    prompt: string;
    rationale: string | null;
    platforms: PlatformResultShape[];
  }>;
  totalChecks: number;
  totalCited: number;
  citationRate: number;
};

export type CitationRunEntry = {
  id: string;
  brandId: string;
  totalChecks: number;
  totalCited: number;
  citationRate: number;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  platformBreakdown: Record<string, { cited: number; checks: number; rate: number }> | null;
  status?: "pending" | "running" | "succeeded" | "failed" | "partial" | "cancelled";
  errorMessage?: string | null;
  disagreementCount?: number;
};

export type RunDetailsData = {
  byPrompt: Array<{ prompt: string; platforms: PlatformResultShape[] }>;
};

export type PromptGeneration = {
  id: string;
  brandId: string;
  createdAt: string;
  [key: string]: unknown;
};

/** One prompt's score over recent runs. `score`/`delta` are null when there
 *  is nothing to measure - a prompt that has never run, or has run once so no
 *  change exists yet. Null is not zero and must render as a dash. */
export type PromptScoreHistory = {
  promptId: string;
  score: number | null;
  delta: number | null;
  series: Array<{ at: string; score: number; cited: number; checks: number; rank: number | null }>;
  runs: number;
  lastRunAt: string | null;
  /** Mean rank across cited placements in the latest run. */
  rank: number | null;
  /** Change in mean rank vs the previous run. POSITIVE MEANS WORSE. */
  rankDelta: number | null;
  /** Latest rank per model plus its movement. `isNew` = placed for the
   *  first time, so there is no delta to show. */
  byPlatform: Array<{
    platform: string;
    rank: number | null;
    rankDelta: number | null;
    isNew: boolean;
  }>;
};

// ============ Query hooks ============

export function usePrompts(brandId: string | null | undefined) {
  return useQuery<{ success: boolean; data: BrandPrompt[] }>({
    queryKey: promptKeys.list(brandId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}`);
      return r.json();
    },
    enabled: !!brandId,
  });
}

/** Tracked *and* archived prompts. The prompts table needs both so a row
 *  switched off stays on screen and can be switched back on; every other
 *  caller wants tracked-only and should keep using `usePrompts`. Separate
 *  query key so the two never overwrite each other in the cache. */
export function useAllPrompts(brandId: string | null | undefined) {
  return useQuery<{ success: boolean; data: BrandPrompt[] }>({
    queryKey: promptKeys.listAll(brandId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}?status=all`);
      return r.json();
    },
    enabled: !!brandId,
  });
}

export function usePromptSuggestions(brandId: string | null | undefined) {
  return useQuery<{ success: boolean; data: BrandPrompt[] }>({
    queryKey: promptKeys.suggestions(brandId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}/suggestions`);
      return r.json();
    },
    enabled: !!brandId,
  });
}

export function usePromptResults(
  brandId: string | null | undefined,
  opts?: { since?: string; enabled?: boolean; refetchInterval?: number | false },
) {
  return useQuery<{ success: boolean; data: PromptResultsData }>({
    queryKey: promptKeys.results(brandId, opts),
    queryFn: async () => {
      const params = opts?.since ? `?since=${encodeURIComponent(opts.since)}` : "";
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}/results${params}`);
      return r.json();
    },
    enabled: (opts?.enabled ?? true) && !!brandId,
    refetchInterval: opts?.refetchInterval ?? false,
  });
}

export function usePromptHistory(
  brandId: string | null | undefined,
  opts?: { refetchInterval?: number | false },
) {
  return useQuery<{ success: boolean; data: CitationRunEntry[] }>({
    queryKey: promptKeys.history(brandId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}/history`);
      return r.json();
    },
    enabled: !!brandId,
    refetchInterval: opts?.refetchInterval ?? false,
  });
}

export function usePromptRunDetails(
  brandId: string | null | undefined,
  runId: string | null | undefined,
  opts?: { enabled?: boolean },
) {
  return useQuery<{ success: boolean; data: RunDetailsData }>({
    queryKey: promptKeys.runDetails(brandId, runId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}/run/${runId}/details`);
      return r.json();
    },
    enabled: (opts?.enabled ?? true) && !!brandId && !!runId,
  });
}

export function usePromptGenerations(brandId: string | null | undefined) {
  return useQuery<{ success: boolean; data: PromptGeneration[] }>({
    queryKey: promptKeys.generations(brandId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}/generations`);
      return r.json();
    },
    enabled: !!brandId,
  });
}

export function usePromptScoreHistory(brandId: string | null | undefined) {
  return useQuery<{ success: boolean; data: PromptScoreHistory[] }>({
    queryKey: promptKeys.scoreHistory(brandId),
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/brand-prompts/${brandId}/prompt-history`);
      return r.json();
    },
    enabled: !!brandId,
  });
}

// ============ Shared invalidation ============

// Everything that can go stale after any prompt-set mutation (generate,
// reset, edit, archive, accept/dismiss suggestion). Results/history/run
// details are NOT invalidated here - they depend on citation runs, not the
// prompt set itself, and are invalidated separately by the mutations that
// actually change them (run, re-detect-all).
function invalidatePromptSet(brandId: string | null | undefined) {
  queryClient.invalidateQueries({ queryKey: promptKeys.list(brandId) });
  queryClient.invalidateQueries({ queryKey: promptKeys.listAll(brandId) });
  queryClient.invalidateQueries({ queryKey: promptKeys.suggestions(brandId) });
}

function invalidateRunOutputs(brandId: string | null | undefined) {
  queryClient.invalidateQueries({ queryKey: promptKeys.results(brandId) });
  queryClient.invalidateQueries({ queryKey: promptKeys.history(brandId) });
}

// ============ Mutation hooks ============

export function useGeneratePrompts(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/brand-prompts/${brandId}/generate`, {});
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.setQueryData(promptKeys.list(brandId), { success: true, data: data.data });
      }
    },
  });
}

export function useResetPrompts(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/brand-prompts/${brandId}/reset`, {
        confirm: true,
      });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) invalidatePromptSet(brandId);
    },
  });
}

export function useRefreshSuggestions(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/brand-prompts/${brandId}/suggestions/refresh`, {});
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.setQueryData(promptKeys.suggestions(brandId), {
          success: true,
          data: data.data,
        });
      }
    },
  });
}

export function useAcceptSuggestion(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async ({
      suggestionId,
      replaceTrackedId,
    }: {
      suggestionId: string;
      replaceTrackedId: string | null;
    }) => {
      const r = await apiRequest(
        "POST",
        `/api/brand-prompts/${brandId}/suggestions/${suggestionId}/accept`,
        replaceTrackedId ? { replaceTrackedId } : {},
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) invalidatePromptSet(brandId);
    },
  });
}

export function useDismissSuggestion(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const r = await apiRequest(
        "DELETE",
        `/api/brand-prompts/${brandId}/suggestions/${suggestionId}`,
      );
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: promptKeys.suggestions(brandId) });
      }
    },
  });
}

export function useEditPrompt(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async ({ promptId, text }: { promptId: string; text: string }) => {
      const r = await apiRequest("PATCH", `/api/brand-prompts/${brandId}/prompts/${promptId}`, {
        prompt: text,
      });
      return r.json();
    },
    onMutate: async ({ promptId, text }) => {
      const key = promptKeys.list(brandId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ success: boolean; data: BrandPrompt[] }>(key);
      if (previous?.data) {
        queryClient.setQueryData(key, {
          ...previous,
          data: previous.data.map((p) => (p.id === promptId ? { ...p, prompt: text } : p)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(promptKeys.list(brandId), ctx.previous);
      }
    },
    onSuccess: (data) => {
      // Always invalidate (even on data.success === false - server returned
      // 200 with an error payload) so an optimistic write never sticks.
      invalidatePromptSet(brandId);
      void data;
    },
  });
}

export function useArchivePrompt(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async (promptId: string) => {
      const r = await apiRequest("DELETE", `/api/brand-prompts/${brandId}/prompts/${promptId}`);
      return r.json();
    },
    onSuccess: (data) => {
      if (data.success) invalidatePromptSet(brandId);
    },
  });
}

/** Create one prompt by hand. Surfaces the server's typed refusals
 *  (`tracked_set_full`, `duplicate_prompt`) so the UI can explain which one
 *  happened rather than showing a generic failure. */
export function useCreatePrompt(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async (text: string) => {
      const r = await apiRequest("POST", `/api/brand-prompts/${brandId}/prompts`, {
        prompt: text,
      });
      return { status: r.status, body: await r.json() };
    },
    onSuccess: ({ body }) => {
      if (body.success) invalidatePromptSet(brandId);
    },
  });
}

/** The row's ON toggle: tracked ⇄ archived. Optimistic, because the dot is
 *  the feedback - a round-trip delay there reads as an unresponsive control. */
export function useSetPromptStatus(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async ({
      promptId,
      status,
    }: {
      promptId: string;
      status: "tracked" | "archived";
    }) => {
      const r = await apiRequest("PATCH", `/api/brand-prompts/${brandId}/prompts/${promptId}`, {
        status,
      });
      return { status: r.status, body: await r.json() };
    },
    // Both list caches are patched: the table reads `listAll` (so a row
    // switched off stays visible) while everything else reads `list`.
    // Patching only one leaves the visible table unchanged and the toggle
    // looking dead.
    onMutate: async ({ promptId, status }) => {
      const keys = [promptKeys.list(brandId), promptKeys.listAll(brandId)];
      await Promise.all(keys.map((key) => queryClient.cancelQueries({ queryKey: key })));
      const snapshots = keys.map(
        (key) => [key, queryClient.getQueryData<PromptListResponse>(key)] as const,
      );
      for (const [key, prev] of snapshots) {
        if (!prev?.data) continue;
        queryClient.setQueryData(key, {
          ...prev,
          data: prev.data.map((p) => (p.id === promptId ? { ...p, status } : p)),
        });
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, prev] of ctx?.snapshots ?? []) {
        if (prev) queryClient.setQueryData(key, prev);
      }
    },
    onSettled: () => invalidatePromptSet(brandId),
  });
}

/** Persist drag-reordering. Optimistic so the row stays where it was dropped
 *  instead of snapping back while the request is in flight. */
export function useReorderPrompts(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await apiRequest("POST", `/api/brand-prompts/${brandId}/prompts/reorder`, { ids });
      return r.json();
    },
    onMutate: async (ids) => {
      const keys = [promptKeys.list(brandId), promptKeys.listAll(brandId)];
      await Promise.all(keys.map((key) => queryClient.cancelQueries({ queryKey: key })));
      const snapshots = keys.map(
        (key) => [key, queryClient.getQueryData<PromptListResponse>(key)] as const,
      );
      for (const [key, prev] of snapshots) {
        if (!prev?.data) continue;
        const byId = new Map(prev.data.map((p) => [p.id, p]));
        const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as BrandPrompt[];
        // Anything not named in `ids` keeps its place at the end rather than
        // vanishing from the cache.
        const rest = prev.data.filter((p) => !ids.includes(p.id));
        queryClient.setQueryData(key, { ...prev, data: [...reordered, ...rest] });
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, prev] of ctx?.snapshots ?? []) {
        if (prev) queryClient.setQueryData(key, prev);
      }
    },
    onSettled: () => invalidatePromptSet(brandId),
  });
}

export function useRunPrompts(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-prompts/${brandId}/run`, {});
      const json = await response.json();
      return { status: response.status, body: json };
    },
  });
}

export function useBackfillPrompts(brandId: string | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/brand-prompts/${brandId}/re-detect-all`, {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        invalidateRunOutputs(brandId);
        queryClient.invalidateQueries({ queryKey: ["/api/listicles"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wikipedia-mentions"] });
      }
    },
  });
}
