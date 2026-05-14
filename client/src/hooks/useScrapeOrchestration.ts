import { useState, useRef, useCallback, useEffect } from "react";
import { apiRequest, ApiError } from "@/lib/queryClient";

// Inline concurrency limiter — avoids a new dep.
function createLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let active = 0;
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>((r) => queue.push(r));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

export type OrchestrationStatus =
  | "idle"
  | "planning"
  | "running"
  | "aggregating"
  | "completed"
  | "plan_failed"
  | "offline"
  | "failed";

export interface PlanError {
  code: "cooldown" | "already_running" | "paused" | "cost_cap_reached" | "unknown";
  message: string;
  runId?: string;
  unlockAtMs?: number;
}

export interface OrchestrationState {
  status: OrchestrationStatus;
  runId: string | null;
  totalFacts: number;
  planError: PlanError | null;
}

export function useScrapeOrchestration() {
  const [state, setState] = useState<OrchestrationState>({
    status: "idle",
    runId: null,
    totalFacts: 0,
    planError: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  // Offline detection — mark running/aggregating as offline.
  useEffect(() => {
    const onOffline = () => {
      setState((s) =>
        s.status === "running" || s.status === "aggregating" ? { ...s, status: "offline" } : s,
      );
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);

  // Abort on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(async (brandId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "planning", runId: null, totalFacts: 0, planError: null });

    try {
      // Step 1: Plan. /plan returns 409 with structured body for cooldown,
      // already_running, paused, cost_cap_reached. apiRequest throws ApiError
      // on non-2xx; catch and extract the body.
      let planJson: { runId: string; pages: Array<{ pageId: string; url: string }> };
      try {
        const planRes = await apiRequest(
          "POST",
          "/api/brand-fact-sheet/plan",
          { brandId, triggeredBy: "user_rescrape" },
          { signal: controller.signal },
        );
        planJson = await planRes.json();
      } catch (err) {
        if (err instanceof ApiError) {
          const body = (err.body ?? {}) as {
            code?: string;
            error?: string;
            runId?: string;
            unlockAtMs?: number;
          };
          setState({
            status: "plan_failed",
            runId: body.runId ?? null,
            totalFacts: 0,
            planError: {
              code: (body.code as PlanError["code"]) ?? "unknown",
              message: body.error ?? `Plan failed (${err.status})`,
              runId: body.runId,
              unlockAtMs: body.unlockAtMs,
            },
          });
          return;
        }
        throw err;
      }

      const runId: string = planJson.runId;
      const pages: Array<{ pageId: string; url: string }> = planJson.pages ?? [];

      setState((s) => ({ ...s, status: "running", runId }));

      // Step 2: Fan out scrape-one × N (concurrency-limited) + search-llm
      // + user-enrich in parallel. Each call catches its own ApiError so
      // Promise.allSettled never sees a rejection (we want all to attempt).
      const limit = createLimit(3);

      const scrapeOnePromises = pages.map(({ pageId }) =>
        limit(() =>
          apiRequest(
            "POST",
            "/api/brand-fact-sheet/scrape-one",
            { runId, pageId },
            { signal: controller.signal },
          ).catch((err) => ({ error: err })),
        ),
      );

      const searchPromise = apiRequest(
        "POST",
        "/api/brand-fact-sheet/search-llm",
        { runId },
        { signal: controller.signal },
      ).catch((err) => ({ error: err }));

      const enrichPromise = apiRequest(
        "POST",
        "/api/brand-fact-sheet/user-enrich",
        { runId },
        { signal: controller.signal },
      ).catch((err) => ({ error: err }));

      await Promise.allSettled([...scrapeOnePromises, searchPromise, enrichPromise]);

      // Step 3: Aggregate.
      setState((s) => ({ ...s, status: "aggregating" }));

      try {
        const aggregateRes = await apiRequest(
          "POST",
          "/api/brand-fact-sheet/aggregate",
          { runId },
          { signal: controller.signal },
        );
        const aggregateJson = await aggregateRes.json();
        setState({
          status: "completed",
          runId,
          totalFacts: aggregateJson.totalFacts ?? 0,
          planError: null,
        });
      } catch {
        setState((s) => ({ ...s, status: "failed" }));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState((s) => ({ ...s, status: "failed" }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: "idle", runId: null, totalFacts: 0, planError: null });
  }, []);

  return { ...state, start, cancel };
}
