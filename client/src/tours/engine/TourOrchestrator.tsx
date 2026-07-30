// client/src/tours/engine/TourOrchestrator.tsx
//
// Single instance, mounted at app root. Subscribes to route + brand + tour-state.
// Decides which tour to fire and delegates to shepherdAdapter. Tracks an
// activeTourRef to prevent StrictMode double-fires.

import { useEffect, useMemo, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../hooks/use-auth";
import { useBrandSelection } from "../../hooks/use-brand-selection";
import { useTourState, useTourStatePatch } from "../../hooks/useTourState";
import { TOURS, getTour } from "../registry";
import type { TourContext } from "../types";
import { shouldAutoFire } from "./eligibility";
import { runTour, type RunningTour } from "./shepherdAdapter";
import { EventBuffer, type BufferedEvent } from "./eventBuffer";
import { isTourEngineEnabled } from "./featureFlag";
import { apiRequest } from "../../lib/queryClient";
import "./tour-engine.css";

const PREVIEW_QUERY_PARAM = "previewTour";

async function sendEvents(events: BufferedEvent[]): Promise<void> {
  await apiRequest("POST", "/api/tours/events", { events });
}

interface CountsResp {
  brands: number;
  mentions: number;
  citations: number;
  articles: number;
  prompts: number;
}

function useCounts(brandId: string | null): CountsResp {
  // Shares query keys with the dashboard so brands/articles hit a warm
  // cache; brand-scoped mentions/prompts fetch once per brand (30s stale)
  // only when a brand is selected.
  const { data: brands } = useQuery<{ data: unknown[] }>({
    queryKey: ["/api/brands"],
    staleTime: 30_000,
  });
  const { data: articles } = useQuery<{ data: unknown[] }>({
    queryKey: ["/api/articles"],
    staleTime: 30_000,
  });
  const { data: mentions } = useQuery<{
    rows: unknown[];
    nextCursor?: string | null;
    stats?: unknown;
  }>({
    queryKey: brandId ? ["/api/brand-mentions", brandId] : ["__no_brand_mentions__"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brand-mentions/${brandId}`);
      return (await res.json()) as {
        rows: unknown[];
        nextCursor?: string | null;
        stats?: unknown;
      };
    },
    enabled: !!brandId,
    staleTime: 30_000,
  });
  // Real per-brand prompt count (same endpoint geo-signals uses) so the
  // first-prompt-added nudge fires on the actual event instead of a
  // hardcoded 0 that silently never triggered.
  const { data: prompts } = useQuery<unknown>({
    queryKey: brandId ? ["/api/brand-prompts", brandId] : ["__no_brand_prompts__"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brand-prompts/${brandId}`);
      return res.json();
    },
    enabled: !!brandId,
    staleTime: 30_000,
  });
  const promptCount = Array.isArray(prompts)
    ? prompts.length
    : ((prompts as { data?: unknown[] } | undefined)?.data?.length ?? 0);
  const brandCount = brands?.data?.length ?? 0;
  const mentionCount = mentions?.rows?.length ?? 0;
  const articleCount = articles?.data?.length ?? 0;
  // Memoised on the scalar counts. A fresh object literal every render made
  // `counts` a new identity every render, which re-ran all three effects
  // below on every render — including the preview effect, which rebuilt the
  // admin's previewed tour from scratch each time.
  return useMemo(
    () => ({
      brands: brandCount,
      mentions: mentionCount,
      // No cheap client-side citations-count source exists; the spine's
      // activation pipeline runs citations server-side. Honest 0 means
      // "not measured here", not "zero citations" — and no tour auto-fires
      // on this value (the always-true empty-citations nudge was removed).
      citations: 0,
      articles: articleCount,
      prompts: promptCount,
    }),
    [brandCount, mentionCount, articleCount, promptCount],
  );
}

