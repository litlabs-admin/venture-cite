// client/src/tours/engine/TourOrchestrator.tsx
//
// Single instance, mounted at app root. Subscribes to route + brand + tour-state.
// Decides which tour to fire and delegates to shepherdAdapter. Tracks an
// activeTourRef to prevent StrictMode double-fires.

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
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
  // Reads from existing TanStack Query caches; no additional fetches.
  // We piggyback on the hooks already used by the dashboard so this is free.
  const { data: brands } = useQuery<{ data: unknown[] }>({
    queryKey: ["/api/brands"],
    staleTime: 30_000,
  });
  const { data: articles } = useQuery<{ data: unknown[] }>({
    queryKey: ["/api/articles"],
    staleTime: 30_000,
  });
  const { data: mentions } = useQuery<{ data: unknown[] }>({
    queryKey: brandId ? [`/api/brand-mentions/${brandId}`] : ["__no_brand_mentions__"],
    enabled: !!brandId,
    staleTime: 30_000,
  });
  return {
    brands: brands?.data?.length ?? 0,
    mentions: mentions?.data?.length ?? 0,
    citations: 0, // Hook into citations cache when available; safe default for v1.
    articles: articles?.data?.length ?? 0,
    prompts: 0,
  };
}

export function TourOrchestrator() {
  const enabled = isTourEngineEnabled();
  const { user } = useAuth();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const brandId = selectedBrandId || null;
  const { state } = useTourState();
  const { mutate: patchState } = useTourStatePatch();
  const [location] = useLocation();
  const counts = useCounts(brandId);

  const activeRef = useRef<RunningTour | null>(null);
  const bufferRef = useRef<EventBuffer | null>(null);
  const lastBrandRef = useRef<string | null>(null);

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
    const isAdmin = typeof user.email === "string" && user.email.endsWith("@litlabs.io");
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
    });
  }, [enabled, user, brandId, selectedBrand?.name, counts]);

  // Auto-fire evaluator. Re-runs on route, brand, state, or counts change.
  useEffect(() => {
    if (!enabled || !user || !bufferRef.current) return;
    if (activeRef.current) return; // StrictMode guard

    const ctx: TourContext = {
      userId: user.id,
      brandId,
      brandName: selectedBrand?.name,
      isAdmin: typeof user.email === "string" && user.email.endsWith("@litlabs.io"),
      counts,
    };

    for (const tour of Object.values(TOURS)) {
      if (shouldAutoFire(tour, state, ctx, location)) {
        activeRef.current = runTour({
          config: tour,
          ctx,
          mode: "auto",
          buffer: bufferRef.current,
          onComplete: () => {
            patchState({
              op: "markCompleted",
              tourId: tour.id,
              version: tour.version,
              brandId: tour.scope === "perBrand" ? ctx.brandId : null,
            });
            activeRef.current = null;
          },
          onSkip: () => {
            patchState({
              op: "markSkipped",
              tourId: tour.id,
              version: tour.version,
              brandId: tour.scope === "perBrand" ? ctx.brandId : null,
            });
            activeRef.current = null;
          },
          onSkipForever: () => {
            patchState({ op: "suppress", tourId: tour.id });
            activeRef.current = null;
          },
        });
        break;
      }
    }
  }, [enabled, user, brandId, selectedBrand?.name, state, location, counts, patchState]);

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
        isAdmin: typeof user.email === "string" && user.email.endsWith("@litlabs.io"),
        counts,
      };
      activeRef.current = runTour({
        config: tour,
        ctx,
        mode: "manual",
        buffer: bufferRef.current,
        onComplete: () => {
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