export function TourOrchestrator() {
  const enabled = isTourEngineEnabled();
  const { user } = useAuth();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const brandId = selectedBrandId || null;
  const { state, isReady: stateReady } = useTourState();
  const { mutate: patchState } = useTourStatePatch();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const counts = useCounts(brandId);

  const activeRef = useRef<RunningTour | null>(null);
  const bufferRef = useRef<EventBuffer | null>(null);
  const lastBrandRef = useRef<string | null>(null);
  // Belt-and-braces against the "fires every page load" failure mode:
  // even if state persistence is delayed or a user dismisses without
  // a state-saving exit (network blip, server error on PATCH), the
  // same tour cannot auto-fire a second time in this browser session.
  // Server state is still the source of truth across sessions.
  const firedThisSessionRef = useRef<Set<string>>(new Set());

  // Init event buffer once.
  useEffect(() => {
    if (!enabled) return;
    bufferRef.current = new EventBuffer(sendEvents, { intervalMs: 5000, capacity: 200 });
    const onUnload = () => bufferRef.current?.flushSyncBeacon("/api/tours/events");
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      bufferRef.current?.destroy();
      bufferRef.current = null;
    };
  }, [enabled]);

  // Cancel active tour on brand switch.
  useEffect(() => {
    if (!enabled) return;
    if (lastBrandRef.current && lastBrandRef.current !== brandId && activeRef.current) {
      activeRef.current.cancel("brand_switched");
      activeRef.current = null;
    }
    lastBrandRef.current = brandId;
  }, [brandId, enabled]);

  // Preview param.
  useEffect(() => {
    if (!enabled || !user) return;
    const params = new URLSearchParams(window.location.search);
    const previewId = params.get(PREVIEW_QUERY_PARAM);
    if (!previewId) return;
    const isAdmin = !!user.isAdmin;
    if (!isAdmin) return;
    const tour = getTour(previewId);
    if (!tour || !bufferRef.current) return;
    if (activeRef.current) activeRef.current.cancel();
    const ctx: TourContext = {
      userId: user.id,
      brandId,
      brandName: selectedBrand?.name,
      isAdmin,
      counts,
    };
    activeRef.current = runTour({
      config: tour,
      ctx,
      mode: "preview",
      buffer: bufferRef.current,
      onEnd: () => {
        activeRef.current = null;
      },
    });
  }, [enabled, user, brandId, selectedBrand?.name, counts]);

  // Auto-fire evaluator. Re-runs on route, brand, state, or counts change.
  useEffect(() => {
    if (!enabled || !user || !bufferRef.current) return;
    if (activeRef.current) return; // StrictMode guard
    // Wait for the persisted state to land. useTourState yields `{}` while
    // /api/tours/state is in flight, and an empty state looks exactly like
    // "never seen this tour" — so every page load re-fired tours the user
    // had already completed, skipped or suppressed. The intro step has no
    // DOM target, so it painted instantly, well before the real state
    // arrived to say it shouldn't have. Completion was being written
    // correctly the whole time; it was simply never read in time.
    //
    // Measured on admin@venturecite.com (2026-07-30): state held
    // `global: { v: 2, skippedAt: 2026-07-29T19:18 }` and the tour still
    // auto-fired 7 times the next day — 133 fires against 6 completions
    // and 21 skips lifetime.
    if (!stateReady) return;

    const ctx: TourContext = {
      userId: user.id,
      brandId,
      brandName: selectedBrand?.name,
      isAdmin: !!user.isAdmin,
      counts,
    };

    for (const tour of Object.values(TOURS)) {
      // Keyed by brand as well as id: a perBrand tour is a different tour
      // for each brand, and keying on id alone meant seeing it for one
      // brand suppressed it for every other brand in the same session.
      const guardKey = tour.scope === "perBrand" ? `${tour.id}::${ctx.brandId ?? "none"}` : tour.id;
      if (firedThisSessionRef.current.has(guardKey)) continue;
      if (shouldAutoFire(tour, state, ctx, location)) {
        firedThisSessionRef.current.add(guardKey);
        activeRef.current = runTour({
          config: tour,
          ctx,
          mode: "auto",
          buffer: bufferRef.current,
          // onEnd clears activeRef for every ending, so none of the
          // persistence callbacks below have to remember to.
          onEnd: () => {
            activeRef.current = null;
          },
          onComplete: () => {
            patchState({
              op: "markCompleted",
              tourId: tour.id,
              version: tour.version,
              brandId: tour.scope === "perBrand" ? ctx.brandId : null,
            });
          },
          onSkip: () => {
            patchState({
              op: "markSkipped",
              tourId: tour.id,
              version: tour.version,
              brandId: tour.scope === "perBrand" ? ctx.brandId : null,
            });
          },
          onSkipForever: () => {
            patchState({ op: "suppress", tourId: tour.id });
          },
          onNoShow: () => {
            // Anchor wasn't on this page, so nothing showed. Persist
            // nothing and release the per-session guard so this tour is
            // re-evaluated on the next route/state change — it fires
            // properly once the user reaches the page that has the
            // anchor, instead of being silently consumed here.
            firedThisSessionRef.current.delete(guardKey);
          },
        });
        break;
      }
    }
  }, [
    enabled,
    user,
    brandId,
    selectedBrand?.name,
    state,
    stateReady,
    location,
    counts,
    patchState,
  ]);

  // Expose replay imperatively via window for PageHeaderHelp / chatbot fallback.
  useEffect(() => {
    if (!enabled) return;
    (window as unknown as Record<string, unknown>).__replayTour = (tourId: string) => {
      if (!user || !bufferRef.current) return;
      const tour = getTour(tourId);
      if (!tour) return;
      if (activeRef.current) activeRef.current.cancel();
      const ctx: TourContext = {
        userId: user.id,
        brandId,
        brandName: selectedBrand?.name,
        isAdmin: !!user.isAdmin,
        counts,
      };
      activeRef.current = runTour({
        config: tour,
        ctx,
        mode: "manual",
        buffer: bufferRef.current,
        // Manual replay persists nothing (runTour enforces that too); it
        // only has to release the slot, however the user ends it. Before
        // onEnd existed, dismissing a replay with X left activeRef set and
        // blocked every later tour for the rest of the session.
        onEnd: () => {
          activeRef.current = null;
        },
      });
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__replayTour;
    };
  }, [enabled, user, brandId, selectedBrand?.name, counts]);

  return null;
}
